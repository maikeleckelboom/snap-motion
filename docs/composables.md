# Composables

Import carousel composables from `@snap-motion/vue/carousel`, spatial-surface composables from
`@snap-motion/vue/coverflow` and `@snap-motion/vue/stacked-deck`, sheet composables from
`@snap-motion/vue/sheet`, and the lower-level scalar adapter from `@snap-motion/vue/motion`.

`useStackedDeckMotion` and `useCoverflowMotion` are the surface layer beneath `StackedDeck` and
`Coverflow`: the same behaviour with your own markup. See
[Spatial surfaces](./spatial-surfaces.md).
The root entrypoint also re-exports these stable composables.

## `useCarouselMotion`

This is the DOM-aware headless carousel layer. Supply semantic anchors and bounds, viewport and
track refs, and a measurement callback. It exposes direct pointer, wheel, keyboard, transform, and
remeasurement bindings while keeping Motion behind the animation-driver boundary.

```ts
const motion = useCarouselMotion({
  anchors: initial.anchors,
  bounds: initial.bounds,
  direction: ref<"auto" | "ltr" | "rtl">("auto"),
  initialTargetId: ids[0],
  measure: () =>
    createFixedStageGeometry({ itemIds: ids, viewportSize: viewport.value?.clientWidth ?? 0 }),
  track,
  viewport,
});
```

Bind `motion.trackStyle.value` to the track, `motion.surfaceStyle` to the viewport, and the input
handlers to the interaction surface. Use `onTargetSelected` for controlled semantic state.

## `useSnapMotion`

The lower-level Vue adapter wraps `SnapController`. It is useful for a new semantic snap surface,
not for bypassing the component event contract. A custom animation driver implements the public
scalar `AnimationDriver` interface; Motion-specific playback types are not public.

## `useSheetMotion`

This composable accepts a physical `side`, generic string snap IDs, and `SheetSnapPoint`
visible-extent resolvers. Its adapter converts primary-axis pointer delta and velocity into one
canonical scalar where positive always closes. The public return type never exposes the internal
hidden closing anchor. `setSide()` interrupts, remeasures, and atomically remaps a valid semantic
snap ID onto the new axis.

## `useCarouselContext`

Call inside a `CarouselRoot` descendant. The returned facade is read-only and includes active ID,
IDs, count, direction, boundary state, and navigation actions. Injection keys and mutable element
registries are internal.

## `useCarouselWindow`

This semantic helper computes mount and preload sets. It never fetches or decodes media. See
[render windows](render-window.md).
