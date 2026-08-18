import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import {
  STACKED_DECK_VISUAL_SCHEMA_VERSION,
  stableJson,
  type StackedDeckVisualScenarioConfig,
  type VisualViewport,
} from "./stackedDeckVisualScenario.ts";

export type ReviewDirection = "forward" | "none" | "reverse";

export interface ReviewItem {
  readonly id: string;
  readonly index: number;
}

export interface CardPoseObservation {
  readonly id: string;
  readonly index: number;
  readonly layer: number;
  readonly opacity: number;
  readonly rotate: number;
  readonly scale: number;
  readonly shadowStrength: number;
  readonly translateX: number;
  readonly translateY: number;
}

export interface MotionStateObservation {
  readonly actualLocalProgress: number;
  readonly actualPhysicalIndex: number;
  readonly actualPhysicalProgress: number;
  readonly authoritativeIndex: number;
  readonly controllerPhase: string;
  readonly outgoing: CardPoseObservation | null;
  readonly segmentOriginIndex: number;
  readonly segmentTargetIndex: number | null;
  readonly target: CardPoseObservation | null;
  readonly visualTopIndex: number;
}

export interface StimulusTraceSample extends MotionStateObservation {
  readonly checkpointProgress?: number;
  readonly direction: Exclude<ReviewDirection, "none">;
  readonly relativeTimeMs: number;
  readonly requestedProgress: number;
  readonly sampleKind: "checkpoint" | "stimulus";
  readonly scheduledTimeMs: number;
}

export interface RenderedFrameSample extends MotionStateObservation {
  readonly browserTimestampMs: number;
  readonly capturePhase: string;
  readonly relativeTimeMs: number;
}

export interface ReviewPhase {
  readonly actualSettledResult: ReviewItem;
  readonly authorityTransitionMs?: number;
  readonly destination?: ReviewItem;
  readonly direction: ReviewDirection;
  readonly endMs: number;
  readonly intendedDurationMs: number;
  readonly interactionType: string;
  readonly key?: "ArrowLeft" | "ArrowRight";
  readonly keyEventMs?: number;
  readonly name: string;
  readonly origin: ReviewItem;
  readonly settlementMs?: number;
  readonly startMs: number;
}

export interface FrameIntervalTelemetry {
  readonly durationMs: number;
  readonly frameCount: number;
  readonly maxFrameIntervalMs: number | null;
  readonly meanFrameIntervalMs: number | null;
  readonly p95FrameIntervalMs: number | null;
}

export interface CaptureRecordingSummary {
  readonly durationMs: number;
  readonly filename: string;
  readonly input: "keyboard" | "mouse";
  readonly renderedFrameTelemetry: FrameIntervalTelemetry;
  readonly screencastTelemetry: FrameIntervalTelemetry;
  readonly timelineSampleCount: number;
}

export interface DirectManipulationDirectionMetrics {
  readonly authorityCrossoverProgress: number | null;
  readonly depthCrossoverProgress: number | null;
  readonly maximumCheckpointError: number;
  readonly maximumProgressError: number;
  readonly minimumScale: MetricLandmark | null;
  readonly peakAbsoluteOutgoingTranslateX: MetricLandmark | null;
  readonly peakAbsoluteOutgoingTranslateXVelocityPerSecond: TimeMetricLandmark | null;
  readonly peakAbsoluteRotation: MetricLandmark | null;
  readonly shadowMinimum: MetricLandmark | null;
  readonly shadowRecovery: {
    readonly endProgress: number;
    readonly startProgress: number;
    readonly threshold: number;
    readonly width: number;
  } | null;
  readonly stimulusSampleCount: number;
}

export interface MetricLandmark {
  readonly progress: number;
  readonly value: number;
}

export interface TimeMetricLandmark {
  readonly relativeTimeMs: number;
  readonly value: number;
}

export interface StackedDeckDerivedMetrics {
  readonly directManipulation: {
    readonly forward: DirectManipulationDirectionMetrics;
    readonly reverse: DirectManipulationDirectionMetrics;
  };
  readonly keyboard: {
    readonly authorityTransitionDurationsMs: readonly number[];
    readonly settlementDurationsMs: readonly number[];
  } | null;
}

