---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Make Stacked Deck a cyclic physical ring. Relative pointer, wheel, keyboard, and imperative
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
