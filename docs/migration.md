# Migration to the beta contract

- Replace `@snap-motion/vue/components` and `@snap-motion/vue/composables` with the root or the
  capability subpaths `carousel`, `sheet`, `dialog`, `motion`, and `localization`.
- Import custom native-dialog focus policy from `@snap-motion/vue/dialog`; DOM inspection, input
  ownership, wheel normalization, reduced-motion wrappers, and default policy constants are no
  longer public implementation API.

- Import structural CSS once from `@snap-motion/vue/style.css`.
- Replace numeric indices with stable string IDs.
- Replace `requestActiveId` and `targetChanged` with
  `activeIdChange(id, { reason })`; keep `update:activeId` as Vue `v-model` plumbing and treat
  `settled(id, { reason })` as physical completion.
- Replace `requestId()` / `navigate()` with `navigateTo()`, and replace `synchronizeId()` with
  `synchronizeTo()`.
- Replace `currentId` with `visualId` where the value is the physically dominant item. Semantic
  application state is consistently `activeId`.
- Replace `labelledby` with `labelledBy` and the high-level spatial `stageWidth` fallback prop with
  `fallbackStageWidth`.
- Replace overlay `requestClose` events with `openChange(false, { reason })`; `scrim` is the shared
  reason for clicking the non-content modal layer.
- Replace Media Gallery's `initialIndex`, `indexChanged`, and index-based close state with stable
  `activeId`, `activeIdChange`, `settled`, and ID-bearing `openChange` details.
- Use `keyboardScope="auto"` for the default modal behavior; remove dialog-level duplicate listeners.
- Use `direction="auto" | "ltr" | "rtl"` instead of local key-only inversion.
- Replace hard-coded accessibility strings with an instance `messages` object.
- Replace `BottomSheet`, `BottomSheetSnapPicker`, `useBottomSheetMotion`, and the
  `@snap-motion/vue/bottom-sheet` entrypoint with `Sheet`, `SheetSnapPicker`, `useSheetMotion`, and
  `@snap-motion/vue/sheet`. There is no compatibility alias because the package is unpublished.
- Replace physical panel-top resolvers with generic `SheetSnapPoint` IDs and
  `resolveVisibleExtent`. Use `createViewportSheetSnapPoints()` for top/bottom defaults or
  `createFixedSheetSnapPoints()` for the left/right `open` default.
- Use `geometryStrategy` for non-fixed stages and logical track insets for centerable rail edges.
- Use pagination primitives and `useCarouselWindow`; do not reach into injection keys or element maps.

There is no autoplay, cloned infinite loop, built-in zoom/pan, vertical carousel, or non-Vue adapter
in this release candidate.
