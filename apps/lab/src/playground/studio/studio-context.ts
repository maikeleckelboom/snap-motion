import { inject, type InjectionKey } from "vue";

import type { CandidateBehavior, CandidateId } from "./candidates";
import type { StudioModel, StudioView } from "./studio-model";

/**
 * What the Studio's regions read and ask for. The workspace owns the model and these commands; a
 * region never changes the model directly, because a command also owns what must accompany the
 * change: its announcement, its focus, and the View Transition that presents it.
 */
export interface StudioCommands {
  toggleShortlist(id: CandidateId): void;
  /** Removing from the shortlist moves focus to a control that survives. */
  removeFromShortlist(id: CandidateId): void;
  pinReference(id: CandidateId): void;
  setCandidate(id: CandidateId): void;
  swapRoles(): void;
  decide(id: CandidateId): void;
  clearDecision(): void;
  /** Opens a candidate's detail, presented as a transition from `source` when one is given. */
  openDetail(id: CandidateId, source?: HTMLElement): void;
  closeDetail(): void;
  setView(view: StudioView): void;
  openImplementation(id: CandidateId, opener: HTMLElement | undefined): void;
  /** Moves to the shortlist's first control, or to the candidates when there is none. */
  goToCandidates(): void;
}

export interface StudioContext {
  readonly model: StudioModel<CandidateId>;
  readonly commands: StudioCommands;
  /** A candidate with its numbers resolved for the page's current tuning. */
  behavior(id: CandidateId): CandidateBehavior;
  /** Announces a committed change on the workspace's one polite live region. */
  announce(message: string): void;
}

export const studioKey: InjectionKey<StudioContext> = Symbol("motion-studio");

export function useStudio(): StudioContext {
  const studio = inject(studioKey);
  if (!studio) throw new Error("Motion Studio regions must render inside the Studio workspace.");
  return studio;
}
