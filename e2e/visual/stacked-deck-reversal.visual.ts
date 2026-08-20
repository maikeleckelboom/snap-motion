import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { inspectGitRevision } from "../../scripts/stackedDeckVisualRevision.ts";
import { expectCarouselAt, openLabDemo } from "../helpers";
import {
  STACKED_DECK_IDS,
  beginPointer,
  destinations,
  finishPointer,
  movePointer,
  motionPitch,
  readFrame,
  viewport,
  type PointerOrigin,
} from "../stackedDeckHarness";
import { installHighContrastPileFixture } from "../stackedDeckPileTrace";

const repoRoot = resolve(import.meta.dirname, "../..");
const revision = inspectGitRevision(repoRoot);
const artifactDirectory = resolve(
  repoRoot,
  ".artifacts",
  "stacked-deck-reversal-review",
  revision.identity,
);

const MATERIAL_LEGEND = [
  { color: "rgb(220 38 38)", label: "A TEMPLATES" },
  { color: "rgb(37 99 235)", label: "B PROJECT" },
  { color: "rgb(22 163 74)", label: "C MAP" },
  { color: "rgb(234 88 12)", label: "D TEAM" },
  { color: "rgb(88 28 135)", label: "E SETTINGS" },
] as const;

/** Dense samples either side of the one instant direction and target change. */
const CROSSING_STRIP = [0.2, 0.1, 0.05, 0.02, 0, -0.02, -0.05, -0.1, -0.2] as const;

interface ReversalSample {
  readonly controllerPosition: number;
  /** `position - handDelta`: the scalar origin the deck is actually measuring the hand from. */
  readonly impliedDragOrigin: number;
  readonly direction: number;
  readonly handDelta: number;
  readonly physicalPosition: number;
  readonly requestedTravel: number;
  readonly segmentTargetId: string | null;
  /** Physical travel the hand did not ask for. This is the number the defect used to move. */
  readonly unexplainedTravel: number;
}

async function settleAt(page: Page, index: number): Promise<void> {
  const stage = viewport(page);
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  await page.waitForTimeout(180);
}

async function select(page: Page, index: number): Promise<void> {
  await destinations(page).nth(index).click();
  await settleAt(page, index);
}

async function record(page: Page, name: string, run: () => Promise<void>): Promise<string> {
  const path = join(artifactDirectory, `${name}.webm`);
  await page.screencast.start({ path, quality: 94, size: { width: 1_280, height: 720 } });
  await page.waitForTimeout(300);
  await run();
  await page.waitForTimeout(500);
  await page.screencast.stop();
  return path;
}

/**
 * One held interaction that keeps its pointer for the whole recording.
 *
 * Everything is driven by absolute hand positions, so a reversal is expressed the way a hand
 * expresses it — by going back to where it came from — rather than by a separate gesture.
 */
function heldHand(origin: PointerOrigin, pitch: number, itemCount: number) {
  let elapsedMs = 0;
  return {
    async sample(page: Page, travel: number, stepMs = 34): Promise<ReversalSample> {
      elapsedMs += stepMs;
      const handDelta = -travel * pitch;
      await movePointer(page, origin, handDelta, elapsedMs);
      const frame = await readFrame(page);
      const controllerPosition = Number(await viewport(page).getAttribute("data-position"));
      const targetIndex = frame.segmentTargetIndex;
      return {
        controllerPosition,
        direction: frame.direction,
        handDelta,
        impliedDragOrigin: controllerPosition - handDelta,
        physicalPosition: frame.physicalPosition,
        requestedTravel: travel,
        segmentTargetId:
          targetIndex === null || targetIndex < 0
            ? null
            : (STACKED_DECK_IDS[targetIndex % itemCount] ?? null),
        unexplainedTravel: frame.physicalPosition - travel,
      };
    },
    async finish(page: Page): Promise<void> {
      await finishPointer(page, origin, 0, elapsedMs + 90, "pointercancel");
    },
    /** Smoothly walks the hand from where it is to `travel`, so a recording can be watched. */
    async glide(page: Page, from: number, to: number, steps = 24): Promise<void> {
      for (let step = 1; step <= steps; step += 1) {
        await this.sample(page, from + ((to - from) * step) / steps, 34);
        await page.waitForTimeout(26);
      }
    },
  };
}

