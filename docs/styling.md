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
- `--snap-motion-sheet-inline-size` (fixed left/right surface width)
- `--snap-motion-sheet-content-max-inline-size` (shared title, picker, and body measure; `none` to
  leave unconstrained)
- `--snap-motion-sheet-content-padding-inline`
- `--snap-motion-sheet-opposite-edge-gap`

Stable state attributes:

- `data-snap-motion-carousel-root`
- `data-snap-motion-primary-carousel`
- `data-snap-motion-keyboard-owner`, `data-snap-motion-ignore-drag`, and
  `data-snap-motion-wheel-owner`
- `data-active-id` and `data-phase` on the viewport
- `data-slide-id`
- `data-start-inset` and `data-end-inset`
- `data-sheet-side`, `data-sheet-axis`, `data-sheet-state`, and `data-sheet-snap`

Semantic class names such as `.snap-motion-carousel-viewport` and `.snap-motion-sheet-panel` are
available for theming. Internal nesting and generated shared chunks are not a public styling API.

Top and bottom panels are full bleed. Their header, optional picker, and body each contain the same
`.snap-motion-sheet-content-shell`, so the two content variables establish one centered editorial
measure without constraining the surface. Left and right panels use a bounded fixed inline size and
translate that surface during drag; partial snaps never animate its width. Safe-area padding is
mapped independently for all four physical edges, including RTL where `left` and `right` remain
physical sides.

```css
.article-sheet {
  --snap-motion-sheet-content-max-inline-size: 48rem;
  --snap-motion-sheet-content-padding-inline: clamp(1rem, 4vw, 2rem);
}

.inspector-sheet {
  --snap-motion-sheet-inline-size: min(28rem, calc(100vw - 2rem));
}
```
