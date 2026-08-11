# Package architecture inventory

This inventory records the packaging boundary established before adding another interaction
surface. It describes public ownership, private infrastructure, and the declaration pipeline; it
does not change runtime interaction contracts.

## Audited baseline

The original package exported `@snap-motion/core`, `@snap-motion/vue`,
`@snap-motion/vue/components`, `@snap-motion/vue/composables`, and the Vue stylesheet. The Vue root
combined production features with focus traversal, DOM ownership inspection, pointer intent, wheel
normalization, and reduced-motion implementation helpers. Feature contracts and contexts shared one
flat `components` directory.

The packed core artifact contained 11 declaration modules and 11 declaration maps. The packed Vue
artifact contained 51 declaration files, including duplicate `.vue.d.ts` and `.d.vue.ts` forms, plus
37 declaration maps. Their relative `.js` specifiers were valid, but the complete private per-file
graph shipped. The audit found no circular dependency; the inappropriate direction was API leakage
and mixed ownership rather than a source cycle.

## Public API inventory

### `@snap-motion/core`

- Driver: `AnimationDriver`, `AnimationPlaybackControls`, `ScalarAnimationRequest`.
- Bounds: `clampToBounds`, `createBounds`, `getTrackBounds`, `isWithinBounds`, `normalizeBounds`,
  `ScalarBounds`.
- Geometry: `calculateFixedCellSize`, `createFixedStageGeometry`, `createPagedGridGeometry`,
  `createVariableWidthGeometry`, `createCoverflowGeometry`, `resolveCoverflowProgress`,
  `resolveCoverflowPresentation`,
  `createStackedDeckFrame`, `createStackedDeckTraversal`, `resolveStackedDeckFrame`,
  `resolveStackedDeckPile`, `resolveStackedDeckTraversal`, `resolveStackedDeckTuning`,
  `CarouselGeometry`,
  `CoverflowGeometry`, `CoverflowGeometryOptions`,
  `CoverflowPresentation`, `CoverflowPresentationOptions`, `CoverflowProgressOptions`,
  `MutableStackedDeckFrame`, `MutableStackedDeckPose`, `MutableStackedDeckTraversal`,
  `ResolveStackedDeckFrameOptions`, `ResolveStackedDeckTraversalOptions`,
  `ResolveStackedDeckTuningOptions`,
  `StackedDeckFrame`, `StackedDeckPilePose`, `StackedDeckPose`, `StackedDeckProfile`,
  `StackedDeckRole`, `StackedDeckTraversal`, `StackedDeckTraversalPhase`, `StackedDeckTuning`,
  `FixedStageGeometry`, `MeasuredItemBox`, `PagedGridGeometry`, `PagedGridGeometryOptions`,
  `PagedGridPageContext`, `VariableWidthGeometryOptions`.
- Shared interaction contract: `NavigationReason`, `ActiveIdRequestDetails`, `SettlementDetails`.
- Controller: `SnapController`, `SnapControllerOptions`, `ControllerListener`,
  `ControllerConfiguration`, `ControllerConfigurationUpdate`, `ControllerMeasurement`,
  `ControllerDragOptions`, `ControllerMoveByOptions`, `ControllerMoveOptions`, `ControllerPhase`,
  `ControllerSnapshot`.
- Physics and targets: `applyElasticity`, `createSymmetricElasticity`,
  `nonlinearElasticDistance`, `projectPosition`, `clampAnchorsToBounds`, `directionalAnchor`,
  `findAnchorById`, `nearestAnchor`, `resolveProgrammaticTarget`, `resolveReleaseTarget`,
  `sortAnchors`, `NearestAnchorOptions`, `ProgrammaticTargetInput`, `ReleaseTargetInput`,
  `ElasticBoundaryOptions`, `ElasticityOptions`, `ReleaseTargetPolicy`, `SnapAnchor`,
  `SnapDirection`, `SpringConfiguration`, `SemanticId`.
