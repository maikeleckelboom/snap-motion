/** User or imperative provenance for a requested overlay close. */
export type CloseReason = "close-button" | "escape" | "scrim" | "programmatic";

/** Metadata for an overlay visibility request made by the component. */
export interface OpenRequestDetails {
  readonly reason: CloseReason;
}
