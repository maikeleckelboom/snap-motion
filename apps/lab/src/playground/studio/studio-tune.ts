import type { LabPhysicsSettings } from "../../fixtures/lab-types";
import {
  CUSTOM_ID,
  type CandidateExchange,
  type CandidateFeel,
  type CandidateId,
  type CandidateSurface,
} from "./candidate-definitions";
import type { CandidateBehavior } from "./candidates";
import type { CustomCandidate, CustomCandidateState } from "./studio-custom";
import type { StudioModel } from "./studio-model";

/**
 * Editing B.
 *
 * The six reference candidates are immutable, and Custom is the only candidate a visitor can change.
 * So editing B while B is a reference does not change that reference: it makes a copy. The first edit
 * seeds Custom from B's whole configuration, applies the edit, and puts Custom in B's place. From then
 * on every edit changes Custom directly. The comparison is never lost: A stays where it was and B is
 * still on screen, now with the change.
 *
 * Two cases cannot copy, and say so instead of acting:
 *
 * - there is no B to edit;
 * - Custom is already the reference A. Custom is one candidate, so it cannot also be B's copy. The
 *   visitor swaps A and B (or chooses another reference) and edits it as B.
 */

export interface TunePatch {
  readonly surface?: CandidateSurface;
  readonly exchange?: CandidateExchange;
  /** A preset replaces every number, as it does in the Playground's own tuning. */
  readonly base?: CandidateFeel;
  readonly settings?: LabPhysicsSettings;
  /** Puts the numbers back to the base preset's. */
  readonly resetToBase?: boolean;
}

export type TuneOutcome = "updated" | "forked" | "no-b" | "reference-is-custom";

function stateOf(behavior: CandidateBehavior): CustomCandidateState {
  return {
    surface: behavior.surface,
    exchange: behavior.exchange ?? "shuffle",
    base: behavior.feel,
    settings: behavior.settings,
  };
}

function apply(custom: CustomCandidate, patch: TunePatch) {
  if (patch.surface !== undefined || patch.exchange !== undefined) {
    custom.patch({
      ...(patch.surface === undefined ? {} : { surface: patch.surface }),
      ...(patch.exchange === undefined ? {} : { exchange: patch.exchange }),
    });
  }
  if (patch.base !== undefined) custom.applyPreset(patch.base);
  if (patch.settings !== undefined) custom.setSettings(patch.settings);
  if (patch.resetToBase) custom.resetToBase();
}

/** Applies an edit to B, copying a reference first when B is one. */
export function tuneCandidateB(
  model: StudioModel<CandidateId>,
  custom: CustomCandidate,
  behaviorOf: (id: CandidateId) => CandidateBehavior,
  patch: TunePatch,
): TuneOutcome {
  const b = model.candidateId.value;
  if (b === undefined) return "no-b";
  if (b === CUSTOM_ID) {
    apply(custom, patch);
    return "updated";
  }
  if (model.referenceId.value === CUSTOM_ID) return "reference-is-custom";
  custom.seedFrom(stateOf(behaviorOf(b)));
  apply(custom, patch);
  // Custom is not in the shortlist yet, or it would be A or B already. A full shortlist gives B's
  // slot to the copy, which is the one place it can go without losing the comparison.
  model.adoptCandidate(CUSTOM_ID);
  return "forked";
}
