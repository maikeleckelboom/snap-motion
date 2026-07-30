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
`fullSrc` and `description` are optional. IDs are trimmed, and the complete collection must contain
unique, non-empty IDs after trimming. An empty or duplicate ID is a consumer error and throws
`RangeError`; items are never silently filtered.

Intrinsic dimensions reserve the media ratio before images load. Width and height are accepted only
as one positive finite pair. If either axis is invalid, both axes fall back to `1 × 1`, producing a
finite, positive square ratio instead of preserving a potentially destructive partial dimension.

The preview remains mounted while an optional distinct full image decodes. A failed full image is
removed without hiding the preview and can be retried. A `fullSrc` equal to `previewSrc` is treated
as preview-only. While full media is pending or failed, the preview owns the accessible name. After
successful decode, the full image owns the name and the preview is hidden from assistive technology.

The persistent previous and next slots remain mounted as visual preload surfaces for directional
continuity, but are `aria-hidden`. Only the item at the committed gallery index is semantically
exposed. During settlement, the incoming destination stays hidden until the index commits; the live
announcement and `indexChanged` event follow that semantic commit.

## Controlled lifecycle

`open` is controlled through `v-model:open`. `initialIndex` is clamped when the dialog opens.
Changing `items` preserves the active item by ID when possible, clamps when it is removed, and
closes safely when the collection becomes empty.

Opening, navigation, track settlement, image decode, and item-replacement work is generation
guarded. Closing, replacement, reopening, or unmounting invalidates scheduled work before it can
publish focus, state, measurements, announcements, or events. Body-lock and media work owned by a
prior open cycle cannot publish into a later cycle.

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

## Assistive-technology certification

> Prepared for manual assistive-technology certification

The dedicated lab harness is available at `?demo=gallery-at`. It supplies deterministic baseline,
single-item, full-image-failure, and preview-failure scenarios plus a deliberately non-live
component event trace.

Use the
[media gallery assistive-technology certification dossier](media-gallery-at-certification.md) and
[results template](media-gallery-at-results-template.md) for physical NVDA, VoiceOver, and TalkBack
runs. Automated DOM, focus, event, axe, and accessibility-tree coverage does not establish spoken
output or a real assistive-technology certification result.
