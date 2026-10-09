import type { LabPhysicsSettings } from "./lab-types";

export type PhysicsKey = keyof LabPhysicsSettings;

export interface PhysicsParameter {
  key: PhysicsKey;
  label: string;
  min: number;
  max: number;
  step: number;
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
  { key: "stiffness", label: "Stiffness", min: 50, max: 900, step: 5 },
  { key: "damping", label: "Damping", min: 1, max: 100, step: 1 },
  { key: "mass", label: "Mass", min: 0.1, max: 4, step: 0.05 },
  { key: "restSpeed", label: "Rest speed", min: 0.1, max: 20, step: 0.1, unit: "px/s" },
  { key: "restDistance", label: "Rest distance", min: 0.01, max: 5, step: 0.01, unit: "px" },
  {
    key: "projectionSeconds",
    label: "Projection",
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: "s",
  },
  {
    key: "flingVelocity",
    label: "Fling threshold",
    min: 100,
    max: 3_000,
    step: 25,
    unit: "px/s",
  },
  { key: "maxAnchorSkip", label: "Maximum skip", min: 1, max: 5, step: 1, integer: true },
  {
    key: "elasticResistance",
    label: "Elastic resistance",
    min: 1,
    max: 8,
    step: 0.05,
  },
  {
    key: "maxElasticDistance",
    label: "Elastic limit",
    min: 0,
    max: 160,
    step: 2,
    unit: "px",
  },
  {
    key: "programmaticImpulse",
    label: "Control impulse",
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
