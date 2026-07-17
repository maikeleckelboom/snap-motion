export type CloseReason = "close-button" | "escape" | "scrim" | "route" | "programmatic";

export type NavigationReason =
  | "previous"
  | "next"
  | "keyboard"
  | "drag"
  | "wheel"
  | "picker"
  | "route";

/** Controls where automatic Arrow-key carousel navigation is active. */
export type CarouselKeyboardScope = "auto" | "carousel" | "dialog" | "off";

/** Logical inline direction for transform-driven carousel interaction. */
export type SnapMotionDirection = "auto" | "ltr" | "rtl";
