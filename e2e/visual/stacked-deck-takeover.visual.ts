import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { inspectGitRevision } from "../../scripts/stackedDeckVisualRevision.ts";
import { expectCarouselAt, openLabDemo } from "../helpers";
import {
  STACKED_DECK_IDS,
  beginPointer,
  finishPointer,
  motionPitch,
  movePointer,
  destinations,
  viewport,
  waitForAuthority,
  type PointerOrigin,
} from "../stackedDeckHarness";

const repoRoot = resolve(import.meta.dirname, "../..");
const revision = inspectGitRevision(repoRoot);
const artifactDirectory = resolve(
  repoRoot,
  ".artifacts",
  "stacked-deck-chained-takeover",
  revision.identity,
);

interface OwnedCard {
  readonly index: number;
  readonly origin: PointerOrigin;
  readonly pitch: number;
}

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolveFrame) => requestAnimationFrame(resolveFrame)),
  );
}

async function prepare(page: Page, startIndex: number, highContrast = false) {
  await openLabDemo(page, "stacked-deck", "no-preference");
  await page.getByTestId("stacked-deck-exchange-direct").click();
  await page.getByTestId("stacked-deck-five-items").click();
  if (highContrast) {
    await page.addStyleTag({
      content: `
        .stacked-deck-demo .snap-motion-stacked-deck-card-motion,
        .stacked-deck-demo .screen-chrome { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
        .stacked-deck-demo .screen-chrome { display: grid !important; place-items: center !important; }
        .stacked-deck-demo .screen-chrome::after,
        .stacked-deck-demo .stacked-screen-image { display: none !important; }
        .stacked-deck-demo .screen-chrome::before { position: relative; z-index: 1; padding: .8rem 1rem; border: 2px solid white; background: rgb(0 0 0 / .35); color: white; font: 800 1.5rem/1 system-ui,sans-serif; }
        .snap-motion-stacked-deck-card[data-item-id="templates"] .screen-chrome { background: #dc2626 !important; }
        .snap-motion-stacked-deck-card[data-item-id="templates"] .screen-chrome::before { content: "A / TEMPLATES"; }
        .snap-motion-stacked-deck-card[data-item-id="project"] .screen-chrome { background: #2563eb !important; }
        .snap-motion-stacked-deck-card[data-item-id="project"] .screen-chrome::before { content: "B / PROJECT"; }
        .snap-motion-stacked-deck-card[data-item-id="map"] .screen-chrome { background: #16a34a !important; }
        .snap-motion-stacked-deck-card[data-item-id="map"] .screen-chrome::before { content: "C / MAP"; }
        .snap-motion-stacked-deck-card[data-item-id="team"] .screen-chrome { background: #ea580c !important; }
        .snap-motion-stacked-deck-card[data-item-id="team"] .screen-chrome::before { content: "D / TEAM"; }
        .snap-motion-stacked-deck-card[data-item-id="settings"] .screen-chrome { background: #581c87 !important; }
        .snap-motion-stacked-deck-card[data-item-id="settings"] .screen-chrome::before { content: "E / SETTINGS"; }
      `,
    });
  }
  const stage = viewport(page);
  await destinations(page).nth(startIndex).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[startIndex]!);
  await expect(stage).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  const card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[startIndex]}']`,
  );
  return {
    stage,
    held: {
      index: startIndex,
      origin: await beginPointer(card),
      pitch: await motionPitch(stage),
    } satisfies OwnedCard,
  };
}

async function exchangeAndTakeOver(
  page: Page,
  held: OwnedCard,
  direction: -1 | 1,
  pace: "fast" | "natural" = "natural",
): Promise<OwnedCard> {
  const deltaX = -direction * held.pitch * 0.8;
  const step = pace === "fast" ? 35 : 80;
  for (const [sample, fraction] of [0.25, 0.55, 0.8].entries()) {
    await movePointer(page, held.origin, -direction * held.pitch * fraction, 80 + sample * 90);
    await nextFrame(page);
    await page.waitForTimeout(step);
  }
  await finishPointer(page, held.origin, deltaX, 700, "pointerup");
  const destinationIndex =
    (held.index + direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length;
  await waitForAuthority(page, destinationIndex);
  const destination = viewport(page).locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[destinationIndex]}']`,
  );
  await expect(destination).toHaveAttribute("data-deck-interactive", "true");
  const origin = await beginPointer(destination);
  await expect(viewport(page)).toHaveAttribute("data-physical-index", /^(?:-?0(?:\.0+)?)$/u);
  return { index: destinationIndex, origin, pitch: held.pitch };
}

async function saveRecording(page: Page, name: string, run: () => Promise<void>): Promise<void> {
  if (process.env.SNAP_MOTION_ALLOW_DIRTY_TAKEOVER_VISUAL !== "true") {
    expect(revision.dirty, "acceptance recordings must name an exact clean revision").toBe(false);
  }
  await mkdir(artifactDirectory, { recursive: true });
  const video = page.video();
  await run();
  await page.waitForTimeout(500);
  await page.close();
  if (!video) throw new Error("The takeover visual project did not enable video recording.");
  await video.saveAs(join(artifactDirectory, name));
}

