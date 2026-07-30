# Styling contract

Import `@snap-motion/vue/style.css` explicitly. JavaScript does not import CSS automatically so ESM
execution and SSR are independent of a bundler CSS loader. The package marks CSS as a side effect,
and packed Vite/Nuxt fixtures prove the public CSS subpath.

The base stylesheet supplies visually hidden content, dialog and sheet structure, control target
sizes, focus fallbacks, forced-colors behavior, small-container safety, and the media gallery's
responsive structural composition. It deliberately supplies no product palette, typography, or
carousel layout theme. The media gallery's stable theme variables are documented in
[Media gallery](./media-gallery.md).

Stable customization variables:

- `--snap-motion-control-target-size`
- `--snap-motion-focus-color`
- `--snap-motion-focus-width`

Stable state attributes:

- `data-snap-motion-carousel-root`
- `data-snap-motion-primary-carousel`
- `data-snap-motion-keyboard-owner`, `data-snap-motion-ignore-drag`, and
  `data-snap-motion-wheel-owner`
- `data-active-id` and `data-phase` on the viewport
- `data-slide-id`
- `data-start-inset` and `data-end-inset`
- `data-sheet-state` and `data-sheet-snap`

Semantic class names such as `.snap-motion-carousel-viewport` and `.snap-motion-sheet-panel` are
available for theming. Internal nesting and generated shared chunks are not a public styling API.
