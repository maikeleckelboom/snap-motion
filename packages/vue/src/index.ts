/**
 * Accessible, interruptible Vue carousel, dialog, and bottom-sheet primitives.
 *
 * @packageDocumentation
 */

export {
  CarouselActivePosition,
  CarouselNext,
  CarouselPagination,
  CarouselPaginationItem,
  CarouselPrevious,
  CarouselProgress,
  CarouselRoot,
  CarouselSlide,
  CarouselStatus,
  CarouselTrack,
  CarouselViewport,
  createFixedStageCarouselGeometryStrategy,
  createVariableWidthCenteredCarouselGeometryStrategy,
  useCarouselContext,
  useCarouselMotion,
  useCarouselWindow,
} from "./carousel";
export type {
  CarouselGeometryMeasureContext,
  CarouselGeometryStrategy,
  CarouselKeyboardScope,
  CarouselWindowOptions,
  CarouselWindowState,
  FixedStageCarouselGeometryOptions,
  PublicCarouselContext,
  SnapMotionDirection,
  UseCarouselMotionOptions,
  VariableWidthCenteredCarouselGeometryOptions,
} from "./carousel";
export {
  BottomSheet,
  BottomSheetSnapPicker,
  bottomSheetSnapPosition,
  createViewportBottomSheetSnapPoints,
  resolveBottomSheetSnapPoints,
  useBottomSheetMotion,
} from "./bottom-sheet";
export type {
  BottomSheetMeasureContext,
  BottomSheetOpenSnapId,
  BottomSheetSnapResolver,
  BottomSheetSnapPoint,
  BottomSheetState,
  BottomSheetViewportPolicy,
  ResolvedBottomSheetSnapPoint,
  UseBottomSheetMotionOptions,
  UseBottomSheetMotionReturn,
} from "./bottom-sheet";
export { ModalDialog } from "./dialog";
export type { CloseReason, FocusReturnOptions, InitialFocus } from "./dialog";
export { createEnglishSnapMotionMessages } from "./localization";
export type { SnapMotionMessages } from "./localization";
export { createMotionDriver, useSnapMotion } from "./motion";
export type { NavigationReason, PointerIntent, UseSnapMotionOptions } from "./motion";
