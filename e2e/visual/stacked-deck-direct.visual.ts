import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { inspectGitRevision } from "../../scripts/stackedDeckVisualRevision.ts";
import { expectCarouselAt, openLabDemo } from "../helpers";
import {
  STACKED_DECK_IDS,
  beginPointerAt,
  fastFlick,
  finishPointerBy,
  flick,
  motionPitch,
  movePointerBy,
  pagination,
  viewport,
  waitForAuthority,
  type PointerOrigin,
} from "../stackedDeckHarness";

interface GrabSample {
  readonly error: number;
  readonly errorX: number;
  readonly errorY: number;
  readonly index: number;
  readonly kind: string;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly transformedX: number;
  readonly transformedY: number;
}

const repoRoot = resolve(import.meta.dirname, "../..");
const revision = inspectGitRevision(repoRoot);
const candidate = process.env.SNAP_MOTION_DIRECT_VISUAL_CANDIDATE ?? "production";
const artifactDirectory = resolve(
  repoRoot,
  ".artifacts",
  "stacked-deck-direct-review",
  candidate,
  revision.identity,
);

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())),
  );
}

async function readGrabSample(
  page: Page,
  id: string,
  index: number,
  origin: PointerOrigin,
  deltaX: number,
  deltaY: number,
  kind: string,
): Promise<GrabSample> {
  return page.evaluate(
    ({
      deltaX: pointerDeltaX,
      deltaY: pointerDeltaY,
      id: itemId,
      index: sampleIndex,
      kind: sampleKind,
      origin: pointerOrigin,
    }) => {
      const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
      const card = document.querySelector<HTMLElement>(
        `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
      )!;
      const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
      const rootBox = root.getBoundingClientRect();
      const box = motion.getBoundingClientRect();
      const pointerX = pointerOrigin.x + pointerDeltaX;
      const pointerY = pointerOrigin.y + pointerDeltaY;
      const grabX = pointerOrigin.x - (rootBox.left + rootBox.width / 2);
      const grabY = pointerOrigin.y - (rootBox.top + rootBox.height / 2);
      const transformedX = box.left + box.width / 2 + grabX;
      const transformedY = box.top + box.height / 2 + grabY;
      const errorX = transformedX - pointerX;
      const errorY = transformedY - pointerY;
      return {
        error: Math.hypot(errorX, errorY),
        errorX,
        errorY,
        index: sampleIndex,
        kind: sampleKind,
        pointerX,
        pointerY,
        transformedX,
        transformedY,
      };
    },
    { deltaX, deltaY, id, index, kind, origin },
  );
}

async function select(page: Page, index: number): Promise<void> {
  const stage = viewport(page);
  await pagination(page).nth(index).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  await page.waitForTimeout(180);
}

async function moveAndSample(
  page: Page,
  origin: PointerOrigin,
  id: string,
  deltaX: number,
  deltaY: number,
  elapsedMs: number,
  samples: GrabSample[],
  kind = "ordinary",
): Promise<void> {
  await movePointerBy(page, origin, deltaX, deltaY, elapsedMs);
  await nextFrame(page);
  samples.push(await readGrabSample(page, id, samples.length, origin, deltaX, deltaY, kind));
  await page.waitForTimeout(70);
}

test("records the Direct candidate exchange", async ({ context, page }) => {
  test.setTimeout(180_000);
  await mkdir(artifactDirectory, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const video = page.video();
  const samples: GrabSample[] = [];
  const phases: string[] = [];
  const releases: string[] = [];
  /**
   * Marks a release in the recording itself rather than against a clock.
   *
   * A container timestamp cannot be trusted to name a frame: the video's own timeline starts at the
   * page's first paint, seconds after the fixture opened it. A corner of the page flashing white on
   * the frame the hand lets go is in the recording, so a strip can be cut around exactly that frame
   * however the two clocks drifted — and the flash stays visible in the strip, naming it.
   */
  const markRelease = async (name: string) => {
    releases.push(name);
    await page.evaluate(() => {
      const marker = document.querySelector<HTMLElement>("[data-release-marker]")!;
      marker.style.background = "#ffffff";
      setTimeout(() => (marker.style.background = "#000000"), 110);
    });
  };

  await openLabDemo(page, "stacked-deck", "no-preference");
  await page.evaluate(() => {
    const marker = document.createElement("div");
    marker.dataset.releaseMarker = "true";
    marker.style.cssText =
      "position:fixed;left:0;top:0;width:28px;height:28px;background:#000;z-index:2147483647;pointer-events:none";
    document.body.append(marker);
  });
  const directControl = page.getByTestId("stacked-deck-exchange-direct");
  await directControl.click();
  const stage = viewport(page);
  await expect(directControl).toHaveAttribute("aria-pressed", "true");
  const pitch = await motionPitch(stage);

  phases.push("touch ownership catch-up");
  await select(page, 2);
  let card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='map']");
  let origin = await beginPointerAt(card, 0.35, 0.65, "touch");
  await moveAndSample(page, origin, "map", -pitch * 0.32, 65, 100, samples, "catch-up");
  await finishPointerBy(page, origin, -pitch * 0.32, 65, 140, "pointercancel");
  await expectCarouselAt(stage, "map");

  phases.push("off-centre pointer lock and reversal");
  await select(page, 3);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  origin = await beginPointerAt(card, 0.2, 0.2);
  for (const [progress, y] of [
    [0.12, 20],
    [0.28, 55],
    [0.62, 110],
    [0.9, 145],
    [0.45, 72],
    [0.76, 125],
    [0.1, 18],
  ] as const) {
    await moveAndSample(
      page,
      origin,
      "team",
      -pitch * progress,
      y,
      samples.length * 45 + 45,
      samples,
    );
  }
  await finishPointerBy(page, origin, -pitch * 0.1, 18, 500, "pointercancel");
  await expectCarouselAt(stage, "team");

  phases.push("interior overdrag with one adjacent target");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await moveAndSample(page, origin, "team", -pitch * 1.8, 105, 120, samples);
  await moveAndSample(page, origin, "team", pitch * 0.2, 35, 220, samples);
  await finishPointerBy(page, origin, pitch * 0.2, 35, 260, "pointercancel");
  await expectCarouselAt(stage, "team");

  phases.push("commit with vertical offset and immediate re-grab");
  origin = await beginPointerAt(card, 0.8, 0.75);
  await moveAndSample(page, origin, "team", -pitch * 0.7, -180, 140, samples);
  await finishPointerBy(page, origin, -pitch * 0.7, -180, 180, "pointerup");
  await waitForAuthority(page, 4);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await moveAndSample(page, origin, "settings", pitch * 0.22, 45, 80, samples);
  await finishPointerBy(page, origin, pitch * 0.22, 45, 120, "pointercancel");
  await expectCarouselAt(stage, "settings");

  phases.push("release handoff, forward and reverse");
  await select(page, 3);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  origin = await beginPointerAt(card, 0.35, 0.6);
  await moveAndSample(page, origin, "team", -pitch * 0.3, 60, 60, samples);
  await moveAndSample(page, origin, "team", -pitch * 0.72, 150, 130, samples);
  await page.waitForTimeout(260);
  await markRelease("release-handoff-forward");
  await finishPointerBy(page, origin, -pitch * 0.72, 150, 200, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(700);

  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  origin = await beginPointerAt(card, 0.35, 0.6);
  await moveAndSample(page, origin, "settings", pitch * 0.3, -60, 60, samples);
  await moveAndSample(page, origin, "settings", pitch * 0.72, -150, 130, samples);
  await page.waitForTimeout(260);
  await markRelease("release-handoff-reverse");
  await finishPointerBy(page, origin, pitch * 0.72, -150, 200, "pointerup");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(700);

  phases.push("full-pitch release");
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  origin = await beginPointerAt(card, 0.35, 0.6);
  await moveAndSample(page, origin, "team", -pitch * 0.4, 40, 60, samples);
  await moveAndSample(page, origin, "team", -pitch, 90, 140, samples);
  await page.waitForTimeout(260);
  await markRelease("full-pitch-release");
  await finishPointerBy(page, origin, -pitch, 90, 200, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(700);

  phases.push("fast alternating flick, forward and reverse");
  // The primed flick leaves the deck travelling; the marked one presses into that travel, which is
  // how a hand reaches a frame where the presentation is being handed to a new interaction. Each
  // strip is cut around the marked flick.
  //
  // Which screen a burst this fast lands on is deliberately not pinned here. A recording is a
  // picture of the physical exchange, and the destination two interrupted springs resolve to
  // belongs to the assertions in `stacked-deck-direct.spec.ts`.
  const settleAfterBurst = async () => {
    await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await page.waitForTimeout(700);
  };
  await select(page, 2);
  await fastFlick(page, 1, pitch);
  await page.waitForTimeout(200);
  await markRelease("fast-flick-forward");
  await fastFlick(page, 1, pitch);
  await settleAfterBurst();

  await select(page, 3);
  await fastFlick(page, -1, pitch);
  await page.waitForTimeout(200);
  await markRelease("fast-flick-reverse");
  await fastFlick(page, -1, pitch);
  await settleAfterBurst();

  phases.push("high-contrast reverse commit");
  await select(page, 4);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await moveAndSample(page, origin, "settings", pitch * 0.72, 130, 150, samples);
  await finishPointerBy(page, origin, pitch * 0.72, 130, 190, "pointerup");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(420);

  phases.push("flick commit");
  await flick(page, 1, pitch);
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(420);

  phases.push("first and last boundary resistance");
  await select(page, 0);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='templates']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await moveAndSample(
    page,
    origin,
    "templates",
    pitch * 0.65,
    90,
    150,
    samples,
    "boundary-resisted",
  );
  await finishPointerBy(page, origin, pitch * 0.65, 90, 190, "pointercancel");
  await expectCarouselAt(stage, "templates");
  await select(page, 4);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await moveAndSample(
    page,
    origin,
    "settings",
    -pitch * 0.65,
    -90,
    150,
    samples,
    "boundary-resisted",
  );
  await finishPointerBy(page, origin, -pitch * 0.65, -90, 190, "pointercancel");
  await expectCarouselAt(stage, "settings");

  phases.push("autonomous keyboard Direct");
  await stage.press("ArrowLeft");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(420);

  phases.push("manual acceptance pass");
  await select(page, 3);
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  // A slow drag with vertical travel, reversed while still held, then committed from inside the
  // overlap — the sequence the manual recording was judged on.
  origin = await beginPointerAt(card, 0.3, 0.7);
  for (const [progress, y] of [
    [0.16, 30],
    [0.36, 70],
    [0.58, 110],
    [0.34, 74],
    [0.62, 120],
  ] as const) {
    await moveAndSample(
      page,
      origin,
      "team",
      -pitch * progress,
      y,
      samples.length * 45 + 45,
      samples,
    );
  }
  await page.waitForTimeout(200);
  await finishPointerBy(page, origin, -pitch * 0.62, 120, 520, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(500);

  // Immediately back the other way, then a full-pitch drag committed the same direction again.
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  origin = await beginPointerAt(card, 0.6, 0.4);
  await moveAndSample(page, origin, "settings", pitch * 0.55, -90, 90, samples);
  await finishPointerBy(page, origin, pitch * 0.55, -90, 130, "pointerup");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(500);

  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await moveAndSample(page, origin, "team", -pitch * 1.15, -60, 150, samples);
  await finishPointerBy(page, origin, -pitch * 1.15, -60, 190, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(700);

  const ordinary = samples.filter((sample) => sample.kind === "ordinary");
  const boundary = samples.filter((sample) => sample.kind === "boundary-resisted");
  const catchUp = samples.filter((sample) => sample.kind === "catch-up");
  const maximum = ordinary.reduce<GrabSample | null>(
    (selected, sample) => (!selected || sample.error > selected.error ? sample : selected),
    null,
  );
  const metrics = {
    candidate,
    pointerLock: {
      maximumError: maximum?.error ?? null,
      maximumErrorIndex: maximum?.index ?? null,
      maximumErrorX: maximum?.errorX ?? null,
      maximumErrorY: maximum?.errorY ?? null,
      p95Error: percentile(
        ordinary.map((sample) => sample.error),
        0.95,
      ),
      sampleCount: ordinary.length,
    },
    catchUp,
    boundaryResisted: {
      maximumSeparation:
        boundary.length === 0 ? null : Math.max(...boundary.map((sample) => sample.error)),
      sampleCount: boundary.length,
    },
    phases,
    releases,
    samples,
    // The recording letterboxes the page into its own frame, so a strip cannot find the release
    // marker without knowing which page the frame is a picture of.
    viewport: page.viewportSize(),
  };
  await writeFile(join(artifactDirectory, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  await writeFile(
    join(artifactDirectory, "candidate.json"),
    `${JSON.stringify(
      {
        candidate,
        createdAt: new Date().toISOString(),
        physicalModel: "source-rest to destination-rest with continuous opaque parking",
        parkingInvariant: "the released shell remains opaque and below the destination top",
        revision,
        pointerLockToleranceCssPx: 0.5,
      },
      null,
      2,
    )}\n`,
  );

  await context.tracing.stop({ path: join(artifactDirectory, "trace.zip") });
  await page.close();
  if (video) await video.saveAs(join(artifactDirectory, "recording.webm"));
  process.stdout.write(`Direct visual artifacts: ${artifactDirectory}\n`);
});
