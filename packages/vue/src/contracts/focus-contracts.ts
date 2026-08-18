/** Focus destination used when a native dialog opens. */
export type InitialFocus =
  | "close"
  | "title"
  | "first-interactive"
  | HTMLElement
  | (() => HTMLElement | undefined);

/** Explicit focus-return targets for a dialog that closes or changes presentation. */
export interface FocusReturnOptions {
  fallback?: HTMLElement | (() => HTMLElement | undefined) | undefined;
  opener?: HTMLElement | undefined;
}