export interface StackedDeckVisualManifest {
  readonly application: {
    readonly motionPitch: number;
    readonly projectionTuning: Readonly<Record<string, unknown>>;
    readonly relevantPhysicsConfiguration: Readonly<Record<string, unknown>>;
    readonly reviewCardPair: readonly [string, string];
    readonly startingItem: string;
    readonly tuningProfile: string;
  };
  readonly artifactFiles: readonly string[];
  readonly canonical: boolean;
  readonly capture: {
    readonly recordings: readonly CaptureRecordingSummary[];
    readonly video: {
      readonly codec: "vp8";
      readonly configuredScreencastQuality: number;
      readonly container: "webm";
      readonly dimensions: VisualViewport;
      readonly encoderFrameRate: 25;
    };
  };
  readonly captureCreatedAt: string;
  readonly derivedMetrics: StackedDeckDerivedMetrics;
  readonly dirty: boolean;
  readonly environment: {
    readonly browserName: string;
    readonly browserVersion: string;
    readonly colorScheme: "dark" | "light" | "no-preference";
    readonly deviceScaleFactor: number;
    readonly locale: string;
    readonly playwrightVersion: string;
    readonly reducedMotion: "no-preference" | "reduce";
    readonly timezoneId: string;
    readonly viewport: VisualViewport;
  };
  readonly resolvedScenarioConfig: StackedDeckVisualScenarioConfig;
  readonly reproductionCommand: string;
  readonly revision: string;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly schemaVersion: number;
  readonly shortSha: string;
  readonly warnings: readonly string[];
  readonly workingTreeFingerprint: string | null;
}

export interface MouseTimeline {
  readonly checkpointCapture: {
    readonly mode: string;
    readonly progress: readonly number[];
  };
  readonly phases: readonly ReviewPhase[];
  readonly recordingDurationMs: number;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly schemaVersion: number;
  readonly stimulusTrace: readonly StimulusTraceSample[];
}

export interface KeyboardTimeline {
  readonly phases: readonly ReviewPhase[];
  readonly recordingDurationMs: number;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly schemaVersion: number;
}

export interface RenderTrace {
  readonly input: "keyboard" | "mouse";
  readonly recordingDurationMs: number;
  readonly samples: readonly RenderedFrameSample[];
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly schemaVersion: number;
}

export interface ArtifactCapture {
  readonly directory: string;
  readonly keyboardRenderTrace: RenderTrace | null;
  readonly keyboardTimeline: KeyboardTimeline | null;
  readonly manifest: StackedDeckVisualManifest;
  readonly mouseRenderTrace: RenderTrace;
  readonly mouseTimeline: MouseTimeline;
}

export type CompatibilityLevel =
  | "comparable"
  | "comparable-with-warnings"
  | "not-directly-comparable";

export interface ComparisonDifference {
  readonly a: unknown;
  readonly b: unknown;
  readonly field: string;
  readonly severity: "hard" | "warning";
}

export interface ProgressMetricDifference {
  readonly maximumAbsoluteDifference: number;
  readonly meanAbsoluteDifference: number;
  readonly progressOfMaximumDifference: number;
}

export interface ProgressAlignedGeometryComparison {
  readonly direction: Exclude<ReviewDirection, "none">;
  readonly metrics: Readonly<Record<string, ProgressMetricDifference>>;
  readonly progressRange: readonly [number, number];
  readonly sampleCount: number;
}

export interface StackedDeckArtifactComparison {
  readonly artifacts: {
    readonly a: { readonly directory: string; readonly revision: string };
    readonly b: { readonly directory: string; readonly revision: string };
  };
  readonly compatibility: CompatibilityLevel;
  readonly createdAt: string;
  readonly differences: readonly ComparisonDifference[];
  readonly directMetricDifferences: Readonly<Record<string, number>> | null;
  readonly keyboardLandmarkDifferences: {
    readonly authorityTransitionDurationsMs: readonly number[];
    readonly settlementDurationsMs: readonly number[];
  } | null;
  readonly progressAlignedGeometry: readonly ProgressAlignedGeometryComparison[] | null;
  readonly scenario: {
    readonly id: string;
    readonly version: number;
  };
  readonly schemaVersion: number;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function normalizedIntervals(timestamps: readonly number[]): readonly number[] {
  const raw = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]!);
  const positive = raw.filter((interval) => Number.isFinite(interval) && interval > 0);
  const median = percentile(positive, 0.5);
  const scale = median !== null && median < 1 ? 1_000 : 1;
  return positive.map((interval) => interval * scale);
}

