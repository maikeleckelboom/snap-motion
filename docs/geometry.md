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

Stacked deck is a separate presentation topology, not a tighter configuration of the Coverflow
rail. It reuses `createCoverflowGeometry`, `useCarouselMotion`, and one live physical position, but
projects the complete card set through `resolveStackedCoverflowFrame`. The rail resolver remains
unchanged: its steep side rails need a permanent clearing, while the deck deliberately keeps large
screens closely overlapped at rest.

`resolveStackedCoverflowTuning` is the single responsive source for card size, projected side
position, virtual depth, yaw, far-stack convergence, visibility, material strength, and the passing
excursion. The wide profile settles the center near 60% of the stage width and projects immediate
neighbors near 75% of that apparent size. Medium and compact profiles enlarge the center relative
to the stage, narrow the exposed strips, reduce yaw and excursion, and hide far cards sooner.

### Tight rest, open pass, tight rest

For a pair fraction `t`, the resolver derives a bounded passing envelope:

```text
lane = 16 × t² × (1 - t)²
```

The lane is zero at both anchors, peaks at the midpoint, and has zero endpoint velocity. It moves
the outgoing and incoming cards slightly apart while their base horizontal travel remains
monotonic. The cards retain overlap throughout: the excursion reveals two independent screen edges
without recreating either the rail's empty corridor or a folded-sheet intersection. Reversal and
re-grab simply retrace the same scalar frame; no card owns a CSS transition or delayed timeline.

### Virtual depth is not paint order

Virtual Z determines projected scale, lift, veil, and local surface treatment. DOM paint order is a
separate explicit integer layer contract. `ownerIndex` crosses once through a symmetric
`handoffLower`/`handoffUpper` hysteresis band, so repeated reversal near the midpoint cannot chatter.
Every pose receives a globally unique layer, including during multi-item frame jumps. Paint owner,
live visual selection, settled semantic selection, and announcement ownership remain independent.

The outer card owns projected X/Y, projected scale, visibility, pointer eligibility, and z-index.
The inner screen surface owns its modest yaw, border edge, contact shadow, directional occlusion,
and neutral veil. The transform carrier stays fully opaque and filter-free. Only actually exposed
adjacent cards are interactive; the foreground card naturally intercepts covered neighbor regions,
and far or hidden cards have neither pointer eligibility nor a compositor hint.

Reduced motion keeps the same exact anchors and layering but flattens yaw, removes the passing
excursion and blur, softens depth/lift, and retains direct manipulation. It does not collapse the
cards into an unordered flat overlap.

## Responsive remeasurement

ResizeObserver, viewport resize, visual-viewport resize, orientation-style size changes, item-set
mutation, image decode, grid-policy changes, and lab-stage resizing all trigger the same semantic
remeasurement contract. Resize never restores a raw `offsetLeft` from an earlier layout.
