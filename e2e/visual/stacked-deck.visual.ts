import { readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { expect, test, type Page } from "@playwright/test";

import {
  BOUNDED_SPRING_TUNING,
  resolveStackedDeckTuning,
  STACKED_DECK_ANCHOR_SKIP,
} from "../../packages/core/src/index";
import {
  deriveLiveCheckpointCrossings,
  deriveStackedDeckMetrics,
  frameIntervalTelemetry,
  renderCaptureReview,
  writeJsonFile,
  type CaptureRecordingSummary,
  type CardPoseObservation,
  type CheckpointTrace,
  type ExactCheckpointSample,
  type KeyboardTimeline,
  type MotionStateObservation,
  type MouseTimeline,
  type RenderedFrameSample,
  type RenderTrace,
  type ReviewDirection,
  type ReviewItem,
  type ReviewPhase,
  type StackedDeckVisualManifest,
  type StimulusTraceSample,
} from "../../scripts/stackedDeckVisualArtifacts.ts";
import { inspectGitRevision } from "../../scripts/stackedDeckVisualRevision.ts";
import {
  createStimulusSchedule,
  idealProgressAtElapsedTime,
  nextStimulusScheduleIndex,
  progressIsMonotonic,
  readVisualScenarioFromEnvironment,
  STACKED_DECK_VISUAL_SCHEMA_VERSION,
} from "../../scripts/stackedDeckVisualScenario.ts";
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
const repoRoot = resolve(import.meta.dirname, "../..");
const scenario = readVisualScenarioFromEnvironment();
const revision = inspectGitRevision(repoRoot);
const reviewDirectory = resolve(
  repoRoot,
  ".artifacts",
  "stacked-deck-visual-review",
  revision.identity,
  scenario.artifactDirectoryName,
);
const checkpointDirectory = join(reviewDirectory, "checkpoints");
const captureCreatedAt = new Date().toISOString();
const SCREENCAST_QUALITY = 90;
const existingResizeObserverWarning =
  /ResizeObserver loop completed with undelivered notifications\./;

const startIndex = STACKED_DECK_IDS.indexOf(
  scenario.config.cardPair.startId as (typeof STACKED_DECK_IDS)[number],
);
const targetIndex = STACKED_DECK_IDS.indexOf(
  scenario.config.cardPair.targetId as (typeof STACKED_DECK_IDS)[number],
);
if (startIndex < 0 || targetIndex < 0) {
  throw new Error(
    `The requested pair ${scenario.config.cardPair.startId}:${scenario.config.cardPair.targetId} does not exist in the Lab Stacked Deck.`,
  );
}
if (Math.abs(targetIndex - startIndex) !== 1) {
  throw new Error("Stacked Deck visual-review pairs must be adjacent cards.");
}
const pairDirection = Math.sign(targetIndex - startIndex) as -1 | 1;

type DeckFrame = Awaited<ReturnType<typeof readFrame>>;

interface PhaseDefinition {
  readonly destination?: ReviewItem;
  readonly direction: ReviewDirection;
  readonly intendedDurationMs: number;
  readonly interactionType: string;
  readonly key?: "ArrowLeft" | "ArrowRight";
  readonly name: string;
  readonly origin: ReviewItem;
}

interface RecordingSession {
  readonly frameTimestamps: number[];
  readonly now: () => number;
  readonly recordingStartTimestamp: string;
}

interface CapturedEnvironment {
  readonly application: StackedDeckVisualManifest["application"];
  readonly environment: StackedDeckVisualManifest["environment"];
}

let capturedEnvironment: CapturedEnvironment | null = null;
let mouseTimeline: MouseTimeline | null = null;
let mouseRenderTrace: RenderTrace | null = null;
let mouseRecording: CaptureRecordingSummary | null = null;
let keyboardTimeline: KeyboardTimeline | null = null;
let keyboardRenderTrace: RenderTrace | null = null;
let keyboardRecording: CaptureRecordingSummary | null = null;
let checkpointTrace: CheckpointTrace | null = null;

function itemAt(index: number): ReviewItem {
  const id = STACKED_DECK_IDS[index];
  if (id === undefined) throw new Error(`No Stacked Deck item exists at index ${index}.`);
  return { id, index };
}

function poseObservation(frame: DeckFrame, index: number): CardPoseObservation | null {
  const pose = frame.poses[index];
  if (pose === undefined) return null;
  return {
    id: pose.id,
    index: pose.index,
    layer: pose.layer,
    opacity: pose.opacity,
    rotate: pose.rotate,
    scale: pose.scale,
    shadowStrength: pose.shadowStrength,
    translateX: pose.translateX,
    translateY: pose.translateY,
  };
}

function motionObservation(frame: DeckFrame): MotionStateObservation {
  return {
    actualLocalProgress: frame.progress,
    actualPhysicalIndex: frame.physicalIndex,
    actualPhysicalProgress: (frame.physicalIndex - startIndex) * pairDirection,
    authoritativeIndex: frame.authoritativeIndex,
    controllerPhase: frame.controllerPhase,
    outgoing: poseObservation(frame, startIndex),
    segmentOriginIndex: frame.segmentOriginIndex,
    segmentTargetIndex: frame.segmentTargetIndex,
    target: poseObservation(frame, targetIndex),
    visualTopIndex: frame.visualTopIndex,
  };
}

function listenForPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration|unhandled promise/i.test(message.text())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  return errors;
}

