import type { NavigationReason } from "../motion/motion-contracts";

export type SheetAxis = "x" | "y";
export type SheetEdge = "top" | "right" | "bottom" | "left";
export type SheetSide = SheetEdge;
export type SheetState = "closed" | "closing" | "dragging" | "open" | "opening" | "settling";
export type SheetNavigationReason = NavigationReason | "side-change";
