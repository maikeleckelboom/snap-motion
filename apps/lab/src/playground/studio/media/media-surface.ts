/**
 * What a stage needs from whichever surface it is browsing with. Both the item carousel and the
 * stacked deck implement it, so a stage, a comparison and a replay drive them identically and the
 * only difference between two stages is the behaviour being compared.
 */
export interface MediaSurfaceHandle {
  /** The surface's own semantic selection: the photo it is going to, or is on. */
  readonly activeId: string | undefined;
  /** The photo drawn at the centre or in front right now, which trails the selection in motion. */
  readonly visualId: string | undefined;
  /** The last photo the surface announced as settled. */
  readonly settledId: string | undefined;
  readonly phase: string;
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  /** The focusable element a modal hands focus back to. */
  readonly root: HTMLElement | undefined;
  next(): void;
  previous(): void;
  /** Moves to a photo the way any request does: with the surface's own spring. */
  goTo(id: string): void;
  /** Opens the selected photo, as Enter does. */
  openSelected(): void;
}

/** A visitor asked to open a photo: a tap on it, or Enter on the surface. */
export interface MediaOpenRequest {
  readonly id: string;
  /** The picture to name for a View Transition, when the surface can say which one it is. */
  readonly source: HTMLElement | undefined;
  /** The focusable surface focus returns to when the viewer closes. */
  readonly opener: HTMLElement | undefined;
  /**
   * The photo was already the selected one and the surface was at rest. Only then can a snapshot of
   * its picture be taken without replacing motion that is still happening.
   */
  readonly atRest: boolean;
}