export function frameIntervalTelemetry(
  timestamps: readonly number[],
  explicitDurationMs?: number,
): FrameIntervalTelemetry {
  const intervals = normalizedIntervals(timestamps);
  const intervalDuration = intervals.reduce((total, interval) => total + interval, 0);
  return {
    durationMs: explicitDurationMs ?? intervalDuration,
    frameCount: timestamps.length,
    maxFrameIntervalMs: intervals.length === 0 ? null : Math.max(...intervals),
    meanFrameIntervalMs:
      intervals.length === 0 ? null : intervalDuration / Math.max(1, intervals.length),
    p95FrameIntervalMs: percentile(intervals, 0.95),
  };
}

function emptyDirectionMetrics(): DirectManipulationDirectionMetrics {
  return {
    authorityCrossoverProgress: null,
    depthCrossoverProgress: null,
    maximumCheckpointError: 0,
    maximumProgressError: 0,
    minimumScale: null,
    peakAbsoluteOutgoingTranslateX: null,
    peakAbsoluteOutgoingTranslateXVelocityPerSecond: null,
    peakAbsoluteRotation: null,
    shadowMinimum: null,
    shadowRecovery: null,
    stimulusSampleCount: 0,
  };
}

function landmark(
  samples: readonly StimulusTraceSample[],
  value: (sample: StimulusTraceSample) => number | null,
  score: (value: number) => number,
  selectMaximum: boolean,
): MetricLandmark | null {
  let selected: MetricLandmark | null = null;
  let selectedScore = selectMaximum ? -Infinity : Infinity;
  for (const sample of samples) {
    const current = value(sample);
    if (current === null || !Number.isFinite(current)) continue;
    const currentScore = score(current);
    if (
      (selectMaximum && currentScore > selectedScore) ||
      (!selectMaximum && currentScore < selectedScore)
    ) {
      selected = { progress: sample.actualPhysicalProgress, value: current };
      selectedScore = currentScore;
    }
  }
  return selected;
}

function velocityLandmark(samples: readonly RenderedFrameSample[]): TimeMetricLandmark | null {
  let selected: TimeMetricLandmark | null = null;
  let selectedMagnitude = -Infinity;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (!previous.outgoing || !current.outgoing) continue;
    const deltaMs = current.browserTimestampMs - previous.browserTimestampMs;
    if (deltaMs < 4 || deltaMs > 100) continue;
    const velocity =
      ((current.outgoing.translateX - previous.outgoing.translateX) / deltaMs) * 1_000;
    const magnitude = Math.abs(velocity);
    if (magnitude > selectedMagnitude) {
      selected = { relativeTimeMs: current.relativeTimeMs, value: velocity };
      selectedMagnitude = magnitude;
    }
  }
  return selected;
}

