---
"@snap-motion/vue": patch
---

Make Sheet respond at the physical edge by reducing default hidden overshoot from 160px to 1px,
and preserve rendered momentum when an active opening, closing or snap animation is retargeted.
Existing custom hidden overshoot remains supported. This also moves the default dismissal midpoint
and scrim normalization to the new hidden anchor; open snaps and intrinsic geometry are unchanged.

Preserve native body scrolling when reopening during dismissal. Make the current snap available
when focus enters the body, including early keyboard traversal and custom initial focus, and reveal
the focused control within the native body scrollport without consumer animation or scroll repair.
