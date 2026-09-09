# Spatial surfaces

`Coverflow` and `StackedDeck` are complete typed product surfaces. An application supplies domain
items and card content; the component owns geometry, motion, input arbitration, focus, semantic
state, accessibility, and projection.

```vue
<Coverflow
  :active-id="routeActiveId"
  :items="screens"
  label="Project screens"
  @active-id-request="onActiveIdRequest"
  @settled="onSettled"
>
  <template #card="{ item, active, visual, settled, inspectable }">
    <ProjectScreen
      :screen="item"
      :data-active="active"
      :data-visual="visual"
      :data-settled="settled"
      :data-inspectable="inspectable"
    />
  </template>
</Coverflow>
```

## State contract

Four names describe distinct facts:

- `activeId`: semantic application state, controlled by the prop when supplied;
- `targetId`: the controller destination in flight, available in advanced diagnostics;
- `visualId`: the item currently dominant in the projection;
- `settledId`: the item at mechanical rest.

User interaction emits `update:activeId` and `activeIdRequest(id, { reason })`. An uncontrolled
surface commits that state itself. A controlled surface keeps the prop value while mechanics may
travel toward the requested target; the host confirms by publishing the requested ID. Only a
confirmed destination emits `settled(id, { reason })` at rest. Ignored requests reconcile back
without settlement or announcement.
Use `v-model:active-id` only for immediate acceptance. A guarded or delayed owner binds the prop one
way, as above, and publishes its decision later; see
[immediate and guarded ownership](integration.md#semantic-selection).
The slot's `active`, `visual`, and `settled` booleans preserve the same distinction. `aria-current`
follows visual authority in DOM metadata; cards remain inert and accessibility-hidden while a
pointer owns the surface, then the one current card is exposed on release. Live announcements remain
settlement-based so early semantic state is not announced twice.

The public reasons are `previous`, `next`, `keyboard`, `drag`, `wheel`, `picker`, `programmatic`,
`reconcile`, and `external`. Component-originated changes never report `external`; external is
reserved for settlement/diagnostics after exact authoritative adoption.

## Controlled and internal state

Supplying `activeId` makes the surface controlled. Omitting it gives the component internal state,
initially the center item. No separate `defaultActiveId` is needed before first publication.

Stable IDs, not indices, are application identity. Reorder preserves the active ID. Uncontrolled
removal falls back to the same ordinal where possible and emits one `reconcile` request. An empty
collection has no active item. A controlled unknown ID stays pending and is adopted if a later
`items` update introduces it; it is never silently rewritten to item zero. Controlled removal never
rewrites the host ID: mechanics retain their last valid anchor.

External prop changes cancel pointer recognition, drag, wheel coalescing, and stale settlement.
They emit neither `update:activeId` nor `activeIdRequest` and do not announce. This makes route/query
changes, Back/Forward, and cross-surface synchronization loop-free.

## Navigation and exact synchronization

High-level handles and feature composables use the same verbs:

- `navigateTo(id)` performs a new programmatic navigation;
- `synchronizeTo(id)` exactly adopts state already changed by another authority;
- `previous()` and `next()` perform intrinsic adjacent navigation.

`StackedDeck` accepts only one adjacent card per interaction. A non-adjacent `navigateTo` is adopted
exactly instead of animating through intermediate cards. `Coverflow` can target the requested rail
position directly. `synchronizeTo` cancels conflicting motion and never replays request events. On
controlled high-level handles it accepts only the current prop; `navigateTo` is the route for asking
the owner to change state.
`StackedDeck` refuses an unknown or stale ID without changing selection, the rollback anchor, or
pending settlement. Its settlement publication waits for the current Vue prop flush and is discarded when newer
navigation, exact adoption, a changed collection, or unmount supersedes it. Status labels are resolved
from the surviving semantic ID, never from an index captured before a collection change.

```ts
function onGalleryClosed(finalId: string | undefined) {
  if (finalId) deck.value?.synchronizeTo(finalId);
}
```

Tap activation remains distinct from selection: `activate(item, index)` means the settled,
unambiguous card was invoked for inspection. It is not emitted for a drag-ending click or a visually
ambiguous card.

## Public high-level props and slots

Both components accept `items`, optional `activeId`, `label` / `labelledBy`, `itemLabel`,
`focusScope`, `disabled`, `landmark`, `fallbackStageWidth`, reduced-motion and physics overrides.
`StackedDeck` additionally accepts `exchange="shuffle" | "direct"`; omitted exchange is exactly
`"shuffle"`. Shuffle is the opaque physical transfer between pile sides. Direct keeps the exact
local point grabbed on the outgoing card attached to the pointer after horizontal intent is owned,
including raw vertical movement, while the scalar controller still owns adjacent target, authority,
release, and pile reflow. It does not change card content, dimensions, pile geometry, or semantics.
The high-level `fallbackStageWidth` prop also caps the root's CSS width at that value (at most 1280
CSS pixels). It supplies geometry before measurement; afterward mechanics use the measured root.
Choose the allocated width with ordinary host CSS. The advanced composable's `stageWidth` option is
only a pre-measurement fallback and does not style its host.
Omitting `reducedMotionOverride` on `StackedDeck` follows the system preference, including changes
while mounted. Explicit `true` reduces motion; explicit `false` forces full motion. Ordinary
consumers do not need to read a media query or forward an override.
The measured public root may be narrower than the compact mechanics profile. At a 280 CSS-pixel
allocation, the compact Deck keeps its 192 CSS-pixel card, slotted content, and settled pile inside
that root in either navigation direction. The package stylesheet applies layout containment to the
public Deck root while preserving visible overflow, so transformed exchange cards do not widen the
document and focus outlines, motion, and pile edges remain unclipped. Consumers should keep their
host and slotted card content shrinkable with `min-inline-size: 0`. They should not patch the package
transform, add host containment, or clip the Deck to compensate for page overflow.

