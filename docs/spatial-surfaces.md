# Spatial surfaces

Two surfaces ship as complete products rather than as parts to assemble: a **stacked deck**, where
one physical interaction exchanges exactly one adjacent card, and a **coverflow** rail, where
neighbours park in perspective on either side of a focused face.

```ts
import "@snap-motion/vue/style.css";
```

```ts
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { Coverflow } from "@snap-motion/vue/coverflow";
```

An application supplies domain items, stable IDs, controlled state, content, and theme. Snap Motion
supplies physics, gestures, navigation, selection, interaction authority, keyboard semantics,
reduced motion, motion styles, and accessibility structure. Nothing about physical indices,
traversal frames, interaction envelopes, anchor skip, controller phases, authority migration, or
synchronization internals is part of ordinary integration.

## Stacked deck

```vue
<script setup lang="ts">
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { ref } from "vue";

const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;

const activeId = ref<(typeof screens)[number]["id"]>("system");
</script>

<template>
  <StackedDeck
    v-model:active-id="activeId"
    :items="screens"
    :item-label="(screen) => screen.title"
    label="Project screens"
  >
    <template #card="{ item, active }">
      <ProjectScreen :screen="item" :current="active" />
    </template>
  </StackedDeck>
</template>
```

That is the whole integration. `activeId` keeps the semantic ID union, `item` inside the slot keeps
the consumer's own item type, and neither requires a cast or an explicit generic argument.

### What the deck guarantees

- One gesture, flick, wheel burst, or command resolves **at most one adjacent card**, however far it
  travels. Travel past that card becomes bounded elastic resistance rather than a second exchange —
  including with no `elasticity` supplied, because the deck states its own interior resistance.
  Supplying `elasticity` customizes that resistance; nothing weakens the one-card invariant.
- Direct manipulation stays 1:1 while the surface is held.
- The next interaction starts on the card already on top. A spring the user can no longer see is
  never a cooldown, so a re-grab during settlement is a new gesture with its own envelope.
- Distinct rapid Previous/Next commands chain one card each; commands issued inside one event-loop
  turn coalesce, because the deck had not answered the first yet.
- A destination further than one card **synchronizes** rather than animating through every
  intermediate card, and announces itself immediately because it is not a traversal.
- The pile behind the current card is exactly the screens the deck is not drawing, placed from item
  order alone. A reversal retraces the same layers instead of mirroring them.

## Coverflow

```vue
<Coverflow v-model:active-id="activeId" :items="screens" :item-label="(s) => s.title">
  <template #card="{ item, presentation }">
    <ProjectScreen :screen="item" :style="{ opacity: presentation.centerInfluence }" />
  </template>
</Coverflow>
```

A rail may travel any distance in one command, so Coverflow has no one-card transaction. It names
two different cards on purpose: `visualIndex` — exposed as `data-visual-id` and as the slot's
`active` — follows the physical mass through a narrow dead band so a caption tracks the gesture,
while the durable selection changes only at mechanical rest.

The `presentation` slot prop carries the card's resolved place on the rail plus normalized material
signals (`depth`, `yaw`, `sheen`, `edgeStrength`, `occlusion`, `settledness`, and friends). Every
signal is a function of the panel's own orientation, so a theme built on them cannot disagree with
the geometry.

## Props, events, and slots

Both surfaces share the same shape.

| Prop                                                           | Meaning                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `items`                                                        | Domain items. Each must carry the stable `id` it is keyed by.                        |
| `activeId`                                                     | Durable selection. Controlled when supplied; it changes only at mechanical rest.     |
| `itemLabel`                                                    | Accessible name of one item. Defaults to the semantic ID.                            |
| `label` / `labelledby`                                         | Accessible name of the surface.                                                      |
| `disabled`                                                     | Refuses every **input**. Controlled `activeId` still applies. See below.             |
| `landmark`                                                     | Publishes the surface as a `region` landmark instead of a labelled `group`.          |
| `focusScope`                                                   | Region that already counts as holding focus, when controls sit beside the surface.   |
| `stageWidth`                                                   | Fallback width used before the surface has been measured.                            |
| `spring`, `elasticity`, `releasePolicy`, `programmaticImpulse` | Physics. Watched by value.                                                           |
| `releasePolicy` (deck)                                         | `StackedDeckReleasePolicy`: the generic policy minus the anchor skip the deck fixes. |
| `reducedMotionOverride`                                        | Overrides the system preference.                                                     |
| `messages`                                                     | Localized strings.                                                                   |

