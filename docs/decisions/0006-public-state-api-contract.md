# 0006: Freeze the public state and event contract

Status: accepted.

## Decision

Snap Motion uses four distinct names for four distinct moments:

- `activeId` is semantic application state. When the prop is supplied it is controlled, so only a
  new prop value changes it. Without the prop, the component owns and commits the same state.
- `targetId` is the controller destination currently in flight. It is transient diagnostics, not a
  second controlled value.
- `visualId` is the item currently dominant in a spatial projection. It is exposed only by advanced
  handles, composables, slots, or data attributes where rendering needs it.
- `settledId` is the item at mechanical rest. `settled(id, details)` is emitted only when that rest
  is reached.

`activeId` wins over `selectedId`, `currentId`, `value`, and domain-specific names. It reads
naturally in Vue, React, routes, galleries, and sheet snap points; it does not imply form ownership;
and, once the mechanical terms above are explicit, it does not pretend to be a visual measurement.

A component-originated request has two Vue expressions:

1. `update:activeId` provides `v-model` plumbing.
2. `activeIdRequest(id, { reason })` provides framework-neutral provenance.

They occur together when the surface accepts the command mechanically. On a controlled component
they do not mutate `activeId`; the host confirms, delays, rejects, or replaces the request through
the prop. A confirmed request may finish with its original reason. An unconfirmed request is
reconciled exactly to the last valid authority at the settlement boundary and emits neither a false
`settled` event nor a live announcement. A later or different prop is authoritative external
adoption: it interrupts conflicting work, is never echoed through either request event, and remains
silent in the live region.

The last valid authority is recorded before the acknowledgement early-return, including when a
host confirms the destination the component just requested. It is distinct from the current
mechanical fallback used while that authority is absent from a reconfigured collection. Targets,
visual dominance, fallbacks, and stale settlements never overwrite the authority anchor.

Controlled ownership is an epoch, not a lifetime cache. Releasing a controlled prop starts a fresh
uncontrolled epoch whose committed mechanics become its authority; a valid ID from the previous
controlled epoch cannot outrank intervening uncontrolled state. A later controlled unknown ID is
pending within its new epoch. Rejected requests reconcile to that epoch's latest valid anchor, and
if the pending ID later appears it is adopted silently without replaying a request.

An uncontrolled destination becomes that epoch's valid anchor when the surface accepts it, not when
its mechanics later settle. If a new controlled epoch begins with an unavailable ID while the
uncontrolled spring or track is still travelling, the accepted uncontrolled destination remains the
mechanical fallback. Arrival at that fallback after controlled semantics changed is silent: it does
not publish the stale uncontrolled settlement or announcement.

The navigation reasons are `previous`, `next`, `keyboard`, `drag`, `wheel`, `picker`,
`programmatic`, `reconcile`, and `external`. They live in `@snap-motion/core` because provenance is shared domain
vocabulary for every future adapter. `external` replaces the router-shaped `route`: routers are one
possible authority, not part of the motion contract.

Imperative navigation is `navigateTo(id)`. Exact adoption of state already changed by another
authority is `synchronizeTo(id)`. `previous()` and `next()` remain because their provenance is
intrinsic. Synchronization is exact, cancels conflicting interaction, emits no semantic request, and
does not announce unless an advanced composable explicitly opts into an announcement.

Overlay visibility remains strictly controlled `open`. An overlay-originated close emits
`update:open(false)` and `openRequest(false, { reason })`; it stays coherently modal when the host
ignores or delays that request, and another close can be requested. Only an external `open=false`
begins close and emits no request echo. The shared close reasons are `close-button`, `escape`,
`scrim`, and `programmatic`.
`scrim` replaces the gallery-only `backdrop`. Collection exhaustion is state reconciliation, not a
new user close reason. `ModalDialog` intentionally has no item selection.

Each native-dialog opening has a monotonic lifecycle generation. Intentional native closes retain
the generation that initiated them, and a queued `close` event can finalize focus return, scroll
unlock, cleanup, or `closed` only when it still owns the current closed lifecycle. A close event
from an older generation is inert even when a newer lifecycle has already closed again. Public
close requests no-op after controlled or native closure. The Sheet's
`closeForPresentationChange()` is a committed host swap: it emits `update:open(false)` but no
refusable `openRequest`.

If a host refuses an unexpected native close, the same lifecycle generation reopens the dialog and
reapplies its configured initial-focus policy without emitting a second `opened`. Final focus return
is generation-scoped and verified across bounded browser cleanup frames so an obsolete lifecycle
cannot steal focus from a newer overlay.

Focus return is a handoff, not an ongoing lease. Bounded verification may repair focus left on the
document or stranded in a closed native dialog, and may retry an opener that is temporarily
unavailable. A configured `focusReturn.opener` wins over browser focus chosen before verification
begins; without one, a valid initial application owner is preserved. Package-owned native close also
observes an immediate application handoff from that configured opener before verification can begin.
If another connected element takes focus during that same cleanup window, it becomes
the short-lived verification target: a late native-dialog cleanup that returns focus to the stale
opener is repaired to the new owner. Verification ends after the new owner is stable, or immediately
if it disconnects. After the handoff stabilizes, later blur or focus changes are outside the
verification window and never reclaim the opener.

## Component contract

