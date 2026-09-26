import { writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { stackedDeckTransform } from "../packages/vue/src/stacked-deck/stacked-deck-contracts";
import { expectCarouselAt, openLabDemo } from "./helpers";
import {
  beginHeldTraversal,
  destinations,
  fastFlick,
  finishPointer,
  holdPhysicalIndex,
  motionPitch,
  viewport,
} from "./stackedDeckHarness";
import {
  exposedModelArea,
  fullyOccludedRasterPixels,
  type PileGeometry,
  type PilePoseGeometry,
} from "./stackedDeckPileGeometry";
import {
  attachPileTrace,
  captureAutonomousPileScenario,
  captureHeldPileScenario,
  capturePileSnapshot,
  expectPileSnapshotWithinEndpointEnvelope,
  expectPhysicallyValidPileTrace,
  installHighContrastPileFixture,
} from "./stackedDeckPileTrace";

const FAST_ALTERNATING_DIRECT_PILE_TITLE =
  "fast alternating Direct around semantic zero preserves pile-perimeter material ownership";

function geometryOf(state: {
  readonly cardWidth: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly publication: { readonly poses: readonly PilePoseGeometry[] };
  readonly shells: readonly {
    readonly matrix: PileGeometry["dom"][number]["matrix"];
    readonly opacity: string;
    readonly surfaceHeight: number;
    readonly surfaceWidth: number;
    readonly visibility: string;
    readonly zIndex: string;
  }[];
}): PileGeometry {
  return {
    cardWidth: state.cardWidth,
    cardHeight: state.shells[0]!.surfaceHeight,
    stageWidth: state.stageWidth,
    stageHeight: state.stageHeight,
    poses: state.publication.poses,
    dom: state.shells.map((shell) => ({
      layer: Number(shell.zIndex),
      matrix: shell.matrix,
      opacity: Number(shell.opacity),
      visible: shell.visibility === "visible",
      width: shell.surfaceWidth,
      height: shell.surfaceHeight,
    })),
  };
}

function isTrueRest(
  state: {
    readonly phase: string | undefined;
    readonly activeId: string | undefined;
    readonly publication: {
      readonly projection: { readonly phase?: string };
      readonly landings: readonly unknown[];
    };
  },
  id: string,
): boolean {
  return (
    state.phase === "idle" &&
    state.activeId === id &&
    state.publication.projection.phase === undefined &&
    state.publication.landings.length === 0
  );
}

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title === FAST_ALTERNATING_DIRECT_PILE_TITLE) {
    await page.clock.install();
  }
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

