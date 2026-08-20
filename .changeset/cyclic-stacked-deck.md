---
"@snap-motion/core": minor
"@snap-motion/vue": minor
---

Make Stacked Deck a cyclic physical ring. Relative pointer, wheel, keyboard, and imperative
navigation now exchange exactly one directed neighbour across every semantic ordinal, while named
non-adjacent destinations continue to synchronize directly. Direct and Shuffle retain distinct
choreography over the same canonical ring order, including explicit two-item direction and atomic
local-coordinate rebasing.

Remove Stacked-Deck-specific pagination state and presentation. Generic pagination and finite
ordinal accessibility announcements remain available to the surfaces that own them.
