import { MOTION_PRESETS } from "@snap-motion/core";
import { describe, expect, it } from "vitest";
import { shallowRef } from "vue";

import {
  carouselReleaseFromSettings,
  deckReleaseFromSettings,
  settingsFromPreset,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "../src/fixtures/lab-settings";
import type { LabPresetName } from "../src/fixtures/lab-types";
import {
  sheetElasticityFromSettings,
  sheetReleaseFromSettings,
  useStudioPhysics,
} from "../src/playground/studio/use-studio-physics";

const presets = Object.keys(MOTION_PRESETS) as LabPresetName[];

describe("Motion Studio physics mapping", () => {
  it("follows the shared settings object: replacing it is the whole update", () => {
    const settings = shallowRef(settingsFromPreset("balanced"));
    const physics = useStudioPhysics(() => settings.value);
    expect(physics.spring.value).toEqual(springFromSettings(settingsFromPreset("balanced")));
    settings.value = settingsFromPreset("heavy");
    expect(physics.spring.value).toEqual(springFromSettings(settingsFromPreset("heavy")));
    expect(physics.carouselRelease.value).toEqual(
      carouselReleaseFromSettings(settingsFromPreset("heavy")),
    );
    expect(physics.sheetElasticity.value).toEqual(
      sheetElasticityFromSettings(settingsFromPreset("heavy")),
    );
  });

  for (const name of presets) {
    it(`maps the ${name} preset onto every surface exactly as the demonstrations do`, () => {
      const settings = settingsFromPreset(name);
      const physics = useStudioPhysics(() => settings);
      expect(physics.spring.value).toEqual(springFromSettings(settings));
      expect(physics.elasticity.value).toEqual(symmetricElasticityFromSettings(settings));
      expect(physics.carouselRelease.value).toEqual(carouselReleaseFromSettings(settings));
      expect(physics.deckRelease.value).toEqual(deckReleaseFromSettings(settings));
      expect(physics.programmaticImpulse.value).toBe(settings.programmaticImpulse);
      // The Deck fixes its own skip; the Studio never hands it the shared slider.
      expect("maxAnchorSkip" in physics.deckRelease.value).toBe(false);
    });

    it(`maps the ${name} preset onto the Sheet's one-sided edge`, () => {
      const settings = settingsFromPreset(name);
      const preset = MOTION_PRESETS[name];
      expect(sheetElasticityFromSettings(settings)).toEqual({
        min: preset.elasticity.min,
        max: false,
      });
      expect(sheetReleaseFromSettings(settings)).toEqual({
        projectionSeconds: preset.release.projectionSeconds,
        flingVelocity: preset.release.flingVelocity,
        maxAnchorSkip: Math.max(1, Math.round(preset.release.maxAnchorSkip)),
        forwardSign: 1,
      });
    });
  }

  it("distinguishes the four presets, so a preset change is a real change for every surface", () => {
    const springs = presets.map((name) =>
      JSON.stringify(springFromSettings(settingsFromPreset(name))),
    );
    expect(new Set(springs).size).toBe(presets.length);
  });
});