| Component            | Visibility      | Semantic state                   | Ownership                                       | Semantic request                     | Rest               | Other public action                         |
| -------------------- | --------------- | -------------------------------- | ----------------------------------------------- | ------------------------------------ | ------------------ | ------------------------------------------- |
| `CarouselRoot`       | always rendered | required `activeId`              | controlled                                      | `update:activeId`, `activeIdRequest` | `settled`          | `navigateTo`, `previous`, `next`            |
| `Coverflow`          | always rendered | optional `activeId`              | controlled when supplied, otherwise internal    | same                                 | same               | same, `activate`                            |
| `StackedDeck`        | always rendered | optional `activeId`              | controlled when supplied, otherwise internal    | same                                 | same               | same, `activate`                            |
| `Sheet`              | `open`          | optional snap `activeId`         | open controlled; snap controlled when supplied  | same                                 | same               | `navigateTo`, `synchronizeTo`, close change |
| `ModalDialog`        | `open`          | none                             | controlled                                      | none                                 | `opened`, `closed` | close change                                |
| `MediaGalleryDialog` | `open`          | optional stable media `activeId` | open controlled; media controlled when supplied | same                                 | same               | same, close change                          |

`requestClose(reason?)` defaults to `programmatic` on Modal, Sheet, and Gallery handles. Gallery
`navigateTo`, `synchronizeTo`, `previous`, and `next` return whether work was synchronously accepted;
current, boundary, busy, empty, and unknown destinations are refused. These methods do not add
aliases or turn imperative handles into state stores.

Optional selection surfaces initialize their internal state from a domain default: the spatial
surface's centre item, the sheet's valid side default, or the gallery's first item. They do not add
`defaultActiveId` or `initialId`; one optional prop is sufficient before first publication. Unknown
controlled IDs remain pending and are adopted if they later appear. Reorder preserves identity.
Uncontrolled removal falls back to the same ordinal where possible, then the nearest valid item; an
empty collection has no active item. A controlled unknown or removed ID remains the exact semantic
`activeId`; mechanics retain the last valid anchor until the authority becomes available. The
component never manufactures or reports a controlled fallback.

The Sheet stores a valid authoritative snap while closed but keeps its mechanics hidden. Opening
remeasures once and starts at that stored snap without a hidden animation. External changes during
opening, dragging, settling, closing, side changes, or snap-point reconfiguration interrupt and
reconcile from the latest valid authority.

The gallery is generic over its item type. The exact `TItem["id"]` union flows through props,
`v-model`, requests, settlements, open/close lifecycle details, and handle methods. Indexes remain
internal layout metadata. Close details return semantic `activeId`, so route state never depends on
collection order.

## Framework mapping

The concepts do not depend on one adapter's syntax:

| Concept            | Vue                                      | React (conceptual)               | Svelte (conceptual)    | DOM adapter (conceptual)          |
| ------------------ | ---------------------------------------- | -------------------------------- | ---------------------- | --------------------------------- |
| semantic state     | `activeId`, `v-model:active-id`          | `activeId`                       | bindable `activeId`    | `activeId` property               |
| semantic request   | `activeIdRequest` plus `update:activeId` | `onActiveIdRequest(id, details)` | request callback/event | `active-id-request` `CustomEvent` |
| mechanical rest    | `settled`                                | `onSettled`                      | `settled` event        | `settled` `CustomEvent`           |
| visibility         | `open`, `v-model:open`                   | `open`                           | bindable `open`        | `open` property                   |
| visibility request | `openRequest` plus `update:open`         | `onOpenRequest(open, details)`   | request callback/event | `open-request` `CustomEvent`      |
| navigation         | exposed `navigateTo`                     | ref handle `navigateTo`          | component method       | element method `navigateTo`       |
| exact adoption     | exposed `synchronizeTo`                  | ref handle `synchronizeTo`       | component method       | element method `synchronizeTo`    |

Vue refs, computed refs, slots, and event casing remain adapter details. No React or DOM adapter is
introduced by this decision.

## Entrypoints and package boundary

`@snap-motion/core` keeps one root entrypoint. Its advanced geometry, controller, model,
presentation, mutable allocation-free frame, tuning, and selection primitives all have plausible
custom-renderer or adapter consumers and tree-shake cleanly. Capability subpaths would add package
and semver complexity without improving ownership in this dependency-free engine. Pre-publication
deprecated coverflow modular-progress aliases are removed rather than frozen.

`@snap-motion/vue` keeps capability subpaths as the stable isolation boundary. Its root is the
curated common path: high-level components, common localization and motion contracts, and the
carousel composition primitives needed for ordinary assembly. Capability-specific composables,
geometry, tuning, and media math remain on their explicit subpaths. Dialog focus implementation is
private. Media Gallery remains subpath-only so importing it cannot pull into unrelated surfaces.

## Consequences

Route and query integrations map host state to `open` and `activeId`; Snap Motion never imports a
router. A guard can delay or refuse a request without the rendered semantic state drifting from the
URL. Back/Forward is external adoption. A direct overlay entry does not require a previous history
entry, because close policy belongs to the host. SSR renders from supplied state without browser-only
module initialization, and hydration continues the same controlled contract.

This supersedes the earlier optimistic Model A reading. Mechanical `targetId` may lead controlled
state so direct manipulation and rapid chaining remain responsive, but it is pending work, not an
alternate application store. Consumers use `visualId` when a caption deliberately follows the
moving visual. `aria-current` follows visual authority in spatial projections, while semantic props,
slots, and handles keep the host's `activeId`. Settlement-based live announcements speak only
confirmed rest.

Close provenance stays in the Vue dialog capability rather than core. `close-button`, `escape`, and
`scrim` describe DOM interaction and adapter policy, not framework-neutral motion mechanics. A
future adapter may map the same structural reasons independently without forcing UI vocabulary into
the core engine.
