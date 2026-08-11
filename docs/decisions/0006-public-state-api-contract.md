# 0006: Freeze the public state and event contract

Status: accepted.

## Decision

Snap Motion uses four distinct names for four distinct moments:

- `activeId` is application-authoritative semantic state. It changes as soon as a surface accepts a
  destination, before motion completes. This is Model A.
- `targetId` is the controller destination currently in flight. It is transient diagnostics, not a
  second controlled value.
- `visualId` is the item currently dominant in a spatial projection. It is exposed only by advanced
  handles, composables, slots, or data attributes where rendering needs it.
- `settledId` is the item at mechanical rest. `settled(id, details)` is emitted only when that rest
  is reached.

`activeId` wins over `selectedId`, `currentId`, `value`, and domain-specific names. It reads
naturally in Vue, React, routes, galleries, and sheet snap points; it does not imply form ownership;
and, once the mechanical terms above are explicit, it does not pretend to be a visual measurement.

A component-originated semantic change is one transition with two Vue expressions:

1. `update:activeId` provides `v-model` plumbing.
2. `activeIdChange(id, { reason })` provides framework-neutral provenance.

They occur together when the destination is accepted. `settled` is a later mechanical fact, not a
second selection event. Authoritative `activeId` changes from the host use reason `external`, cancel
or supersede conflicting interaction, and are never echoed through either change event. Live-region
announcements remain settlement-based and are silent for external synchronization.

The navigation reasons are `previous`, `next`, `keyboard`, `drag`, `wheel`, `picker`,
`programmatic`, `reconcile`, and `external`. They live in `@snap-motion/core` because provenance is shared domain
vocabulary for every future adapter. `external` replaces the router-shaped `route`: routers are one
possible authority, not part of the motion contract.

Imperative navigation is `navigateTo(id)`. Exact adoption of state already changed by another
authority is `synchronizeTo(id)`. `previous()` and `next()` remain because their provenance is
intrinsic. Synchronization is exact, cancels conflicting interaction, emits no semantic change, and
does not announce unless an advanced composable explicitly opts into an announcement.

Overlay visibility remains `open`. An overlay-originated close emits `update:open(false)` and
`openChange(false, { reason })`; an external `open=false` is authoritative adoption and emits
nothing. The shared close reasons are `close-button`, `escape`, `scrim`, and `programmatic`.
`scrim` replaces the gallery-only `backdrop`. Collection exhaustion is state reconciliation, not a
new user close reason. `ModalDialog` intentionally has no item selection.

## Component contract

| Component            | Visibility      | Semantic state                   | Ownership                                       | Semantic change                     | Rest               | Other public action                         |
| -------------------- | --------------- | -------------------------------- | ----------------------------------------------- | ----------------------------------- | ------------------ | ------------------------------------------- |
| `CarouselRoot`       | always rendered | required `activeId`              | controlled                                      | `update:activeId`, `activeIdChange` | `settled`          | `navigateTo`, `previous`, `next`            |
| `Coverflow`          | always rendered | optional `activeId`              | controlled when supplied, otherwise internal    | same                                | same               | same, `activate`                            |
| `StackedDeck`        | always rendered | optional `activeId`              | controlled when supplied, otherwise internal    | same                                | same               | same, `activate`                            |
| `Sheet`              | `open`          | optional snap `activeId`         | open controlled; snap controlled when supplied  | same                                | same               | `navigateTo`, `synchronizeTo`, close change |
| `ModalDialog`        | `open`          | none                             | controlled                                      | none                                | `opened`, `closed` | close change                                |
| `MediaGalleryDialog` | `open`          | optional stable media `activeId` | open controlled; media controlled when supplied | same                                | same               | same, close change                          |

Optional selection surfaces initialize their internal state from a domain default: the spatial
surface's centre item, the sheet's valid side default, or the gallery's first item. They do not add
`defaultActiveId` or `initialId`; one optional prop is sufficient before first publication. Unknown
controlled IDs remain pending and are adopted if they later appear. Reorder preserves identity.
Removal falls back to the same ordinal where possible, then the nearest valid item; an empty
collection has no active item. A controlled fallback is reported only when it results from the
surface's own collection reconciliation, never by rewriting an unknown host value.

The Sheet stores a valid authoritative snap while closed but keeps its mechanics hidden. Opening
remeasures once and starts at that stored snap without a hidden animation. External changes during
opening, dragging, settling, closing, side changes, or snap-point reconfiguration interrupt and
reconcile from the latest valid authority.

The gallery's public identity is always the item ID. Indexes remain internal layout metadata. Close
details return the final semantic `activeId`, so route state never depends on collection order.

## Framework mapping

The concepts do not depend on one adapter's syntax:

| Concept            | Vue                                     | React (conceptual)              | Svelte (conceptual)   | DOM adapter (conceptual)         |
| ------------------ | --------------------------------------- | ------------------------------- | --------------------- | -------------------------------- |
| semantic state     | `activeId`, `v-model:active-id`         | `activeId`                      | bindable `activeId`   | `activeId` property              |
| semantic change    | `activeIdChange` plus `update:activeId` | `onActiveIdChange(id, details)` | change callback/event | `active-id-change` `CustomEvent` |
| mechanical rest    | `settled`                               | `onSettled`                     | `settled` event       | `settled` `CustomEvent`          |
| visibility         | `open`, `v-model:open`                  | `open`                          | bindable `open`       | `open` property                  |
| visibility request | `openChange` plus `update:open`         | `onOpenChange(open, details)`   | change callback/event | `open-change` `CustomEvent`      |
| navigation         | exposed `navigateTo`                    | ref handle `navigateTo`         | component method      | element method `navigateTo`      |
| exact adoption     | exposed `synchronizeTo`                 | ref handle `synchronizeTo`      | component method      | element method `synchronizeTo`   |

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
router. Back/Forward is simply external adoption. A direct overlay entry does not require a previous
history entry, because close policy belongs to the host. SSR renders from the supplied state without
browser-only module initialization, and hydration continues the same controlled contract.

Model A makes URL state, analytics, cross-surface synchronization, interruption, rapid chaining,
and reduced motion independent of spring duration. It also requires consumers to use `visualId`
when a caption deliberately follows the moving visual rather than application state. `aria-current`
follows that visual authority in DOM metadata, while pointer-owned cards stay inert and hidden from
assistive technology until release. Settlement-based live announcements prevent semantic state
changes from being spoken twice.
