import { expect, test } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "./helpers";
import {
  beginHeldTraversal,
  destinations,
  fastFlick,
  finishPointer,
  holdPhysicalIndex,
  motionPitch,
  viewport,
  waitForAuthority,
} from "./stackedDeckHarness";
import {
  attachPileTrace,
  captureAutonomousPileScenario,
  captureHeldPileScenario,
  capturePileSnapshot,
  expectPileSnapshotWithinEndpointEnvelope,
  expectPhysicallyValidPileTrace,
  installHighContrastPileFixture,
} from "./stackedDeckPileTrace";

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "stacked-deck", "no-preference");
  await installHighContrastPileFixture(page);
});

for (const exchange of ["shuffle", "direct"] as const) {
  for (const scenario of [
    { direction: 1 as const, name: "forward interior", sourceIndex: 1 },
    { direction: -1 as const, name: "backward interior", sourceIndex: 2 },
    { direction: 1 as const, name: "forward semantic wrap", sourceIndex: 4 },
  ]) {
    test(`${exchange} ${scenario.name} keeps every background material behind the physical pile`, async ({
      page,
    }, testInfo) => {
      const trace = await captureHeldPileScenario(page, { exchange, ...scenario });
      await attachPileTrace(testInfo, trace);
      expectPhysicallyValidPileTrace(trace);
    });
  }
}

for (const scenario of [
  { direction: 1 as const, interactionOrigin: "button" as const, name: "Next", sourceIndex: 1 },
  {
    direction: -1 as const,
    interactionOrigin: "button" as const,
    name: "Previous",
    sourceIndex: 2,
  },
  {
    direction: 1 as const,
    interactionOrigin: "keyboard" as const,
    name: "ArrowRight wrap",
    sourceIndex: 4,
  },
  {
    direction: -1 as const,
    interactionOrigin: "keyboard" as const,
    name: "ArrowLeft wrap",
    sourceIndex: 0,
  },
]) {
  test(`autonomous Direct ${scenario.name} keeps the complete pile physically covered`, async ({
    page,
  }, testInfo) => {
    const trace = await captureAutonomousPileScenario(page, scenario);
    await attachPileTrace(testInfo, trace);
    expectPhysicallyValidPileTrace(trace, {
      allowFrameRateSkippedOcclusion: testInfo.project.name.includes("webkit"),
    });
  });
}

test("fast alternating Direct around semantic zero preserves pile-perimeter material ownership", async ({
  page,
}) => {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  await destinations(page).nth(4).click();
  await expectCarouselAt(stage, "settings");
  const settingsRest = await capturePileSnapshot(page);
  await destinations(page).nth(0).click();
  await expectCarouselAt(stage, "templates");
  const templatesRest = await capturePileSnapshot(page);
  await destinations(page).nth(4).click();
  await expectCarouselAt(stage, "settings");
  const pitch = await motionPitch(stage);

  for (const [sourceIndex, direction, targetIndex] of [
    [4, 1, 0],
    [0, -1, 4],
    [4, 1, 0],
  ] as const) {
    await fastFlick(page, direction, pitch);
    await waitForAuthority(page, targetIndex);
    for (let sample = 0; sample < 4; sample += 1) {
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      const snapshot = await capturePileSnapshot(page);
      expectPileSnapshotWithinEndpointEnvelope(
        snapshot,
        sourceIndex === 4 ? settingsRest : templatesRest,
        targetIndex === 0 ? templatesRest : settingsRest,
        sourceIndex,
        direction,
      );
    }
  }
  await expectCarouselAt(stage, "templates");
});

test("Direct parking inserts the outgoing card before an occluded fold shell re-emerges", async ({
  page,
}) => {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  await destinations(page).nth(2).click();
  await expectCarouselAt(stage, "map");
  const sourceRest = await capturePileSnapshot(page);
  await destinations(page).nth(1).click();
  await expectCarouselAt(stage, "project");
  const destinationRest = await capturePileSnapshot(page);
  await destinations(page).nth(2).click();
  await expectCarouselAt(stage, "map");

  const switchingPixels = [sourceRest.painted.materials.settings!.pixelCount];
  const held = await beginHeldTraversal(page, 2);
  for (const progress of [0.3, 0.6, 0.95]) {
    await holdPhysicalIndex(page, held, 2 - progress, 90);
    const snapshot = await capturePileSnapshot(page);
    expectPileSnapshotWithinEndpointEnvelope(snapshot, sourceRest, destinationRest, 2, -1);
    switchingPixels.push(snapshot.painted.materials.settings!.pixelCount);
  }
  await finishPointer(page, held.origin, held.pitch * 0.95, held.elapsedMs + 120, "pointerup");
  for (let sample = 0; sample < 120; sample += 1) {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const snapshot = await capturePileSnapshot(page);
    expectPileSnapshotWithinEndpointEnvelope(snapshot, sourceRest, destinationRest, 2, -1, true);
    switchingPixels.push(snapshot.painted.materials.settings!.pixelCount);
    if (
      snapshot.rendered.controllerPhase === "idle" &&
      snapshot.rendered.authoritativeIndex === 1
    ) {
      break;
    }
  }
  await expectCarouselAt(stage, "project");
  expect(switchingPixels.some((pixels) => pixels === 0)).toBe(true);
  expect(switchingPixels.at(-1)).toBeGreaterThan(0);
});
