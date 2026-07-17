# Composables

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

## `useBottomSheetMotion`

This composable accepts generic string snap IDs and `BottomSheetSnapPoint` resolvers. Its public
return type never exposes the internal hidden closing anchor.

## `useCarouselContext`

Call inside a `CarouselRoot` descendant. The returned facade is read-only and includes active ID,
IDs, count, direction, boundary state, and navigation actions. Injection keys and mutable element
registries are internal.

## `useCarouselWindow`

This semantic helper computes mount and preload sets. It never fetches or decodes media. See
[render windows](render-window.md).
