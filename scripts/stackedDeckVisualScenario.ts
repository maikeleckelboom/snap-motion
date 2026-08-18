import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

export const STACKED_DECK_VISUAL_SCHEMA_VERSION = 1;
export const STACKED_DECK_REVIEW_SCENARIO_ID = "stacked-deck-review";
export const STACKED_DECK_CURVE_SCENARIO_ID = "stacked-deck-curve";

export interface VisualViewport {
  readonly height: number;
  readonly width: number;
}

export interface StackedDeckReviewPair {
  readonly startId: string;
  readonly targetId: string;
}

export interface SlowTraversalConfig {
  readonly checkpoints: readonly number[];
  readonly durationMs: number;
  readonly inputCadenceMs: number;
  readonly maxProgress: number;
  readonly screenshotCheckpoints: readonly number[];
  readonly turnaroundHoldMs: number;
}

export interface NormalGestureConfig {
  readonly alternatingRepetitions: number;
  readonly cadenceMs: number;
  readonly durationMs: number;
  readonly progress: number;
}

export interface ReviewRestConfig {
  readonly betweenGesturesMs: number;
  readonly finalMs: number;
  readonly initialMs: number;
  readonly keyboardBetweenMs: number;
  readonly preRecordingMs: number;
}

export interface StackedDeckVisualScenarioConfig {
  readonly cardPair: StackedDeckReviewPair;
  readonly kind: "curve" | "full-review";
  readonly normalGesture: NormalGestureConfig | null;
  readonly rests: ReviewRestConfig;
  readonly slowTraversal: SlowTraversalConfig;
  readonly viewport: VisualViewport;
}

export interface StackedDeckVisualScenario {
  readonly config: StackedDeckVisualScenarioConfig;
  readonly id: string;
  readonly version: number;
}

export interface ResolvedStackedDeckVisualScenario extends StackedDeckVisualScenario {
  readonly artifactDirectoryName: string;
  readonly canonical: boolean;
  readonly configFingerprint: string;
  readonly reproductionCommand: string;
  readonly requestedArguments: readonly string[];
}

export interface StimulusSchedulePoint {
  readonly atMs: number;
  readonly checkpointProgress?: number;
  readonly sampleKind: "checkpoint" | "stimulus";
}

const canonicalViewport = { height: 1_000, width: 1_440 } as const;
const canonicalPair = { startId: "team", targetId: "settings" } as const;
const canonicalCheckpoints = [
  0, 0.25, 0.4, 0.45, 0.47, 0.49, 0.5, 0.51, 0.53, 0.55, 0.6, 0.7,
] as const;
const screenshotCheckpoints = [0.49, 0.5, 0.51] as const;

const scenarios = {
  [STACKED_DECK_REVIEW_SCENARIO_ID]: {
    id: STACKED_DECK_REVIEW_SCENARIO_ID,
    version: 1,
    config: {
      cardPair: canonicalPair,
      kind: "full-review",
      normalGesture: {
        alternatingRepetitions: 4,
        cadenceMs: 16,
        durationMs: 720,
        progress: 0.68,
      },
      rests: {
        betweenGesturesMs: 350,
        finalMs: 1_000,
        initialMs: 1_000,
        keyboardBetweenMs: 350,
        preRecordingMs: 300,
      },
      slowTraversal: {
        checkpoints: canonicalCheckpoints,
        durationMs: 2_500,
        inputCadenceMs: 16,
        maxProgress: 0.7,
        screenshotCheckpoints,
        turnaroundHoldMs: 400,
      },
      viewport: canonicalViewport,
    },
  },
  [STACKED_DECK_CURVE_SCENARIO_ID]: {
    id: STACKED_DECK_CURVE_SCENARIO_ID,
    version: 1,
    config: {
      cardPair: canonicalPair,
      kind: "curve",
      normalGesture: null,
      rests: {
        betweenGesturesMs: 0,
        finalMs: 600,
        initialMs: 600,
        keyboardBetweenMs: 0,
        preRecordingMs: 300,
      },
      slowTraversal: {
        checkpoints: canonicalCheckpoints,
        durationMs: 2_500,
        inputCadenceMs: 16,
        maxProgress: 0.7,
        screenshotCheckpoints,
        turnaroundHoldMs: 400,
      },
      viewport: canonicalViewport,
    },
  },
} as const satisfies Record<string, StackedDeckVisualScenario>;