async function openHeld(page: Page, sourceIndex: number, itemCount = STACKED_DECK_IDS.length) {
  const stage = viewport(page);
  const pitch = await motionPitch(stage);
  return heldHand(await beginPointer(stage), pitch, itemCount);
}

async function writeStrip(
  page: Page,
  name: string,
  frames: readonly { readonly encoded: string; readonly label: string }[],
): Promise<string> {
  const encodedStrip = await page.evaluate(
    async ({ frames: input, materials }) => {
      const bitmaps = await Promise.all(
        input.map(async (frame) => {
          const bytes = Uint8Array.from(atob(frame.encoded), (character) =>
            character.charCodeAt(0),
          );
          return createImageBitmap(new Blob([bytes], { type: "image/png" }));
        }),
      );
      const width = 300;
      const legendHeight = 42;
      const captionHeight = 74;
      const height = Math.round((bitmaps[0]!.height / bitmaps[0]!.width) * width);
      const canvas = document.createElement("canvas");
      canvas.width = width * bitmaps.length;
      canvas.height = height + captionHeight + legendHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The frame-strip canvas could not be created.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = "700 15px system-ui, sans-serif";
      for (let index = 0; index < materials.length; index += 1) {
        const material = materials[index]!;
        const x = 14 + index * 190;
        context.fillStyle = material.color;
        context.fillRect(x, 10, 22, 22);
        context.fillStyle = "#111827";
        context.fillText(material.label, x + 30, 27);
      }
      for (let index = 0; index < bitmaps.length; index += 1) {
        const bitmap = bitmaps[index]!;
        context.drawImage(bitmap, index * width, legendHeight + captionHeight, width, height);
        context.fillStyle = "#111827";
        context.font = "600 13px ui-monospace, monospace";
        const lines = input[index]!.label.split("\n");
        for (let line = 0; line < lines.length; line += 1) {
          context.fillText(lines[line]!, index * width + 10, legendHeight + 17 + line * 15);
        }
        bitmap.close();
      }
      return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    },
    { frames: [...frames], materials: [...MATERIAL_LEGEND] },
  );
  const path = join(artifactDirectory, `${name}-strip.png`);
  await writeFile(path, Buffer.from(encodedStrip, "base64"));
  return path;
}

/** A dense strip through one sign crossing, captured inside one continuous pointer ownership. */
async function captureCrossing(page: Page, name: string, sourceIndex: number) {
  await select(page, sourceIndex);
  const held = await openHeld(page, sourceIndex);
  const samples: ReversalSample[] = [];
  const frames: { encoded: string; label: string }[] = [];
  try {
    for (const travel of CROSSING_STRIP) {
      const sample = await held.sample(page, travel, 45);
      samples.push(sample);
      frames.push({
        encoded: (await viewport(page).screenshot({ type: "png" })).toString("base64"),
        label:
          `hand ${sample.handDelta.toFixed(1)}px\n` +
          `physical ${sample.physicalPosition.toFixed(4)}\n` +
          `dir ${sample.direction} target ${sample.segmentTargetId ?? "-"}\n` +
          `unexplained ${sample.unexplainedTravel.toFixed(6)}`,
      });
    }
  } finally {
    await held.finish(page);
    await settleAt(page, sourceIndex);
  }
  return { samples, strip: await writeStrip(page, name, frames) };
}

