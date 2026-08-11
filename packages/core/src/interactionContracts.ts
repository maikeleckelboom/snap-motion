/** Framework-neutral provenance for semantic navigation and mechanical settlement. */
export type NavigationReason =
  | "previous"
  | "next"
  | "keyboard"
  | "drag"
  | "wheel"
  | "picker"
  | "programmatic"
  | "reconcile"
  | "external";

/** Provenance emitted when a component asks its owner to accept a semantic destination. */
export interface ActiveIdRequestDetails {
  readonly reason: Exclude<NavigationReason, "external">;
}

/** Provenance emitted when mechanics reach rest on a semantic destination. */
export interface SettlementDetails {
  readonly reason: NavigationReason;
}
