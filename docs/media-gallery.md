# Media gallery

`MediaGalleryDialog` is a complete, responsive lightbox composition with a native dialog boundary,
previous and next navigation, swipe navigation at fit, zoom and pan, preview-to-full-image loading,
failure recovery, reduced-motion support, and focus restoration.

Import the capability from its dedicated entrypoint and import the shared structural stylesheet
once in the application:

```ts
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";
import type { MediaGalleryItem } from "@snap-motion/vue/media-gallery";
import "@snap-motion/vue/style.css";
```

```vue
<MediaGalleryDialog
  v-model:open="open"
  :items="items"
  :initial-index="selectedIndex"
  :focus-return="{ target: opener, fallback: viewport }"
  @index-changed="(index, reason) => syncSelection(index, reason)"
  @request-close="(index, reason) => syncBeforeClose(index, reason)"
/>
```

## Item contract

Every item requires a stable non-empty `id`, `title`, `alt`, `previewSrc`, `width`, and `height`.
`fullSrc` and `description` are optional. Duplicate or empty IDs are ignored. Dimensions are used to
reserve the media ratio before images load.

The preview remains mounted while an optional distinct full image decodes. A failed full image is
removed without hiding the preview and can be retried. A `fullSrc` equal to `previewSrc` is treated
as preview-only.

## Controlled lifecycle

`open` is controlled through `v-model:open`. `initialIndex` is clamped when the dialog opens.
Changing `items` preserves the active item by ID when possible, clamps when it is removed, and
closes safely when the collection becomes empty.

The component emits:

- `requestClose(finalIndex, reason)` before `update:open(false)` so a consumer can synchronize its
  underlying selection before focus returns
- `opened(index)` and `closed(finalIndex)` for native-dialog lifecycle completion
- `indexChanged(index, reason)` for previous, next, swipe, Home, and End navigation

Close reasons are `backdrop`, `close-button`, `escape`, and `programmatic`. Navigation reasons are
`previous`, `next`, `swipe`, `home`, and `end`.

`focusReturn` accepts a preferred target plus an optional fallback. `initialFocus` defaults to the
close button. The server-rendered result stays closed even when `open` is true; the native dialog is
opened only after mount.

## Messages and reduced motion

English labels are supplied by `createEnglishMediaGalleryMessages()`. Pass a partial `messages`
object to replace labels or formatter functions. System reduced motion is honored by default;
`reducedMotionOverride` provides an explicit application override.

## Theme contract

The stylesheet owns geometry, safe areas, target sizes, responsive composition, high-contrast
fallbacks, and motion-state structure. Consumers can theme the composition at the dialog or an
ancestor through:

- `--snap-motion-gallery-surface`
- `--snap-motion-gallery-canvas`
- `--snap-motion-gallery-text`
- `--snap-motion-gallery-muted`
- `--snap-motion-gallery-line`
- `--snap-motion-gallery-control-surface`
- `--snap-motion-gallery-control-border`
- `--snap-motion-gallery-control-hover-surface`
- `--snap-motion-gallery-disabled-surface`
- `--snap-motion-gallery-disabled-text`
- `--snap-motion-gallery-focus`
- `--snap-motion-gallery-backdrop`
- `--snap-motion-gallery-chrome-surface`
- `--snap-motion-gallery-radius`

The `@snap-motion/vue/media-gallery` runtime graph contains Vue, VueUse listeners/measurement/scroll
lock/timers, and the shared focus helper. It does not import Motion, Snap Motion core, the carousel,
the bottom sheet, Router, Nuxt, or lab code.
