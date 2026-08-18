import { execFileSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { expect, test, type Page } from "@playwright/test";

import { expectCarouselAt, openLabDemo } from "../helpers";
import {
  STACKED_DECK_IDS,
  STACKED_DECK_TITLES,
  beginPointer,
  finishPointer,
  flick,
  holdPhysicalIndex,
  motionPitch,
  pagination,
  readFrame,
  viewport,
  waitForAuthority,
  type HeldTraversal,
} from "../stackedDeckHarness";

const require = createRequire(import.meta.url);
const playwrightVersion = (require("@playwright/test/package.json") as { version: string }).version;
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const shortGitSha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
  encoding: "utf8",
}).trim();
const reviewDirectory = resolve(".artifacts", "stacked-deck-visual-review", shortGitSha);
const checkpointDirectory = join(reviewDirectory, "checkpoints");

const REVIEW_VIEWPORT = { height: 1_000, width: 1_440 } as const;
const SEQUENCE_VERSION = "stacked-deck-visual-review-v1";
const TEAM_INDEX = 3;
const SETTINGS_INDEX = 4;
const NORMAL_GESTURE_PROGRESS = 0.68;
const REVIEW_TIMING = {
  preRecordingRestMs: 300,
  initialRestMs: 1_000,
  normalGestureMs: 720,
  normalGestureCadenceMs: 60,
  betweenGesturesMs: 350,
  slowTraversalMs: 2_500,
  slowTraversalCadenceMs: 100,
  slowTurnaroundHoldMs: 400,
  keyboardRestMs: 350,
  finalRestMs: 1_000,
} as const;
const SLOW_PROGRESS_CHECKPOINTS = [
  0, 0.25, 0.4, 0.45, 0.47, 0.49, 0.5, 0.51, 0.53, 0.55, 0.6, 0.7,
] as const;
const SCREENSHOT_PROGRESS = new Set(["0.49", "0.50", "0.51"]);
const existingResizeObserverWarning =
  /ResizeObserver loop completed with undelivered notifications\./;

type DeckFrame = Awaited<ReturnType<typeof readFrame>>;
type ReviewDirection = "forward" | "none" | "reverse";

interface ReviewItem {
  readonly id: (typeof STACKED_DECK_IDS)[number];
  readonly index: number;
}

interface ReviewPhase {
  readonly actualSettledResult: ReviewItem;
  readonly destination?: ReviewItem;
  readonly direction: ReviewDirection;
  readonly endMs: number;
  readonly interactionType: string;
  readonly intendedDurationMs: number;
  readonly key?: "ArrowLeft" | "ArrowRight";
  readonly keyEventMs?: number;
  readonly authorityTransitionMs?: number;
  readonly settlementMs?: number;
  readonly name: string;
  readonly origin: ReviewItem;
  readonly startMs: number;
}

interface PhaseDefinition {
  readonly destination?: ReviewItem;
  readonly direction: ReviewDirection;
  readonly interactionType: string;
  readonly intendedDurationMs: number;
  readonly name: string;
  readonly origin: ReviewItem;
}

interface PoseObservation {
  readonly id: string;
  readonly index: number;
  readonly layer: number;
  readonly modelOpacity: number;
  readonly opacity: number;
  readonly role: string;
  readonly shadowStrength: number;
  readonly transform: {
    readonly rotate: number;
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
  };
}

interface SlowMarker {
  readonly actualPhysicalProgress: number;
  readonly authoritativeIndex: number;
  readonly controllerPhase: string;
  readonly direction: Exclude<ReviewDirection, "none">;
  readonly localProgress: number;
  readonly outgoing: PoseObservation | null;
  readonly physicalIndex: number;
  readonly relativeVideoTimeMs: number;
  readonly requestedProgress: number;
  readonly segmentOriginIndex: number;
  readonly segmentPhase: string;
  readonly segmentTargetIndex: number | null;
  readonly target: PoseObservation | null;
  readonly visualTopIndex: number;
}

interface RecordingSession {
  readonly frameTimestamps: number[];
  readonly now: () => number;
  readonly recordingStartTimestamp: string;
}

function itemAt(index: number): ReviewItem {
  const id = STACKED_DECK_IDS[index];
  if (id === undefined) throw new Error(`No Stacked Deck item exists at index ${index}.`);
  return { id, index };
}

function poseObservation(frame: DeckFrame, index: number | null): PoseObservation | null {
  if (index === null) return null;
  const pose = frame.poses[index];
  if (pose === undefined) return null;
  return {
    id: pose.id,
    index: pose.index,
    layer: pose.layer,
    modelOpacity: pose.modelOpacity,
    opacity: pose.opacity,
    role: pose.role,
    shadowStrength: pose.shadowStrength,
    transform: {
      rotate: pose.rotate,
      scale: pose.scale,
      translateX: pose.translateX,
      translateY: pose.translateY,
    },
  };
}

function listenForPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration|unhandled promise/i.test(message.text())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  return errors;
}

async function prepareReviewPage(page: Page) {
  const errors = listenForPageErrors(page);
  await page.setViewportSize(REVIEW_VIEWPORT);
  await openLabDemo(page, "stacked-deck", "no-preference");
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [
      ...document.querySelectorAll<HTMLImageElement>('[data-testid="stacked-deck-viewport"] img'),
    ];
    await Promise.all(
      images.map(async (image) => {
        try {
          await image.decode();
        } catch {
          if (!image.complete || image.naturalWidth === 0) {
            throw new Error(`Stacked Deck preview failed to decode: ${image.currentSrc}`);
          }
        }
      }),
    );
  });

  const stage = viewport(page);
  await expect.poll(() => motionPitch(stage)).toBeGreaterThan(0);
  await pagination(page).nth(TEAM_INDEX).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[TEAM_INDEX]);
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText(
    STACKED_DECK_TITLES[TEAM_INDEX],
  );
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await page.waitForTimeout(REVIEW_TIMING.preRecordingRestMs);
  return errors;
}

async function startRecording(page: Page, filename: string): Promise<RecordingSession> {
  const frameTimestamps: number[] = [];
  await page.screencast.start({
    path: join(reviewDirectory, filename),
    size: REVIEW_VIEWPORT,
    onFrame(frame) {
      frameTimestamps.push(frame.timestamp);
    },
  });
  const startedAt = performance.now();
  return {
    frameTimestamps,
    now: () => Number((performance.now() - startedAt).toFixed(1)),
    recordingStartTimestamp: new Date().toISOString(),
  };
}

async function recordPhase(
  page: Page,
  recording: RecordingSession,
  phases: ReviewPhase[],
  definition: PhaseDefinition,
  action: () => Promise<DeckFrame>,
) {
  const startMs = recording.now();
  const frame = await action();
  phases.push({
    ...definition,
    actualSettledResult: itemAt(frame.settledIndex),
    endMs: recording.now(),
    startMs,
  });
  return frame;
}

async function recordRest(
  page: Page,
  recording: RecordingSession,
  phases: ReviewPhase[],
  name: string,
  durationMs: number,
) {
  const frameBefore = await readFrame(page);
  return recordPhase(
    page,
    recording,
    phases,
    {
      direction: "none",
      interactionType: "rest",
      intendedDurationMs: durationMs,
      name,
      origin: itemAt(frameBefore.settledIndex),
    },
    async () => {
      await page.waitForTimeout(durationMs);
      return readFrame(page);
    },
  );
}

async function beginHeldAtCurrent(page: Page, startIndex: number): Promise<HeldTraversal> {
  const stage = viewport(page);
  await expectCarouselAt(stage, STACKED_DECK_IDS[startIndex]);
  return {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: await motionPitch(stage),
    startIndex,
  };
}

async function performNormalGesture(page: Page, startIndex: number, direction: -1 | 1) {
  const held = await beginHeldAtCurrent(page, startIndex);
  const steps = REVIEW_TIMING.normalGestureMs / REVIEW_TIMING.normalGestureCadenceMs;
  for (let step = 1; step <= steps; step += 1) {
    await page.waitForTimeout(REVIEW_TIMING.normalGestureCadenceMs);
    await holdPhysicalIndex(
      page,
      held,
      startIndex + (direction * NORMAL_GESTURE_PROGRESS * step) / steps,
      REVIEW_TIMING.normalGestureCadenceMs,
    );
  }
  const deltaX = -direction * held.pitch * NORMAL_GESTURE_PROGRESS;
  await finishPointer(page, held.origin, deltaX, held.elapsedMs + 40, "pointerup");
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[startIndex + direction]);
  return readFrame(page);
}

interface SweepPoint {
  readonly atMs: number;
  readonly marker?: number;
  readonly progress: number;
}

