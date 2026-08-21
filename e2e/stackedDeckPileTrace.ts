import { writeFile } from "node:fs/promises";

import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

import { expectCarouselAt } from "./helpers";
import {
  STACKED_DECK_IDS,
  beginHeldTraversal,
  destinations,
  finishPointer,
  holdPhysicalIndex,
  readFrame,
  viewport,
} from "./stackedDeckHarness";

export type PileTraceDirection = -1 | 1;
export type PileTraceExchange = "direct" | "shuffle";

const MATERIALS = [
  { color: [220, 38, 38] as const, id: "templates", label: "A / TEMPLATES" },
  { color: [37, 99, 235] as const, id: "project", label: "B / PROJECT" },
  { color: [22, 163, 74] as const, id: "map", label: "C / MAP" },
  { color: [234, 88, 12] as const, id: "team", label: "D / TEAM" },
  { color: [88, 28, 135] as const, id: "settings", label: "E / SETTINGS" },
] as const;

export const PILE_TRACE_PROGRESS = [
  0, 0.0005, 0.001, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3,
  0.325, 0.35, 0.375, 0.4, 0.425, 0.45, 0.475, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625, 0.65, 0.675,
  0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99,
] as const;

interface PixelEnvelope {
  readonly bottom: number | null;
  readonly centerPixels: number;
  readonly left: number | null;
  readonly leftPixels: number;
  readonly pixelCount: number;
  readonly right: number | null;
  readonly rightPixels: number;
  readonly top: number | null;
}

interface StagePointOwner {
  readonly itemId: string | null;
  readonly x: number;
  readonly y: number;
}

export interface PaintedPile {
  readonly height: number;
  readonly materials: Readonly<Record<string, PixelEnvelope>>;
  readonly stagePoints: readonly StagePointOwner[];
  readonly width: number;
}

export interface PileSnapshot {
  readonly painted: PaintedPile;
  readonly rendered: Awaited<ReturnType<typeof readFrame>>;
}

export interface PileShellTrace {
  readonly canonicalRingDepth: number;
  readonly destinationDepth: number;
  readonly destinationSlot: number;
  readonly id: string;
  readonly index: number;
  readonly interactive: boolean;
  readonly layer: number;
  readonly opacity: number;
  readonly painted: PixelEnvelope;
  readonly paintedBoundingGeometry: {
    readonly bottom: number;
    readonly height: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly width: number;
  };
  readonly role: string;
  readonly rotate: number;
  readonly scale: number;
  readonly signedVisiblePileSlot: number;
  readonly sourceDepth: number;
  readonly sourceSlot: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly visible: boolean;
}

export interface PileFrameTrace {
  readonly exchange: PileTraceExchange;
  readonly frame: number;
  readonly interactionOrigin: "button" | "keyboard" | "pointer";
  readonly physicalDirection: PileTraceDirection;
  readonly physicalProgress: number;
  readonly semanticOrdinal: number;
  readonly shells: readonly PileShellTrace[];
  readonly stagePoints: readonly StagePointOwner[];
  readonly timestamp: number;
}

export interface PileScenarioTrace {
  readonly destinationIndex: number;
  readonly direction: PileTraceDirection;
  readonly exchange: PileTraceExchange;
  readonly frames: readonly PileFrameTrace[];
  readonly layerCrossovers: readonly {
    readonly afterFrame: number;
    readonly before: readonly [string, string];
    readonly pair: readonly [string, string];
  }[];
  readonly nonParticipatingIds: readonly string[];
  readonly sourceId: string;
  readonly sourceIndex: number;
  readonly targetId: string;
  readonly switchingId: string;
}

function ringDepth(topIndex: number, itemIndex: number, itemCount: number): number {
  return (itemIndex - topIndex + itemCount) % itemCount;
}

function signedRingSlot(depth: number, itemCount: number): number {
  if (depth === 0) return 0;
  return depth <= Math.floor(itemCount / 2) ? depth : depth - itemCount;
}

