# Media gallery

`MediaGalleryDialog` is a responsive native-dialog lightbox with stable-ID navigation, previous and
next controls, swipe navigation at fit, zoom and pan, preview-to-full-image loading, failure recovery,
reduced-motion support, and focus restoration.

```ts
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";
import type { MediaGalleryItem } from "@snap-motion/vue/media-gallery";
import "@snap-motion/vue/style.css";
```

```vue
<MediaGalleryDialog
  v-model:open="open"
  v-model:active-id="activeId"
  :items="items"
  :focus-return="{ opener, fallback: viewport }"
  @active-id-request="(id, details) => replaceRouteMedia(id, details.reason)"
  @open-request="(_open, details) => closeRouteOverlay(details.activeId, details.reason)"
/>
```

## Item and identity contract

Every item requires a stable non-empty `id`, `title`, `alt`, `previewSrc`, `width`, and `height`.
`fullSrc` and `description` are optional. IDs must already be canonical (no surrounding whitespace)
and unique. Invalid IDs throw a `RangeError`; they are never rewritten or silently filtered. The
component is generic over the supplied item type, and the exact `TItem["id"]` union flows through
props, `v-model`, events, lifecycle details, and handle methods. Public state never uses indices.

Intrinsic dimensions reserve layout before loading. Invalid dimensions fall back as one `1 x 1`
pair. Mixed-aspect media uses a stable containing viewport. A preview stays mounted while a distinct
full image decodes; a failed full image is removed without hiding the preview and can be retried.
Only the mechanically settled item is exposed to assistive technology.

## Controlled lifecycle

`open` is controlled through `v-model:open`. `activeId` is optionally controlled through
`v-model:active-id`; without it, the component starts at the first item and owns semantic state.
Unknown controlled IDs remain the exact semantic state and are adopted mechanically if they later
appear. Reorder preserves the same ID. Controlled removal does not manufacture a fallback; mechanics
retain the last valid item. Uncontrolled removal falls back to the same ordinal where possible.
Emptying an uncontrolled collection clears semantic identity and requests a programmatic close.

A component-originated destination emits `update:activeId` and
`activeIdRequest(id, { reason })`. In controlled use, `activeId` does not change until the host
confirms that ID. An ignored request rolls its mechanics back without `settled` or announcement; a
delayed or different prop is external adoption. A confirmed request emits `settled(id, { reason })`
at mechanical rest. A component-originated close emits `update:open(false)` and
`openRequest(false, { activeId, reason })`. `opened(id)` and `closed(finalId)` report native-dialog
lifecycle completion.

Close reasons are `scrim`, `close-button`, `escape`, and `programmatic`. Gallery navigation uses the
family reasons `previous`, `next`, `keyboard`, `drag`, `programmatic`, `reconcile`, and `external`.
Externally supplied `activeId` and `open=false` are authoritative: they cancel conflicting
swipe/zoom/load work without request or live-announcement echo. A refused or delayed close request
leaves the dialog open, modal, focus-contained, and able to request close again.

The exposed handle contains `activeId`, `settledId`, `navigateTo`, `synchronizeTo`, `previous`,
`next`, `resetToFit`, `requestClose`, and `dialog`. `navigateTo` performs a new programmatic action;
`synchronizeTo` exactly adopts state already changed by the same authority. On a controlled gallery
it refuses an ID other than the current prop, so the handle cannot become a competing state store.

Opening, navigation, settlement, image decode, item replacement, closing, and reopening are
generation-guarded. Work from a stale open cycle cannot publish focus, state, measurements,
announcements, or events into a later cycle. `focusReturn` accepts a preferred opener and optional
fallback. Server markup reflects the supplied semantic ID while the native dialog opens only after
mount.

## Runtime and theme boundary

The entrypoint runtime graph contains Vue, VueUse listeners/measurement/scroll lock/timers, and the
shared focus helper. Its core provenance import is type-only and disappears at runtime. It does not
import Motion, Carousel, Sheet, Router, Nuxt, or lab code.

Consumers can theme the component with its documented `--snap-motion-gallery-*` custom properties;
the package stylesheet owns structural geometry, safe areas, focus targets, and motion state.

## Assistive-technology certification

The lab harness at `?demo=gallery-at` and the
[media gallery assistive-technology certification dossier](media-gallery-at-certification.md)
remain prepared, not completed. Automated DOM, focus, event, axe, and accessibility-tree coverage
does not establish spoken output on physical NVDA, VoiceOver, or TalkBack setups.