function createSweepPoints(from: number, to: number): SweepPoint[] {
  const points = new Map<string, SweepPoint>();
  const add = (point: SweepPoint) => points.set(point.atMs.toFixed(3), point);
  for (
    let atMs = 0;
    atMs <= REVIEW_TIMING.slowTraversalMs;
    atMs += REVIEW_TIMING.slowTraversalCadenceMs
  ) {
    const fraction = atMs / REVIEW_TIMING.slowTraversalMs;
    add({ atMs, progress: from + (to - from) * fraction });
  }
  add({ atMs: REVIEW_TIMING.slowTraversalMs, progress: to });
  for (const marker of SLOW_PROGRESS_CHECKPOINTS) {
    const fraction = Math.abs((marker - from) / (to - from));
    add({
      atMs: REVIEW_TIMING.slowTraversalMs * fraction,
      marker,
      progress: marker,
    });
  }
  return [...points.values()].toSorted((left, right) => left.atMs - right.atMs);
}

function slowMarker(
  recording: RecordingSession,
  direction: Exclude<ReviewDirection, "none">,
  requestedProgress: number,
  frame: DeckFrame,
): SlowMarker {
  return {
    actualPhysicalProgress: frame.physicalIndex - TEAM_INDEX,
    authoritativeIndex: frame.authoritativeIndex,
    controllerPhase: frame.controllerPhase,
    direction,
    localProgress: frame.progress,
    outgoing: poseObservation(frame, frame.segmentOriginIndex),
    physicalIndex: frame.physicalIndex,
    relativeVideoTimeMs: recording.now(),
    requestedProgress,
    segmentOriginIndex: frame.segmentOriginIndex,
    segmentPhase: frame.segmentPhase,
    segmentTargetIndex: frame.segmentTargetIndex,
    target: poseObservation(frame, frame.segmentTargetIndex),
    visualTopIndex: frame.visualTopIndex,
  };
}

async function sweepHeldTraversal(
  page: Page,
  recording: RecordingSession,
  held: HeldTraversal,
  direction: Exclude<ReviewDirection, "none">,
  from: number,
  to: number,
  markers: SlowMarker[],
) {
  const sweepStartedAt = performance.now();
  let previousAtMs = 0;
  let lastFrame = await readFrame(page);
  for (const point of createSweepPoints(from, to)) {
    const remainingMs = point.atMs - (performance.now() - sweepStartedAt);
    if (remainingMs > 0) await page.waitForTimeout(remainingMs);
    const eventElapsedMs = Math.max(1, point.atMs - previousAtMs);
    lastFrame = await holdPhysicalIndex(page, held, TEAM_INDEX + point.progress, eventElapsedMs);
    previousAtMs = point.atMs;
    if (point.marker === undefined) continue;
    markers.push(slowMarker(recording, direction, point.marker, lastFrame));
  }
  return lastFrame;
}

async function captureReviewCheckpoints(page: Page) {
  const held = await beginHeldAtCurrent(page, TEAM_INDEX);
  for (const [direction, progressValues] of [
    ["forward", SLOW_PROGRESS_CHECKPOINTS],
    ["reverse", SLOW_PROGRESS_CHECKPOINTS.toReversed()],
  ] as const) {
    for (const progress of progressValues) {
      await holdPhysicalIndex(
        page,
        held,
        TEAM_INDEX + progress,
        REVIEW_TIMING.slowTraversalCadenceMs,
      );
      const progressLabel = progress.toFixed(2);
      if (SCREENSHOT_PROGRESS.has(progressLabel)) {
        await page.screenshot({
          animations: "allow",
          path: join(checkpointDirectory, `${direction}-${progressLabel}.png`),
        });
      }
    }
  }
  await finishPointer(page, held.origin, 0, held.elapsedMs + 40, "pointercancel");
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[TEAM_INDEX]);
}

async function assertArtifact(filename: string) {
  const artifact = await stat(join(reviewDirectory, filename));
  expect(artifact.size).toBeGreaterThan(0);
}