function relativePaintOrder(
  first: Pick<PileShellTrace, "id" | "layer">,
  second: Pick<PileShellTrace, "id" | "layer">,
): readonly [string, string] {
  return first.layer > second.layer ? [first.id, second.id] : [second.id, first.id];
}

function layerCrossovers(frames: readonly PileFrameTrace[]) {
  const crossovers: {
    afterFrame: number;
    before: readonly [string, string];
    pair: readonly [string, string];
  }[] = [];
  const first = frames[0];
  if (!first) return crossovers;
  for (let left = 0; left < first.shells.length; left += 1) {
    for (let right = left + 1; right < first.shells.length; right += 1) {
      let previous = relativePaintOrder(first.shells[left]!, first.shells[right]!);
      for (const frame of frames.slice(1)) {
        const current = relativePaintOrder(frame.shells[left]!, frame.shells[right]!);
        if (current[0] === previous[0]) continue;
        crossovers.push({
          afterFrame: frame.frame,
          before: previous,
          pair: [first.shells[left]!.id, first.shells[right]!.id],
        });
        previous = current;
      }
    }
  }
  return crossovers;
}

export async function installHighContrastPileFixture(page: Page): Promise<void> {
  const rules = MATERIALS.map(
    ({ color, id, label }) => `
      .snap-motion-stacked-deck-card[data-item-id="${id}"] .screen-chrome {
        background: rgb(${color.join(" ")}) !important;
        color: white !important;
      }
      .snap-motion-stacked-deck-card[data-item-id="${id}"] .screen-chrome::before {
        content: "${label}";
      }
    `,
  ).join("\n");
  await page.addStyleTag({
    content: `
      .stacked-deck-demo .snap-motion-stacked-deck-card-motion {
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      .stacked-deck-demo .screen-chrome {
        display: grid !important;
        place-items: center !important;
        border: 0 !important;
        border-radius: 0 !important;
      }
      .stacked-deck-demo .screen-chrome::after,
      .stacked-deck-demo .stacked-screen-image {
        display: none !important;
      }
      .stacked-deck-demo .screen-chrome::before {
        position: relative;
        z-index: 1;
        padding: 0.65rem 0.85rem;
        border: 2px solid currentColor;
        background: rgb(0 0 0 / 0.3);
        color: inherit;
        font: 800 1.4rem/1 system-ui, sans-serif;
        letter-spacing: 0.06em;
      }
      ${rules}
    `,
  });
  await expect(page.locator(".stacked-screen-image").first()).toBeHidden();
}

async function readPaintedPile(stage: Locator, stageCardWidth: number): Promise<PaintedPile> {
  const screenshot = await stage.screenshot({ animations: "allow", type: "png" });
  const painted = await stage.page().evaluate(
    async ({ cardWidth, encoded, materials }) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("The browser could not create a pixel trace canvas.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const center = canvas.width / 2;
      const centerHalfWidth = cardWidth * 0.06;
      const materialAt = (x: number, y: number) => {
        const offset = (y * canvas.width + x) * 4;
        for (const material of materials) {
          if (
            Math.abs(pixels[offset]! - material.color[0]) <= 2 &&
            Math.abs(pixels[offset + 1]! - material.color[1]) <= 2 &&
            Math.abs(pixels[offset + 2]! - material.color[2]) <= 2 &&
            pixels[offset + 3]! >= 250
          ) {
            return material.id;
          }
        }
        return null;
      };
      const mutable = Object.fromEntries(
        materials.map((material) => [
          material.id,
          {
            bottom: null as number | null,
            centerPixels: 0,
            left: null as number | null,
            leftPixels: 0,
            pixelCount: 0,
            right: null as number | null,
            rightPixels: 0,
            top: null as number | null,
          },
        ]),
      );
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const id = materialAt(x, y);
          if (id === null) continue;
          const observation = mutable[id]!;
          observation.pixelCount += 1;
          observation.left = observation.left === null ? x : Math.min(observation.left, x);
          observation.right = observation.right === null ? x : Math.max(observation.right, x);
          observation.top = observation.top === null ? y : Math.min(observation.top, y);
          observation.bottom = observation.bottom === null ? y : Math.max(observation.bottom, y);
          if (x < center - centerHalfWidth) observation.leftPixels += 1;
          else if (x > center + centerHalfWidth) observation.rightPixels += 1;
          else observation.centerPixels += 1;
        }
      }
      const stagePoints: StagePointOwner[] = [];
      for (const yRatio of [-0.25, 0, 0.25]) {
        for (const xRatio of [-0.5, -0.25, 0, 0.25, 0.5]) {
          const x = Math.round(center + cardWidth * xRatio);
          const y = Math.round(canvas.height / 2 + cardWidth * 0.625 * yRatio);
          stagePoints.push({ itemId: materialAt(x, y), x, y });
        }
      }
      return {
        height: canvas.height,
        materials: mutable,
        stagePoints,
        width: canvas.width,
      };
    },
    {
      cardWidth: stageCardWidth,
      encoded: screenshot.toString("base64"),
      materials: MATERIALS.map(({ color, id }) => ({ color, id })),
    },
  );
  return painted;
}

