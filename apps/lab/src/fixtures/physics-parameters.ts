import type { LabPhysicsSettings } from "./lab-types";

export type PhysicsKey = keyof LabPhysicsSettings;

export const physicsGroups = [
  { key: "spring", label: "Spring", defaultOpen: true },
  { key: "release", label: "Release", defaultOpen: true },
  { key: "boundaries", label: "Boundaries", defaultOpen: false },
  { key: "controls", label: "Buttons & keys", defaultOpen: false },
  { key: "settling", label: "Settling precision", defaultOpen: false },
] as const;

export type PhysicsGroupKey = (typeof physicsGroups)[number]["key"];

export interface PhysicsParameter {
  key: PhysicsKey;
  label: string;
  group: PhysicsGroupKey;
  description: string;
  min: number;
  max: number;
  /** Adjustment increment, not a restriction on supported decimal input. */
  step: number;
  slider?: boolean;
  /** Only whole numbers are accepted: the engine rejects a fractional anchor skip. */
  integer?: boolean;
  unit?: string;
}

/**
 * Every shared physics setting the lab edits, with the range it accepts. The ranges are the lab's
 * contract rather than the engine's: every preset sits inside them, and nothing outside them may
 * reach the shared settings object.
 */
export const physicsParameters: readonly PhysicsParameter[] = [
  {
    key: "stiffness",
    label: "Stiffness",
    group: "spring",
    description: "Force pulling toward the target.",
    min: 50,
    max: 900,
    step: 5,
    slider: true,
  },
  {
    key: "damping",
    label: "Damping",
    group: "spring",
    description: "Resistance to motion during settling.",
    min: 1,
    max: 100,
    step: 1,
    slider: true,
  },
  {
    key: "mass",
    label: "Mass",
    group: "spring",
    description: "Inertia under the same spring forces.",
    min: 0.1,
    max: 4,
    step: 0.05,
    slider: true,
  },
  {
    key: "restSpeed",
    label: "Rest speed",
    group: "settling",
    description: "Speed threshold for completing a settle.",
    min: 0.1,
    max: 20,
    step: 0.1,
    unit: "px/s",
  },
  {
    key: "restDistance",
    label: "Rest distance",
    group: "settling",
    description: "Target distance threshold; both rest limits must be met.",
    min: 0.01,
    max: 5,
    step: 0.01,
    unit: "px",
  },
  {
    key: "projectionSeconds",
    label: "Projection",
    group: "release",
    description: "Velocity look-ahead for a decisive fling.",
    slider: true,
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: "s",
  },
  {
    key: "flingVelocity",
    label: "Fling threshold",
    group: "release",
    description: "Release speed at which direction becomes decisive.",
    slider: true,
    min: 100,
    max: 3_000,
    step: 25,
    unit: "px/s",
  },
  {
    key: "maxAnchorSkip",
    label: "Maximum skip",
    group: "release",
    description: "Caps anchor travel during a drag and its release.",
    min: 1,
    max: 5,
    step: 1,
    integer: true,
  },
  {
    key: "elasticResistance",
    label: "Elastic resistance",
    group: "boundaries",
    description: "Higher values resist overdrag more strongly.",
    slider: true,
    min: 1,
    max: 8,
    step: 0.05,
  },
  {
    key: "maxElasticDistance",
    label: "Elastic limit",
    group: "boundaries",
    description: "Visual overdrag limit beyond a legal edge.",
    slider: true,
    min: 0,
    max: 160,
    step: 2,
    unit: "px",
  },
  {
    key: "programmaticImpulse",
    label: "Control impulse",
    group: "controls",
    description: "Directional velocity for button and keyboard moves.",
    slider: true,
    min: 0,
    max: 2_500,
    step: 25,
    unit: "px/s",
  },
];

// A decimal number as a number input reports it. Anything else, including an empty field, is an
// incomplete draft rather than a value.
const decimalNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parseDecimal(draft: string): number | undefined {
  const text = draft.trim();
  if (!decimalNumber.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function isSupportedPhysicsValue(parameter: PhysicsParameter, value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= parameter.min &&
    value <= parameter.max &&
    (!parameter.integer || Number.isInteger(value))
  );
}

/** The value a draft may commit while it is still being typed, or `undefined` while incomplete. */
export function parsePhysicsDraft(parameter: PhysicsParameter, draft: string): number | undefined {
  const value = parseDecimal(draft);
  return isSupportedPhysicsValue(parameter, value) ? value : undefined;
}

/**
 * The value a draft commits on Enter or blur: a supported value as typed, a finite out-of-range value
 * at its nearest bound, otherwise `undefined`, which keeps the committed value.
 */
export function normalizePhysicsDraft(
  parameter: PhysicsParameter,
  draft: string,
): number | undefined {
  const value = parseDecimal(draft);
  if (value === undefined) return undefined;
  const bounded = Math.min(parameter.max, Math.max(parameter.min, value));
  return isSupportedPhysicsValue(parameter, bounded) ? bounded : undefined;
}

/** The first setting a candidate cannot hand to a controller, or `undefined` when all are supported. */
export function unsupportedPhysicsSetting(candidate: LabPhysicsSettings): PhysicsKey | undefined {
  return physicsParameters.find(
    (parameter) => !isSupportedPhysicsValue(parameter, candidate[parameter.key]),
  )?.key;
}

// Far below the finest control step and far above the error of a decimal round trip, so only
// representation noise compares equal, never an edit.
function sameSettingValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Every shared setting that differs from `base`, whether or not the active surface consumes it: a
 * value a surface fixes or ignores is still part of the configuration every other surface uses.
 */
export function modifiedPhysicsKeys(
  settings: LabPhysicsSettings,
  base: LabPhysicsSettings,
): PhysicsKey[] {
  return physicsParameters
    .filter(({ key }) => !sameSettingValue(settings[key], base[key]))
    .map(({ key }) => key);
}
