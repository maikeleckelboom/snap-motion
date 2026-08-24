---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Add the opt-in `exchange="direct"` Stacked Deck presentation while preserving Shuffle as the exact
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