export async function capturePileSnapshot(page: Page): Promise<PileSnapshot> {
  const before = await readFrame(page);
  const painted = await readPaintedPile(viewport(page), before.cardWidth);
  return {
    painted,
    rendered: await readFrame(page),
  };
}

/**
 * Every subordinate shell, held to what the exchange itself is allowed to do to it.
 *
 * `released` names the frames after the hand has let go. There the exchange is over as far as the
 * pile is concerned — it is already at its destination rest — and the only thing still moving is
 * the shell the hand threw, which arcs clear of the deck on its way into the pile and uncovers
 * whatever was behind it while it is out there. How much of itself a background shell shows is
 * therefore not bounded by its two rests on those frames, and asserting that it is only holds for
 * an implementation that hides the whole pile for the duration. What is asserted on every frame is
 * the claim that matters: the shell the ring carries across the fold contributes nothing at the
 * centre of the deck.
 */
export function expectPileSnapshotWithinEndpointEnvelope(
  snapshot: PileSnapshot,
  source: PileSnapshot,
  destination: PileSnapshot,
  sourceIndex: number,
  direction: PileTraceDirection,
  released = false,
): void {
  const destinationIndex =
    (sourceIndex + direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length;
  const tolerance =
    Math.ceil(source.painted.materials[STACKED_DECK_IDS[sourceIndex]!]!.pixelCount * 0.002) + 4;
  for (let index = 0; index < STACKED_DECK_IDS.length; index += 1) {
    if (index === sourceIndex || index === destinationIndex) continue;
    const id = STACKED_DECK_IDS[index]!;
    const endpointEnvelope = Math.max(
      source.painted.materials[id]!.pixelCount,
      destination.painted.materials[id]!.pixelCount,
    );
    if (!released) {
      expect(
        snapshot.painted.materials[id]!.pixelCount,
        `${id} during ${sourceIndex} ${direction} at ${snapshot.rendered.signedLocalDistance}; ` +
          `poses=${JSON.stringify(
            snapshot.rendered.poses.map(
              ({ bottom, id: poseId, layer, left, right, scale, top, translateX, translateY }) => ({
                bottom,
                id: poseId,
                layer,
                left,
                right,
                scale,
                top,
                translateX,
                translateY,
              }),
            ),
          )}`,
      ).toBeLessThanOrEqual(endpointEnvelope + tolerance);
    }
    const sourceSlot = signedRingSlot(
      ringDepth(sourceIndex, index, STACKED_DECK_IDS.length),
      STACKED_DECK_IDS.length,
    );
    const destinationSlot = signedRingSlot(
      ringDepth(destinationIndex, index, STACKED_DECK_IDS.length),
      STACKED_DECK_IDS.length,
    );
    if (Math.sign(sourceSlot) !== Math.sign(destinationSlot)) {
      expect(snapshot.painted.materials[id]!.centerPixels).toBeLessThanOrEqual(tolerance);
    }
  }
}

async function selectIndex(page: Page, index: number): Promise<void> {
  await destinations(page).nth(index).click();
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[index]!);
}

