import { MOTION_PRESETS } from "@snap-motion/core";
import { describe, expect, it } from "vitest";

import { settingsFromPreset } from "../src/fixtures/lab-settings";
import { unsupportedPhysicsSetting } from "../src/fixtures/physics-parameters";
import { candidateIds } from "../src/playground/studio/candidate-definitions";
import {
  CUSTOM_ID,
  candidateById,
  resolveCandidate,
  type CandidateBehavior,
  type CandidateId,
} from "../src/playground/studio/candidates";
import { createCustomCandidate } from "../src/playground/studio/studio-custom";
import { createStudioModel } from "../src/playground/studio/studio-model";
import { tuneCandidateB, type TunePatch } from "../src/playground/studio/studio-tune";

describe("the Custom candidate", () => {
  it("starts as the Balanced carousel and is a complete, valid set of numbers", () => {
    const custom = createCustomCandidate();
    expect(custom.state.value).toMatchObject({ surface: "carousel", base: "balanced" });
    expect(custom.state.value.settings).toEqual(settingsFromPreset("balanced"));
    expect(unsupportedPhysicsSetting(custom.state.value.settings)).toBeUndefined();
    expect(custom.modifiedKeys.value).toEqual([]);
  });

  it("changes layout and exchange without touching the numbers", () => {
    const custom = createCustomCandidate();
    custom.patch({ surface: "deck", exchange: "direct" });
    expect(custom.state.value).toMatchObject({ surface: "deck", exchange: "direct" });
    expect(custom.state.value.settings).toEqual(settingsFromPreset("balanced"));
  });

  it("replaces the numbers with a preset's, as the Playground's own tuning does", () => {
    const custom = createCustomCandidate();
    custom.setSettings({
      ...settingsFromPreset("balanced"),
      stiffness: settingsFromPreset("balanced").stiffness + 100,
    });
    expect(custom.modifiedKeys.value).toEqual(["stiffness"]);
    custom.applyPreset("loose");
    expect(custom.state.value.base).toBe("loose");
    expect(custom.state.value.settings).toEqual(settingsFromPreset("loose"));
    expect(custom.modifiedKeys.value).toEqual([]);
  });

  it("reports what differs from its base and resets to it", () => {
    const custom = createCustomCandidate();
    custom.setSettings({ ...settingsFromPreset("balanced"), mass: 3, damping: 9 });
    expect(custom.modifiedKeys.value.toSorted()).toEqual(["damping", "mass"]);
    custom.resetToBase();
    expect(custom.modifiedKeys.value).toEqual([]);
    expect(custom.state.value.base).toBe("balanced");
  });

  it("copies what it is seeded with and never shares it", () => {
    const source = settingsFromPreset("tight");
    const custom = createCustomCandidate();
    custom.seedFrom({ surface: "deck", exchange: "shuffle", base: "tight", settings: source });
    custom.setSettings({ ...custom.state.value.settings, stiffness: 123 });
    expect(source).toEqual(settingsFromPreset("tight"));
  });

  it("never mutates the engine's presets", () => {
    const before = JSON.stringify(MOTION_PRESETS);
    const custom = createCustomCandidate();
    custom.applyPreset("tight");
    custom.setSettings({ ...custom.state.value.settings, stiffness: 1 });
    custom.resetToBase();
    expect(JSON.stringify(MOTION_PRESETS)).toBe(before);
  });
});

function studio(shortlist: readonly CandidateId[]) {
  const model = createStudioModel<CandidateId>({
    ids: candidateIds,
    initialShortlist: shortlist,
  });
  const custom = createCustomCandidate();
  const behaviorOf = (id: CandidateId): CandidateBehavior =>
    resolveCandidate(candidateById.get(id)!, custom.state.value);
  const tune = (patch: TunePatch) => tuneCandidateB(model, custom, behaviorOf, patch);
  return { model, custom, behaviorOf, tune };
}

describe("editing B", () => {
  it("copies a reference into Custom on the first edit and leaves the reference as it was", () => {
    const { model, custom, behaviorOf, tune } = studio(["carousel-balanced", "carousel-loose"]);
    const loose = behaviorOf("carousel-loose");
    expect(tune({ surface: "deck" })).toBe("forked");
    expect(model.candidateId.value).toBe(CUSTOM_ID);
    expect(model.referenceId.value).toBe("carousel-balanced");
    // Custom began as Loose, then took the edit.
    expect(custom.state.value).toMatchObject({ surface: "deck", base: "loose" });
    expect(custom.state.value.settings).toEqual(loose.settings);
    // The reference candidate is the same candidate it always was.
    expect(behaviorOf("carousel-loose")).toEqual(loose);
    expect(behaviorOf("carousel-loose").surface).toBe("carousel");
  });

  it("edits Custom directly from then on, without copying again", () => {
    const { model, custom, tune } = studio(["carousel-balanced", "carousel-loose"]);
    tune({ surface: "deck" });
    const shortlist = [...model.shortlist.value];
    expect(tune({ exchange: "direct" })).toBe("updated");
    expect(tune({ base: "heavy" })).toBe("updated");
    expect(custom.state.value).toMatchObject({ exchange: "direct", base: "heavy" });
    expect(model.shortlist.value).toEqual(shortlist);
  });

  it("keeps the original in the shortlist when there is room", () => {
    const { model, tune } = studio(["carousel-balanced", "carousel-loose"]);
    tune({ base: "tight" });
    expect(model.shortlist.value).toEqual(["carousel-balanced", "carousel-loose", CUSTOM_ID]);
    expect(model.candidateId.value).toBe(CUSTOM_ID);
  });

  it("gives B's slot to the copy when the shortlist is full", () => {
    const { model, tune } = studio([
      "carousel-balanced",
      "carousel-loose",
      "deck-shuffle",
      "deck-heavy",
    ]);
    model.setCandidate("deck-shuffle");
    tune({ base: "tight" });
    expect(model.shortlist.value).toEqual([
      "carousel-balanced",
      "carousel-loose",
      CUSTOM_ID,
      "deck-heavy",
    ]);
    expect(model.referenceId.value).toBe("carousel-balanced");
  });

  it("copies a preset's numbers when the edit is a different preset", () => {
    const { custom, tune } = studio(["carousel-balanced", "carousel-loose"]);
    tune({ base: "tight" });
    expect(custom.state.value.settings).toEqual(settingsFromPreset("tight"));
    expect(custom.state.value.base).toBe("tight");
  });

  it("resets to the base preset's numbers", () => {
    const { custom, tune } = studio(["carousel-balanced", "carousel-loose"]);
    tune({ settings: { ...settingsFromPreset("loose"), stiffness: 500 } });
    expect(custom.modifiedKeys.value).toEqual(["stiffness"]);
    expect(tune({ resetToBase: true })).toBe("updated");
    expect(custom.modifiedKeys.value).toEqual([]);
  });

  it("does not copy over the reference: Custom as A cannot also be B's copy", () => {
    const { model, custom, tune } = studio([CUSTOM_ID, "carousel-loose"]);
    const before = JSON.stringify(custom.state.value);
    expect(tune({ surface: "deck" })).toBe("reference-is-custom");
    expect(JSON.stringify(custom.state.value)).toBe(before);
    expect(model.referenceId.value).toBe(CUSTOM_ID);
    expect(model.candidateId.value).toBe("carousel-loose");
  });

  it("edits nothing when there is no B", () => {
    const { custom, tune } = studio(["carousel-balanced"]);
    const before = JSON.stringify(custom.state.value);
    expect(tune({ surface: "deck" })).toBe("no-b");
    expect(JSON.stringify(custom.state.value)).toBe(before);
  });
});