async function writeTimeline(filename: string, value: unknown) {
  await writeFile(join(reviewDirectory, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await assertArtifact(filename);
}

function commonTimeline(recording: RecordingSession, page: Page) {
  return {
    browserVersion: page.context().browser()?.version() ?? "unknown",
    gitSha,
    playwrightVersion,
    recordingStartTimestamp: recording.recordingStartTimestamp,
    sequenceVersion: SEQUENCE_VERSION,
    shortGitSha,
    viewport: REVIEW_VIEWPORT,
  };
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
  await rm(reviewDirectory, { force: true, recursive: true });
  await mkdir(checkpointDirectory, { recursive: true });
});

test("records the deterministic mouse review", async ({ page }) => {
  const pageErrors = await prepareReviewPage(page);
  const phases: ReviewPhase[] = [];
  const markers: SlowMarker[] = [];
  const recording = await startRecording(page, "mouse-review.webm");
  let recordingDurationMs = 0;

  try {
    await recordRest(page, recording, phases, "initial-rest", REVIEW_TIMING.initialRestMs);

    await recordPhase(
      page,
      recording,
      phases,
      {
        destination: itemAt(SETTINGS_INDEX),
        direction: "forward",
        interactionType: "normal-swipe",
        intendedDurationMs: REVIEW_TIMING.normalGestureMs,
        name: "normal-swipe-forward",
        origin: itemAt(TEAM_INDEX),
      },
      () => performNormalGesture(page, TEAM_INDEX, 1),
    );
    await recordRest(
      page,
      recording,
      phases,
      "rest-after-normal-forward",
      REVIEW_TIMING.betweenGesturesMs,
    );

    await recordPhase(
      page,
      recording,
      phases,
      {
        destination: itemAt(TEAM_INDEX),
        direction: "reverse",
        interactionType: "normal-swipe",
        intendedDurationMs: REVIEW_TIMING.normalGestureMs,
        name: "normal-swipe-reverse",
        origin: itemAt(SETTINGS_INDEX),
      },
      () => performNormalGesture(page, SETTINGS_INDEX, -1),
    );
    await recordRest(
      page,
      recording,
      phases,
      "rest-before-slow-traversal",
      REVIEW_TIMING.betweenGesturesMs,
    );

    const held = await beginHeldAtCurrent(page, TEAM_INDEX);
    await recordPhase(
      page,
      recording,
      phases,
      {
        direction: "forward",
        interactionType: "held-physical-progress",
        intendedDurationMs: REVIEW_TIMING.slowTraversalMs,
        name: "slow-held-outbound",
        origin: itemAt(TEAM_INDEX),
      },
      () => sweepHeldTraversal(page, recording, held, "forward", 0, 0.7, markers),
    );
    await recordPhase(
      page,
      recording,
      phases,
      {
        direction: "none",
        interactionType: "held-rest",
        intendedDurationMs: REVIEW_TIMING.slowTurnaroundHoldMs,
        name: "slow-turnaround-hold",
        origin: itemAt(TEAM_INDEX),
      },
      async () => {
        await page.waitForTimeout(REVIEW_TIMING.slowTurnaroundHoldMs);
        held.elapsedMs += REVIEW_TIMING.slowTurnaroundHoldMs;
        return readFrame(page);
      },
    );
    await recordPhase(
      page,
      recording,
      phases,
      {
        direction: "reverse",
        interactionType: "held-physical-progress",
        intendedDurationMs: REVIEW_TIMING.slowTraversalMs,
        name: "slow-held-retrace",
        origin: itemAt(TEAM_INDEX),
      },
      () => sweepHeldTraversal(page, recording, held, "reverse", 0.7, 0, markers),
    );
    await recordPhase(
      page,
      recording,
      phases,
      {
        destination: itemAt(TEAM_INDEX),
        direction: "none",
        interactionType: "pointer-cancel",
        intendedDurationMs: 0,
        name: "slow-origin-cancel",
        origin: itemAt(TEAM_INDEX),
      },
      async () => {
        await finishPointer(page, held.origin, 0, held.elapsedMs + 40, "pointercancel");
        await expectCarouselAt(viewport(page), STACKED_DECK_IDS[TEAM_INDEX]);
        return readFrame(page);
      },
    );
    await recordRest(
      page,
      recording,
      phases,
      "rest-after-slow-reversal",
      REVIEW_TIMING.betweenGesturesMs,
    );

    for (const [name, originIndex, direction] of [
      ["fast-flick-forward", TEAM_INDEX, 1],
      ["fast-flick-reverse", SETTINGS_INDEX, -1],
    ] as const) {
      const destinationIndex = originIndex + direction;
      await recordPhase(
        page,
        recording,
        phases,
        {
          destination: itemAt(destinationIndex),
          direction: direction === 1 ? "forward" : "reverse",
          interactionType: "fast-flick",
          intendedDurationMs: 24,
          name,
          origin: itemAt(originIndex),
        },
        async () => {
          await flick(page, direction, await motionPitch(viewport(page)));
          await expectCarouselAt(viewport(page), STACKED_DECK_IDS[destinationIndex]);
          return readFrame(page);
        },
      );
      await recordRest(
        page,
        recording,
        phases,
        `rest-after-${name}`,
        REVIEW_TIMING.betweenGesturesMs,
      );
    }

    for (let exchange = 0; exchange < 4; exchange += 1) {
      const forward = exchange % 2 === 0;
      const originIndex = forward ? TEAM_INDEX : SETTINGS_INDEX;
      const direction = forward ? 1 : -1;
      const destinationIndex = originIndex + direction;
      await recordPhase(
        page,
        recording,
        phases,
        {
          destination: itemAt(destinationIndex),
          direction: forward ? "forward" : "reverse",
          interactionType: "normal-swipe",
          intendedDurationMs: REVIEW_TIMING.normalGestureMs,
          name: `alternating-exchange-${exchange + 1}-${forward ? "forward" : "reverse"}`,
          origin: itemAt(originIndex),
        },
        () => performNormalGesture(page, originIndex, direction),
      );
      if (exchange < 3) {
        await recordRest(
          page,
          recording,
          phases,
          `rest-after-alternating-exchange-${exchange + 1}`,
          REVIEW_TIMING.betweenGesturesMs,
        );
      }
    }

    await recordRest(page, recording, phases, "final-rest", REVIEW_TIMING.finalRestMs);
    const finalFrame = await readFrame(page);
    expect(finalFrame.settledIndex).toBe(TEAM_INDEX);
  } finally {
    recordingDurationMs = recording.now();
    await page.screencast.stop();
  }

  await captureReviewCheckpoints(page);

  await writeTimeline("mouse-timeline.json", {
    ...commonTimeline(recording, page),
    recordingDurationMs,
    screencastFrameCount: recording.frameTimestamps.length,
    phases,
    slowTraversalMarkers: markers,
    checkpointCapture: {
      mode: "post-recording deterministic held-gesture replay",
      progress: [...SCREENSHOT_PROGRESS].map(Number),
    },
    timing: REVIEW_TIMING,
  });
  await assertArtifact("mouse-review.webm");
  for (const direction of ["forward", "reverse"] as const) {
    for (const progress of SCREENSHOT_PROGRESS) {
      await assertArtifact(join("checkpoints", `${direction}-${progress}.png`));
    }
  }
  const unexpectedErrors = pageErrors.filter((error) => !existingResizeObserverWarning.test(error));
  expect(unexpectedErrors).toEqual([]);
});

test("records the deterministic keyboard review", async ({ page }) => {
  const pageErrors = await prepareReviewPage(page);
  const phases: ReviewPhase[] = [];
  const stage = viewport(page);
  await stage.focus();
  await expect(stage).toBeFocused();
  const recording = await startRecording(page, "keyboard-review.webm");
  let recordingDurationMs = 0;

  try {
    await recordRest(page, recording, phases, "initial-rest", REVIEW_TIMING.initialRestMs);

    for (const [step, key, originIndex, destinationIndex] of [
      [1, "ArrowRight", TEAM_INDEX, SETTINGS_INDEX],
      [2, "ArrowLeft", SETTINGS_INDEX, TEAM_INDEX],
      [3, "ArrowRight", TEAM_INDEX, SETTINGS_INDEX],
      [4, "ArrowLeft", SETTINGS_INDEX, TEAM_INDEX],
    ] as const) {
      const startMs = recording.now();
      const keyEventMs = recording.now();
      await stage.press(key);
      await waitForAuthority(page, destinationIndex);
      const authorityTransitionMs = recording.now();
      await expectCarouselAt(stage, STACKED_DECK_IDS[destinationIndex]);
      const settlementMs = recording.now();
      const finalFrame = await readFrame(page);
      phases.push({
        actualSettledResult: itemAt(finalFrame.settledIndex),
        authorityTransitionMs,
        destination: itemAt(destinationIndex),
        direction: key === "ArrowRight" ? "forward" : "reverse",
        endMs: settlementMs,
        interactionType: "keyboard",
        intendedDurationMs: 0,
        key,
        keyEventMs,
        name: `keyboard-${step}-${key}`,
        origin: itemAt(originIndex),
        settlementMs,
        startMs,
      });
      if (step < 4) {
        await recordRest(
          page,
          recording,
          phases,
          `rest-after-keyboard-${step}`,
          REVIEW_TIMING.keyboardRestMs,
        );
      }
    }

    await recordRest(page, recording, phases, "final-rest", REVIEW_TIMING.finalRestMs);
    const finalFrame = await readFrame(page);
    expect(finalFrame.settledIndex).toBe(TEAM_INDEX);
  } finally {
    recordingDurationMs = recording.now();
    await page.screencast.stop();
  }

  await writeTimeline("keyboard-timeline.json", {
    ...commonTimeline(recording, page),
    recordingDurationMs,
    screencastFrameCount: recording.frameTimestamps.length,
    phases,
    timing: REVIEW_TIMING,
  });
  await assertArtifact("keyboard-review.webm");
  const unexpectedErrors = pageErrors.filter((error) => !existingResizeObserverWarning.test(error));
  expect(unexpectedErrors).toEqual([]);
});