function directionMetrics(
  stimulusSamples: readonly StimulusTraceSample[],
  renderedSamples: readonly RenderedFrameSample[],
  direction: Exclude<ReviewDirection, "none">,
  targetIndex: number,
): DirectManipulationDirectionMetrics {
  const samples = stimulusSamples.filter((sample) => sample.direction === direction);
  if (samples.length === 0) return emptyDirectionMetrics();
  const progressSorted = samples.toSorted(
    (left, right) => left.actualPhysicalProgress - right.actualPhysicalProgress,
  );
  const maximumProgressError = Math.max(
    ...samples.map((sample) => Math.abs(sample.actualPhysicalProgress - sample.requestedProgress)),
  );
  const checkpoints = samples.filter((sample) => sample.sampleKind === "checkpoint");
  const maximumCheckpointError = checkpoints.length
    ? Math.max(
        ...checkpoints.map((sample) =>
          Math.abs(
            sample.actualPhysicalProgress - (sample.checkpointProgress ?? sample.requestedProgress),
          ),
        ),
      )
    : 0;
  const shadowValues = progressSorted
    .map((sample) => sample.outgoing?.shadowStrength)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  let shadowRecovery: DirectManipulationDirectionMetrics["shadowRecovery"] = null;
  if (shadowValues.length > 1) {
    const minimum = Math.min(...shadowValues);
    const maximum = Math.max(...shadowValues);
    const threshold = minimum + (maximum - minimum) * 0.5;
    const recoveryRegion = progressSorted.filter(
      (sample) => sample.outgoing !== null && sample.outgoing.shadowStrength <= threshold,
    );
    const startProgress = recoveryRegion.at(0)?.actualPhysicalProgress;
    const endProgress = recoveryRegion.at(-1)?.actualPhysicalProgress;
    if (startProgress !== undefined && endProgress !== undefined) {
      shadowRecovery = {
        endProgress,
        startProgress,
        threshold,
        width: endProgress - startProgress,
      };
    }
  }
  const phaseName = direction === "forward" ? "slow-held-outbound" : "slow-held-retrace";
  const renderedDirection = renderedSamples.filter((sample) => sample.capturePhase === phaseName);

  return {
    authorityCrossoverProgress:
      progressSorted.find((sample) => sample.authoritativeIndex === targetIndex)
        ?.actualPhysicalProgress ?? null,
    depthCrossoverProgress:
      progressSorted.find(
        (sample) =>
          sample.outgoing !== null &&
          sample.target !== null &&
          sample.target.layer > sample.outgoing.layer,
      )?.actualPhysicalProgress ?? null,
    maximumCheckpointError,
    maximumProgressError,
    minimumScale: landmark(
      samples,
      (sample) => sample.outgoing?.scale ?? null,
      (value) => value,
      false,
    ),
    peakAbsoluteOutgoingTranslateX: landmark(
      samples,
      (sample) => sample.outgoing?.translateX ?? null,
      Math.abs,
      true,
    ),
    peakAbsoluteOutgoingTranslateXVelocityPerSecond: velocityLandmark(renderedDirection),
    peakAbsoluteRotation: landmark(
      samples,
      (sample) => sample.outgoing?.rotate ?? null,
      Math.abs,
      true,
    ),
    shadowMinimum: landmark(
      samples,
      (sample) => sample.outgoing?.shadowStrength ?? null,
      (value) => value,
      false,
    ),
    shadowRecovery,
    stimulusSampleCount: samples.length,
  };
}

export function deriveStackedDeckMetrics(options: {
  readonly keyboardPhases?: readonly ReviewPhase[];
  readonly mouseRenderedSamples: readonly RenderedFrameSample[];
  readonly stimulusSamples: readonly StimulusTraceSample[];
  readonly targetIndex: number;
}): StackedDeckDerivedMetrics {
  const keyboardPhases = options.keyboardPhases?.filter(
    (phase) => phase.interactionType === "keyboard",
  );
  return {
    directManipulation: {
      forward: directionMetrics(
        options.stimulusSamples,
        options.mouseRenderedSamples,
        "forward",
        options.targetIndex,
      ),
      reverse: directionMetrics(
        options.stimulusSamples,
        options.mouseRenderedSamples,
        "reverse",
        options.targetIndex,
      ),
    },
    keyboard:
      keyboardPhases && keyboardPhases.length > 0
        ? {
            authorityTransitionDurationsMs: keyboardPhases.map(
              (phase) => (phase.authorityTransitionMs ?? phase.startMs) - phase.startMs,
            ),
            settlementDurationsMs: keyboardPhases.map(
              (phase) => (phase.settlementMs ?? phase.endMs) - phase.startMs,
            ),
          }
        : null,
  };
}

function formatNumber(value: number | null, digits = 3): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function metricSummary(label: string, metric: MetricLandmark | null, unit: string): string {
  return `- ${label}: ${metric ? `${formatNumber(metric.value)}${unit} at progress ${formatNumber(metric.progress)}` : "n/a"}`;
}

