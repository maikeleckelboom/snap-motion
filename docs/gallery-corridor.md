# Physical gallery corridor

Beta.13 pruned slots based on visibility at allocation time while dragging could cross the whole
numeric span of the remaining coordinates. Retaining an off-screen mechanical anchor at zero and
an incoming item at three allowed an entirely empty viewport between them. Destination placement
could also skip an empty coordinate while stepping past the current viewport.

## Real component witness

The unchanged runtime at `1b3ad691036fee082f7b891b06c8ae70a9b7afb4` fails the controlled component
regression with six 800px-wide fitted items. All commands use the public `navigateTo` handle.
Swipes dispatch pointerdown, move and up. No operation reaches settlement.

1. Command item 3.
2. Reverse swipe by 0.50 viewport.
3. Command item 4 and start its scheduled animation frame.
4. Advance the controlled animation by 65ms.
5. Command item 1.
6. Reverse swipe by 0.25 viewport.
7. Forward swipe by 0.75 viewport.
8. Start the pending animation and advance it by 60ms.
9. Reverse swipe by 0.75 viewport.

During the last move, the rendered track is at `-1567.895px` and the mounted positions are 0, 3
and 4. None intersects the viewport. Pointer mode is swipe, navigation is valid and no `settled`
event has fired. The supplied numeric replay finds the same physical hole with different partial
travel fractions. Its spatial fractions are not animation durations.

## Coverage invariant

For normalized presented position `p = -offset / viewportWidth`, a slot has a visibility interval
centered at `position + pan / viewportWidth`, with radius
`(1 + fittedWidth * scale / viewportWidth) / 2`. Fitted width comes from contain geometry.
Only the mechanical image receives the scale and pan. Other images remain fitted.

Allocation preserves the coordinate of every intersecting keyed image. Those intervals contain
the current position, so their union is connected. Off-screen destination, mechanical and
presentation owners are placed at the corridor edges. Fitted centers stay at least one pitch
apart. Their visibility radii exceed half a pitch, so adjacent intervals overlap. A transformed
anchor uses its actual extent when joining the corridor. Placing new owners beyond the physical
extrema also prevents coordinate collisions.
The resulting union covers the current position, both physical extremes, and every intermediate
position. New coordinates extend beyond the retained physical extrema by at least one pitch,
including ordinary immediate neighbors. Drag limits, elastic edge behavior, animation duration
and settlement authority are unchanged.

The eight-slot bound follows from at most three intersecting fitted slots, one transformed anchor,
and the destination, presentation owner and two destination neighbors. An off-screen mechanical
anchor consumes the same reserved anchor slot. Duplicate semantic items are omitted. New fitted
slots extend outside the physical coordinate extrema, preserving their one-pitch minimum separation.
This bound does not depend on collection size, semantic distance or interruption count.

## Regression ownership

The component regression samples every command, takeover, pointer move, release and controlled
return frame. Its zoom/pan variant adds a scaled, panned mechanical return after compounded fitted
reversals. Existing synchronization, cancellation, return, controlled-authority and 300-retarget
tests remain in the same suite.

The pure state-space regression exhausts four-operation compositions for 2, 3 and 6 items under
full-width fit, narrow fit and both extreme pan directions at scale four. It includes all command
targets, two partial travel fractions, takeover, short return gestures and opposite qualifying
swipes. An independent interval-union oracle checks the entire reachable span after each allocation
and movement, plus uniqueness, destination ownership, visible coordinates and the eight-slot bound.
The oracle explicitly rejects the immutable beta.13 sparse witness.

The browser regression uses the real gallery fixture, public programmatic commands, native mouse
gestures and real CSS. It samples each animation frame and each of twelve pointer movements per
gesture. Coverage uses decoded, painted image bounds corrected for `object-fit: contain`.
Takeover additionally requires the same visible image nodes, physical coordinates and rendered
positions. Chromium, Firefox and WebKit run the same compounded reversal and mechanical return.
