import { describe, expect, it } from "vitest";

import { settingsFromPreset } from "../src/fixtures/lab-settings";
import type { LabPresetName } from "../src/fixtures/lab-types";
import { sampleSpringResponse } from "../src/playground/spring-response";

const presets: LabPresetName[] = ["tight", "balanced", "heavy", "loose"];

describe("spring response preview", () => {
  it.each(presets)("settles the %s preset on its own rest rule within the window", (name) => {
    const response = sampleSpringResponse(settingsFromPreset(name));
    expect(response.settleSeconds).toBeDefined();
    expect(response.settleSeconds!).toBeGreaterThan(0.05);
    expect(response.settleSeconds!).toBeLessThan(2);
    expect(response.samples.at(-1)?.progress).toBe(1);
  });

  it("starts at rest and is deterministic", () => {
    const settings = settingsFromPreset("balanced");
    const first = sampleSpringResponse(settings);
    expect(first.samples[0]).toEqual({ time: 0, progress: 0 });
    expect(sampleSpringResponse(settings)).toEqual(first);
  });

  it("shows a lightly damped spring overshooting and a heavily damped one not", () => {
    const base = settingsFromPreset("balanced");
    const light = sampleSpringResponse({ ...base, damping: 6 });
    const heavy = sampleSpringResponse({ ...base, damping: 100 });
    expect(light.overshoot).toBeGreaterThan(0.2);
    expect(heavy.overshoot).toBe(0);
  });

  it("reports a spring that cannot settle in the window instead of inventing a time", () => {
    const base = settingsFromPreset("balanced");
    const response = sampleSpringResponse({
      ...base,
      damping: 1,
      restSpeed: 0.1,
      restDistance: 0.01,
    });
    expect(response.settleSeconds).toBeUndefined();
  });

  it("settles later with more mass under the same spring", () => {
    const base = settingsFromPreset("balanced");
    const light = sampleSpringResponse({ ...base, mass: 0.4 });
    const massive = sampleSpringResponse({ ...base, mass: 3 });
    expect(massive.settleSeconds!).toBeGreaterThan(light.settleSeconds!);
  });
});
