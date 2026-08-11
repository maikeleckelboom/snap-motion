/** Framework-neutral provenance for an accepted semantic navigation. */
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

/** Provenance emitted when a surface accepts a component-originated semantic destination. */
export interface ActiveIdChangeDetails {
  readonly reason: Exclude<NavigationReason, "external">;
}

/** Provenance emitted when mechanics reach rest on a semantic destination. */
export interface SettlementDetails {
  readonly reason: NavigationReason;
}