test("records the held Direct reversal review set", async ({ page }) => {
  test.setTimeout(600_000);
  await mkdir(artifactDirectory, { recursive: true });
  await openLabDemo(page, "stacked-deck", "no-preference");
  await installHighContrastPileFixture(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.getByTestId("stacked-deck-exchange-direct").click();

  const recordings: Record<string, string> = {};

  // One uninterrupted ownership: neutral, forward, neutral, backward, neutral, forward, backward.
  await select(page, 2);
  recordings.reversal = await record(page, "direct-held-reversal", async () => {
    const held = await openHeld(page, 2);
    await held.glide(page, 0, 0.6);
    await page.waitForTimeout(420);
    await held.glide(page, 0.6, 0);
    await page.waitForTimeout(420);
    await held.glide(page, 0, -0.6);
    await page.waitForTimeout(420);
    await held.glide(page, -0.6, 0);
    await page.waitForTimeout(420);
    await held.glide(page, 0, 0.6);
    await page.waitForTimeout(300);
    await held.glide(page, 0.6, -0.6, 40);
    await page.waitForTimeout(300);
    await held.finish(page);
    await settleAt(page, 2);
  });

  // Deep into resistance, then straight back across the press point in one coalesced sample.
  await select(page, 2);
  recordings.overdrag = await record(page, "direct-held-reversal-overdrag", async () => {
    const held = await openHeld(page, 2);
    await held.glide(page, 0, 1.8, 30);
    await page.waitForTimeout(500);
    await held.sample(page, -0.25, 16);
    await page.waitForTimeout(700);
    await held.glide(page, -0.25, -1.8, 30);
    await page.waitForTimeout(500);
    await held.sample(page, 0.25, 16);
    await page.waitForTimeout(700);
    await held.glide(page, 0.25, 0);
    await held.finish(page);
    await settleAt(page, 2);
  });

  // The same gesture at semantic zero, where the ring wraps.
  await select(page, 0);
  recordings.wrap = await record(page, "direct-held-reversal-wrap", async () => {
    const held = await openHeld(page, 0);
    await held.glide(page, 0, 0.6);
    await page.waitForTimeout(420);
    await held.glide(page, 0.6, 0);
    await page.waitForTimeout(420);
    await held.glide(page, 0, -0.6);
    await page.waitForTimeout(420);
    await held.glide(page, -0.6, 0);
    await held.finish(page);
    await settleAt(page, 0);
  });

  // Two items, where both directions name the same card and only the physical route separates them.
  await page.getByTestId("stacked-deck-two-items").click();
  await page.waitForTimeout(240);
  recordings.twoItem = await record(page, "direct-held-reversal-two-item", async () => {
    const held = await openHeld(page, 0, 2);
    await held.glide(page, 0, 0.6);
    await page.waitForTimeout(420);
    await held.glide(page, 0.6, 0);
    await page.waitForTimeout(300);
    await held.glide(page, 0, -0.6);
    await page.waitForTimeout(420);
    await held.glide(page, -0.6, 0);
    await held.finish(page);
    await page.waitForTimeout(400);
  });
  await page.getByTestId("stacked-deck-five-items").click();
  await page.waitForTimeout(240);

  const interior = await captureCrossing(page, "direct-held-reversal-interior", 2);
  const wrap = await captureCrossing(page, "direct-held-reversal-wrap", 0);

  const worstUnexplained = Math.max(
    ...[...interior.samples, ...wrap.samples].map((sample) => Math.abs(sample.unexplainedTravel)),
  );
  await writeFile(
    join(artifactDirectory, "reversal-trace.json"),
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        crossings: { interior: interior.samples, wrap: wrap.samples },
        materials: {
          map: "green",
          project: "blue",
          settings: "purple",
          team: "orange",
          templates: "red",
        },
        recordings,
        revision,
        strips: { interior: interior.strip, wrap: wrap.strip },
        worstUnexplainedTravel: worstUnexplained,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // The recording is only worth reviewing if the numbers behind it hold: inside the one-card
  // envelope the deck stands exactly where the hand put it, on both sides of the crossing.
  expect(worstUnexplained).toBeLessThan(1e-6);
});