| Event             | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `update:activeId` | Durable selection changed.                                          |
| `requestActiveId` | The same change, with the reason that caused it (see below).        |
| `settled`         | The surface reached mechanical rest on an item.                     |
| `activate`        | A tap on the current, unambiguous item: open it on another surface. |

Slots are `#card` (required) and, for the deck, `#backdrop` for a decorative stage layer behind the
pile. `#card` receives `{ item, id, index, active, settled, inspectable, … }`; the deck adds `role`
and `pose`, the rail adds `presentation`.

The exposed instance — typed as `StackedDeckHandle<TId>` or `CoverflowHandle<TId>` — offers
`previous()`, `next()`, `requestId(id)`, `synchronizeId(id)`, `isInspectEligible(index)`,
`onKeyDown(event)`, and read-only state including `state` (the surface's whole published semantics)
and a `diagnostics` snapshot of its motion (`phase`, `position`, `velocity`, `activeId`, `targetId`,
`anchors`, `bounds`, `reducedMotion`).

`previous()` and `next()` take no arguments. They are semantically fixed operations, not
parameterised ones: `requestActiveId` exists so an application can trust the reason it is given,
and a reason a caller chose is not evidence of anything.

The handle deliberately exposes **no controller**. A product surface owns a transaction model — the
deck's one-card exchange most of all — and a handle that returned the controller would be a
documented way around it. A renderer that genuinely needs that level of control composes
`useStackedDeckMotion` / `useCoverflowMotion`, which still return `motion` and `model`.

### Navigation reasons

`requestActiveId` carries why the selection changed, and it tells the truth:

| Reason         | What actually happened                                       |
| -------------- | ------------------------------------------------------------ |
| `previous`     | `previous()`                                                 |
| `next`         | `next()`                                                     |
| `keyboard`     | An Arrow, Home, or End key the surface owned                 |
| `drag`         | A pointer manipulation the surface **accepted and resolved** |
| `wheel`        | A wheel burst the surface **accepted and resolved**          |
| `picker`       | A tap on an item, or a pagination dot                        |
| `programmatic` | `requestId()` — an imperative request from the application   |
| `route`        | Authoritative state: `activeId`, or `synchronizeId()`        |

`drag` and `wheel` are claims about movement, not about events. A pointerdown that a nested button
refuses, a right-click, a vertical page scroll, and a wheel gesture belonging to a descendant all
reach the surface and none of them renames a settlement that something else caused. A change the
application itself made through `activeId` or `synchronizeId()` is **not** re-emitted, so a route
can never receive its own navigation back as a user request.

### Controlled selection is not input

`activeId` is authoritative application state, not an input device. It is applied even while the
surface is `disabled` or physically held by a pointer, because refusing it would leave the surface
disagreeing with the application with nothing to retry it. The interruption policy is explicit:
while the surface is held or refusing input the destination is adopted exactly, since animating out
from under a hand is worse than arriving; otherwise the surface's own navigation policy applies.

### Changing items

`items` may be added to, removed from, replaced, reordered, emptied, and repopulated at any time.
The surface preserves the **semantic item** it was on wherever that item moved to; if the item is
gone it holds the same ordinal position, clamped to what remains. Indexes are never carried across
a reconfiguration, and an `activeId` or `requestId()` naming an item the collection does not contain
is refused rather than resolved to item zero.

An empty collection is a supported state with one answer everywhere: ID-valued fields are
`undefined`, every ordinal on the published `state` is **`-1`**, `canPrevious` and `canNext` are
false, and every command is refused. No layer substitutes item zero for "no item" — not the model,
not the composable, not the handle.

## Requesting versus synchronizing

`requestId()` is a navigation the surface performs: the deck traverses an adjacent card and
synchronizes anything further; the rail simply travels. `synchronizeId()` is for a change another
surface already made and already reported — returning from an inspection gallery, for instance. It
adopts the destination exactly, with no travel and no announcement it did not earn.

```vue
<StackedDeck ref="deck" v-model:active-id="activeId" :items="screens" @activate="openGallery" />
```

```ts
function onGalleryClose(finalId: ScreenId) {
  deck.value?.synchronizeId(finalId);
}
```

## Styling

Package CSS owns containment, the stage box, the camera, and the per-card coordinate space —
structure a rigid-panel projection cannot be correct without. Palette, material, radius, and chrome
stay with the product.

Stable class names: `snap-motion-stacked-deck`, `-stage`, `-card`, `-card-motion`, `-pile-layer`;
`snap-motion-coverflow`, `-stage`, `-card`.

Both roots are a labelled `group` with `aria-roledescription="carousel"`, or a `region` landmark
when `landmark` is set. Each card is a `group` with `aria-roledescription="slide"`, and a card that
is hidden from assistive technology is also `inert`, so it never leaves focusable content reachable
by keyboard. Interactive content a consumer puts in a `#card` slot keeps its own clicks, pointer,
and Arrow keys. Only a manipulation the surface actually **consumed** suppresses the browser click
it produced — a vertical touch scroll, a tap, a cancelled gesture, and a two-finger gesture all
leave the following click alone — and that suppression is spent on exactly one click and expires
rather than waiting for one that never comes.

`will-change` is set on cards only while the surface is being manipulated or is animating, and
returns to `auto` once it settles.

Stable state attributes on the surface root: `data-phase`, `data-active-id`, `data-reduced-motion`;
the deck adds `data-settled-id`, `data-authority-stable`, `data-owned`, and `data-profile`, and the
rail adds `data-visual-id`. Each card carries `data-item-id`; deck cards add `data-deck-role`
(`top`, `target`, `hidden`), `data-deck-visible`, `data-deck-interactive`, and `data-deck-layer`.

Stable custom properties: `--snap-motion-deck-card-width`, `--snap-motion-deck-card-height`,
`--snap-motion-deck-stage-width`, `--snap-motion-deck-shadow-strength`, and the
`--snap-motion-coverflow-*` sizing and material signals.

## Nuxt

Nothing is client-only. Add the stylesheet through Nuxt so server and client receive the same
structural contract:

```ts
export default defineNuxtConfig({
  css: ["@snap-motion/vue/style.css"],
});
```

Keep a route-provided `activeId` stable across server and client. The surfaces render deterministic
markup during SSR and take their first measurement after mount.

## Lower layers

Advanced consumers may descend without giving up the product behaviour:

1. `StackedDeck` / `Coverflow` — the components above.
2. `useStackedDeckMotion` / `useCoverflowMotion` — the same behaviour with your own markup. Supply
   viewport and track refs; receive frames, pile layers, presentations, and input handlers.
3. `StackedDeckModel` / `CoverflowModel` in `@snap-motion/core` — the framework-neutral semantics:
   selection, authority, interaction envelopes, command policy, and announcements, resolved from
   controller snapshots without touching a controller.
4. `SnapController` — the generic scalar controller, unchanged and still generic.

`useStackedDeckMotion` and `useCoverflowMotion` publish an explicit
`UseStackedDeckMotionReturn<Id>` / `UseCoverflowMotionReturn<Id>` — a written contract rather than
whatever the implementation happens to return. Both include `model` and `motion` as the deliberate
escape hatches; index-only request and synchronization helpers are not part of it, because they are
how the capability is built rather than what it offers. Controlled selection is an _option_
(`controlledId`), not a method: it is state arriving from outside, so it is applied even while the
surface is disabled or held, and is never echoed back.

Below the models sit the primitives they compose: `resolveStackedDeckTraversal`,
`resolveStackedDeckFrame`, `resolveStackedDeckPile`, `resolveCoverflowPresentation`,
`resolvePaginationIndicator`, `advanceBoundedSpring`, and `resolveDirectManipulationGesture`. They
remain public because a custom renderer may genuinely need them — not because ordinary integration
does.
