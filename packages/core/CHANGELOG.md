# @snap-motion/core

## 0.1.0-beta.10

### Minor Changes

- 419fcbc: Keep core and Vue candidate provenance aligned. Vue Coverflow pointer activation now preserves the
  surface's focus ownership when the pointer originates outside a nested interactive control, while
  nested controls keep their own focus behavior.

  The shared native-dialog focus-return verifier also yields to a subsequent pointer interaction,
  including one that intentionally leaves focus on the document body, instead of reclaiming the opener.

- def6407: Make Stacked Deck a cyclic physical ring. Relative pointer, wheel, keyboard, and imperative
  navigation now exchange exactly one directed neighbour across every semantic ordinal, while named
  non-adjacent destinations continue to synchronize directly. Direct and Shuffle retain distinct
  choreography over the same canonical ring order, including explicit two-item direction and atomic
  local-coordinate rebasing.

  The ring decides which card is adjacent and nothing else. Physical pile depth is the folded slot's
  own distance from the centre of the deck, so the nearest neighbour on either side is the nearest to
  the eye on that side and the exchange a hand performs is the same one a bounded collection performs.
  The only physical behaviour the ring adds is that one shell per exchange crosses from one folded
  side of the pile to the other; it passes behind the deck and paints nothing between the two rests it
  is exact at.

  A press does not catch a card a release is still carrying. Every unfinished release keeps its own
  path and clock while later hands continue immediately, so several persistent shells may be in
  flight together and each lands in whichever slot the deck is drawing for it by the time it arrives.
  Release chronology determines relative airborne paint order, and depth changes only after the
  involved bodies are physically clear.

  Held Direct reversal also keeps physical paint authority continuous when raw vertical pointer travel
  has carried the source clear of the deck. Semantic direction and target may still change immediately,
  but the exposed under-card continuously recedes without losing opacity, travels clear of the complete
  pile, and changes depth there; subordinate shells change depth only under physical occlusion. Scalar
  neutral no longer assumes the source is covering that handoff.

  Direct now uses one scalar-driven clear/contained choreography that is physically safe even when the
  held source does not cover the pile. Raw vertical travel moves only that source and never changes a
  target or pile pose. A directed target that is still landing is projected first on its own continuous
  clock; the target's actual physical coverage continuously admits the same scalar pile path as it
  approaches the deck, and settlement `1` is exactly the record-free pose. Retiring that record
  therefore cannot switch the deck between two pose fields.

  A shell that is still in the air is a presentation until it lands. It stays visible and keeps
  travelling, but the deck does not offer it: an exchange is measured from a card that is physically
  covering the pile it hands depth to, and a released shell is covering nothing. So it can be neither
  pressed nor named as the source of a pointer, wheel, keyboard, or imperative exchange while its own
  release still has it — and the frame it arrives, it is an ordinary deck top again and the same
  gesture is accepted. Nothing is queued, delayed, or cut short by this; it is the deck having no card
  to exchange yet rather than a cooldown. A pointer that goes down anywhere other than a card the deck
  is offering no longer starts an exchange at all.

  Remove Stacked-Deck-specific pagination state and presentation. Generic pagination and finite
  ordinal accessibility announcements remain available to the surfaces that own them.

  For custom renderers, replace traversal `physicalIndex` with interaction-local `physicalPosition`
  and an explicit `originIndex`; `StackedDeckSnapshotInput` also uses `physicalPosition`.
  `StackedDeckTraversalBounds` and the model's `traversalBounds` are removed. Supply direction to
  `StackedDeckModel.openInteraction(originIndex, direction)` and traversal commands. The model exposes
  `interactionDirection`, while `resolveStackedDeckNeighbor`, `resolveStackedDeckOrder`, and
  `resolveStackedDeckDepth` expose ring identity; pile poses and Vue pile layers also expose `depth`.

  The generic controller adds opt-in `ControllerMeasurement.rebaseFromId` and
  `ControllerDragOptions.resetPositionToOrigin` for explicit coordinate changes. Vue exposes
  `useSnapMotion`'s `onPointerTravelDirection` and `resetDragPositionToOrigin`, plus
  `useCarouselMotion`'s `onInteractionDirection`. Omitted options preserve existing generic behavior.

