import { computed, ref, type ComputedRef, type Ref } from "vue";

import { settingsFromPreset } from "../../fixtures/lab-settings";
import type { LabPhysicsSettings } from "../../fixtures/lab-types";
import { modifiedPhysicsKeys, type PhysicsKey } from "../../fixtures/physics-parameters";
import type { CandidateExchange, CandidateFeel, CandidateSurface } from "./candidate-definitions";

/**
 * The Custom candidate: the one configuration in the Studio a visitor can change, and the one place
 * its numbers live.
 *
 * Why it is its own owner. Three other things in the page also hold physics, and none of them may be
 * changed by editing B:
 *
 * - the six reference candidates are presets read straight from the engine. They are immutable, so a
 *   comparison against one always means the same thing;
 * - the Playground's shared Motion Tuning belongs to the five single-surface sections, and to the
 *   implementation sheet. Editing B never writes to it. The relationship is one explicit, one-way
 *   copy (`seedFrom`) the visitor asks for, and nothing here holds a reference back to it;
 * - the Shortlist's own Deck takes no physics from here at all: how those cards turn is a property
 *   of the list, not of the behaviour being compared.
 *
 * `settings` is always a complete, valid set of numbers. `base` is only the preset it started from,
 * so the interface can say what was changed ("Balanced, 2 edited") and reset to it.
 */

export interface CustomCandidateState {
  readonly surface: CandidateSurface;
  readonly exchange: CandidateExchange;
  readonly base: CandidateFeel;
  readonly settings: LabPhysicsSettings;
}

export type CustomPatch = Partial<Pick<CustomCandidateState, "exchange" | "surface">>;

export interface CustomCandidate {
  readonly state: Readonly<Ref<CustomCandidateState>>;
  /** The keys of `settings` that differ from the base preset. */
  readonly modifiedKeys: ComputedRef<readonly PhysicsKey[]>;
  /** Changes the layout or the exchange. */
  patch(patch: CustomPatch): void;
  /** Selects a base preset. Presets replace the numbers, as they do in the Playground's tuning. */
  applyPreset(base: CandidateFeel): void;
  /** Replaces the numbers. The base stays what it was. */
  setSettings(settings: LabPhysicsSettings): void;
  /** Puts the numbers back to the base preset's. */
  resetToBase(): void;
  /** Starts over from a whole state, which is how another candidate is copied here. */
  seedFrom(state: CustomCandidateState): void;
}

export function createCustomCandidate(
  initial: CustomCandidateState = {
    surface: "carousel",
    exchange: "shuffle",
    base: "balanced",
    settings: settingsFromPreset("balanced"),
  },
): CustomCandidate {
  const state = ref<CustomCandidateState>({
    ...initial,
    settings: { ...initial.settings },
  }) as Ref<CustomCandidateState>;
  const modifiedKeys = computed(() =>
    modifiedPhysicsKeys(state.value.settings, settingsFromPreset(state.value.base)),
  );

  return {
    state,
    modifiedKeys,
    patch(patch) {
      state.value = { ...state.value, ...patch };
    },
    applyPreset(base) {
      state.value = { ...state.value, base, settings: settingsFromPreset(base) };
    },
    setSettings(settings) {
      state.value = { ...state.value, settings: { ...settings } };
    },
    resetToBase() {
      state.value = { ...state.value, settings: settingsFromPreset(state.value.base) };
    },
    seedFrom(next) {
      state.value = { ...next, settings: { ...next.settings } };
    },
  };
}
