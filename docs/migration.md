# Migration to the beta contract

- Import structural CSS once from `@snap-motion/vue/style.css`.
- Replace numeric indices with stable string IDs.
- Treat `requestActiveId` as the controlled-state request and `settled` as physical completion.
- Use `keyboardScope="auto"` for the default modal behavior; remove dialog-level duplicate listeners.
- Use `direction="auto" | "ltr" | "rtl"` instead of local key-only inversion.
- Replace hard-coded accessibility strings with an instance `messages` object.
- Replace fixed sheet unions with generic `BottomSheetSnapPoint` IDs, or call
  `createViewportBottomSheetSnapPoints()` for the legacy three-height preset.
- Use `geometryStrategy` for non-fixed stages and logical track insets for centerable rail edges.
- Use pagination primitives and `useCarouselWindow`; do not reach into injection keys or element maps.

There is no autoplay, cloned infinite loop, built-in zoom/pan, vertical carousel, or non-Vue adapter
in this release candidate.
