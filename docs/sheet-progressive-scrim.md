# Progressive Sheet scrim

Starting source: `80d9a8608084c47c2d2bcd202e6c21983a55c477`.

The fixed 240ms opening / 180ms closing fade finished independently of the panel. It also gave
every physical snap the same dimming. The new product requirement keeps spatial detachment and
makes opacity follow physical expansion instead.

`p = clamp(visiblePrimaryExtent / maximumEnabledVisibleExtent, 0, 1)`

`opacity = maximumScrimOpacity * p * p * (3 - 2 * p)`

The default maximum remains 0.56. At 0%, 25%, 50%, 75% and 100% expansion, opacity is respectively
0, 0.0875, 0.28, 0.4725 and 0.56. Invalid or zero geometry yields zero. There is no rounding,
timer, opacity transition, new dependency or public API. Hidden overshoot is offscreen travel and
does not count as expansion. Spring overshoot clamps at the maximum.

Both Sheet and the advanced composable use this calculation. Drag reversal changes opacity on the
same state update. An interrupted spring retains its current position and therefore its opacity.
Partial physical snaps dim less. Equal physical snaps and unrelated descendant state retain the
same opacity. The closed lifecycle is explicitly transparent, including immediate host handoff.
Reduced motion uses the existing panel authority and has no independent scrim animation.

The scrim remains a fixed sibling outside the panel transform, black in light and dark themes.
The accepted top spring remains stiffness 360, damping 38, mass 0.9, rest speed 12 and rest distance
0.5. No pointer ownership, focus, card state, release policy or panel trajectory changes are included.

Regression coverage includes physical exposure across four sides, hidden travel, partial/equal
snaps, overshoot, drag reversal, interruption, reduced motion and browser opening/closing traces.
Trace assertions compare opacity with the frame's physical extent rather than elapsed time.