- 425bdab: Render Stacked Deck with one persistent physical shell and one `#card` subtree per item. Each card
  keeps its material through parked, exchanging, interrupted, and reversed states. Shuffle transfers
  depth under physical occlusion instead of dissolving card content. The high-level `#pile-layer`
  slot and `StackedDeckPileLayerSlotState` are removed; render material through `#card` instead.
  Advanced renderers retain `useStackedDeckMotion().pileLayers` and `resolveStackedDeckPile`, which
  describe non-dominant physical poses without granting semantic or interaction ownership.
- 760682e: Add the opt-in `exchange="direct"` Stacked Deck presentation while preserving Shuffle as the exact
  default. Direct keeps the originally grabbed local card point attached to the pointer after existing
  horizontal gesture arbitration, separates raw two-axis hand motion from scalar one-card traversal,
  and uses the same persistent shells, semantic model, pile geometry, release policy, and authoritative
  core frame as Shuffle.

  Every non-held shell interpolates between exact source-rest and destination-rest deck poses with
  stable hidden ordering. A released shell parks along its own bounded presentation settlement — never
  along remaining scalar travel, which can already be finished at the moment the hand lets go — from
  the exact frame it was released on into its exact pile slot, without fading, rebasing, or
  duplication. It keeps the paint order the hand released it with until the two card bodies are
  laterally clear of each other, and passes behind the new top there, so the depth change repaints
  nothing. Mechanical rest no longer takes that path away from it. Cancellation, held reversal,
  controlled takeover, and collection changes remain immediately interruptible. A release still in
  the air stays visible and keeps landing independently, but cannot be recaptured as a new origin.
  Cyclic overdrag remains bounded to the one adjacent transaction rather than fabricating additional
  travel. Autonomous and reduced-motion Direct navigation use the same endpoint model without
  inventing a cursor.

  Ordinary pointer release is classified exactly once where the release resolver chooses between the
  interaction origin and its directed neighbour. A committed release opens parking and owns its
  presentation clock; a return opens no landing and remains coupled to the controller's way back to
  interaction-local zero. Zero-direction and cancelled gestures explicitly return to their origin.

  A hand takes ownership of the shell it presses on in the same statement that binds the presentation
  to its interaction. Those were two steps — the origin moved when the drag opened, the lifecycle
  arrived with the first movement sample a microtask later — and a frame rendered between them showed
  a presentation carrying a new origin with no owner, which the projection reads as an autonomous
  exchange: nothing is being held, so the incoming card takes the top of the deck immediately. At the
  frame a hand presses, the two bodies overlap almost exactly, so every shared pixel changed material
  for that one frame. It was reachable only by pressing before the previous exchange had finished
  travelling, which is what alternating flicks do. A press that never moves the shell now also ends
  its presentation instead of settling a vector of nothing.

### Patch Changes

- f316436: Make StackedDeck refuse stale synchronization without changing semantic state, discard superseded
  settlement and announcements after Vue's current prop flush, and cancel active pointer/wheel input
  when disabled while preserving independent committed landings. An omitted reduced-motion override
  now follows the system preference. Keep airborne shells non-inspectable through public handles and
  card slots until landing retirement. Clarify the existing stage-width cap and semantic slot contracts.
  Cancel queued gesture callbacks when their pointer sequence, authority, or component lifetime ends.
  Keep a departing Direct source above subordinate pile material until an airborne target's delayed
  pile transfer can hand depth over safely, without changing scalar geometry or release timing.

## 0.1.0-beta.9

### Minor Changes

- Keep core and Vue provenance aligned for the private beta.9 candidate. Core has no runtime or public
  API change. Vue now depends on VueUse 14.4.0, exposes built-in Media Gallery retry only for selected
  HTTP(S) resources that can produce a cache-busted request, and certifies both pointer and keyboard
  Workbench lightbox activation after Lab convergence.

