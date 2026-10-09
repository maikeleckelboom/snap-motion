import { describe, expect, it } from "vitest";

import { settingsFromPreset } from "../src/fixtures/lab-settings";
import type { LabPresetName } from "../src/fixtures/lab-types";
import {
  presetLabel,
  presetNote,
  presetOptions,
  presetSpringSummary,
} from "../src/playground/preset-facts";

const names = presetOptions.map(({ value }) => value);

function maximum(key: keyof ReturnType<typeof settingsFromPreset>): LabPresetName {
  return names.reduce((best, name) =>
    settingsFromPreset(name)[key] > settingsFromPreset(best)[key] ? name : best,
  );
}

function minimum(key: keyof ReturnType<typeof settingsFromPreset>): LabPresetName {
  return names.reduce((best, name) =>
    settingsFromPreset(name)[key] < settingsFromPreset(best)[key] ? name : best,
  );
}

describe("preset copy", () => {
  it("offers exactly the four engine presets in a stable order", () => {
    expect(names).toEqual(["tight", "balanced", "heavy", "loose"]);
  });

  it("states only comparisons the engine values support", () => {
    // "Stiffest spring"
    expect(maximum("stiffness")).toBe("tight");
    // "Highest mass; a release travels at most one step"
    expect(maximum("mass")).toBe("heavy");
    expect(settingsFromPreset("heavy").maxAnchorSkip).toBe(1);
    // "Softest spring and the widest elastic edge"
    expect(minimum("stiffness")).toBe("loose");
    expect(maximum("maxElasticDistance")).toBe("loose");
    // "Between Tight and Loose"
    const balanced = settingsFromPreset("balanced");
    expect(balanced.stiffness).toBeLessThan(settingsFromPreset("tight").stiffness);
    expect(balanced.stiffness).toBeGreaterThan(settingsFromPreset("loose").stiffness);
  });

  it("derives the spring summary from the preset, not from copy", () => {
    expect(presetSpringSummary("balanced")).toBe("Stiffness 400 · Damping 36 · Mass 0.85");
    expect(presetLabel("heavy")).toBe("Heavy");
    expect(presetNote("tight")).toBe("Stiffest spring.");
  });
});