function createPileFrameTrace(
  rendered: Awaited<ReturnType<typeof readFrame>>,
  painted: PaintedPile,
  context: {
    readonly destinationIndex: number;
    readonly direction: PileTraceDirection;
    readonly exchange: PileTraceExchange;
    readonly frameIndex: number;
    readonly interactionOrigin: PileFrameTrace["interactionOrigin"];
    readonly physicalProgress: number;
    readonly sourceIndex: number;
  },
): PileFrameTrace {
  return {
    exchange: context.exchange,
    frame: context.frameIndex,
    interactionOrigin: context.interactionOrigin,
    physicalDirection: context.direction,
    physicalProgress: context.physicalProgress,
    semanticOrdinal: rendered.authoritativeIndex,
    shells: rendered.poses.map((pose) => {
      const sourceDepth = ringDepth(context.sourceIndex, pose.index, STACKED_DECK_IDS.length);
      const destinationDepth = ringDepth(
        context.destinationIndex,
        pose.index,
        STACKED_DECK_IDS.length,
      );
      return {
        canonicalRingDepth: ringDepth(rendered.visualTopIndex, pose.index, STACKED_DECK_IDS.length),
        destinationDepth,
        destinationSlot: signedRingSlot(destinationDepth, STACKED_DECK_IDS.length),
        id: pose.id,
        index: pose.index,
        interactive: pose.interactive,
        layer: pose.layer,
        opacity: pose.opacity,
        painted: painted.materials[pose.id]!,
        paintedBoundingGeometry: {
          bottom: pose.bottom,
          height: pose.height,
          left: pose.left,
          right: pose.right,
          top: pose.top,
          width: pose.width,
        },
        role: pose.role,
        rotate: pose.rotate,
        scale: pose.scale,
        signedVisiblePileSlot: signedRingSlot(
          ringDepth(rendered.visualTopIndex, pose.index, STACKED_DECK_IDS.length),
          STACKED_DECK_IDS.length,
        ),
        sourceDepth,
        sourceSlot: signedRingSlot(sourceDepth, STACKED_DECK_IDS.length),
        translateX: pose.translateX,
        translateY: pose.translateY,
        visible: pose.visible,
      };
    }),
    stagePoints: painted.stagePoints,
    timestamp: Date.now(),
  };
}