- Surface models and shared policy: `StackedDeckModel`, `CoverflowModel`,
  `isStackedDeckAuthorityStable`, `isStackedDeckInspectEligible`, `isSettledOnAnchor`,
  `STACKED_DECK_ANCHOR_SKIP`, `SettledSelection`, `resolveAdjacentIndex`,
  `resolveCommandOriginIndex`, `resolveHystereticIndex`, `resolvePaginationIndicator`,
  `createPaginationIndicatorState`, `PAGINATION_INDICATOR_TUNING`, `advanceBoundedSpring`,
  `resolveAutonomousReleaseVelocity`, `resolveSpeedInCards`, `BOUNDED_SPRING_TUNING`,
  `resolveCoverflowKinetics`, `createCoverflowKineticState`, `COVERFLOW_KINETIC_TUNING`,
  `resolveCoverflowTuning`, `resolveDirectManipulationGesture`, `resolveSnapKeyboardAction`,
  `DIRECT_MANIPULATION_TUNING`, and their option and state types.
- Presets and velocity: `balancedPreset`, `DEFAULT_MOTION_PRESET`, `heavyPreset`, `loosePreset`,
  `MOTION_PRESETS`, `tightPreset`, `MotionPreset`, `MotionPresetName`, `VelocityTracker`,
  `VelocitySample`, `VelocityTrackerOptions`.

Numeric assertion and policy-validation functions remain implementation exports inside concrete core
modules but are no longer package exports.

### `@snap-motion/vue/carousel`

- Components: `CarouselActivePosition`, `CarouselNext`, `CarouselPagination`,
  `CarouselPaginationItem`, `CarouselPrevious`, `CarouselProgress`, `CarouselRoot`,
  `CarouselSlide`, `CarouselStatus`, `CarouselTrack`, `CarouselViewport`.
- Composables and geometry: `useCarouselContext`, `useCarouselMotion`, `useCarouselWindow`,
  `createFixedStageCarouselGeometryStrategy`, `createVariableWidthCenteredCarouselGeometryStrategy`.
- Types: `CarouselGeometryMeasureContext`, `CarouselGeometryStrategy`, `CarouselKeyboardScope`,
  `CarouselWindowOptions`, `CarouselWindowState`, `FixedStageCarouselGeometryOptions`,
  `CarouselMotion`, `PublicCarouselContext`, `SnapMotionDirection`, `UseCarouselMotionOptions`,
  `VariableWidthCenteredCarouselGeometryOptions`.

### `@snap-motion/vue/coverflow`

- Component and composable: `Coverflow`, `useCoverflowMotion`.
- Types: `CoverflowCardPresentation`, `CoverflowCardState`, `CoverflowHandle`, `CoverflowTuning`,
  `UseCoverflowMotionOptions`, `UseCoverflowMotionReturn`.

### `@snap-motion/vue/stacked-deck`

- Component and composable: `StackedDeck`, `useStackedDeckMotion`.
- Types: `StackedDeckCardState`, `StackedDeckHandle`, `StackedDeckPileLayer`,
  `StackedDeckPileLayerSlotState`, `StackedDeckPose`, `StackedDeckRole`,
  `UseStackedDeckMotionOptions`, `UseStackedDeckMotionReturn`.

### `@snap-motion/vue/sheet`

- Components and composable: `Sheet`, `SheetSnapPicker`, `useSheetMotion`.
- Policy: `sheetSnapVisibleExtent`, `createViewportSheetSnapPoints`,
  `createFixedSheetSnapPoints`, `createDefaultSheetSnapPoints`, `defaultSheetOpenSnapId`,
  `resolveSheetSnapPoints`, and `sheetMaximumVisibleExtent`.
- Side normalization: `sheetSides`, `sheetSideDescriptors`, `getSheetSideDescriptor`,
  `toCanonicalSheetDelta`, `toPhysicalSheetPosition`, and `sheetTransform`.
- Types: `SheetAxis`, `SheetEdge`, `SheetSide`, `SheetSideDescriptor`, `SheetMeasureContext`,
  `SheetOpenSnapId`, `SheetFixedSnapId`, `SheetViewportSnapId`, `SheetSnapResolver`,
  `SheetSnapPoint`, `SheetState`, `SheetViewportPolicy`, `SheetGeometry`, `SheetGeometryInput`,
  `SheetDiagnostics`, `ResolvedSheetSnapPoint`, `UseSheetMotionOptions`, and
  `UseSheetMotionReturn`.