test(FAST_ALTERNATING_DIRECT_PILE_TITLE, async ({ page }, testInfo) => {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  await destinations(page).nth(0).click();
  await expectCarouselAt(stage, "templates");

  const readGeometry = () =>
    stage.evaluate((element) => {
      const directDebug = (
        element as HTMLElement & {
          snapMotionDirectDebug?: {
            rendered?: {
              revision: number;
              timestamp: number;
              projection: {
                direction: -1 | 0 | 1;
                originIndex: number;
                phase?: "held" | "parking" | "returning";
                settlement: number;
                signedTravel: number;
                targetIndex: number | null;
                translateX: number;
                translateY: number;
              };
              landings: readonly Record<string, unknown>[];
              poses: readonly PilePoseGeometry[];
            };
          };
        }
      ).snapMotionDirectDebug;
      const rendered = directDebug?.rendered;
      if (!rendered) throw new Error("Missing immutable Direct publication");
      const shells = [
        ...element.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card"),
      ].map((shell) => {
        const motion = shell.querySelector<HTMLElement>(".snap-motion-stacked-deck-card-motion")!;
        const surface = shell.querySelector<HTMLElement>(".screen-chrome")!;
        const shellStyle = getComputedStyle(shell);
        const motionStyle = getComputedStyle(motion);
        const surfaceStyle = getComputedStyle(surface);
        const matrix = new DOMMatrix(motionStyle.transform);
        return {
          id: shell.dataset.itemId,
          index: [...shell.parentElement!.children].indexOf(shell),
          layer: shell.dataset.deckLayer,
          zIndex: shellStyle.zIndex,
          visibility: shellStyle.visibility,
          opacity: shellStyle.opacity,
          transform: motionStyle.transform,
          inlineTransform: motion.style.transform,
          matrix: {
            a: matrix.a,
            b: matrix.b,
            c: matrix.c,
            d: matrix.d,
            e: matrix.e,
            f: matrix.f,
          },
          transformOrigin: motionStyle.transformOrigin,
          motionRect: motion.getBoundingClientRect().toJSON(),
          surfaceRect: surface.getBoundingClientRect().toJSON(),
          surfaceBackground: surfaceStyle.backgroundColor,
          surfaceWidth: surface.offsetWidth,
          surfaceHeight: surface.offsetHeight,
        };
      });
      return {
        revision: rendered.revision,
        publication: rendered,
        stageRect: element.getBoundingClientRect().toJSON(),
        stageWidth: element.clientWidth,
        stageHeight: element.clientHeight,
        cardWidth: Number(element.dataset.cardWidth),
        dpr: devicePixelRatio,
        phase: element.dataset.phase,
        activeId: element.dataset.activeId,
        signedLocalDistance: Number(element.dataset.signedLocalDistance),
        shells,
      };
    });

  const alignStage = async () => {
    await stage.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top));
  };

  const capture = async (label: string) => {
    const observed = await readGeometry();
    const expectedTransforms = await page.evaluate(
      (transforms) =>
        transforms.map((transform) => {
          const style = document.createElement("div").style;
          style.transform = transform;
          return style.transform;
        }),
      observed.publication.poses.map(stackedDeckTransform),
    );
    for (const [index, shell] of observed.shells.entries()) {
      const pose = observed.publication.poses[index]!;
      expect(
        shell.inlineTransform,
        `${label}: ${shell.id} transform disagrees with publication`,
      ).toBe(expectedTransforms[index]);
      expect(Number(shell.zIndex)).toBe(pose.layer);
      expect(Number(shell.opacity)).toBe(pose.opacity);
      expect(pose.opacity).toBe(1);
      expect(shell.visibility === "visible").toBe(pose.visible);
      expect(shell.surfaceWidth).toBe(observed.cardWidth);
    }
    const screenshot = await stage.screenshot({ animations: "allow", type: "png" });
    const raster = await page.evaluate(async (encoded) => {
      const colors = {
        templates: [220, 38, 38],
        project: [37, 99, 235],
        map: [22, 163, 74],
        team: [234, 88, 12],
        settings: [88, 28, 135],
      } as const;
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const materials = Object.fromEntries(
        Object.keys(colors).map((id) => [
          id,
          {
            pixelCount: 0,
            centerPixels: 0,
            leftPixels: 0,
            rightPixels: 0,
            left: null as number | null,
            right: null as number | null,
            top: null as number | null,
            bottom: null as number | null,
            pixels: [] as number[],
          },
        ]),
      );
      const center = canvas.width / 2;
      const centerHalfWidth =
        Number(
          document.querySelector<HTMLElement>("[data-testid='stacked-deck-viewport']")?.dataset
            .cardWidth,
        ) * 0.06;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          for (const [id, color] of Object.entries(colors)) {
            if (
              Math.abs(pixels[offset]! - color[0]!) > 2 ||
              Math.abs(pixels[offset + 1]! - color[1]!) > 2 ||
              Math.abs(pixels[offset + 2]! - color[2]!) > 2 ||
              pixels[offset + 3]! < 250
            )
              continue;
            const material = materials[id]!;
            material.pixelCount += 1;
            material.pixels.push(y * canvas.width + x);
            material.left = material.left === null ? x : Math.min(material.left, x);
            material.right = material.right === null ? x : Math.max(material.right, x);
            material.top = material.top === null ? y : Math.min(material.top, y);
            material.bottom = material.bottom === null ? y : Math.max(material.bottom, y);
            if (x < center - centerHalfWidth) material.leftPixels += 1;
            else if (x > center + centerHalfWidth) material.rightPixels += 1;
            else material.centerPixels += 1;
            break;
          }
        }
      }
      return { width: canvas.width, height: canvas.height, materials };
    }, screenshot.toString("base64"));
    const after = await readGeometry();
    expect(after.revision, `publication changed during ${label} screenshot`).toBe(
      observed.revision,
    );
    expect(after.stageRect).toEqual(observed.stageRect);
    expect(
      after.shells.map(({ transform, surfaceRect, zIndex }) => ({
        transform,
        surfaceRect,
        zIndex,
      })),
    ).toEqual(
      observed.shells.map(({ transform, surfaceRect, zIndex }) => ({
        transform,
        surfaceRect,
        zIndex,
      })),
    );
    return { label, ...observed, raster, screenshot };
  };

  const expectPhysicalEnvelope = (
    sample: Awaited<ReturnType<typeof capture>>,
    sourceRest: Awaited<ReturnType<typeof capture>>,
    destinationRest: Awaited<ReturnType<typeof capture>>,
    sourceIndex: 0 | 4,
  ) => {
    const geometry = geometryOf(sample);
    const sourceGeometry = geometryOf(sourceRest);
    const destinationGeometry = geometryOf(destinationRest);
    const sourceId = sourceRest.shells[sourceIndex]!.id!;
    const centerTolerance =
      Math.ceil(sourceRest.raster.materials[sourceId]!.pixelCount * 0.002) + 4;

    // Map crosses the ring fold in both directions. Its actual painted centre remains empty.
    expect(sample.raster.materials.map!.centerPixels).toBeLessThanOrEqual(centerTolerance);
    for (const index of [1, 2, 3]) {
      const id = sample.shells[index]!.id!;
      const painted = sample.raster.materials[id]!;
      expect(
        fullyOccludedRasterPixels(geometry, index, painted.pixels, sample.raster.width, sample.dpr),
        `${id} painted inside a front shell at Direct revision ${sample.revision}`,
      ).toEqual([]);

      // While the released shell is still arcing away, its background can show beyond either rest.
      // Once that shell has arrived, the subordinate material must fit the exchange's two rests.
      const { phase, settlement } = sample.publication.projection;
      if (phase === "parking" && settlement < 1) continue;
      const endpointEnvelope = Math.max(
        exposedModelArea(sourceGeometry, index),
        exposedModelArea(destinationGeometry, index),
      );
      expect(
        exposedModelArea(geometry, index),
        `${id} continuous exposure at Direct revision ${sample.revision}`,
      ).toBeLessThanOrEqual(endpointEnvelope);
    }
  };

  await expect
    .poll(async () => isTrueRest(await readGeometry(), "templates"), { timeout: 10_000 })
    .toBe(true);
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
  expect(isTrueRest(await readGeometry(), "templates")).toBe(true);
  await alignStage();
  const source = await capture("templates-rest");
  await destinations(page).nth(4).click();
  for (let step = 0; step < 120; step += 1) {
    const state = await readGeometry();
    if (isTrueRest(state, "settings")) break;
    await page.clock.runFor(16);
  }
  expect(isTrueRest(await readGeometry(), "settings")).toBe(true);
  await alignStage();
  const destination = await capture("settings-rest");
  expect(source.stageRect).toEqual(destination.stageRect);
  const pitch = await motionPitch(stage);
  await fastFlick(page, 1, pitch);
  let firstAuthority = false;
  for (let step = 0; step < 120; step += 1) {
    await page.clock.runFor(16);
    const state = await readGeometry();
    if (state.activeId === "templates") {
      firstAuthority = true;
      break;
    }
  }
  expect(firstAuthority).toBe(true);
  for (let frame = 0; frame < 4; frame += 1) {
    await page.clock.runFor(16);
    expectPhysicalEnvelope(await capture(`first-${frame}`), destination, source, 4);
  }
  const beforeSecond = await readGeometry();
  expect(beforeSecond.publication.projection.phase).toBe("parking");
  await fastFlick(page, -1, pitch);
  const samples = [] as Awaited<ReturnType<typeof capture>>[];
  let lastRevision = -1;
  const progressTrace = [] as {
    revision: number;
    phase: string | undefined;
    progress: number;
    settlement: unknown;
    landingCount: number;
  }[];
  for (let tick = 0; tick < 240; tick += 1) {
    await page.clock.runFor(8);
    const state = await readGeometry();
    if (state.revision === lastRevision) continue;
    lastRevision = state.revision;
    const projection = state.publication.projection;
    const progress = -projection.signedTravel;
    progressTrace.push({
      revision: state.revision,
      phase: state.phase,
      progress,
      settlement: projection.settlement,
      landingCount: state.publication.landings.length,
    });
    if (progress >= 0.94 && state.phase !== "idle") {
      const sample = await capture(`travel-${tick}`);
      expectPhysicalEnvelope(sample, source, destination, 0);
      samples.push(sample);
    }
    if (progress >= 0.998 && projection.settlement === 1) break;
  }
  expect(samples.length).toBeGreaterThan(5);
  expect(samples.some((sample) => -sample.publication.projection.signedTravel >= 0.993)).toBe(true);
  await fastFlick(page, 1, pitch);
  let thirdAuthority = false;
  for (let step = 0; step < 120; step += 1) {
    await page.clock.runFor(16);
    if ((await readGeometry()).activeId === "templates") {
      thirdAuthority = true;
      break;
    }
  }
  expect(thirdAuthority).toBe(true);
  for (let frame = 0; frame < 4; frame += 1) {
    await page.clock.runFor(16);
    expectPhysicalEnvelope(await capture(`third-${frame}`), destination, source, 4);
  }
  for (let step = 0; step < 120; step += 1) {
    if (isTrueRest(await readGeometry(), "templates")) break;
    await page.clock.runFor(16);
  }
  expect(isTrueRest(await readGeometry(), "templates")).toBe(true);
  const max = samples.toSorted(
    (a, b) => b.raster.materials.team!.pixelCount - a.raster.materials.team!.pixelCount,
  )[0];
  expect(max).toBeDefined();
  const summarize = (sample: Awaited<ReturnType<typeof capture>>) => ({
    revision: sample.revision,
    timestamp: sample.publication.timestamp,
    projection: sample.publication.projection,
    landings: sample.publication.landings,
    poses: sample.publication.poses,
    shells: sample.shells,
    stageRect: sample.stageRect,
    cardWidth: sample.cardWidth,
    cardHeight: sample.shells[0]!.surfaceHeight,
    devicePixelRatio: sample.dpr,
    raster: {
      width: sample.raster.width,
      height: sample.raster.height,
      materials: Object.fromEntries(
        Object.entries(sample.raster.materials).map(([id, { pixels: _pixels, ...material }]) => [
          id,
          material,
        ]),
      ),
    },
    exposedModelArea: Object.fromEntries(
      [1, 2, 3].map((index) => [
        sample.shells[index]!.id,
        exposedModelArea(geometryOf(sample), index),
      ]),
    ),
  });
  const report = {
    source: summarize(source),
    destination: summarize(destination),
    maximum: summarize(max!),
    nearEndpoint: samples.map(({ revision, publication, raster }) => ({
      revision,
      progress: -publication.projection.signedTravel,
      teamPixels: raster.materials.team!.pixelCount,
    })),
    beforeSecond: {
      revision: beforeSecond.revision,
      projection: beforeSecond.publication.projection,
      landingCount: beforeSecond.publication.landings.length,
    },
    progressTrace,
  };
  const reportPath = testInfo.outputPath("same-publication-pile.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach("same-publication-pile", {
    contentType: "application/json",
    path: reportPath,
  });
  if (max!.raster.materials.team!.pixelCount > destination.raster.materials.team!.pixelCount) {
    await testInfo.attach("maximum-team-raster", {
      body: max!.screenshot,
      contentType: "image/png",
    });
  }
});