function scenarioTrace(
  exchange: PileTraceExchange,
  sourceIndex: number,
  direction: PileTraceDirection,
  frames: readonly PileFrameTrace[],
): PileScenarioTrace {
  const destinationIndex =
    (sourceIndex + direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length;
  const switchingIndex = STACKED_DECK_IDS.findIndex((_, index) => {
    if (index === sourceIndex || index === destinationIndex) return false;
    const sourceSlot = signedRingSlot(
      ringDepth(sourceIndex, index, STACKED_DECK_IDS.length),
      STACKED_DECK_IDS.length,
    );
    const destinationSlot = signedRingSlot(
      ringDepth(destinationIndex, index, STACKED_DECK_IDS.length),
      STACKED_DECK_IDS.length,
    );
    return Math.sign(sourceSlot) !== Math.sign(destinationSlot);
  });
  if (switchingIndex < 0) throw new Error("The scenario has no non-participating side switch.");
  return {
    destinationIndex,
    direction,
    exchange,
    frames,
    layerCrossovers: layerCrossovers(frames),
    nonParticipatingIds: STACKED_DECK_IDS.filter(
      (_, index) => index !== sourceIndex && index !== destinationIndex,
    ),
    sourceId: STACKED_DECK_IDS[sourceIndex]!,
    sourceIndex,
    targetId: STACKED_DECK_IDS[destinationIndex]!,
    switchingId: STACKED_DECK_IDS[switchingIndex]!,
  };
}

export async function captureHeldPileScenario(
  page: Page,
  options: {
    readonly direction: PileTraceDirection;
    readonly exchange: PileTraceExchange;
    readonly progress?: readonly number[];
    readonly sourceIndex: number;
  },
): Promise<PileScenarioTrace> {
  const stage = viewport(page);
  await page.getByTestId(`stacked-deck-exchange-${options.exchange}`).click();
  await selectIndex(page, options.sourceIndex);
  const direction = options.direction;
  const destinationIndex =
    (options.sourceIndex + direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length;
  const sourceId = STACKED_DECK_IDS[options.sourceIndex]!;
  const frames: PileFrameTrace[] = [];
  const progress = options.progress ?? PILE_TRACE_PROGRESS;
  const held = await beginHeldTraversal(page, options.sourceIndex);
  try {
    for (let frameIndex = 0; frameIndex < progress.length; frameIndex += 1) {
      const requestedProgress = progress[frameIndex]!;
      const frame =
        requestedProgress === 0
          ? await readFrame(page)
          : await holdPhysicalIndex(
              page,
              held,
              options.sourceIndex + direction * requestedProgress,
              32,
            );
      const painted = await readPaintedPile(stage, frame.cardWidth);
      frames.push(
        createPileFrameTrace(frame, painted, {
          destinationIndex,
          direction,
          exchange: options.exchange,
          frameIndex,
          interactionOrigin: "pointer",
          physicalProgress: requestedProgress,
          sourceIndex: options.sourceIndex,
        }),
      );
    }
  } finally {
    await finishPointer(page, held.origin, 0, held.elapsedMs + 80, "pointercancel");
    await expectCarouselAt(stage, sourceId);
  }
  return scenarioTrace(options.exchange, options.sourceIndex, direction, frames);
}

export async function captureAutonomousPileScenario(
  page: Page,
  options: {
    readonly direction: PileTraceDirection;
    readonly interactionOrigin: "button" | "keyboard";
    readonly sourceIndex: number;
  },
): Promise<PileScenarioTrace> {
  const stage = viewport(page);
  await page.getByTestId("stacked-deck-exchange-direct").click();
  await selectIndex(page, options.sourceIndex);
  const destinationIndex =
    (options.sourceIndex + options.direction + STACKED_DECK_IDS.length) % STACKED_DECK_IDS.length;
  const frames: PileFrameTrace[] = [];
  const capture = async () => {
    const rendered = await readFrame(page);
    const painted = await readPaintedPile(stage, rendered.cardWidth);
    frames.push(
      createPileFrameTrace(rendered, painted, {
        destinationIndex,
        direction: options.direction,
        exchange: "direct",
        frameIndex: frames.length,
        interactionOrigin: options.interactionOrigin,
        physicalProgress:
          rendered.controllerPhase === "idle"
            ? rendered.authoritativeIndex === destinationIndex
              ? 1
              : 0
            : Math.min(0.999, Math.abs(rendered.signedLocalDistance)),
        sourceIndex: options.sourceIndex,
      }),
    );
    return rendered;
  };

  await capture();
  if (options.interactionOrigin === "button") {
    await page
      .getByTestId(options.direction > 0 ? "stacked-deck-next" : "stacked-deck-previous")
      .click();
  } else {
    await stage.focus();
    await page.keyboard.press(options.direction > 0 ? "ArrowRight" : "ArrowLeft");
  }
  for (let sample = 0; sample < 120; sample += 1) {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const rendered = await capture();
    if (
      frames.length >= 4 &&
      rendered.controllerPhase === "idle" &&
      rendered.authoritativeIndex === destinationIndex
    ) {
      break;
    }
  }
  await expectCarouselAt(stage, STACKED_DECK_IDS[destinationIndex]!);
  return scenarioTrace("direct", options.sourceIndex, options.direction, frames);
}

export function expectPhysicallyValidPileTrace(
  trace: PileScenarioTrace,
  options: { readonly allowFrameRateSkippedOcclusion?: boolean } = {},
): void {
  const first = trace.frames[0]!;
  const last = trace.frames.at(-1)!;
  const switchingFirst = first.shells.find((shell) => shell.id === trace.switchingId)!;
  const switchingLast = last.shells.find((shell) => shell.id === trace.switchingId)!;
  const sourceSide = Math.sign(switchingFirst.sourceSlot);
  const destinationSide = Math.sign(switchingFirst.destinationSlot);
  expect(sourceSide).not.toBe(destinationSide);
  const switching = trace.frames.map((frame) =>
    frame.shells.find((shell) => shell.id === trace.switchingId)!,
  );
  const visibleTolerance = Math.ceil(first.shells[trace.sourceIndex]!.painted.pixelCount * 0.002);
  const fullyOccluded = switching.map((shell) => shell.painted.pixelCount <= visibleTolerance);
  const firstOccluded = fullyOccluded.indexOf(true);
  const lastOccluded = fullyOccluded.lastIndexOf(true);
  if (firstOccluded < 0) {
    const maximumProgressStep = Math.max(
      ...trace.frames.slice(1).map((frame, index) => {
        return frame.physicalProgress - trace.frames[index]!.physicalProgress;
      }),
    );
    expect(options.allowFrameRateSkippedOcclusion === true || maximumProgressStep > 0.5).toBe(true);
    const paintedSides = switching
      .filter((shell) => shell.painted.pixelCount > visibleTolerance)
      .map((shell) => {
        expect(Math.min(shell.painted.leftPixels, shell.painted.rightPixels)).toBeLessThanOrEqual(
          visibleTolerance,
        );
        return Math.sign(shell.painted.rightPixels - shell.painted.leftPixels);
      });
    expect(paintedSides[0]).toBe(sourceSide);
    expect(paintedSides.at(-1)).toBe(destinationSide);
    const firstDestination = paintedSides.indexOf(destinationSide);
    expect(paintedSides.slice(firstDestination)).not.toContain(sourceSide);
  } else {
    expect(firstOccluded).toBeGreaterThan(0);
    if (lastOccluded === switching.length - 1) {
      expect(trace.exchange).toBe("direct");
    } else {
      expect(lastOccluded).toBeLessThan(switching.length - 1);
    }
  }
  for (let index = 0; index < switching.length; index += 1) {
    const shell = switching[index]!;
    expect(shell.painted.centerPixels).toBeLessThanOrEqual(visibleTolerance);
    if (firstOccluded >= 0 && index < firstOccluded) {
      const wrongSidePixels = sourceSide < 0 ? shell.painted.rightPixels : shell.painted.leftPixels;
      expect(wrongSidePixels).toBeLessThanOrEqual(visibleTolerance);
    }
    if (lastOccluded >= 0 && index > lastOccluded) {
      const wrongSidePixels =
        destinationSide < 0 ? shell.painted.rightPixels : shell.painted.leftPixels;
      expect(wrongSidePixels).toBeLessThanOrEqual(visibleTolerance);
    }
  }
  for (const id of trace.nonParticipatingIds) {
    const endpointEnvelope = Math.max(
      first.shells.find((shell) => shell.id === id)!.painted.pixelCount,
      last.shells.find((shell) => shell.id === id)!.painted.pixelCount,
    );
    for (const frame of trace.frames.slice(1, -1)) {
      const shell = frame.shells.find((candidate) => candidate.id === id)!;
      expect(
        shell.painted.pixelCount,
        `${id} at ${frame.physicalProgress} exceeded endpoint ${endpointEnvelope}`,
      ).toBeLessThanOrEqual(endpointEnvelope + visibleTolerance + 16);
    }
  }
  expect(switchingLast.destinationSlot).toBe(-switchingFirst.sourceSlot);
}

export async function attachPileTrace(testInfo: TestInfo, trace: PileScenarioTrace): Promise<void> {
  const name = `${trace.exchange}-${trace.direction > 0 ? "forward" : "backward"}-${trace.sourceId}-pile-trace`;
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  await testInfo.attach(name, {
    contentType: "application/json",
    path,
  });
}