Both require `#card`. `StackedDeck` also supports a decorative `#backdrop`. Card slot state exposes
the domain `item`, stable `id`, collection `index`, semantic/visual/settled/inspection state, and the
surface-specific presentation. These projections are read-only render data, not alternate sources
of truth.

Each Stacked Deck item is rendered once through `#card`, inside one persistent physical shell that
owns transform, depth, opacity, and shadow for the item's lifetime. There is no second high-level
pile-material slot. Custom renderers and diagnostics that need the read-only non-dominant projection
can use `useStackedDeckMotion().pileLayers`; those values mirror the same card poses and do not grant
semantic, interaction, focus, or accessibility ownership.

`labelledBy` follows the JavaScript/DOM property spelling while rendering `aria-labelledby`.
`focusScope` identifies a surrounding region that already owns focus; it is not a focus trap.
`landmark` upgrades the default labelled group to a region only when the surface is a major page
section.

## Input, interruption, and accessibility

Keyboard input is accepted only while the surface owns the relevant focus scope. Pointer input
starts as recognition, becomes an owned horizontal drag only after intent is clear, and otherwise
leaves vertical page scrolling alone. Descendant controls, right-click, and regions marked
`data-snap-motion-ignore-drag` do not begin surface drag. Accepted navigation prevents its key or
wheel default; refused navigation does not.

Direct applies the full movement accumulated since pointer-down on the first owned touch frame. From
the next frame through release, the grabbed local point follows the pointer literally. Interior
overdrag keeps that hand-owned vector while the existing one-card envelope resists scalar progress.
Every semantic item has both cyclic neighbours, including across ordinal zero, so former outward
edge gestures enter an ordinary adjacent exchange before that same one-card overdrag applies.
Keyboard, wheel, and programmatic Direct navigation use the same scalar projection without a
fictional cursor.

On commit, the released shell keeps its release paint order until its path is physically clear,
passes behind the new top there, and continues from the actual release X/Y into its exact destination
pose on the parking clock. Opacity remains `1`. A return creates no landing and remains coupled to
the controller's scalar path home; cancellation and vertical-only release return to exact source
rest. New input and controlled or collection authority never wait for presentation settlement.

An interrupted committed release remains visible and lands independently, but it is noninteractive
and cannot become a new origin while airborne. A later exchange targeting that shell resolves the
target and landing through the same persistent pose rather than rebasing it. Every fresh accepted
gesture begins a local scalar transaction on a shell the deck is actually offering. Rapid commands
chain from the pending mechanical target without promoting it to durable semantic state. Reduced
motion preserves the same authority and material protocol.
Calls made synchronously before Vue acknowledges the first command share its origin and coalesce;
distinct inputs after that acknowledgement chain from the pending target.

Changing `disabled` during input ends pointer recognition and wheel coalescing. An owned exchange
returns to its interaction origin without a new selection request; a touch still awaiting intent
preserves the previously accepted destination. Older committed Direct landings continue independently.
Explicit cancellation also retires queued gesture samples and actions, so they cannot be delivered
for a replaced contact, collection, or component lifetime.

Only the settled inspectable card is interactive. Hidden and pile-only cards stay inert. Focus is
preserved before semantic collection changes, status announcements happen once at settlement, and
external synchronization stays silent.

## SSR and advanced composition

Keep route-provided `activeId` stable across server and client. Surfaces render deterministic markup
without browser-global module initialization and hydrate without `ClientOnly`. Geometry is measured
after mount without an entrance spring from a different semantic item.

Advanced consumers can import `useCoverflowMotion`, `useStackedDeckMotion`, presentation functions,
tuning types, geometry, and read-only diagnostics from the corresponding capability subpath. These
APIs exist for custom renderers; ordinary product integration should use the high-level component.
Core remains the owner of framework-neutral models, controller mechanics, target policy, and
allocation-conscious frames. Vue composables own refs, DOM measurement, event listeners, and
Motion playback.
