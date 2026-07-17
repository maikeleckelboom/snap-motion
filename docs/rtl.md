# Logical direction and RTL

Set `direction` on `CarouselRoot` or `useCarouselMotion` to `"ltr"`, `"rtl"`, or `"auto"`.
`auto` reads computed direction from the mounted interaction surface; explicit values are useful
for locale switches and deterministic fixtures.

```vue
<CarouselRoot v-model:active-id="activeId" :ids="ids" direction="rtl">...</CarouselRoot>
```

Semantic ID order does not change. Direction maps physical Arrow keys, drag deltas, release
velocity, wheel movement, and programmatic directional impulse onto previous/next. Geometry stays
in one transform coordinate system and does not depend on browser-specific RTL `scrollLeft`.
The component track is physically laid out LTR while each slide restores the resolved content
direction, so inherited RTL cannot reverse measured offsets.

Pagination receives IDs in semantic order and exposes the resolved direction through its slot.
After changing direction or size during a settle, remeasurement preserves the intended semantic ID
and retargets from the current rendered position and velocity.
