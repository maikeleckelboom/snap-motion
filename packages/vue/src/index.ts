/**
 * Accessible, interruptible Vue carousel, dialog, and multi-edge sheet primitives.
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
export { Coverflow, useCoverflowMotion } from "./coverflow";
export type {
  CoverflowCardPresentation,
  CoverflowCardState,
  CoverflowHandle,
  CoverflowTuning,
  SurfaceMotionDiagnostics,
  UseCoverflowMotionOptions,
  UseCoverflowMotionReturn,
} from "./coverflow";
export { StackedDeck, useStackedDeckMotion } from "./stacked-deck";
export type {
  StackedDeckCardState,
  StackedDeckHandle,
  StackedDeckPileLayer,
  StackedDeckPose,
  StackedDeckRole,
  UseStackedDeckMotionOptions,
  UseStackedDeckMotionReturn,
} from "./stacked-deck";
export {
  Sheet,
  SheetSnapPicker,
  createDefaultSheetSnapPoints,
  createFixedSheetSnapPoints,
  createViewportSheetSnapPoints,
  defaultSheetOpenSnapId,
  getSheetSideDescriptor,
  resolveSheetGeometry,
  resolveSheetSnapPoints,
  sheetMaximumVisibleExtent,
  sheetSideDescriptors,
  sheetSides,
  sheetSnapVisibleExtent,
  sheetTransform,
  toCanonicalSheetDelta,
  toPhysicalSheetPosition,
  useSheetMotion,
} from "./sheet";
export type {
  ResolvedSheetSnapPoint,
  SheetAxis,
  SheetEdge,
  SheetFixedSnapId,
  SheetGeometry,
  SheetGeometryInput,
  SheetMeasureContext,
  SheetNavigationReason,
  SheetOpenSnapId,
  SheetSafeAreaInsets,
  SheetSide,
  SheetSideDescriptor,
  SheetSnapPoint,
  SheetSnapResolver,
  SheetState,
  SheetViewportDimensions,
  SheetViewportPolicy,
  SheetViewportSnapId,
  UseSheetMotionOptions,
  UseSheetMotionReturn,
} from "./sheet";
export { ModalDialog } from "./dialog";
export type { CloseReason, FocusReturnOptions, InitialFocus } from "./dialog";
export { createEnglishSnapMotionMessages } from "./localization";
export type { SnapMotionMessages } from "./localization";
export { createMotionDriver, useBoundedSpringDriver, useSnapMotion } from "./motion";
export type { NavigationReason, PointerIntent, UseSnapMotionOptions } from "./motion";
