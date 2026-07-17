/**
 * Accessible, interruptible Vue carousel and bottom-sheet primitives.
 *
 * @packageDocumentation
 */

export * from "./components.js";
export * from "./composables.js";

export {
  bottomSheetSnapPosition,
  createViewportBottomSheetSnapPoints,
  defaultBottomSheetReleasePolicy,
  defaultBottomSheetViewportPolicy,
  resolveBottomSheetSnapPoints,
} from "./bottom-sheet-policy.js";
export type {
  BottomSheetMeasureContext,
  BottomSheetOpenSnapId,
  BottomSheetReleasePolicy,
  BottomSheetSnapResolver,
  BottomSheetSnapPoint,
  BottomSheetViewportPolicy,
  ResolvedBottomSheetSnapPoint,
} from "./bottom-sheet-policy.js";
export {
  createFixedStageCarouselGeometryStrategy,
  createVariableWidthCenteredCarouselGeometryStrategy,
} from "./carousel-geometry.js";
export type {
  CarouselGeometryMeasureContext,
  CarouselGeometryStrategy,
  FixedStageCarouselGeometryOptions,
  VariableWidthCenteredCarouselGeometryOptions,
} from "./carousel-geometry.js";
export type {
  CarouselKeyboardScope,
  CloseReason,
  NavigationReason,
  SnapMotionDirection,
} from "./components/contracts.js";
export {
  carouselKeyAction,
  elementOwnsCarouselKeyboard,
  elementOwnsSnapMotionDrag,
  elementOwnsSnapMotionWheel,
  horizontalWheelDelta,
  normalizeWheelDelta,
  resolvePointerIntent,
} from "./input-policy.js";
export type { NormalizedWheelDelta, PointerIntent, PointerIntentOptions } from "./input-policy.js";
export {
  captureFocusOpener,
  firstInteractive,
  focusInitial,
  focusInside,
  interactiveElements,
  maintainModalTabOrder,
  resolveInitialFocus,
  restoreFocus,
} from "./focus.js";
export type { FocusReturnOptions, InitialFocus } from "./focus.js";
export { createEnglishSnapMotionMessages } from "./messages.js";
export type { SnapMotionMessages } from "./messages.js";
export { createMotionDriver } from "./motion-driver.js";
export { useReducedMotionPreference } from "./reduced-motion.js";
export type { ReducedMotionOptions } from "./reduced-motion.js";