## 0.1.0-beta.8

### Minor Changes

- Keep core and Vue provenance aligned for the private beta.8 candidate. Vue Gallery retries now
  capture the browser-selected responsive `currentSrc`, issue a distinct request for that exact
  resource, and invalidate retry work across authority, collection, and open-cycle changes. Gallery
  source distinctness now includes `sizes` only when a shared `srcset` can select different resources,
  while intrinsic geometry remains outside network identity.

## 0.1.0-beta.7

### Minor Changes

- Align core and Vue provenance for the beta.7 private candidate. Core package bytes remain coherent
  with the Vue candidate. Vue replaces scalar Gallery URLs with responsive preview and full source
  objects, defaults full-image promotion to the mechanically current item, makes DOM guards safe
  across iframe and adopted-document realms, and certifies rapid overlay lifecycle cleanup. The lab,
  SSR, packed-consumer, browser-network, documentation, and API fixtures now exercise that contract.

## 0.1.0-beta.6

### Minor Changes

- Align core and Vue provenance for the beta.6 private candidate. Core has no runtime or public API
  change in this candidate. Vue renders mechanically settled Media Gallery descriptions, adds one
  optional no-prop `actions` slot inside the native modal, and keeps the expanded header bounded at
  narrow allocations. Its bounded native-dialog focus verifier also preserves an immediate keyboard,
  pointer, or application focus handoff across late browser cleanup without reclaiming focus after
  that handoff stabilizes or disconnects. A configured opener takes priority over focus assigned by
  native cleanup, while an immediate application handoff from that opener is preserved even when it
  precedes verifier registration. Stacked Deck now applies layout containment at its public root
  while preserving visible overflow, and gains exact frame-sampled narrow-consumer regression
  coverage for both directions.

## 0.1.0-beta.5

### Minor Changes

- Align core and Vue provenance for the beta.5 private candidate. Core has no runtime or public API
  change in this candidate. Vue preserves an accepted in-flight uncontrolled destination across a new
  unavailable controlled epoch and makes verified native-dialog focus return respect later legitimate
  keyboard, pointer, application, and overlay focus ownership.

## 0.1.0-beta.4

### Minor Changes

- Align core and Vue provenance for the beta.4 private candidate. Vue closes the remaining controlled
  authority-epoch, native-dialog focus-repair, and imperative Gallery navigation gaps, while docs and
  consumer proof clarify guarded ownership, nested-overlay support, package exports, and TypeScript
  handoff.

## 0.1.0-beta.3

### Minor Changes

- Correct the final private-beta authority and overlay lifecycle edge cases. Controlled acknowledgements
  now update rollback authority before motion can settle, controlled ownership handoff cannot accept a
  pending request, stale native dialog close events cannot finalize newer lifecycles, and Media Gallery
  normalization widens repaired base fields without losing literal IDs or consumer metadata.

## 0.1.0-beta.2

### Minor Changes

- Correct the pre-publication controlled-state contract. Component-originated selection and close
  events are now explicit requests, controlled semantic state remains prop-authoritative through
  ignored, delayed, or replaced requests, and rejected mechanics produce no false settlement or live
  announcement. Rename low-level nearest-anchor telemetry, align `navigateTo` vocabulary, make Media
  Gallery preserve the exact inferred item ID union through its full public surface, and strengthen
  packed TypeScript 6/7 consumer proof with library checking enabled.

## 0.1.0-beta.1

### Minor Changes

- Freeze the first public state contract around application-authoritative `activeId`, immediate
  semantic change events, later mechanical settlement, stable-ID Media Gallery routing, exact silent
  synchronization, shared navigation and close provenance, deliberate package entrypoints, and clean
  declaration reports. Upgrade repository TypeScript work to TypeScript 7 while using Vue Language
  Tools' supported TypeScript 6 bridge for SFC compilation and certify both consumer compiler lines.