export function renderCaptureReview(manifest: StackedDeckVisualManifest): string {
  const forward = manifest.derivedMetrics.directManipulation.forward;
  const reverse = manifest.derivedMetrics.directManipulation.reverse;
  const recordings = manifest.capture.recordings
    .map(
      (recording) =>
        `- \`${recording.filename}\`: ${formatNumber(recording.durationMs, 1)} ms, ${recording.timelineSampleCount} timeline samples, ${recording.renderedFrameTelemetry.frameCount} rendered samples`,
    )
    .join("\n");
  const files = manifest.artifactFiles.map((file) => `- \`${file}\``).join("\n");
  const warnings = manifest.warnings.length
    ? manifest.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- None recorded.";

  return `# Stacked Deck visual review

- Revision: \`${manifest.revision}\` (${manifest.dirty ? "dirty working tree" : "clean working tree"})
- Scenario: \`${manifest.scenarioId}\` v${manifest.scenarioVersion} (${manifest.canonical ? "canonical" : "exploratory/custom"})
- Reproduce: \`${manifest.reproductionCommand}\`

## Environment

- Playwright ${manifest.environment.playwrightVersion}; ${manifest.environment.browserName} ${manifest.environment.browserVersion}
- Viewport ${manifest.environment.viewport.width}x${manifest.environment.viewport.height} at ${manifest.environment.deviceScaleFactor}x device scale
- ${manifest.environment.colorScheme} color scheme; ${manifest.environment.reducedMotion} reduced motion; ${manifest.environment.locale}; ${manifest.environment.timezoneId}
- Card pair \`${manifest.application.reviewCardPair[0]} -> ${manifest.application.reviewCardPair[1]}\`; profile \`${manifest.application.tuningProfile}\`; motion pitch ${formatNumber(manifest.application.motionPitch)} px

## Recordings

${recordings}

## Direct-manipulation metrics

${metricSummary("Forward peak absolute outgoing translateX", forward.peakAbsoluteOutgoingTranslateX, " px")}
${metricSummary("Forward peak absolute rotation", forward.peakAbsoluteRotation, " deg")}
${metricSummary("Forward minimum scale", forward.minimumScale, "")}
${metricSummary("Forward shadow minimum", forward.shadowMinimum, "")}
- Forward depth crossover: ${formatNumber(forward.depthCrossoverProgress)}
- Forward authority crossover: ${formatNumber(forward.authorityCrossoverProgress)}
- Forward/retrace maximum progress error: ${formatNumber(forward.maximumProgressError, 6)} / ${formatNumber(reverse.maximumProgressError, 6)}
- Forward/retrace maximum checkpoint error: ${formatNumber(forward.maximumCheckpointError, 6)} / ${formatNumber(reverse.maximumCheckpointError, 6)}

Raw traces are authoritative. The WebM files are human perception aids; exact checkpoint PNGs and dense progress/render traces serve different review purposes.

## Artifacts

${files}

## Warnings

${warnings}
`;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readArtifactCapture(directory: string): Promise<ArtifactCapture> {
  const resolvedDirectory = resolve(directory);
  let manifest: StackedDeckVisualManifest;
  try {
    manifest = await readJson<StackedDeckVisualManifest>(join(resolvedDirectory, "manifest.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Artifact ${resolvedDirectory} lacks manifest.json/schemaVersion; recapture with the current harness for direct comparison.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (manifest.schemaVersion === undefined) {
    throw new Error(
      `Artifact ${resolvedDirectory} lacks schemaVersion; recapture with the current harness for direct comparison.`,
    );
  }
  const mouseTimeline = await readJson<MouseTimeline>(
    join(resolvedDirectory, "mouse-timeline.json"),
  );
  const mouseRenderTrace = await readJson<RenderTrace>(
    join(resolvedDirectory, "mouse-render-trace.json"),
  );
  return {
    directory: resolvedDirectory,
    keyboardRenderTrace: await readOptionalJson<RenderTrace>(
      join(resolvedDirectory, "keyboard-render-trace.json"),
    ),
    keyboardTimeline: await readOptionalJson<KeyboardTimeline>(
      join(resolvedDirectory, "keyboard-timeline.json"),
    ),
    manifest,
    mouseRenderTrace,
    mouseTimeline,
  };
}

function interpolationSeries(
  samples: readonly StimulusTraceSample[],
  direction: Exclude<ReviewDirection, "none">,
  read: (sample: StimulusTraceSample) => number | null,
): readonly { readonly progress: number; readonly value: number }[] {
  const byProgress = new Map<string, { progress: number; value: number }>();
  for (const sample of samples.filter((entry) => entry.direction === direction)) {
    const value = read(sample);
    if (value === null || !Number.isFinite(value)) continue;
    byProgress.set(sample.actualPhysicalProgress.toFixed(9), {
      progress: sample.actualPhysicalProgress,
      value,
    });
  }
  return [...byProgress.values()].toSorted((left, right) => left.progress - right.progress);
}

function interpolate(
  series: readonly { readonly progress: number; readonly value: number }[],
  progress: number,
): number | null {
  if (series.length === 0 || progress < series[0]!.progress || progress > series.at(-1)!.progress) {
    return null;
  }
  const exact = series.find((sample) => Math.abs(sample.progress - progress) < 1e-9);
  if (exact) return exact.value;
  const upperIndex = series.findIndex((sample) => sample.progress > progress);
  if (upperIndex <= 0) return null;
  const lower = series[upperIndex - 1]!;
  const upper = series[upperIndex]!;
  const fraction = (progress - lower.progress) / (upper.progress - lower.progress);
  return lower.value + (upper.value - lower.value) * fraction;
}

export function compareProgressAlignedGeometry(
  a: readonly StimulusTraceSample[],
  b: readonly StimulusTraceSample[],
  direction: Exclude<ReviewDirection, "none">,
): ProgressAlignedGeometryComparison | null {
  const readers = {
    "outgoing.rotate": (sample: StimulusTraceSample) => sample.outgoing?.rotate ?? null,
    "outgoing.scale": (sample: StimulusTraceSample) => sample.outgoing?.scale ?? null,
    "outgoing.shadowStrength": (sample: StimulusTraceSample) =>
      sample.outgoing?.shadowStrength ?? null,
    "outgoing.translateX": (sample: StimulusTraceSample) => sample.outgoing?.translateX ?? null,
    "target.rotate": (sample: StimulusTraceSample) => sample.target?.rotate ?? null,
    "target.scale": (sample: StimulusTraceSample) => sample.target?.scale ?? null,
    "target.shadowStrength": (sample: StimulusTraceSample) => sample.target?.shadowStrength ?? null,
    "target.translateX": (sample: StimulusTraceSample) => sample.target?.translateX ?? null,
  } as const;
  const firstReader = readers["outgoing.translateX"];
  const firstA = interpolationSeries(a, direction, firstReader);
  const firstB = interpolationSeries(b, direction, firstReader);
  if (firstA.length < 2 || firstB.length < 2) return null;
  const minimum = Math.max(firstA[0]!.progress, firstB[0]!.progress);
  const maximum = Math.min(firstA.at(-1)!.progress, firstB.at(-1)!.progress);
  if (maximum <= minimum) return null;
  const gridLength = Math.max(2, Math.floor((maximum - minimum) / 0.01) + 1);
  const grid = Array.from(
    { length: gridLength },
    (_, index) => minimum + ((maximum - minimum) * index) / (gridLength - 1),
  );
  const metrics: Record<string, ProgressMetricDifference> = {};
  for (const [name, reader] of Object.entries(readers)) {
    const seriesA = interpolationSeries(a, direction, reader);
    const seriesB = interpolationSeries(b, direction, reader);
    const differences = grid
      .map((progress) => {
        const valueA = interpolate(seriesA, progress);
        const valueB = interpolate(seriesB, progress);
        return valueA === null || valueB === null
          ? null
          : { difference: Math.abs(valueB - valueA), progress };
      })
      .filter((entry): entry is { difference: number; progress: number } => entry !== null);
    if (differences.length === 0) continue;
    const maximumDifference = differences.reduce((selected, current) =>
      current.difference > selected.difference ? current : selected,
    );
    metrics[name] = {
      maximumAbsoluteDifference: maximumDifference.difference,
      meanAbsoluteDifference:
        differences.reduce((total, entry) => total + entry.difference, 0) / differences.length,
      progressOfMaximumDifference: maximumDifference.progress,
    };
  }
  return {
    direction,
    metrics,
    progressRange: [minimum, maximum],
    sampleCount: grid.length,
  };
}

function addDifference(
  differences: ComparisonDifference[],
  field: string,
  a: unknown,
  b: unknown,
  severity: ComparisonDifference["severity"],
): void {
  if (stableJson(a) === stableJson(b)) return;
  differences.push({ a, b, field, severity });
}

function numericLeaves(
  value: unknown,
  prefix = "",
  output: Record<string, number> = {},
): Record<string, number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    output[prefix] = value;
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      numericLeaves(child, prefix ? `${prefix}.${key}` : key, output);
    }
  }
  return output;
}

