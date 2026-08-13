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
  :open="routeOpen"
  :active-id="routeMediaId"
  :items="items"
  preload-policy="current-only"
  :focus-return="{ opener, fallback: viewport }"
  @active-id-request="(id, details) => replaceRouteMedia(id, details.reason)"
  @open-request="(_open, details) => closeRouteOverlay(details.activeId, details.reason)"
>
  <template #actions>
    <LocaleSwitch :media-id="routeMediaId" />
  </template>
</MediaGalleryDialog>
```

## Item and identity contract

Every item requires a stable non-empty `id`, `title`, `alt`, `preview`, and `full`. Both image
sources require a fallback `src` and may carry `srcset`, `sizes`, and a paired intrinsic `width` and
`height`:

```ts
const items = [
  {
    id: "overview",
    title: "Project overview",
    alt: "Project overview on a wide screen",
    preview: {
      src: "/overview-800.avif",
      srcset: "/overview-400.avif 400w, /overview-800.avif 800w",
      sizes: "(max-width: 48rem) 100vw, 50vw",
      width: 800,
      height: 500,
    },
    full: {
      src: "/overview-1600.avif",
      srcset: "/overview-1200.avif 1200w, /overview-1600.avif 1600w",
      sizes: "100vw",
      width: 1600,
      height: 1000,
    },
  },
] satisfies readonly MediaGalleryItem[];
```

IDs must already be canonical, without surrounding whitespace, and unique. Source `src` values
follow the same rule. Invalid values throw a `RangeError`. They are never rewritten or silently
filtered. The component is generic over the supplied item type, and the exact `TItem["id"]` union
flows through props, `v-model`, events, lifecycle details, and handle methods. Public state never
uses indices.

Valid intrinsic dimensions reserve layout before loading. A missing or invalid pair is omitted from
the image attributes and the stable containing viewport uses a bounded `1 x 1` geometry fallback.
Mixed-aspect media keeps that containing viewport stable. A preview stays mounted while a distinct
full image decodes. A failed full image is removed without hiding the preview and can be retried.
When `preview` and `full` identify the same source, the Gallery renders one preview layer and does
not request a duplicate.
Only the mechanically settled item is exposed to assistive technology. Its optional `description`
is rendered with that same mechanical item, below the item title and position. A controlled request
cannot publish destination copy before the host adopts it, and the description is intentionally not
a live announcement.

## Responsive loading and retry

`preloadPolicy` controls full-source promotion. Its default, `current-only`, renders preview sources
for the current and adjacent track slots but mounts a full source only for the mechanically current
item. After an adjacent move settles, the former full layer is removed and the new current item is
promoted. `adjacent-full` is an explicit opt-in for hosts that have measured a benefit and accept the
extra transfers.

Closed Galleries render no image elements, so they make no preview or full requests. Under the
default policy, opening requests the bounded current-and-adjacent preview set and exactly one full
source. `src`, `srcset`, `sizes`, and valid intrinsic dimensions are forwarded to their respective
image layers. The current full image is high priority. Adjacent previews do not mount a hidden full
image merely because `fetchpriority` would be low.

Retry applies only to the failed current full source. The Gallery captures the browser-selected
`currentSrc`, adds a fresh request identity to that exact resource, and omits `srcset` only from the
retry element. It neither parses the serialized candidate list nor falls back to a potentially
larger `full.src`. Open-cycle, collection, active-authority, item, and retry generations prevent a
late load, decode, error, or rapid-navigation result from changing another item. Navigation back to
an earlier item and reopening restore its original responsive source contract.

Preview and full sources are network-distinct when `src` differs, `srcset` differs, or a shared
non-empty `srcset` has different `sizes`. Intrinsic `width` and `height` reserve geometry and do not
make otherwise identical sources network-distinct. `sizes` alone cannot change selection without a
candidate list.

## Application actions

The optional no-prop `#actions` slot places application-owned controls inside the native modal.
Use it for an action such as locale switching that must remain operable while `showModal()` correctly
makes the page outside the dialog inert. The host owns the action's behavior, accessible name, and
visual treatment. Snap Motion owns its structural placement, focus containment, focus indication,
forced-color participation, and DOM order before the Close control. When the slot is absent, no
empty action container is rendered.

## Controlled lifecycle

`open` is controlled. `activeId` is optionally controlled; without it, the component starts at the
first item and owns semantic state. `v-model` is the immediate-acceptance shorthand for either prop.
Route guards and other owners that may delay, refuse, or replace a request use one-way `:open` and
`:active-id` bindings, as above. See
[immediate and guarded ownership](integration.md#semantic-selection).
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
Navigation methods return `true` only when they synchronously accept work; boundary, busy, empty,
unknown, and current-destination no-ops return `false`. `requestClose()` defaults to the
`programmatic` reason; UI paths always supply their exact interaction reason.

Opening, navigation, settlement, image decode, item replacement, closing, and reopening are
generation-guarded. Work from a stale open cycle cannot publish focus, state, measurements,
announcements, or events into a later cycle. `focusReturn` accepts a preferred opener and optional
fallback. Focus and image guards resolve DOM ownership through each node's document and remain valid
for iframe-realm and adopted-document nodes. Server markup reflects the supplied semantic ID and
responsive image attributes while the native dialog opens only after mount.

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
