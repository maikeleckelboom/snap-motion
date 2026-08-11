/** User or imperative provenance for a requested overlay close. */
export type CloseReason = "close-button" | "escape" | "scrim" | "programmatic";

/** Metadata for an overlay visibility change requested by the component. */
export interface OpenChangeDetails {
  readonly reason: CloseReason;
}
