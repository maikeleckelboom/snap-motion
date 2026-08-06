# Geometry

## Coordinate convention

Horizontal carousels use track translation in CSS pixels:

- `0` places the track at its legal start.
- Negative position moves the track left and advances through logical content.
- `bounds.max` is `0`.
- `bounds.min` is the furthest legal negative translation.

Pointer deltas, release velocity, projection, anchors, Motion updates, diagnostics, and tests use
that sign convention without intermediate inversions.

Bounds are normalized so `min <= max`. Non-finite inputs are rejected. A track no wider than its
viewport has degenerate bounds `[0, 0]`.

## Fixed stages

One stage is one viewport-wide slide cell. The anchor for logical index `i` is
`-i * viewportWidth`, clamped into legal bounds. A child image never participates in this
calculation.

Media hierarchy is viewport → track → slide cell → media frame → media. The slide cell has an
explicit size and `min-inline-size: 0`; the media uses containment inside the frame. Intrinsic image
size, visual overflow, and child transforms cannot change the track extent or anchors. A future
zoom transform belongs below the track on the media layer.

## Paged grid

Items are grouped into explicit semantic pages of `rows * columns`. Each page is exactly one stage
wide and contains a CSS grid. For a stage width `W`, gap `G`, and `C` columns, cell width is:

```text
(W - G * (C - 1)) / C
```

Only the gaps between columns are occupied. A partial final page remains a full semantic page with
one deterministic anchor.

## Variable-width rail

Variable-width geometry accepts measured cell layout boxes `{ start, size }` in track-content
coordinates. It never measures descendants.

For start alignment:

```text
rawAnchor = startGutter - itemStart
```

For centered alignment:

```text
rawAnchor = viewportCenter - (itemStart + itemSize / 2)
```

The raw anchor is clamped into legal bounds before entering the controller. Several boundary items
may therefore share one physical position while retaining distinct IDs and logical order. Optional
visual gutters are explicit geometry inputs rather than gap corrections inferred later.

## Coverflow

Coverflow keeps the same scalar controller contract. `createCoverflowGeometry` builds equal-pitch
anchors at `-i * pitch`. Presentation maps live progress into a classic two-phase fan:

1. `|progress| ≤ 1` — card leaves the solid center face and parks in a side rail (`sidePeakX`,
   `maxRotateY`)
2. `|progress| > 1` — card stays angled and stacks deeper (`stackGap`, or the lower-level
   `stackGapX`/`stackGapZ`, plus `stackGapRotateY` and `stackGapScale`)

The center face stays fully opaque. Visual depth never feeds layout geometry.

Every card stays a whole rigid rectangle for the entire step. Nothing is revealed by clipping or
by width, so a mid-step frame reads as two solid panels trading the foreground rather than one
sheet folding down the middle. Three rules carry that:

- **Translation is literal, everything else is shaped.** `translateX` is linear in progress across
  the first pitch, so the stack sits under the pointer. Yaw, depth, and scale run through a
  smoothstep, and `flatZone` holds yaw at zero through the central band so the focused face reads
  as magnetically stable without decoupling from the gesture.
- **Every channel is monotonic.** A card that is approaching only approaches; a card that is
  leaving only leaves. This is the difference between motion that reads as an object moving and
  motion that reads as values being animated, and it is easy to lose: separating the rails with a
  multiplier peaked at `|progress| = 0.5` works perfectly in a still frame but makes an incoming
  card back away ~40px before it comes forward — a visible hitch at the start of every transition.
- **The rails never mirror where they overlap.** Two panels at `±0.5` would otherwise be exact
  mirrors, and mirrored panels meeting mid-overlap intersect along their shared centre line, which
  is the folded-sheet read. `crossoverBias` and `crossoverYawBias` skew the rails apart as an
  **exponent** on the shaped depth and yaw. `x ** k` is monotonic, so the skew costs nothing in
  smoothness, and `1 ** k === 1` returns both rails to the same place at every resting slot, so a
  settled fan stays symmetric with no envelope needed. Keep the yaw skew well under the depth
  skew: yaw pushes a panel's near edge toward the camera by `width / 2 × sin(yaw)`, and if that
  overtakes the depth separation the receding panel pokes through the one in front.
- **One depth-order handoff.** `zIndex` is derived from the same biased depth the transform
  describes, so a flattened consumer and a `preserve-3d` renderer agree on which panel is in
  front, the pair never ties, and the foreground changes hands exactly once per step.

### The rail is specified in projected pixels

`sidePeakX` describes where a card lands **on screen**, which is not where a `translateX` puts it.
A card at `translateZ: -300` under a 900px camera arrives at 75% of its nominal X, and the next
slot back arrives at 64% — so uncompensated offsets shrink toward the vanishing point and the rail
collapses into a pile of slivers behind the focused face, however large the numbers look in the
source. Neighbouring panels then butt edge-to-edge at matching heights, which is what makes a stack
read as one folded object rather than several at different distances. Adding depth alone makes it
worse, not better, because stronger perspective pulls harder.

Pass `perspective` — the same value the stage uses — and the rail travel is pre-divided by the
foreshortening it is about to go through, so a parked slot lands exactly where it was asked to:

```
travelX = railT × sidePeakX × (perspective - railDepth) / perspective
```

The focused face sits at zero depth, so this is a no-op exactly where drag is felt: projected X
stays linear in progress across the first pitch. Compensation applies to the _travel_ only — the
stack behind it is left to converge, because a real stack does narrow as it recedes and forcing
even on-screen spacing all the way back would flatten the very cue the depth is there to give.

### The parked rail is a plane

