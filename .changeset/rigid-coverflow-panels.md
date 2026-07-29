---
"@snap-motion/core": minor
---

Rebuild the coverflow presentation model around a physically coherent stack.

**`perspective`** makes `sidePeakX` mean projected pixels rather than pre-perspective model units.
Without it, depth silently eats the rail: each receding slot is pulled toward the vanishing point
faster than the gaps push it outward, so the stack collapses into a pile of slivers behind the
focused face and neighbouring panels butt edge-to-edge — the fan reads as one folded object rather
than several panels at different distances, and adding depth makes it worse rather than better.
Compensation applies to the rail travel only, leaving the stack behind it free to converge the way
real depth does. The focused face sits at zero depth, so drag stays 1:1 on screen.

**`stackGap`** replaces the independent `stackGapX`/`stackGapZ` with one number: the spacing
between parked cards measured along the rail plane's own normal. Independent offsets let the stack
drift off the surface its own yaw describes — cards tilted 40° but arranged along a line diving
back four times steeper cannot read as parallel panels. Both offsets are now derived from the
parked angle, so every card in a rail is genuinely parallel and genuinely evenly spaced.

**`crossoverBias`/`crossoverYawBias`** skew the two rails apart as an exponent on the shaped depth
and yaw instead of as a multiplier peaked mid-step. Mirrored panels meeting mid-overlap intersect
along their shared centre line, so some separation is needed — but a peaked multiplier makes an
incoming card back away roughly 40px before it comes forward, a visible hitch at the start of every
transition. `x ** k` is monotonic, so every channel now moves one way only, while `1 ** k === 1`
still returns both rails to the same place at every resting slot.

Also: translation tracks the pointer across the first pitch while yaw, depth, and scale stay
shaped; `flatZone` holds the focused face frontal; paint order is derived from the same skewed
depth the transform describes, so flattened and `preserve-3d` consumers agree and the foreground
changes hands exactly once. Adds `stackGapRotateY` and `stackGapScale`, and reports `depth`, `yaw`,
`edgeStrength`, and `edgeSide` for orientation-dependent side edges, directional lighting, and
depth-dependent shadows.
