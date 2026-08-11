/**
 * High-level Vue surfaces and the common contracts used to compose them.
 *
 * Capability-specific composables, geometry, and advanced helpers live on explicit subpaths.
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
} from "./carousel";
export type {
  CarouselGeometryStrategy,
  CarouselGeometryMeasureContext,
  CarouselKeyboardScope,
  SnapMotionDirection,
} from "./carousel";
export { Coverflow } from "./coverflow";
export type { CoverflowCardPresentation, CoverflowCardState, CoverflowHandle } from "./coverflow";
export { StackedDeck } from "./stacked-deck";
export type {
  StackedDeckCardState,
  StackedDeckHandle,
  StackedDeckPileLayerSlotState,
} from "./stacked-deck";
export { Sheet, SheetSnapPicker } from "./sheet";
export type {
  SheetAxis,
  SheetEdge,
  SheetDiagnostics,
  SheetFixedSnapId,
  SheetGeometry,
  SheetMeasureContext,
  SheetOpenSnapId,
  SheetSafeAreaInsets,
  SheetSide,
  SheetSnapPoint,
  SheetState,
  SheetViewportDimensions,
  SheetViewportPolicy,
  SheetViewportSnapId,
} from "./sheet";
export { ModalDialog } from "./dialog";
export type { CloseReason, FocusReturnOptions, InitialFocus, OpenChangeDetails } from "./dialog";
export { createEnglishSnapMotionMessages } from "./localization";
export type { SnapMotionMessages } from "./localization";
export type {
  ActiveIdChangeDetails,
  NavigationReason,
  PointerIntent,
  SettlementDetails,
  SurfaceMotionDiagnostics,
} from "./motion";