`stackGapX` and `stackGapZ` are independent, which lets a stack drift off the surface its own yaw
describes. Cards parked at 40° but arranged along a line that dives back four times steeper than
they are tilted cannot read as parallel panels however carefully each one is drawn — they read as
a scatter. `stackGap` replaces both with one number: the spacing between successive cards measured
along the rail plane's own normal, the way a stack of records in a crate is spaced.

```
stepX = stackGap × sin(maxRotateY)
stepZ = -stackGap × cos(maxRotateY)
```

Every card in the rail then shares one angle and one spacing (set `stackGapRotateY` to `0` — a
stack of parallel panels is what rigid panels do), and the only thing narrowing the rail on screen
is the projection, which is exactly what should be narrowing it.

### The crossing pair must not touch

Because travel is linear, the two crossing panels sit exactly one projected `sidePeakX` apart for
the whole step — the separation is constant, so whatever relationship they have at the midpoint
they have throughout. That makes `sidePeakX` the single most consequential number in the fan.

Set it below a card's _foreshortened_ width and every panel butts against its neighbour: the fan
tiles the stage edge to edge, no background shows between any two cards, and the result reads as a
concertina rather than as separate objects — regardless of shading, shadows, depth ordering, or how
rigid each panel is. This is the failure the whole model is built to avoid, and no amount of
material cueing rescues it, because the eye is reading continuity of surface, not lighting.

Set it above that width and the focused face sits in a clearing. The crossing pair never touches,
so there is no seam to misread, and a steep `maxRotateY` helps twice over: it foreshortens parked
cards into narrow slivers, which both widens the clearing and sharpens the distinction between the
face being read and the stack behind it. A few pixels of visible background between the focused
card and its neighbour is enough; the margin only has to stay positive across the whole step. `depth`, `yaw`, `edgeStrength`, and `edgeSide` are reported alongside the transform so consumers
can drive side-surface thickness, directional lighting, and depth-dependent shadows off the same
geometry. Those are finishing cues, not structure — they make coherent geometry look like material,
and cannot make incoherent geometry look like anything.

## Stacked deck

The deck is a physical pile with one authoritative top card and at most three restrained backing
layers. It reuses `createCoverflowGeometry` and `useCarouselMotion` only for generic scalar gesture,
constraint, velocity, and settlement mechanics. It does not reuse the rail renderer. No card is
assigned a horizontal slot from its index.

`resolveStackedDeckTuning` owns responsive card size, motion pitch, compact backing offsets, and the
one-anchor exchange geometry. `resolveStackedDeckTraversal` consumes the controller phase, settled
index, and continuous physical index. It retains the current visual top, completes every crossed
anchor in order, and exposes only the residual adjacent segment. `resolveStackedDeckFrame` projects
that segment into `top`, `target`, `backing`, or `hidden` roles. No active segment can have a
non-adjacent target.

### Direct screen-space mapping

Carousel anchors use `position = -index * pitch`, while an LTR pointer drag writes its screen-space
delta directly into controller position. The deck therefore derives:

```text
physicalIndex = -controllerPosition / pitch
signedLocalDistance = physicalIndex - segmentOriginIndex
topCardX = -signedLocalDistance * motionPitch
```

For this deck `motionPitch` is the same pitch used by the controller, so away from elastic bounds
`topCardX` equals pointer delta exactly. A left drag produces negative card X from the first
meaningful movement; a right drag produces positive card X. At an outer bound, the controller's
existing nonlinear elasticity reduces the physical delta and the same equation projects that
reduced movement without inventing a target.

The two directions share this equation and one restrained secondary arc. Rotation, vertical lift,
scale recession, and shadow attenuation are deterministic functions of local progress. The top
card remains opaque and above the target until the handoff, so visible metadata cannot lag behind a
visually dominant target. Reduced motion preserves direct translation and removes the secondary
arc.

### Segment handoff and reversal

`visualTopIndex` is history-bearing presentation state. While physical index stays within one pitch
of it, the same card remains on top and the signed residual chooses the adjacent target underneath.
At a complete pitch the target is already at exact top-card rest geometry and the former top is
removed from the active frame. Visual ownership then advances one anchor, and any residual physical distance
immediately opens the next adjacent segment. A programmatic `0 -> 4` controller animation is thus
rendered as `0 -> 1`, `1 -> 2`, `2 -> 3`, and `3 -> 4` without intermediate `moveTo()` calls or idle
states.

Reversal uses the same signed residual. Before a handoff, progress simply retraces to zero. After a
handoff, movement first retraces the new top toward the previously crossed anchor; crossing that
pitch transfers visual ownership back. Direction can change only through an exact neutral state at
the current visual anchor. Re-grabbing, wheel input, fast flicks, and programmatic movement all use
the same controller position and traversal resolver.

### Visual and accessibility invariants

At rest only one semantic card is current and interactive. Backing instances are hidden from the
accessibility tree and expose only small translated edges; non-participating cards never cross the
stage. During motion, visible caption, counter, pagination emphasis, and `aria-current` follow the
visual top only after a completed handoff. Durable selection remains unchanged until controller idle,
inspection stays disabled, and the live region announces only the final settled card. At idle the
visual top and settled index must agree exactly.

The clipped decorative backdrop is a sibling of the card stage, never an ancestor. The viewport and
stage allow intentional render bleed, while page-level horizontal containment prevents document
overflow. Responsive card width and pitch keep the dominant part of a one-pitch exchange within the
stage; a card may approach or leave the screen edge only late in an exchange, never against an
internal rectangular clip. Compact, medium, wide, and reduced-motion profiles preserve the same
role topology and exact settled anchors.

## Responsive remeasurement

ResizeObserver, viewport resize, visual-viewport resize, orientation-style size changes, item-set
mutation, image decode, grid-policy changes, and lab-stage resizing all trigger the same semantic
remeasurement contract. Resize never restores a raw `offsetLeft` from an earlier layout.