function numericOption(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function positiveOption(value: string | undefined, name: string): number | undefined {
  const parsed = numericOption(value, name);
  if (parsed !== undefined && parsed <= 0) throw new Error(`${name} must be greater than zero.`);
  return parsed;
}

function positiveIntegerOption(value: string | undefined, name: string): number | undefined {
  const parsed = positiveOption(value, name);
  if (parsed !== undefined && !Number.isInteger(parsed)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseViewport(value: string | undefined): VisualViewport | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)x(\d+)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error("--viewport must use WIDTHxHEIGHT, for example 1440x1000.");
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) throw new Error("--viewport dimensions must be positive.");
  return { height, width };
}

function parsePair(value: string | undefined): StackedDeckReviewPair | undefined {
  if (value === undefined) return undefined;
  const [startId, targetId, extra] = value.split(":");
  if (!startId || !targetId || extra !== undefined || startId === targetId) {
    throw new Error("--pair must identify two distinct card IDs as START:TARGET.");
  }
  return { startId, targetId };
}

function scenarioIdFor(value: string | undefined): keyof typeof scenarios {
  if (value === undefined || ["canonical", "full", "review"].includes(value)) {
    return STACKED_DECK_REVIEW_SCENARIO_ID;
  }
  if (value === "curve") return STACKED_DECK_CURVE_SCENARIO_ID;
  if (value in scenarios) return value as keyof typeof scenarios;
  throw new Error(
    `Unknown Stacked Deck visual scenario ${JSON.stringify(value)}. Use "review" or "curve".`,
  );
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function shortStableFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 12);
}

function reproductionCommand(arguments_: readonly string[]): string {
  const suffix = arguments_
    .map((argument) => (/\s/.test(argument) ? JSON.stringify(argument) : argument))
    .join(" ");
  return `pnpm visual:stacked-deck${suffix ? ` -- ${suffix}` : ""}`;
}