### `@snap-motion/vue/dialog`

- Component and contracts: `ModalDialog`, `CloseReason`, `OpenRequestDetails`,
  `FocusReturnOptions`, `InitialFocus`.

Native-dialog focus traversal, opener capture, and restoration are implementation details. The
component exposes its dialog ref, title ID, and `requestClose`; it does not publish private focus
helpers.

### `@snap-motion/vue/media-gallery`

- Component: `MediaGalleryDialog` with stable-ID `activeId` and `open` contracts.
- Contracts: `MediaGalleryItem`, `MediaGalleryDialogProps`, `MediaGalleryHandle`,
  `MediaGalleryOpenRequestDetails`, `MediaGalleryMessages`, and shared dialog types. The component
  carries the exact inferred item ID union through every ID-bearing public surface.
- Advanced media math: fit/zoom/pan/swipe, transform, slot, loading-visibility, and tuning contracts.

### `@snap-motion/vue/motion`

- Runtime: `createMotionDriver`, `useBoundedSpringDriver`, `useSnapMotion`.
- Types: `NavigationReason`, `ActiveIdRequestDetails`, `SettlementDetails`, `PointerIntent`,
  `SurfaceMotionDiagnostics`, `UseSnapMotionOptions`. Low-level diagnostics call the nearest
  mechanical anchor `nearestId`; `activeId` is reserved for semantic high-level state.

### `@snap-motion/vue/localization`

- `createEnglishSnapMotionMessages`, `SnapMotionMessages`.

### `@snap-motion/vue`

The root is deliberately smaller than the union of subpaths. It re-exports high-level components,
ordinary carousel composition primitives, common localization/interaction contracts, and the
transitive public prop/handle types needed to consume those components. Capability-specific
composables, tuning, geometry implementation, Media Gallery, and dialog focus implementation remain
off the root.

## Removed or relocated API

- Removed entrypoints: `@snap-motion/vue/components`, `@snap-motion/vue/composables`.
- Removed Vue implementation helpers: `carouselKeyAction`, `elementOwnsCarouselKeyboard`,
  `elementOwnsSnapMotionDrag`, `elementOwnsSnapMotionWheel`, `horizontalWheelDelta`,
  `normalizeWheelDelta`, `resolvePointerIntent`, `NormalizedWheelDelta`, `PointerIntentOptions`,
  `firstInteractive`, `focusInside`, `interactiveElements`, `resolveInitialFocus`,
  `useReducedMotionPreference`, `ReducedMotionOptions`, and former feature-specific default release
  and viewport policy constants.
- Removed dialog implementation exports: `captureFocusOpener`, `focusInitial`,
  `maintainModalTabOrder`, `restoreFocus`.
- Removed core implementation helpers: `assertFiniteNumber`, `assertNonNegative`,
  `validateElasticityOptions`, `validateReleaseTargetPolicy`.
- Removed the pre-publication deprecated core aliases `resolveCoverflowModularProgress` and
  `CoverflowModularProgressOptions`; `resolveCoverflowProgress` is the one supported primitive.

These packages are private and unpublished, so correcting accidental beta API does not require a
compatibility facade.

## Dependency direction

Feature components depend on their own concrete modules and precise internal capabilities.
Carousel and sheet may depend on motion; all rendered features may depend on localization; sheet
may depend on the dialog close contract. Public declarations preserve those owner subpaths instead
of re-exporting shared types from every feature. API rollups are generated in dependency order, and
only exact Vue-emitter helper names from generated `.d.vue.ts` files have a forgotten-export
allowlist; any source-owned forgotten export fails. Internal capabilities cannot depend on a
feature. Core cannot import Vue, DOM, or another runtime package. Apps and fixtures import package
entrypoints. A deterministic architecture check enforces these rules and rejects source cycles.

## Declaration output

Core ships one declaration rollup. Vue ships nine: root, carousel, coverflow, stacked deck, sheet,
dialog, media gallery, motion, and localization. None contains a relative module specifier. `vue-tsc` still needs a temporary
normalization step for Vue SFC declarations and minimum-Vue generic compatibility, but those files
exist only under `temp/declarations` and never enter a tarball.
