# Carousel geometry strategies

`CarouselRoot` defaults to one fixed viewport stage per ID. A public strategy receives read-only
semantic IDs, the viewport and optional track, plus registered slide elements, and returns a core
`ControllerMeasurement`.

```ts
const strategy = createVariableWidthCenteredCarouselGeometryStrategy();
```

```vue
<CarouselRoot :geometry-strategy="strategy" ...>
  <CarouselViewport>
    <CarouselTrack :start-inset="leadingInset" :end-inset="trailingInset">...</CarouselTrack>
  </CarouselViewport>
</CarouselRoot>
```

For a centered unequal-width rail, the track needs enough physical content before the first item
and after the last item to put their centers on the viewport center. Without those insets, early or
late raw anchors clamp to the same boundary. That is why a first “Next” can appear too short: the
click selected the correct ID, but both centers had collapsed into boundary-clamped positions.

Use `startInset` and `endInset`, not item margins, because logical track padding contributes to
`scrollWidth` and therefore to legal bounds. The lab computes half-viewport minus half-item-width
for each edge and verifies every item center after navigation.

Custom strategies must measure slide layout boxes only, remain SSR-safe by waiting for mount, and
never let transformed media descendants alter geometry. Remeasurement preserves the semantic target.