async function prepareReviewPage(page: Page): Promise<string[]> {
  const errors = listenForPageErrors(page);
  await page.setViewportSize(scenario.config.viewport);
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
    await new Promise<void>((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
    );
  });

  const stage = viewport(page);
  await expect.poll(() => motionPitch(stage)).toBeGreaterThan(0);
  await pagination(page).nth(startIndex).click();
  await expectCarouselAt(stage, STACKED_DECK_IDS[startIndex]!);
  await expect(page.getByTestId("stacked-deck-caption")).toHaveText(
    STACKED_DECK_TITLES[startIndex]!,
  );
  await expect(stage).toHaveAttribute("data-phase", "idle");
  await page.waitForTimeout(scenario.config.rests.preRecordingMs);

  if (capturedEnvironment === null) {
    const frame = await readFrame(page);
    const environment = await page.evaluate(() => ({
      colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      deviceScaleFactor: devicePixelRatio,
      locale: navigator.language,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "reduce"
        : "no-preference",
      timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    const physics = await page.evaluate(() => {
      const numericControls = Object.fromEntries(
        [
          "Control impulse",
          "Damping",
          "Elastic limit",
          "Elastic resistance",
          "Fling threshold",
          "Mass",
          "Projection",
          "Rest distance",
          "Rest speed",
          "Stiffness",
        ].map((label) => {
          const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
          if (!input || !Number.isFinite(input.valueAsNumber)) {
            throw new Error(`The Lab physics control ${label} is unavailable.`);
          }
          return [label, input.valueAsNumber];
        }),
      );
      const preset = document.querySelector<HTMLSelectElement>(".preset-control select")?.value;
      if (!preset) throw new Error("The Lab physics preset is unavailable.");
      return {
        damping: numericControls["Damping"]!,
        elasticResistance: numericControls["Elastic resistance"]!,
        flingVelocity: numericControls["Fling threshold"]!,
        mass: numericControls["Mass"]!,
        maxElasticDistance: numericControls["Elastic limit"]!,
        preset,
        programmaticImpulse: numericControls["Control impulse"]!,
        projectionSeconds: numericControls["Projection"]!,
        restDistance: numericControls["Rest distance"]!,
        restSpeed: numericControls["Rest speed"]!,
        stiffness: numericControls["Stiffness"]!,
      };
    });
    const stageHeight = Math.min(640, Math.max(320, frame.stageWidth * 0.56));
    capturedEnvironment = {
      application: {
        motionPitch: await motionPitch(stage),
        projectionTuning: resolveStackedDeckTuning({
          stageHeight,
          stageWidth: frame.stageWidth,
        }),
        relevantPhysicsConfiguration: {
          autonomousLimits: BOUNDED_SPRING_TUNING,
          elasticity: {
            max: {
              maxDistance: physics.maxElasticDistance,
              resistance: physics.elasticResistance,
            },
            min: {
              maxDistance: physics.maxElasticDistance,
              resistance: physics.elasticResistance,
            },
          },
          preset: physics.preset,
          programmaticImpulse: physics.programmaticImpulse,
          releasePolicy: {
            flingVelocity: physics.flingVelocity,
            forwardSign: -1,
            maxAnchorSkip: STACKED_DECK_ANCHOR_SKIP,
            projectionSeconds: physics.projectionSeconds,
          },
          spring: {
            damping: physics.damping,
            mass: physics.mass,
            restDistance: physics.restDistance,
            restSpeed: physics.restSpeed,
            stiffness: physics.stiffness,
          },
        },
        reviewCardPair: [scenario.config.cardPair.startId, scenario.config.cardPair.targetId],
        startingItem: scenario.config.cardPair.startId,
        tuningProfile: (await stage.getAttribute("data-profile")) ?? "unknown",
      },
      environment: {
        browserName: page.context().browser()?.browserType().name() ?? "unknown",
        browserVersion: page.context().browser()?.version() ?? "unknown",
        colorScheme: environment.colorScheme,
        deviceScaleFactor: environment.deviceScaleFactor,
        locale: environment.locale,
        playwrightVersion,
        reducedMotion: environment.reducedMotion,
        timezoneId: environment.timezoneId,
        viewport: scenario.config.viewport,
      },
    };
  }
  return errors;
}

async function startRecording(page: Page, filename: string): Promise<RecordingSession> {
  const frameTimestamps: number[] = [];
  await page.screencast.start({
    onFrame(frame) {
      frameTimestamps.push(frame.timestamp);
    },
    path: join(reviewDirectory, filename),
    quality: SCREENCAST_QUALITY,
    size: scenario.config.viewport,
  });
  const startedAt = performance.now();
  return {
    frameTimestamps,
    now: () => performance.now() - startedAt,
    recordingStartTimestamp: new Date().toISOString(),
  };
}

async function startRenderedFrameTrace(page: Page): Promise<void> {
  await page.evaluate(
    ({ direction, originIndex, destinationIndex }) => {
      type BrowserTraceState = {
        active: boolean;
        capturePhase: string;
        firstTimestamp: number | null;
        samples: RenderedFrameSample[];
      };
      const traceWindow = window as typeof window & {
        stackedDeckVisualFrameTrace?: BrowserTraceState;
      };
      const trace: BrowserTraceState = {
        active: true,
        capturePhase: "initial-rest",
        firstTimestamp: null,
        samples: [],
      };
      traceWindow.stackedDeckVisualFrameTrace = trace;

      const tick = (browserTimestampMs: number) => {
        if (!trace.active) return;
        trace.firstTimestamp ??= browserTimestampMs;
        const stage = document.querySelector<HTMLElement>('[data-testid="stacked-deck-viewport"]');
        if (stage) {
          const cards = [
            ...document.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card"),
          ];
          const cardObservation = (index: number): CardPoseObservation | null => {
            const card = cards[index];
            const surface = card?.querySelector<HTMLElement>(".screen-chrome");
            if (!card || !surface) return null;
            return {
              id: card.dataset.itemId ?? "",
              index,
              layer: Number(card.dataset.deckLayer),
              opacity: Number(getComputedStyle(card).opacity),
              rotate: Number(surface.dataset.rotate),
              scale: Number(surface.dataset.scale),
              shadowStrength: Number(surface.dataset.shadowStrength),
              translateX: Number(surface.dataset.translateX),
              translateY: Number(surface.dataset.translateY),
            };
          };
          const physicalIndex = Number(stage.dataset.physicalIndex);
          const targetAttribute = stage.getAttribute("data-segment-target-index");
          trace.samples.push({
            actualLocalProgress: Number(stage.dataset.segmentProgress),
            actualPhysicalIndex: physicalIndex,
            actualPhysicalProgress: (physicalIndex - originIndex) * direction,
            authoritativeIndex: Number(stage.dataset.authoritativeIndex),
            browserTimestampMs,
            capturePhase: trace.capturePhase,
            controllerPhase: stage.dataset.phase ?? "",
            outgoing: cardObservation(originIndex),
            relativeTimeMs: browserTimestampMs - trace.firstTimestamp,
            segmentOriginIndex: Number(stage.dataset.segmentOriginIndex),
            segmentTargetIndex: targetAttribute === null ? null : Number(targetAttribute),
            target: cardObservation(destinationIndex),
            visualTopIndex: Number(stage.dataset.visualTopIndex),
          });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { destinationIndex: targetIndex, direction: pairDirection, originIndex: startIndex },
  );
}

async function markRenderedTracePhase(page: Page, phase: string): Promise<void> {
  await page.evaluate((nextPhase) => {
    const traceWindow = window as typeof window & {
      stackedDeckVisualFrameTrace?: { capturePhase: string };
    };
    if (traceWindow.stackedDeckVisualFrameTrace) {
      traceWindow.stackedDeckVisualFrameTrace.capturePhase = nextPhase;
    }
  }, phase);
}

async function stopRenderedFrameTrace(page: Page): Promise<readonly RenderedFrameSample[]> {
  return page.evaluate(async () => {
    const traceWindow = window as typeof window & {
      stackedDeckVisualFrameTrace?: {
        active: boolean;
        samples: RenderedFrameSample[];
      };
    };
    const trace = traceWindow.stackedDeckVisualFrameTrace;
    if (!trace) throw new Error("The rendered-frame trace was not started.");
    trace.active = false;
    await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
    delete traceWindow.stackedDeckVisualFrameTrace;
    return trace.samples;
  });
}

async function recordPhase(
  page: Page,
  recording: RecordingSession,
  phases: ReviewPhase[],
  definition: PhaseDefinition,
  action: () => Promise<DeckFrame>,
): Promise<DeckFrame> {
  await markRenderedTracePhase(page, definition.name);
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
): Promise<DeckFrame> {
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

async function beginHeldAtCurrent(page: Page, index: number): Promise<HeldTraversal> {
  const stage = viewport(page);
  await expectCarouselAt(stage, STACKED_DECK_IDS[index]!);
  return {
    elapsedMs: 0,
    origin: await beginPointer(stage),
    pitch: await motionPitch(stage),
    startIndex: index,
  };
}

async function performNormalGesture(
  page: Page,
  originIndex: number,
  direction: -1 | 1,
): Promise<DeckFrame> {
  const normalGesture = scenario.config.normalGesture;
  if (!normalGesture) throw new Error("The curve scenario has no normal gesture chapter.");
  const held = await beginHeldAtCurrent(page, originIndex);
  const schedule = createStimulusSchedule(normalGesture.durationMs, normalGesture.cadenceMs);
  const startedAt = performance.now();
  let previousElapsedMs = 0;
  for (const point of schedule) {
    const remainingMs = point.atMs - (performance.now() - startedAt);
    if (remainingMs > 0) await page.waitForTimeout(remainingMs);
    const elapsedMs = Math.min(normalGesture.durationMs, performance.now() - startedAt);
    const requestedProgress =
      normalGesture.progress * Math.min(1, elapsedMs / normalGesture.durationMs);
    const eventElapsedMs = Math.max(1, elapsedMs - previousElapsedMs);
    await holdPhysicalIndex(
      page,
      held,
      originIndex + direction * requestedProgress,
      eventElapsedMs,
    );
    previousElapsedMs = elapsedMs;
  }
  const deltaX = -direction * held.pitch * normalGesture.progress;
  await finishPointer(page, held.origin, deltaX, held.elapsedMs + 40, "pointerup");
  const destinationIndex = originIndex + direction;
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[destinationIndex]!);
  return readFrame(page);
}

async function sweepHeldTraversal(
  page: Page,
  recording: RecordingSession,
  held: HeldTraversal,
  direction: Exclude<ReviewDirection, "none">,
  from: number,
  to: number,
  trace: StimulusTraceSample[],
): Promise<DeckFrame> {
  const traversal = scenario.config.slowTraversal;
  const schedule = createStimulusSchedule(traversal.durationMs, traversal.inputCadenceMs);
  const startedAt = performance.now();
  let previousExecutionTimeMs = 0;
  let lastFrame = await readFrame(page);
  let scheduleIndex = 0;
  while (scheduleIndex < schedule.length) {
    const point = schedule[scheduleIndex]!;
    const remainingMs = point.atMs - (performance.now() - startedAt);
    if (remainingMs > 0) await page.waitForTimeout(remainingMs);
    const actualExecutionTimeMs = performance.now() - startedAt;
    const requestedProgress = idealProgressAtElapsedTime(
      from,
      to,
      actualExecutionTimeMs,
      traversal.durationMs,
    );
    const eventElapsedMs = Math.max(1, actualExecutionTimeMs - previousExecutionTimeMs);
    lastFrame = await holdPhysicalIndex(
      page,
      held,
      startIndex + pairDirection * requestedProgress,
      eventElapsedMs,
    );
    previousExecutionTimeMs = actualExecutionTimeMs;
    const sample: StimulusTraceSample = {
      ...motionObservation(lastFrame),
      actualExecutionTimeMs,
      direction,
      latenessMs: Math.max(0, actualExecutionTimeMs - point.atMs),
      relativeTimeMs: recording.now(),
      requestedProgress,
      sampleKind: "stimulus",
      scheduledTimeMs: point.atMs,
    };
    const previous = trace.findLast((entry) => entry.direction === direction);
    if (previous) {
      if (!progressIsMonotonic(previous.requestedProgress, sample.requestedProgress, direction)) {
        throw new Error(
          `${direction} live requested progress reversed: ${previous.requestedProgress} -> ${sample.requestedProgress}.`,
        );
      }
      if (
        !progressIsMonotonic(
          previous.actualPhysicalProgress,
          sample.actualPhysicalProgress,
          direction,
        )
      ) {
        throw new Error(
          `${direction} live actual physical progress reversed: ${previous.actualPhysicalProgress} -> ${sample.actualPhysicalProgress}.`,
        );
      }
    }
    trace.push(sample);
    if (scheduleIndex === schedule.length - 1) break;
    scheduleIndex = nextStimulusScheduleIndex(
      schedule,
      scheduleIndex,
      performance.now() - startedAt,
    );
  }
  return lastFrame;
}

async function captureReviewCheckpoints(page: Page): Promise<{
  readonly files: readonly string[];
  readonly samples: readonly ExactCheckpointSample[];
}> {
  await pagination(page).nth(startIndex).click();
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[startIndex]!);
  const held = await beginHeldAtCurrent(page, startIndex);
  const files: string[] = [];
  const samples: ExactCheckpointSample[] = [];
  for (const [direction, progressValues] of [
    ["forward", scenario.config.slowTraversal.checkpoints],
    ["reverse", scenario.config.slowTraversal.checkpoints.toReversed()],
  ] as const) {
    for (const progress of progressValues) {
      const frame = await holdPhysicalIndex(
        page,
        held,
        startIndex + pairDirection * progress,
        scenario.config.slowTraversal.inputCadenceMs,
      );
      samples.push({
        ...motionObservation(frame),
        direction,
        requestedProgress: progress,
      });
      if (!scenario.config.slowTraversal.screenshotCheckpoints.includes(progress)) continue;
      const filename = `${direction}-${progress.toFixed(2)}.png`;
      await page.screenshot({
        animations: "allow",
        path: join(checkpointDirectory, filename),
      });
      files.push(join("checkpoints", filename).replaceAll("\\", "/"));
    }
  }
  await finishPointer(page, held.origin, 0, held.elapsedMs + 40, "pointercancel");
  await expectCarouselAt(viewport(page), STACKED_DECK_IDS[startIndex]!);
  return { files, samples };
}

async function assertArtifact(filename: string): Promise<void> {
  const artifact = await stat(join(reviewDirectory, filename));
  expect(artifact.size).toBeGreaterThan(0);
}

function renderTelemetry(samples: readonly RenderedFrameSample[], durationMs: number) {
  return frameIntervalTelemetry(
    samples.map((sample) => sample.browserTimestampMs),
    durationMs,
  );
}

function unexpectedPageErrors(errors: readonly string[]): readonly string[] {
  return errors.filter((error) => !existingResizeObserverWarning.test(error));
}

function captureWarnings(
  metrics: ReturnType<typeof deriveStackedDeckMetrics>,
  recordings: readonly CaptureRecordingSummary[],
  trace: readonly StimulusTraceSample[],
): readonly string[] {
  const warnings: string[] = [];
  for (const direction of ["forward", "reverse"] as const) {
    const samples = trace.filter((sample) => sample.direction === direction);
    const intervals = samples
      .slice(1)
      .map((sample, index) => sample.relativeTimeMs - samples[index]!.relativeTimeMs)
      .toSorted((left, right) => left - right);
    const p95 = intervals[Math.max(0, Math.ceil(intervals.length * 0.95) - 1)];
    if (p95 !== undefined && p95 > scenario.config.slowTraversal.inputCadenceMs * 2.5) {
      warnings.push(`${direction} stimulus p95 interval was ${p95.toFixed(1)} ms.`);
    }
  }
  for (const recording of recordings) {
    const renderedP95 = recording.renderedFrameTelemetry.p95FrameIntervalMs;
    if (renderedP95 !== null && renderedP95 > 50) {
      warnings.push(
        `${recording.input} rendered-frame p95 interval was ${renderedP95.toFixed(1)} ms.`,
      );
    }
  }
  const maximumCheckpointError = Math.max(
    metrics.directManipulation.forward.maximumCheckpointError,
    metrics.directManipulation.reverse.maximumCheckpointError,
  );
  if (maximumCheckpointError > 0.001) {
    warnings.push(`Maximum exact checkpoint-replay error was ${maximumCheckpointError}.`);
  }
  return warnings;
}

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.beforeAll(async () => {
  await rm(reviewDirectory, { force: true, recursive: true });
});

test("records the deterministic mouse review", async ({ page }) => {
  const pageErrors = await prepareReviewPage(page);
  const phases: ReviewPhase[] = [];
  const stimulusTrace: StimulusTraceSample[] = [];
  const recording = await startRecording(page, "mouse-review.webm");
  await startRenderedFrameTrace(page);
  let recordingDurationMs = 0;
  let renderedSamples: readonly RenderedFrameSample[] = [];

  try {
    await recordRest(page, recording, phases, "initial-rest", scenario.config.rests.initialMs);

    if (scenario.config.kind === "full-review") {
      await recordPhase(
        page,
        recording,
        phases,
        {
          destination: itemAt(targetIndex),
          direction: "forward",
          interactionType: "normal-swipe",
          intendedDurationMs: scenario.config.normalGesture!.durationMs,
          name: "normal-swipe-forward",
          origin: itemAt(startIndex),
        },
        () => performNormalGesture(page, startIndex, pairDirection),
      );
      await recordRest(
        page,
        recording,
        phases,
        "rest-after-normal-forward",
        scenario.config.rests.betweenGesturesMs,
      );
      await recordPhase(
        page,
        recording,
        phases,
        {
          destination: itemAt(startIndex),
          direction: "reverse",
          interactionType: "normal-swipe",
          intendedDurationMs: scenario.config.normalGesture!.durationMs,
          name: "normal-swipe-reverse",
          origin: itemAt(targetIndex),
        },
        () => performNormalGesture(page, targetIndex, -pairDirection as -1 | 1),
      );
      await recordRest(
        page,
        recording,
        phases,
        "rest-before-slow-traversal",
        scenario.config.rests.betweenGesturesMs,
      );
    }

    const held = await beginHeldAtCurrent(page, startIndex);
    await recordPhase(
      page,
      recording,
      phases,
      {
        direction: "forward",
        interactionType: "held-physical-progress",
        intendedDurationMs: scenario.config.slowTraversal.durationMs,
        name: "slow-held-outbound",
        origin: itemAt(startIndex),
      },
      () =>
        sweepHeldTraversal(
          page,
          recording,
          held,
          "forward",
          0,
          scenario.config.slowTraversal.maxProgress,
          stimulusTrace,
        ),
    );
    await recordPhase(
      page,
      recording,
      phases,
      {
        direction: "none",
        interactionType: "held-rest",
        intendedDurationMs: scenario.config.slowTraversal.turnaroundHoldMs,
        name: "slow-turnaround-hold",
        origin: itemAt(startIndex),
      },
      async () => {
        await page.waitForTimeout(scenario.config.slowTraversal.turnaroundHoldMs);
        held.elapsedMs += scenario.config.slowTraversal.turnaroundHoldMs;
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
        intendedDurationMs: scenario.config.slowTraversal.durationMs,
        name: "slow-held-retrace",
        origin: itemAt(startIndex),
      },
      () =>
        sweepHeldTraversal(
          page,
          recording,
          held,
          "reverse",
          scenario.config.slowTraversal.maxProgress,
          0,
          stimulusTrace,
        ),
    );
    await recordPhase(
      page,
      recording,
      phases,
      {
        destination: itemAt(startIndex),
        direction: "none",
        interactionType: "pointer-cancel",
        intendedDurationMs: 0,
        name: "slow-origin-cancel",
        origin: itemAt(startIndex),
      },
      async () => {
        await finishPointer(page, held.origin, 0, held.elapsedMs + 40, "pointercancel");
        await expectCarouselAt(viewport(page), STACKED_DECK_IDS[startIndex]!);
        return readFrame(page);
      },
    );

    if (scenario.config.kind === "full-review") {
      await recordRest(
        page,
        recording,
        phases,
        "rest-after-slow-reversal",
        scenario.config.rests.betweenGesturesMs,
      );
      for (const [name, originIndex, direction] of [
        ["fast-flick-forward", startIndex, pairDirection],
        ["fast-flick-reverse", targetIndex, -pairDirection as -1 | 1],
      ] as const) {
        const destinationIndex = originIndex + direction;
        await recordPhase(
          page,
          recording,
          phases,
          {
            destination: itemAt(destinationIndex),
            direction: direction === pairDirection ? "forward" : "reverse",
            interactionType: "fast-flick",
            intendedDurationMs: 24,
            name,
            origin: itemAt(originIndex),
          },
          async () => {
            await flick(page, direction, await motionPitch(viewport(page)));
            await expectCarouselAt(viewport(page), STACKED_DECK_IDS[destinationIndex]!);
            return readFrame(page);
          },
        );
        await recordRest(
          page,
          recording,
          phases,
          `rest-after-${name}`,
          scenario.config.rests.betweenGesturesMs,
        );
      }

      const repetitions = scenario.config.normalGesture!.alternatingRepetitions;
      for (let exchange = 0; exchange < repetitions; exchange += 1) {
        const forward = exchange % 2 === 0;
        const originIndex = forward ? startIndex : targetIndex;
        const direction = forward ? pairDirection : (-pairDirection as -1 | 1);
        const destinationIndex = originIndex + direction;
        await recordPhase(
          page,
          recording,
          phases,
          {
            destination: itemAt(destinationIndex),
            direction: forward ? "forward" : "reverse",
            interactionType: "normal-swipe",
            intendedDurationMs: scenario.config.normalGesture!.durationMs,
            name: `alternating-exchange-${exchange + 1}-${forward ? "forward" : "reverse"}`,
            origin: itemAt(originIndex),
          },
          () => performNormalGesture(page, originIndex, direction),
        );
        if (exchange < repetitions - 1) {
          await recordRest(
            page,
            recording,
            phases,
            `rest-after-alternating-exchange-${exchange + 1}`,
            scenario.config.rests.betweenGesturesMs,
          );
        }
      }
      const expectedFinalIndex = repetitions % 2 === 0 ? startIndex : targetIndex;
      await recordRest(page, recording, phases, "final-rest", scenario.config.rests.finalMs);
      expect((await readFrame(page)).settledIndex).toBe(expectedFinalIndex);
    } else {
      await recordRest(page, recording, phases, "final-rest", scenario.config.rests.finalMs);
      expect((await readFrame(page)).settledIndex).toBe(startIndex);
    }
  } finally {
    recordingDurationMs = recording.now();
    renderedSamples = await stopRenderedFrameTrace(page);
    await page.screencast.stop();
  }

  const checkpointReplay = await captureReviewCheckpoints(page);
  const liveCheckpointCrossings = deriveLiveCheckpointCrossings(
    stimulusTrace,
    scenario.config.slowTraversal.checkpoints,
  );
  checkpointTrace = {
    captureMode: "post-recording deterministic held-gesture replay",
    samples: checkpointReplay.samples,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
  };
  mouseTimeline = {
    checkpointCapture: {
      mode: "post-recording deterministic held-gesture replay",
      progress: scenario.config.slowTraversal.checkpoints,
      traceFilename: "checkpoint-trace.json",
    },
    liveCheckpointCrossings,
    phases,
    recordingDurationMs,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
    stimulusTrace,
  };
  mouseRenderTrace = {
    input: "mouse",
    recordingDurationMs,
    samples: renderedSamples,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
  };
  mouseRecording = {
    durationMs: recordingDurationMs,
    filename: "mouse-review.webm",
    input: "mouse",
    renderedFrameTelemetry: renderTelemetry(renderedSamples, recordingDurationMs),
    screencastTelemetry: frameIntervalTelemetry(recording.frameTimestamps, recordingDurationMs),
    timelineSampleCount: stimulusTrace.length,
  };
  await writeJsonFile(join(reviewDirectory, "mouse-timeline.json"), mouseTimeline);
  await writeJsonFile(join(reviewDirectory, "mouse-render-trace.json"), mouseRenderTrace);
  await writeJsonFile(join(reviewDirectory, "checkpoint-trace.json"), checkpointTrace);
  await assertArtifact("mouse-review.webm");
  await assertArtifact("mouse-timeline.json");
  await assertArtifact("mouse-render-trace.json");
  await assertArtifact("checkpoint-trace.json");
  for (const checkpoint of checkpointReplay.files) await assertArtifact(checkpoint);
  expect(unexpectedPageErrors(pageErrors)).toEqual([]);
});

test("records the deterministic keyboard review", async ({ page }) => {
  test.skip(
    scenario.config.kind !== "full-review",
    "The curve scenario intentionally omits keyboard input.",
  );
  const pageErrors = await prepareReviewPage(page);
  const phases: ReviewPhase[] = [];
  const stage = viewport(page);
  await stage.focus();
  await expect(stage).toBeFocused();
  const recording = await startRecording(page, "keyboard-review.webm");
  await startRenderedFrameTrace(page);
  let recordingDurationMs = 0;
  let renderedSamples: readonly RenderedFrameSample[] = [];

  try {
    await recordRest(page, recording, phases, "initial-rest", scenario.config.rests.initialMs);
    for (const [step, forward] of [true, false, true, false].entries()) {
      const originIndex = forward ? startIndex : targetIndex;
      const destinationIndex = forward ? targetIndex : startIndex;
      const key = (forward === (pairDirection === 1) ? "ArrowRight" : "ArrowLeft") as
        | "ArrowLeft"
        | "ArrowRight";
      const name = `keyboard-${step + 1}-${key}`;
      await markRenderedTracePhase(page, name);
      const startMs = recording.now();
      const keyEventMs = recording.now();
      await stage.press(key);
      await waitForAuthority(page, destinationIndex);
      const authorityTransitionMs = recording.now();
      await expectCarouselAt(stage, STACKED_DECK_IDS[destinationIndex]!);
      const settlementMs = recording.now();
      const finalFrame = await readFrame(page);
      phases.push({
        actualSettledResult: itemAt(finalFrame.settledIndex),
        authorityTransitionMs,
        destination: itemAt(destinationIndex),
        direction: forward ? "forward" : "reverse",
        endMs: settlementMs,
        interactionType: "keyboard",
        intendedDurationMs: 0,
        key,
        keyEventMs,
        name,
        origin: itemAt(originIndex),
        settlementMs,
        startMs,
      });
      if (step < 3) {
        await recordRest(
          page,
          recording,
          phases,
          `rest-after-keyboard-${step + 1}`,
          scenario.config.rests.keyboardBetweenMs,
        );
      }
    }
    await recordRest(page, recording, phases, "final-rest", scenario.config.rests.finalMs);
    expect((await readFrame(page)).settledIndex).toBe(startIndex);
  } finally {
    recordingDurationMs = recording.now();
    renderedSamples = await stopRenderedFrameTrace(page);
    await page.screencast.stop();
  }

  keyboardTimeline = {
    phases,
    recordingDurationMs,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
  };
  keyboardRenderTrace = {
    input: "keyboard",
    recordingDurationMs,
    samples: renderedSamples,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
  };
  keyboardRecording = {
    durationMs: recordingDurationMs,
    filename: "keyboard-review.webm",
    input: "keyboard",
    renderedFrameTelemetry: renderTelemetry(renderedSamples, recordingDurationMs),
    screencastTelemetry: frameIntervalTelemetry(recording.frameTimestamps, recordingDurationMs),
    timelineSampleCount: phases.length,
  };
  await writeJsonFile(join(reviewDirectory, "keyboard-timeline.json"), keyboardTimeline);
  await writeJsonFile(join(reviewDirectory, "keyboard-render-trace.json"), keyboardRenderTrace);
  await assertArtifact("keyboard-review.webm");
  await assertArtifact("keyboard-timeline.json");
  await assertArtifact("keyboard-render-trace.json");
  expect(unexpectedPageErrors(pageErrors)).toEqual([]);
});

test.afterAll(async () => {
  if (
    !capturedEnvironment ||
    !mouseTimeline ||
    !mouseRenderTrace ||
    !mouseRecording ||
    !checkpointTrace
  ) {
    throw new Error("The mouse capture did not produce the required artifact data.");
  }
  if (
    scenario.config.kind === "full-review" &&
    (!keyboardTimeline || !keyboardRenderTrace || !keyboardRecording)
  ) {
    throw new Error("The full review did not produce the required keyboard artifact data.");
  }
  const metrics = deriveStackedDeckMetrics({
    checkpointSamples: checkpointTrace.samples,
    ...(keyboardTimeline ? { keyboardPhases: keyboardTimeline.phases } : {}),
    mouseRenderedSamples: mouseRenderTrace.samples,
    stimulusSamples: mouseTimeline.stimulusTrace,
    targetIndex,
  });
  for (const direction of ["forward", "reverse"] as const) {
    const directionMetrics = metrics.directManipulation[direction];
    if (
      directionMetrics.requestedProgressMonotonicityViolations > 0 ||
      directionMetrics.actualProgressMonotonicityViolations > 0
    ) {
      throw new Error(
        `${direction} live stimulus failed monotonicity: ${directionMetrics.requestedProgressMonotonicityViolations} requested and ${directionMetrics.actualProgressMonotonicityViolations} actual reversals.`,
      );
    }
  }
  const recordings = [mouseRecording, ...(keyboardRecording ? [keyboardRecording] : [])];
  const checkpointFiles = (await readdir(checkpointDirectory))
    .map((file) => `checkpoints/${file}`)
    .toSorted();
  const artifactFiles = [
    "manifest.json",
    "review.md",
    "mouse-review.webm",
    "mouse-timeline.json",
    "mouse-render-trace.json",
    "checkpoint-trace.json",
    ...(keyboardRecording
      ? ["keyboard-review.webm", "keyboard-timeline.json", "keyboard-render-trace.json"]
      : []),
    ...checkpointFiles,
  ];
  const manifest: StackedDeckVisualManifest = {
    ...capturedEnvironment,
    artifactFiles,
    canonical: scenario.canonical,
    capture: {
      exactCheckpointReplay: {
        purpose:
          "Exact named states for machine inspection and checkpoint PNGs; excluded from the WebM live stimulus.",
        sampleCount: checkpointTrace.samples.length,
        traceFilename: "checkpoint-trace.json",
      },
      liveStimulus: {
        checkpointBehavior: "observational-crossings-only",
        checkpointCrossingCount: mouseTimeline.liveCheckpointCrossings?.length ?? 0,
        progressSource: "monotonic-elapsed-time",
      },
      recordings,
      video: {
        codec: "vp8",
        configuredScreencastQuality: SCREENCAST_QUALITY,
        container: "webm",
        dimensions: scenario.config.viewport,
        encoderFrameRate: 25,
      },
    },
    captureCreatedAt,
    derivedMetrics: metrics,
    dirty: revision.dirty,
    environment: capturedEnvironment.environment,
    reproductionCommand: scenario.reproductionCommand,
    resolvedScenarioConfig: scenario.config,
    revision: revision.identity,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
    shortSha: revision.shortSha,
    warnings: captureWarnings(metrics, recordings, mouseTimeline.stimulusTrace),
    workingTreeFingerprint: revision.workingTreeFingerprint,
  };
  await writeJsonFile(join(reviewDirectory, "manifest.json"), manifest);
  await writeFile(join(reviewDirectory, "review.md"), renderCaptureReview(manifest), "utf8");
  await assertArtifact("manifest.json");
  await assertArtifact("review.md");
  process.stdout.write(`Stacked Deck visual artifacts: ${reviewDirectory}\n`);
});