export function compareArtifactCaptures(
  a: ArtifactCapture,
  b: ArtifactCapture,
): StackedDeckArtifactComparison {
  const differences: ComparisonDifference[] = [];
  addDifference(
    differences,
    "schemaVersion",
    a.manifest.schemaVersion,
    b.manifest.schemaVersion,
    "hard",
  );
  addDifference(differences, "scenarioId", a.manifest.scenarioId, b.manifest.scenarioId, "hard");
  addDifference(
    differences,
    "scenarioVersion",
    a.manifest.scenarioVersion,
    b.manifest.scenarioVersion,
    "hard",
  );
  addDifference(
    differences,
    "environment.viewport",
    a.manifest.environment.viewport,
    b.manifest.environment.viewport,
    "hard",
  );
  addDifference(
    differences,
    "environment.deviceScaleFactor",
    a.manifest.environment.deviceScaleFactor,
    b.manifest.environment.deviceScaleFactor,
    "hard",
  );
  addDifference(
    differences,
    "environment.browserName",
    a.manifest.environment.browserName,
    b.manifest.environment.browserName,
    "hard",
  );
  addDifference(
    differences,
    "environment.reducedMotion",
    a.manifest.environment.reducedMotion,
    b.manifest.environment.reducedMotion,
    "hard",
  );
  addDifference(
    differences,
    "application.reviewCardPair",
    a.manifest.application.reviewCardPair,
    b.manifest.application.reviewCardPair,
    "hard",
  );
  addDifference(
    differences,
    "resolvedScenarioConfig",
    a.manifest.resolvedScenarioConfig,
    b.manifest.resolvedScenarioConfig,
    "hard",
  );
  addDifference(
    differences,
    "environment.browserVersion",
    a.manifest.environment.browserVersion,
    b.manifest.environment.browserVersion,
    "warning",
  );
  addDifference(
    differences,
    "environment.colorScheme",
    a.manifest.environment.colorScheme,
    b.manifest.environment.colorScheme,
    "warning",
  );
  addDifference(
    differences,
    "environment.locale",
    a.manifest.environment.locale,
    b.manifest.environment.locale,
    "warning",
  );
  addDifference(differences, "canonical", a.manifest.canonical, b.manifest.canonical, "warning");
  if (a.manifest.dirty !== b.manifest.dirty) {
    differences.push({
      a: a.manifest.dirty,
      b: b.manifest.dirty,
      field: "dirty",
      severity: "warning",
    });
  }
  for (const input of ["mouse", "keyboard"] as const) {
    const recordingA = a.manifest.capture.recordings.find((recording) => recording.input === input);
    const recordingB = b.manifest.capture.recordings.find((recording) => recording.input === input);
    const cadenceA = recordingA?.screencastTelemetry.meanFrameIntervalMs;
    const cadenceB = recordingB?.screencastTelemetry.meanFrameIntervalMs;
    if (
      cadenceA !== undefined &&
      cadenceA !== null &&
      cadenceB !== undefined &&
      cadenceB !== null &&
      Math.abs(cadenceA - cadenceB) > 5
    ) {
      differences.push({
        a: cadenceA,
        b: cadenceB,
        field: `capture.${input}.meanFrameIntervalMs`,
        severity: "warning",
      });
    }
  }
  const hard = differences.some((difference) => difference.severity === "hard");
  const warnings = differences.some((difference) => difference.severity === "warning");
  const compatibility: CompatibilityLevel = hard
    ? "not-directly-comparable"
    : warnings
      ? "comparable-with-warnings"
      : "comparable";
  const directMetricDifferences = hard
    ? null
    : (() => {
        const metricsA = numericLeaves(a.manifest.derivedMetrics.directManipulation);
        const metricsB = numericLeaves(b.manifest.derivedMetrics.directManipulation);
        return Object.fromEntries(
          Object.keys(metricsA)
            .filter((key) => metricsB[key] !== undefined)
            .toSorted()
            .map((key) => [key, metricsB[key]! - metricsA[key]!]),
        );
      })();
  const progressAlignedGeometry = hard
    ? null
    : (["forward", "reverse"] as const)
        .map((direction) =>
          compareProgressAlignedGeometry(
            a.mouseTimeline.stimulusTrace,
            b.mouseTimeline.stimulusTrace,
            direction,
          ),
        )
        .filter((entry): entry is ProgressAlignedGeometryComparison => entry !== null);
  const keyboardA = a.manifest.derivedMetrics.keyboard;
  const keyboardB = b.manifest.derivedMetrics.keyboard;
  const keyboardLandmarkDifferences =
    hard || !keyboardA || !keyboardB
      ? null
      : {
          authorityTransitionDurationsMs: keyboardA.authorityTransitionDurationsMs.map(
            (value, index) => (keyboardB.authorityTransitionDurationsMs[index] ?? value) - value,
          ),
          settlementDurationsMs: keyboardA.settlementDurationsMs.map(
            (value, index) => (keyboardB.settlementDurationsMs[index] ?? value) - value,
          ),
        };

  return {
    artifacts: {
      a: { directory: a.directory, revision: a.manifest.revision },
      b: { directory: b.directory, revision: b.manifest.revision },
    },
    compatibility,
    createdAt: new Date().toISOString(),
    differences,
    directMetricDifferences,
    keyboardLandmarkDifferences,
    progressAlignedGeometry,
    scenario: { id: a.manifest.scenarioId, version: a.manifest.scenarioVersion },
    schemaVersion: STACKED_DECK_VISUAL_SCHEMA_VERSION,
  };
}

