# Logical direction and RTL

Set `direction` on `CarouselRoot` or `useCarouselMotion` to `"ltr"`, `"rtl"`, or `"auto"`.
`auto` reads computed direction from the mounted interaction surface at the moment each input is
resolved; a page-level locale switch takes effect without remounting. Explicit values are useful
for isolated locale regions and deterministic fixtures.

```vue
<CarouselRoot v-model:active-id="activeId" :ids="ids" direction="rtl">...</CarouselRoot>
```

Semantic ID order does not change. Direction maps physical Arrow keys, drag deltas, release
velocity, wheel movement, and programmatic directional impulse onto previous/next. Geometry stays
in one transform coordinate system and does not depend on browser-specific RTL `scrollLeft`.
The component track is physically laid out LTR while the carousel observes inherited `dir`/class
changes, resolves the root's actual computed direction, and publishes it through a CSS variable
inherited by each slide. The package does not stamp a cached `dir` attribute onto content, so
inherited RTL cannot reverse measured offsets or become stale after a locale switch or inside a
locally directed region.

Pagination receives IDs in semantic order and exposes the resolved direction through its slot.
After changing direction or size during a settle, remeasurement preserves the intended semantic ID
and retargets from the current rendered position and velocity.
