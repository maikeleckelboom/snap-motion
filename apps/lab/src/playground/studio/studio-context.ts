import { inject, type InjectionKey } from "vue";

import type { CandidateBehavior, CandidateId } from "./candidates";
import type { MediaOpenRequest } from "./media/media-surface";
import type { SharedMediaItem } from "./media/shared-media";
import type { CustomCandidate } from "./studio-custom";
import type { ShortlistExchange, StudioModel, StudioView } from "./studio-model";
import type { TunePatch } from "./studio-tune";

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
  /**
   * Edits B. A reference candidate is never changed: the first edit copies it into Custom and puts the
   * copy in B's place. See `studio-tune.ts`.
   */
  tuneB(patch: TunePatch): void;
  /** One explicit, one-way copy of the Playground's Motion Tuning into B. Nothing writes back. */
  copyTuningToB(): void;
  /** How the Shortlist's own Deck turns its cards. It never changes what A or B runs. */
  setShortlistExchange(exchange: ShortlistExchange): void;
  /** Opens a photo in the viewer, presented from its thumbnail when it is at rest. */
  openMedia(
    request: MediaOpenRequest & { readonly role: "reference" | "candidate" | "detail" },
  ): void;
  closeMedia(): void;
  /** Moves to the shortlist's first control, or to the candidates when there is none. */
  goToCandidates(): void;
}

/**
 * A one-shot note from a command to the comparison that follows it. Editing B copies a reference into
 * Custom, which replaces B's stage; the copy is the same B continuing, so its stage should begin on the
 * photo B was on, not on A's as a stage mounted by a role change does. The command sets `forked`, the
 * comparison reads it once and clears it.
 */
export interface StudioContinuity {
  forked: boolean;
}

export interface StudioContext {
  readonly model: StudioModel<CandidateId>;
  readonly continuity: StudioContinuity;
  /** The one owner of the Custom candidate's configuration. */
  readonly custom: CustomCandidate;
  /** The photos every stage browses, in order. */
  readonly media: readonly SharedMediaItem[];
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