export function resolveStackedDeckVisualScenario(
  rawArguments: readonly string[] = [],
): ResolvedStackedDeckVisualScenario {
  const requestedArguments = rawArguments.filter(
    (argument, index) => argument !== "--" || index > 0,
  );
  const { values } = parseArgs({
    args: requestedArguments,
    allowPositionals: false,
    strict: true,
    options: {
      "normal-cadence": { type: "string" },
      "normal-duration": { type: "string" },
      pair: { type: "string" },
      repetitions: { type: "string" },
      scenario: { type: "string" },
      "slow-cadence": { type: "string" },
      "slow-duration": { type: "string" },
      "slow-max-progress": { type: "string" },
      viewport: { type: "string" },
    },
  });
  const scenario = structuredClone(scenarios[scenarioIdFor(values.scenario)]);
  const viewport = parseViewport(values.viewport);
  const pair = parsePair(values.pair);
  const slowDurationMs = positiveOption(values["slow-duration"], "--slow-duration");
  const slowCadenceMs = positiveOption(values["slow-cadence"], "--slow-cadence");
  const slowMaxProgress = numericOption(values["slow-max-progress"], "--slow-max-progress");
  const normalDurationMs = positiveOption(values["normal-duration"], "--normal-duration");
  const normalCadenceMs = positiveOption(values["normal-cadence"], "--normal-cadence");
  const repetitions = positiveIntegerOption(values.repetitions, "--repetitions");

  if (slowMaxProgress !== undefined && (slowMaxProgress <= 0 || slowMaxProgress > 1)) {
    throw new Error("--slow-max-progress must be greater than zero and no more than one.");
  }
  if (
    scenario.config.normalGesture === null &&
    [normalDurationMs, normalCadenceMs, repetitions].some((value) => value !== undefined)
  ) {
    throw new Error("Normal-gesture overrides are not applicable to the curve-only scenario.");
  }

  const baseCheckpoints: number[] = [...scenario.config.slowTraversal.checkpoints].filter(
    (checkpoint) => checkpoint <= (slowMaxProgress ?? scenario.config.slowTraversal.maxProgress),
  );
  const maxProgress = slowMaxProgress ?? scenario.config.slowTraversal.maxProgress;
  const checkpoints = baseCheckpoints.includes(maxProgress)
    ? baseCheckpoints
    : [...baseCheckpoints, maxProgress].toSorted((left, right) => left - right);
  const config: StackedDeckVisualScenarioConfig = {
    ...scenario.config,
    ...(pair ? { cardPair: pair } : {}),
    ...(viewport ? { viewport } : {}),
    normalGesture:
      scenario.config.normalGesture === null
        ? null
        : {
            ...scenario.config.normalGesture,
            ...(normalCadenceMs === undefined ? {} : { cadenceMs: normalCadenceMs }),
            ...(normalDurationMs === undefined ? {} : { durationMs: normalDurationMs }),
            ...(repetitions === undefined ? {} : { alternatingRepetitions: repetitions }),
          },
    slowTraversal: {
      ...scenario.config.slowTraversal,
      checkpoints,
      ...(slowCadenceMs === undefined ? {} : { inputCadenceMs: slowCadenceMs }),
      ...(slowDurationMs === undefined ? {} : { durationMs: slowDurationMs }),
      maxProgress,
      screenshotCheckpoints: scenario.config.slowTraversal.screenshotCheckpoints.filter(
        (checkpoint) => checkpoint <= maxProgress,
      ),
    },
  };
  const canonical = requestedArguments.length === 0;
  const configFingerprint = shortStableFingerprint(config);
  const hasParameterOverride = Object.entries(values).some(
    ([name, value]) => name !== "scenario" && value !== undefined,
  );
  const selectedCanonicalAsCustom = scenario.id === STACKED_DECK_REVIEW_SCENARIO_ID && !canonical;
  const customSuffix =
    hasParameterOverride || selectedCanonicalAsCustom ? `-custom-${configFingerprint}` : "";

  return {
    artifactDirectoryName: `${scenario.id}-v${scenario.version}${customSuffix}`,
    canonical,
    config,
    configFingerprint,
    id: scenario.id,
    reproductionCommand: reproductionCommand(requestedArguments),
    requestedArguments,
    version: scenario.version,
  };
}

export function createStimulusSchedule(
  durationMs: number,
  cadenceMs: number,
  checkpoints: readonly number[],
  fromProgress: number,
  toProgress: number,
): readonly StimulusSchedulePoint[] {
  const points = new Map<string, StimulusSchedulePoint>();
  const add = (point: StimulusSchedulePoint) => {
    const key = point.atMs.toFixed(6);
    const existing = points.get(key);
    if (existing?.sampleKind === "checkpoint" && point.sampleKind === "stimulus") return;
    points.set(key, point);
  };
  for (let atMs = 0; atMs <= durationMs; atMs += cadenceMs) {
    add({ atMs, sampleKind: "stimulus" });
  }
  add({ atMs: durationMs, sampleKind: "stimulus" });
  for (const checkpointProgress of checkpoints) {
    const fraction = Math.abs((checkpointProgress - fromProgress) / (toProgress - fromProgress));
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) continue;
    add({
      atMs: durationMs * fraction,
      checkpointProgress,
      sampleKind: "checkpoint",
    });
  }
  return [...points.values()].toSorted((left, right) => left.atMs - right.atMs);
}

export function readVisualScenarioFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ResolvedStackedDeckVisualScenario {
  const source = environment.SNAP_MOTION_STACKED_DECK_VISUAL_SCENARIO;
  if (!source) return resolveStackedDeckVisualScenario();
  const parsed = JSON.parse(source) as ResolvedStackedDeckVisualScenario;
  if (
    !parsed.id ||
    !Number.isInteger(parsed.version) ||
    !parsed.config ||
    !parsed.artifactDirectoryName
  ) {
    throw new Error("The resolved Stacked Deck visual scenario environment payload is invalid.");
  }
  return parsed;
}
