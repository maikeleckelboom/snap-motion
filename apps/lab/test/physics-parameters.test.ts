import { describe, expect, it } from "vitest";

import { isLabPresetName, settingsFromPreset } from "../src/fixtures/lab-settings";
import type { LabPhysicsSettings, LabPresetName } from "../src/fixtures/lab-types";
import {
  modifiedPhysicsKeys,
  normalizePhysicsDraft,
  parsePhysicsDraft,
  physicsParameters,
  unsupportedPhysicsSetting,
  type PhysicsKey,
  type PhysicsParameter,
} from "../src/fixtures/physics-parameters";

const presetNames: LabPresetName[] = ["tight", "balanced", "heavy", "loose"];
const balanced = settingsFromPreset("balanced");

function parameter(key: PhysicsKey): PhysicsParameter {
  const found = physicsParameters.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`No parameter for ${key}`);
  return found;
}

function withSetting(key: PhysicsKey, value: number): LabPhysicsSettings {
  return { ...balanced, [key]: value };
}

describe("physics parameter definitions", () => {
  it("define every shared setting exactly once", () => {
    const keys = physicsParameters.map(({ key }) => key);
    expect(keys).toHaveLength(Object.keys(balanced).length);
    expect(new Set(keys)).toEqual(new Set(Object.keys(balanced)));
  });

  it.each(presetNames)("hold every %s preset value as a supported setting", (name) => {
    expect(unsupportedPhysicsSetting(settingsFromPreset(name))).toBeUndefined();
  });
});

describe("physics drafts", () => {
  const damping = parameter("damping");
  const skip = parameter("maxAnchorSkip");

  it("commit supported values while typing", () => {
    expect(parsePhysicsDraft(damping, "36")).toBe(36);
    expect(parsePhysicsDraft(damping, "1")).toBe(1);
    expect(parsePhysicsDraft(damping, "100")).toBe(100);
    expect(parsePhysicsDraft(parameter("mass"), ".85")).toBe(0.85);
    expect(parsePhysicsDraft(parameter("flingVelocity"), "1e3")).toBe(1_000);
    expect(parsePhysicsDraft(skip, "4")).toBe(4);
  });

  it.each(["", " ", "-", ".", "1e", "abc", "0x10", "NaN", "Infinity", "1e400"])(
    "keep %j as an incomplete draft",
    (draft) => {
      expect(parsePhysicsDraft(damping, draft)).toBeUndefined();
      expect(normalizePhysicsDraft(damping, draft)).toBeUndefined();
    },
  );

  it("never commit an out-of-range value while typing", () => {
    expect(parsePhysicsDraft(damping, "0.5")).toBeUndefined();
    expect(parsePhysicsDraft(damping, "-5")).toBeUndefined();
    expect(parsePhysicsDraft(damping, "250")).toBeUndefined();
    expect(parsePhysicsDraft(skip, "2.5")).toBeUndefined();
  });

  it("bound a finite out-of-range value on commit and keep an unsupported one out", () => {
    expect(normalizePhysicsDraft(damping, "-5")).toBe(1);
    expect(normalizePhysicsDraft(damping, "250")).toBe(100);
    expect(normalizePhysicsDraft(skip, "0.4")).toBe(1);
    expect(normalizePhysicsDraft(skip, "7.5")).toBe(5);
    // In range but fractional: the engine rejects it, so the committed value stays.
    expect(normalizePhysicsDraft(skip, "2.5")).toBeUndefined();
  });
});

describe("shared settings writes", () => {
  it.each([
    ["damping", Number.NaN],
    ["damping", Number.POSITIVE_INFINITY],
    ["stiffness", 0],
    ["stiffness", 901],
    ["mass", -1],
    ["maxAnchorSkip", 2.5],
    ["maxElasticDistance", -0.5],
  ] as const)("reject %s = %d", (key, value) => {
    expect(unsupportedPhysicsSetting(withSetting(key, value))).toBe(key);
  });

  it("reject a value that is not a number at all", () => {
    const candidate = { ...balanced, damping: "36" } as unknown as LabPhysicsSettings;
    expect(unsupportedPhysicsSetting(candidate)).toBe("damping");
  });

  it("accept only the four lab preset names", () => {
    for (const name of presetNames) expect(isLabPresetName(name)).toBe(true);
    for (const name of ["", "custom", "Balanced", "toString", undefined]) {
      expect(isLabPresetName(name)).toBe(false);
    }
  });

  it("accept the supported bounds themselves", () => {
    for (const { key, min, max } of physicsParameters) {
      expect(unsupportedPhysicsSetting(withSetting(key, min))).toBeUndefined();
      expect(unsupportedPhysicsSetting(withSetting(key, max))).toBeUndefined();
    }
  });
});

describe("preset modification", () => {
  it.each(presetNames)("reports an untouched %s preset as unmodified", (name) => {
    expect(modifiedPhysicsKeys(settingsFromPreset(name), settingsFromPreset(name))).toEqual([]);
  });

  it("counts every differing shared setting, including ones a surface fixes", () => {
    const edited = { ...withSetting("stiffness", 620), maxAnchorSkip: 4 };
    expect(modifiedPhysicsKeys(edited, balanced)).toEqual(["stiffness", "maxAnchorSkip"]);
  });

  it("clears once every edit returns to the preset value", () => {
    const edited = withSetting("mass", 1.2);
    expect(modifiedPhysicsKeys(edited, balanced)).toEqual(["mass"]);
    expect(modifiedPhysicsKeys({ ...edited, mass: Number("0.85") }, balanced)).toEqual([]);
  });

  it("compares against the selected base preset, not the lab's initial one", () => {
    expect(modifiedPhysicsKeys(balanced, settingsFromPreset("heavy")).length).toBeGreaterThan(0);
  });

  it("ignores representation noise but never a real edit", () => {
    expect(modifiedPhysicsKeys(withSetting("projectionSeconds", 0.22 + 1e-15), balanced)).toEqual(
      [],
    );
    expect(modifiedPhysicsKeys(withSetting("restDistance", 0.61), balanced)).toEqual([
      "restDistance",
    ]);
    expect(modifiedPhysicsKeys(withSetting("mass", 0.851), balanced)).toEqual(["mass"]);
  });
});
