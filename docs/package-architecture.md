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
  `createVariableWidthGeometry`, `CarouselGeometry`, `FixedStageGeometry`, `MeasuredItemBox`,
  `PagedGridGeometry`, `PagedGridGeometryOptions`, `PagedGridPageContext`,
  `VariableWidthGeometryOptions`.
- Controller: `SnapController`, `SnapControllerOptions`, `ControllerListener`,
  `ControllerConfiguration`, `ControllerConfigurationUpdate`, `ControllerMeasurement`,
  `ControllerMoveByOptions`, `ControllerMoveOptions`, `ControllerPhase`, `ControllerSnapshot`.
- Physics and targets: `applyElasticity`, `createSymmetricElasticity`,
  `nonlinearElasticDistance`, `projectPosition`, `clampAnchorsToBounds`, `directionalAnchor`,
  `findAnchorById`, `nearestAnchor`, `resolveProgrammaticTarget`, `resolveReleaseTarget`,
  `sortAnchors`, `NearestAnchorOptions`, `ProgrammaticTargetInput`, `ReleaseTargetInput`,
  `ElasticBoundaryOptions`, `ElasticityOptions`, `ReleaseTargetPolicy`, `SnapAnchor`,
  `SnapDirection`, `SpringConfiguration`, `SemanticId`.
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
  `NavigationReason`, `PublicCarouselContext`, `SnapMotionDirection`, `UseCarouselMotionOptions`,
  `VariableWidthCenteredCarouselGeometryOptions`.

### `@snap-motion/vue/bottom-sheet`

- Components and composable: `BottomSheet`, `BottomSheetSnapPicker`, `useBottomSheetMotion`.
- Policy: `bottomSheetSnapPosition`, `createViewportBottomSheetSnapPoints`,
  `resolveBottomSheetSnapPoints`.
- Types: `BottomSheetMeasureContext`, `BottomSheetOpenSnapId`, `BottomSheetSnapResolver`,
  `BottomSheetSnapPoint`, `BottomSheetState`, `BottomSheetViewportPolicy`,
  `ResolvedBottomSheetSnapPoint`, `UseBottomSheetMotionOptions`, `UseBottomSheetMotionReturn`,
  `CloseReason`, `NavigationReason`.

### `@snap-motion/vue/dialog`

- Component and contracts: `ModalDialog`, `CloseReason`, `FocusReturnOptions`, `InitialFocus`.
- Headless native-dialog policy: `captureFocusOpener`, `focusInitial`, `maintainModalTabOrder`,
  `restoreFocus`.

The four functions are intentional support for custom native-dialog fixtures. DOM candidate
enumeration and focus-target resolution remain internal.

### `@snap-motion/vue/motion`

- Runtime: `createMotionDriver`, `useSnapMotion`.
- Types: `NavigationReason`, `PointerIntent`, `UseSnapMotionOptions`.

### `@snap-motion/vue/localization`

- `createEnglishSnapMotionMessages`, `SnapMotionMessages`.

### `@snap-motion/vue`

The root re-exports the stable component, policy, composable, geometry, localization, and motion API
listed above. The dialog focus functions are intentionally available only from the dialog subpath.

## Removed or relocated API

- Removed entrypoints: `@snap-motion/vue/components`, `@snap-motion/vue/composables`.
- Removed Vue implementation helpers: `carouselKeyAction`, `elementOwnsCarouselKeyboard`,
  `elementOwnsSnapMotionDrag`, `elementOwnsSnapMotionWheel`, `horizontalWheelDelta`,
  `normalizeWheelDelta`, `resolvePointerIntent`, `NormalizedWheelDelta`, `PointerIntentOptions`,
  `firstInteractive`, `focusInside`, `interactiveElements`, `resolveInitialFocus`,
  `useReducedMotionPreference`, `ReducedMotionOptions`, `defaultBottomSheetReleasePolicy`,
  `defaultBottomSheetViewportPolicy`, `BottomSheetReleasePolicy`.
- Relocated from the Vue root to `@snap-motion/vue/dialog`: `captureFocusOpener`, `focusInitial`,
  `maintainModalTabOrder`, `restoreFocus`.
- Removed core implementation helpers: `assertFiniteNumber`, `assertNonNegative`,
  `validateElasticityOptions`, `validateReleaseTargetPolicy`.

These packages are private and unpublished, so correcting accidental beta API does not require a
compatibility facade.

## Dependency direction

Feature components depend on their own concrete modules and precise internal capabilities.
Carousel and bottom sheet may depend on motion; all rendered features may depend on localization;
bottom sheet may depend on the dialog close contract. Internal capabilities cannot depend on a
feature. Core cannot import Vue, DOM, or another runtime package. Apps and fixtures import package
entrypoints. A deterministic architecture check enforces these rules and rejects source cycles.

## Declaration output

Core ships one declaration rollup. Vue ships six: root, carousel, bottom sheet, dialog, motion, and
localization. None contains a relative module specifier. `vue-tsc` still needs a temporary
normalization step for Vue SFC declarations and minimum-Vue generic compatibility, but those files
exist only under `temp/declarations` and never enter a tarball.