test("records stateful chained takeover on realistic cards", async ({ page }) => {
  test.setTimeout(120_000);
  await saveRecording(page, "direct-chained-takeover-real-cards.webm", async () => {
    let { held } = await prepare(page, 3);
    for (const direction of [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1] as const) {
      held = await exchangeAndTakeOver(page, held, direction, direction === 1 ? "fast" : "natural");
    }
    await finishPointer(page, held.origin, 0, 100, "pointercancel");
  });
});

test("records the high-contrast chained pile", async ({ page }) => {
  test.setTimeout(90_000);
  await saveRecording(page, "direct-chained-takeover-high-contrast.webm", async () => {
    let { held } = await prepare(page, 1, true);
    for (let exchange = 0; exchange < 7; exchange += 1) {
      held = await exchangeAndTakeOver(page, held, 1, exchange % 2 === 0 ? "fast" : "natural");
    }
    await finishPointer(page, held.origin, 0, 100, "pointercancel");
  });
});

test("records repeated Settings and Templates wrap takeover", async ({ page }) => {
  test.setTimeout(90_000);
  await saveRecording(page, "direct-chained-wrap-settings-templates.webm", async () => {
    let { held } = await prepare(page, 4, true);
    for (const direction of [1, -1, 1, -1, 1, -1] as const) {
      held = await exchangeAndTakeOver(page, held, direction);
    }
    await finishPointer(page, held.origin, 0, 100, "pointercancel");
  });
});

test("records isolated dark Settings to light Templates release", async ({ page }) => {
  test.setTimeout(90_000);
  await saveRecording(page, "direct-dark-settings-to-light-templates.webm", async () => {
    const prepared = await prepare(page, 4);
    const deltaX = -prepared.held.pitch * 0.8;
    for (const [sample, fraction] of [0.25, 0.55, 0.8].entries()) {
      await movePointer(
        page,
        prepared.held.origin,
        -prepared.held.pitch * fraction,
        80 + sample * 90,
      );
      await nextFrame(page);
      await page.waitForTimeout(120);
    }
    await finishPointer(page, prepared.held.origin, deltaX, 700, "pointerup");
    await expectCarouselAt(prepared.stage, "templates");
    await page.waitForTimeout(1_000);
  });
});

test("records the exact Direct showcase route from dark Settings to light Templates", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await saveRecording(page, "direct-showcase-dark-settings-to-light-templates.webm", async () => {
    await page.goto("./?demo=stacked-deck&exchange=direct");
    const stage = viewport(page);
    await expect(stage).toBeVisible();
    await page.getByTestId("stacked-deck-five-items").click();
    await destinations(page).nth(4).click();
    await expectCarouselAt(stage, "settings");
    const card = stage.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width * 0.55;
    const startY = box!.y + box!.height * 0.55;
    const pitch = await motionPitch(stage);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - pitch * 0.8, startY, { steps: 18 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await expectCarouselAt(stage, "templates");
    await page.waitForTimeout(1_000);
  });
});

test("records two reverse chained revolutions", async ({ page }) => {
  test.setTimeout(120_000);
  await saveRecording(page, "direct-chained-reverse-revolution.webm", async () => {
    let { held } = await prepare(page, 0, true);
    for (let exchange = 0; exchange < STACKED_DECK_IDS.length * 2; exchange += 1) {
      held = await exchangeAndTakeOver(page, held, -1, "fast");
    }
    await finishPointer(page, held.origin, 0, 100, "pointercancel");
  });
});

test("records takeover followed by same-hand reversal", async ({ page }) => {
  test.setTimeout(90_000);
  await saveRecording(page, "direct-chained-takeover-reversal.webm", async () => {
    const prepared = await prepare(page, 0);
    const held = await exchangeAndTakeOver(page, prepared.held, 1);
    await movePointer(page, held.origin, -held.pitch * 0.65, 180);
    await nextFrame(page);
    await page.waitForTimeout(120);
    await movePointer(page, held.origin, 0, 360);
    await nextFrame(page);
    await page.waitForTimeout(120);
    await movePointer(page, held.origin, held.pitch * 0.8, 540);
    await nextFrame(page);
    await page.waitForTimeout(120);
    await finishPointer(page, held.origin, held.pitch * 0.8, 1_040, "pointerup");
    await expectCarouselAt(prepared.stage, "templates");
  });
});

test.afterAll(async () => {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    join(artifactDirectory, "revision.json"),
    `${JSON.stringify({ createdAt: new Date().toISOString(), revision }, null, 2)}\n`,
  );
  process.stdout.write(`Direct chained takeover recordings: ${artifactDirectory}\n`);
});
