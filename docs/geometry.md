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
two exchange excursions. `resolveStackedDeckFrame` receives an explicit transition containing the
settled index, outgoing index, incoming index, direction, phase, and progress. It returns `top`,
`outgoing`, `incoming`, `backing`, or `hidden` roles. Render order follows those roles and stays
constant throughout visible overlap; it is never recalculated when progress crosses a scalar
threshold.

### Committed state and transient roles

The settled index is the sole authority for caption, pagination, current-item semantics, focus, and
inspection. The transition's `fromIndex` remains that settled index until the controller reaches the
target and becomes idle. `toIndex`, progress, and phase describe only the transient compositor.
Cancellation therefore reverses the same exchange back to the settled card, while completion
commits the target exactly once. A re-grab or a second command starts from the rendered physical
position; it does not reconstruct an idle deck from semantic state.

### Forward exchange

The target begins as the first backing card directly beneath the top card. It rises by only the
existing backing offset and scale. The outgoing card keeps the upper layer for the entire exchange,
peels laterally with restrained lift and rotation, and accelerates away only after the target is
established beneath it. The incoming card never travels from a side rail. It is revealed at the pile
center and becomes the top card only after settlement. The outgoing card becomes transparent only
after it has left meaningful overlap, then returns to the back of the cyclic pile while fully
concealed. The two faces never dissolve through one another.

### Backward retrieval

The previous card is retrieved from behind rather than evaluated as a mirrored slot. It begins fully
clipped, owns one uninterrupted upper exchange layer while visible, emerges around the leading edge
of the pile, and settles at center. The current card continuously settles onto the first backing
layer beneath it. Because the retrieved card is concealed at the instant its exchange role is
assigned, no visible overlap ever changes paint ownership.

### Visual and accessibility invariants

At rest only one semantic card is current and interactive. Backing instances are hidden from the
accessibility tree and expose only small translated edges; non-participating cards never cross the
stage. During an exchange both visual participants remain non-interactive and only the settled card
retains current-item semantics. Compact, medium, wide, and reduced-motion profiles preserve the
same role topology and exact settled anchors. Reduced motion removes exchange rotation and shortens
displacement without creating an alternate state or competing full-size face.

## Responsive remeasurement

ResizeObserver, viewport resize, visual-viewport resize, orientation-style size changes, item-set
mutation, image decode, grid-policy changes, and lab-stage resizing all trigger the same semantic
remeasurement contract. Resize never restores a raw `offsetLeft` from an earlier layout.
