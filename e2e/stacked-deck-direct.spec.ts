import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo, type ReducedMotionMode } from "./helpers";
import {
  STACKED_DECK_IDS,
  beginPointerAt,
  finishPointerBy,
  motionPitch,
  movePointerBy,
  pagination,
  viewport,
  waitForAuthority,
} from "./stackedDeckHarness";

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function prepareDirect(
  page: Page,
  index = 3,
  reducedMotion: ReducedMotionMode = "no-preference",
) {
  await openLabDemo(page, "stacked-deck", reducedMotion);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  const stage = viewport(page);
  await expect(stage).toHaveAttribute("data-exchange", "direct");
  await pagination(page).nth(index).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  return stage;
}

interface ShellSample {
  readonly opacity: number;
  readonly phase: string;
  readonly x: number;
  readonly y: number;
}

async function startShellRecorder(page: Page, id: string): Promise<void> {
  await page.evaluate((itemId) => {
    const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
    const shell = document.querySelector<HTMLElement>(
      `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
    )!;
    const motion = shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
    const samples: ShellSample[] = [];
    Object.assign(window, { snapMotionDirectShellSamples: samples });
    let remaining = 120;
    const record = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(motion).transform);
      samples.push({
        opacity: Number(getComputedStyle(shell).opacity),
        phase: root.dataset.directPhase ?? "none",
        x: matrix.m41,
        y: matrix.m42,
      });
      if ((remaining -= 1) > 0) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, id);
}

async function shellSamples(page: Page): Promise<readonly ShellSample[]> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          snapMotionDirectShellSamples?: readonly ShellSample[];
        }
      ).snapMotionDirectShellSamples ?? [],
  );
}

function expectZeroOpacityRebase(samples: readonly ShellSample[]): void {
  // Once newer input owns the root, the retired shell's private phase is no longer the public
  // primary telemetry. Its rendered opacity and geometry remain the authoritative evidence.
  expect(samples.some((sample) => sample.phase === "fade-out")).toBe(true);
  expect(samples.filter((sample) => sample.opacity <= 0.01).length).toBeGreaterThanOrEqual(2);
  const jumps = samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index]!;
    const distance = Math.hypot(sample.x - previous.x, sample.y - previous.y);
    return distance > 40 ? [{ current: sample, distance, previous }] : [];
  });
  expect(jumps.length).toBeGreaterThan(0);
  const zeroOpacityJumps = jumps.filter(
    (jump) => jump.previous.opacity <= 0.01 && jump.current.opacity <= 0.01,
  );
  expect(zeroOpacityJumps.length).toBeGreaterThan(0);
}

async function grabPointError(page: Page, id: string) {
  return page.evaluate((itemId) => {
    const root = document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")!;
    const card = document.querySelector<HTMLElement>(
      `[data-snap-motion-stacked-deck-card][data-item-id='${itemId}']`,
    )!;
    const motion = card.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
    const box = motion.getBoundingClientRect();
    const pointerX = Number(root.dataset.directPointerX);
    const pointerY = Number(root.dataset.directPointerY);
    const grabX = Number(root.dataset.directGrabX);
    const grabY = Number(root.dataset.directGrabY);
    const transformedX = box.left + box.width / 2 + grabX;
    const transformedY = box.top + box.height / 2 + grabY;
    const errorX = transformedX - pointerX;
    const errorY = transformedY - pointerY;
    return {
      error: Math.hypot(errorX, errorY),
      errorX,
      errorY,
      sampleKind: root.dataset.directSampleKind,
    };
  }, id);
}

test("Direct keeps three local grab points attached through diagonal owned movement", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);

  for (const [relativeX, relativeY] of [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.75],
  ] as const) {
    await pagination(page).nth(3).click();
    await expectCarouselAt(stage, "team");
    const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
    const origin = await beginPointerAt(card, relativeX, relativeY);
    await movePointerBy(page, origin, -pitch * 0.42, 96, 120);
    await nextFrame(page);

    await expect(stage).toHaveAttribute("data-owned", "true");
    const error = await grabPointError(page, "team");
    expect(error.sampleKind).toBe("ordinary");
    expect(error.error).toBeLessThanOrEqual(0.5);

    await finishPointerBy(page, origin, -pitch * 0.42, 96, 180, "pointercancel");
    await expectCarouselAt(stage, "team");
  }
});

test("Direct reports touch catch-up and boundary resistance separately", async ({ page }) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  let card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  let origin = await beginPointerAt(card, 0.35, 0.65, "touch");
  await movePointerBy(page, origin, -pitch * 0.38, 72, 100);
  await nextFrame(page);

  await expect(stage).toHaveAttribute("data-direct-sample-kind", "catch-up");
  const catchUp = await grabPointError(page, "team");
  expect(catchUp.error).toBeLessThanOrEqual(0.5);
  expect(Number(await stage.getAttribute("data-physical-index"))).toBeGreaterThan(3.2);
  await finishPointerBy(page, origin, -pitch * 0.38, 72, 140, "pointercancel");
  await expectCarouselAt(stage, "team");

  await pagination(page).first().click();
  await expectCarouselAt(stage, "templates");
  card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='templates']");
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, pitch * 0.7, 90, 100);
  await nextFrame(page);
  await expect(stage).toHaveAttribute("data-direct-sample-kind", "boundary-resisted");
  await expect(stage).toHaveAttribute("data-direct-origin-id", "templates");
  await finishPointerBy(page, origin, pitch * 0.7, 90, 150, "pointercancel");
  await expectCarouselAt(stage, "templates");
});

test("Direct overdrag and reversal keep one stable origin with only an adjacent target", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const card = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  const origin = await beginPointerAt(card, 0.5, 0.5);

  for (const [deltaX, allowed] of [
    [-pitch * 3, ["team", "settings"]],
    [pitch * 3, ["map", "team"]],
  ] as const) {
    await movePointerBy(page, origin, deltaX, 60, deltaX < 0 ? 100 : 200);
    await nextFrame(page);
    await expect(stage).toHaveAttribute("data-direct-origin-id", "team");
    const exchanging = await page
      .locator("[data-snap-motion-stacked-deck-card]")
      .evaluateAll((elements) =>
        elements
          .filter((element) =>
            ["top", "target"].includes((element as HTMLElement).dataset.deckRole ?? ""),
          )
          .map((element) => (element as HTMLElement).dataset.itemId),
      );
    expect(exchanging.every((id) => id !== undefined && allowed.includes(id as never))).toBe(true);
  }

  await finishPointerBy(page, origin, pitch * 3, 60, 240, "pointercancel");
  await expectCarouselAt(stage, "team");
});

test("Direct rebases at zero opacity and keeps a new grab immediate during reconciliation", async ({
  page,
}) => {
  const stage = await prepareDirect(page);
  const pitch = await motionPitch(stage);
  const outgoing = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='team']");
  await startShellRecorder(page, "team");
  let origin = await beginPointerAt(outgoing, 0.2, 0.75);
  await movePointerBy(page, origin, -pitch * 0.76, 180, 140);
  await finishPointerBy(page, origin, -pitch * 0.76, 180, 180, "pointerup");
  await waitForAuthority(page, 4);
  await expect(stage).toHaveAttribute("data-direct-phase", "fade-out");

  const incoming = page.locator("[data-snap-motion-stacked-deck-card][data-item-id='settings']");
  await expect(incoming).toHaveAttribute("data-deck-interactive", "true");
  origin = await beginPointerAt(incoming, 0.75, 0.25);
  await movePointerBy(page, origin, pitch * 0.22, -45, 80);
  await nextFrame(page);
  await expect(stage).toHaveAttribute("data-direct-phase", "held");
  expect((await grabPointError(page, "settings")).error).toBeLessThanOrEqual(0.5);
  await finishPointerBy(page, origin, pitch * 0.22, -45, 120, "pointercancel");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(350);

  expectZeroOpacityRebase(await shellSamples(page));

  await startShellRecorder(page, "settings");
  const reverse = await beginPointerAt(incoming, 0.8, 0.25);
  await movePointerBy(page, reverse, pitch * 0.76, -180, 140);
  await finishPointerBy(page, reverse, pitch * 0.76, -180, 180, "pointerup");
  await expectCarouselAt(stage, "team");
  await page.waitForTimeout(350);
  expectZeroOpacityRebase(await shellSamples(page));

  await startShellRecorder(page, "team");
  const flick = await beginPointerAt(outgoing, 0.5, 0.5);
  await movePointerBy(page, flick, -pitch * 0.18, 35, 8);
  await movePointerBy(page, flick, -pitch * 0.48, 80, 16);
  await finishPointerBy(page, flick, -pitch * 0.48, 80, 24, "pointerup");
  await expectCarouselAt(stage, "settings");
  await page.waitForTimeout(350);
  expectZeroOpacityRebase(await shellSamples(page));
});

test("Direct autonomous navigation works with normal and reduced motion", async ({ page }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const stage = await prepareDirect(page, 2, reducedMotion);
    await stage.press("ArrowRight");
    await expectCarouselAt(stage, "team");
    await expect(stage).not.toHaveAttribute("data-direct-phase", "held");
  }
});

test("Direct preserves nested controls on the new top and accepts controlled takeover", async ({
  page,
}) => {
  await openLabDemo(page, "defaults", "no-preference");
  await page.getByTestId("defaults-deck-direct").click();
  const stage = page.getByTestId("defaults-deck");
  await expect(stage).toHaveAttribute("data-exchange", "direct");
  const initialId = await stage.getAttribute("data-active-id");
  expect(initialId).not.toBeNull();
  let card = stage.locator(`[data-snap-motion-stacked-deck-card][data-item-id='${initialId}']`);
  let origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, -700, 120, 120);
  await finishPointerBy(page, origin, -700, 120, 150, "pointerup");
  await expect(stage).not.toHaveAttribute("data-active-id", initialId!);
  const nextId = await stage.getAttribute("data-active-id");
  card = stage.locator(`[data-snap-motion-stacked-deck-card][data-item-id='${nextId}']`);
  await expect(card).toHaveAttribute("data-deck-interactive", "true");
  await card
    .getByTestId("defaults-card-button")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId("defaults-activations")).toHaveText("1");

  // External authority can take over a committed reconciliation without waiting for its fade.
  await page
    .getByTestId("defaults-route-first")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
  await expect(stage).toHaveAttribute("data-phase", "idle");

  // A cancelled two-axis return is equally interruptible.
  card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS[0]}']`,
  );
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, -180, 75, 90);
  await finishPointerBy(page, origin, -180, 75, 110, "pointercancel");
  await expect(stage).toHaveAttribute("data-direct-phase", "returning");
  await page
    .getByTestId("defaults-route-last")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS.at(-1)!);
  await expect(stage).toHaveAttribute("data-phase", "idle");

  card = stage.locator(
    `[data-snap-motion-stacked-deck-card][data-item-id='${STACKED_DECK_IDS.at(-1)}']`,
  );
  origin = await beginPointerAt(card, 0.5, 0.5);
  await movePointerBy(page, origin, 180, -60, 90);
  await expect(stage).toHaveAttribute("data-direct-phase", "held");
  await page
    .getByTestId("defaults-route-first")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await finishPointerBy(page, origin, 180, -60, 130, "pointerup");
  await expect(stage).toHaveAttribute("data-active-id", STACKED_DECK_IDS[0]);
});