export function renderComparisonMarkdown(comparison: StackedDeckArtifactComparison): string {
  const differences = comparison.differences.length
    ? comparison.differences
        .map(
          (difference) =>
            `- **${difference.severity}** \`${difference.field}\`: A=${JSON.stringify(difference.a)}, B=${JSON.stringify(difference.b)}`,
        )
        .join("\n")
    : "- None.";
  const directMetrics = comparison.directMetricDifferences
    ? Object.entries(comparison.directMetricDifferences)
        .filter(([, difference]) => Math.abs(difference) > 0)
        .map(([name, difference]) => `- \`${name}\`: ${difference >= 0 ? "+" : ""}${difference}`)
        .join("\n") || "- No numerical differences in derived direct-manipulation metrics."
    : "- Omitted because the experiments are not directly comparable.";
  const progress = comparison.progressAlignedGeometry
    ? comparison.progressAlignedGeometry
        .flatMap((direction) =>
          Object.entries(direction.metrics).map(
            ([name, metric]) =>
              `- ${direction.direction} \`${name}\`: mean |delta| ${formatNumber(metric.meanAbsoluteDifference, 6)}, max |delta| ${formatNumber(metric.maximumAbsoluteDifference, 6)} at progress ${formatNumber(metric.progressOfMaximumDifference)}`,
          ),
        )
        .join("\n")
    : "- Omitted because the experiments are not directly comparable.";

  return `# Stacked Deck artifact comparison

- Compatibility: **${comparison.compatibility}**
- Scenario: \`${comparison.scenario.id}\` v${comparison.scenario.version}

- A: \`${comparison.artifacts.a.revision}\` — \`${comparison.artifacts.a.directory}\`
- B: \`${comparison.artifacts.b.revision}\` — \`${comparison.artifacts.b.directory}\`

## Compatibility and environment differences

${differences}

## Derived metric deltas (B - A)

${directMetrics}

## Progress-aligned card geometry

${progress}

No better/worse score is assigned. Direct manipulation is aligned by actual physical progress; keyboard settlement landmarks remain time-relative. Human review decides motion quality.
`;
}

export async function writeComparisonFiles(
  comparison: StackedDeckArtifactComparison,
  outputDirectory: string,
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonFile(join(outputDirectory, "comparison.json"), comparison);
  await writeFile(
    join(outputDirectory, "comparison.md"),
    renderComparisonMarkdown(comparison),
    "utf8",
  );
}

export function defaultComparisonDirectory(a: ArtifactCapture, b: ArtifactCapture): string {
  const label =
    `${b.manifest.revision}-${b.manifest.scenarioId}-v${b.manifest.scenarioVersion}`.replaceAll(
      /[^0-9A-Za-z._-]/g,
      "-",
    );
  return join(a.directory, "comparisons", label || basename(b.directory));
}
