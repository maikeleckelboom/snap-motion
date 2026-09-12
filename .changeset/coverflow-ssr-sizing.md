---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Add a preferred `cardWidth` to high-level Coverflow and its geometry/composable options. Preserve
default sizing, reserve responsive neighbour space, and scale the camera and depth coherently for
larger evidence cards. Measured narrow hosts retain a focus gutter.

Document and certify the existing neutral physical shell: direct image slots can fill the panel
without a package border, background, padding, radius, shadow or inner chassis. The representative
image fixture demonstrates edge-to-edge planes at default, narrow and wide allocations without
material overrides or a new prop.

Keep shared reduced-motion state deterministic through SSR and the first hydration render, then
adopt the live browser preference on mount. Explicit overrides remain authoritative. This fixes
Coverflow and Stacked Deck hydration styles. Keep Sheet's initial viewport measurement deterministic
as well. Adopt spatial-surface allocation and anchors together, and defer shared carousel observer
measurement outside resize delivery to prevent responsive feedback warnings.

Give Coverflow and Stacked Deck the shared themeable `:focus-visible` ring. Suppress the generic
pointer-focus rectangle on Coverflow, Stacked Deck and Carousel's viewport while retaining keyboard
focus, navigation and forced-colors indicators. Local pointer state accounts for prevented gestures
that transfer focus by script and clears on keyboard input or focus departure. Sheet's focus
treatment is unchanged.
