# Studio Deck composition and settlement review

## Decision

The Studio owns the cross-region intrusion. Active Study is now an opaque foreground region in
the workspace's stacking context. Comparison retains visible overflow and its own stacking context;
cards travel behind the inspector's existing divider. The same ownership protects the inspector
below Comparison in the narrow layout. No card, shadow, transform, input lifetime, collection,
controller, preset or package API changes. No package changeset is needed.

This is deliberate spatial occlusion, not an invisible Deck animation tail or a change of a body's
visibility at an arbitrary progress. A partially exposed card stays partially exposed and continues
moving. Its edge passes progressively behind the foreground surface, and can re-emerge from there.
The boundary is straight because the existing workspace divider is straight. Whether that foreground
reading is aesthetically preferable to a larger motion stage remains a human design judgment.

Backward Shuffle retains its exact-rest correction. It is subpixel with the supplied presets in the
sampled cases, not mathematically zero. This review does not claim a settlement fix or universal
perceptual invisibility. Large valid custom rest thresholds can make the correction more apparent.

## Original evidence and ownership

The original ignored evidence is under `.artifacts/playground/deck-reconfiguration/evidence/` in
the primary checkout. The 1280px recordings live in `sequences/video-after-chromium-1280-{shuffle,direct}/`.
The frame at 2.79 seconds shows Relay over the inspector's actions, attributes and media. Importantly,
this is also a **surviving card yielding the front during re-addition**, not just a removed departure.
Restricting a fix to `.snap-motion-stacked-deck-exit` would miss it and ordinary exchanges.

A fresh 1280px sample measured the inspector's right edge at x=535.08, the Comparison stage at
x=568.08 with width 648.91, and a 402px untransformed card. During re-addition Relay's transformed
body occupied x=285.25 through 650.81, y=347.36 through 594.20. Its centre offset was -424.50px,
scale 0.86535 and rotation -5.025 degrees. Arc occupied x=708.06 through 1077.00. The original
workspace assigned no foreground paint ownership to the adjacent inspector. The isolated Deck's
positive card layers therefore painted above the earlier sibling, despite both regions having
correct layout boxes and despite departures being inert.

A separating-axis calculation on those actual rotated/scaled rectangles gives a minimum horizontal
centre separation of 367.25px from the two other bodies (without a shadow safety margin). That
would place Relay's left edge at 342.50px, still 192.58px inside Active Study. The conservative route
has spare clearance, but eliminating that spare clearance cannot eliminate this intrusion.

| Alternative                | Assessment                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shorter lateral route      | At that frame the disjoint horizontal body bounds leave about 57px spare clearance. Recovering that space still leaves roughly 193px of intrusion. Tightening a conservative all-pile bound cannot solve the composition. Changing the route vertically or making it host-directed would be a new choreography contract.                                                                        |
| Smaller/right-shifted Deck | Can reserve more left clearance, but shrinks or displaces the resting pile in the approved editorial composition. Reserving both lateral routes needs roughly twice the current stage width at the measured scale. The adapter also has a 320px minimum tuning width, so shrinking the host does not solve 320px presentation. Unbounded held-pointer reach still needs a composition boundary. |
| Clip the Deck stage        | Rejected: its box is smaller than the necessary exchange route and would sever cards inside Comparison.                                                                                                                                                                                                                                                                                         |
| Foreground inspector       | Selected: the host defines which work surface may cover which. It preserves card geometry, physical occlusion within the pile and all responsive allocation. It adds no measurement, animation or input machinery.                                                                                                                                                                              |

The chosen boundary can occlude a cast shadow as well as a body. Shadows remain free beyond the
resting pile elsewhere in Comparison. On narrow screens the viewport still limits lateral viewing,
as before; this change adds no new lateral clipping edge. The inspector below remains protected.

## Visual contract and oracle

`studio-deck-reconciliation.spec.ts` now runs both exchanges at 1280, 1440, 390 and 320px in all three
Studio browser owners. Existing per-frame identity, arrival, paint-order, shadow and inert-shell
assertions remain intact. The added raster oracle exercises forward, remove-current, re-add and
backward travel at outbound, crossover and return samples.

For each frozen frame it photographs the occupied inspector, then photographs the **same frame**
with card paint made effectively transparent. The inspector pixels must be identical. The Deck's
composited surfaces remain alive: `visibility:hidden` was found to change Chromium's inspector
text antialiasing, an invalid counterfactual. The comparison excludes one fractional edge pixel
beside the divider, not inspector content. Images are decoded before sampling. Desktop cases also
require a transformed card bound to cross the inspector, so the test cannot pass simply because
the motion never reached the boundary. The rectangle is only an exposure prerequisite; actual
paint, not bounding-box containment or hit testing of inert shells, decides acceptance.

The test also checks pointer ownership at every inspector button centre and keyboard focus on
Details. The existing trace suite covers removals behind the current item, rapid remove/re-add,
3-to-2-to-1-to-2 transitions, held-pointer cancellation and mutation during an exchange. The unchanged
package reconciliation tests own captured departures, interrupted routes, midpoint safety and the
same-timestamp clock guard. Reduced motion retains immediate canonical adoption.

The frozen clock is installed before application startup. Initial oracle experiments exposed
thumbnail-only Firefox differences outside the Deck's reach: two image pixels in one case and
307 hover-border pixels in another. The harness now installs the clock before startup, decodes
images, and parks the pointer outside the crop before scrolling so hover cannot change between
counterfactual captures. Both affected narrow cases passed three focused repetitions. Earlier
failed experiments are retained in the ignored evidence, not counted as successful certification.

An additional three-engine stress case starts Shuffle, removes the moving current card, removes
another card, switches the shared mode to Direct, re-adds the departing Arc, removes Relay while
other departures remain, restores a second member and navigates when available. Its retained frame
trace must satisfy the same continuity, paint-order, visibility and inertness assertions.

## Settlement findings

Browser evidence records controller position, velocity, spring thresholds, physical index, every
pose channel, paint rank, computed transform and `will-change`, then captures PNGs after each
explicit 16ms browser step. The final moving frames, the exact rest frame and three idle raster
frames are retained. This separates a rendered sample from a controller notification; no post-rest
reconstruction is substituted for an intermediate screenshot.

With Balanced at 1280px, the final sampled controller distance is 0.68077px and speed is 11.81394px/s.
Both exceed the 0.6px / 10px/s rest thresholds on that frame; the next integration step satisfies
them and adopts the anchor. Rebased controller coordinates at rest must not be subtracted from the
previous coordinate without accounting for the anchor rebase.

Backward's destination card approaches rest with approximately -0.681px translation; rotation,
scale and vertical translation also converge continuously. Forward has a much smaller endpoint
pose derivative. Direct's presentation has already reached essentially canonical geometry.

Chromium, 1280px, DPR 1, last moving raster to exact rest (body includes its edge; shadow is a
32px band below it):

| Preset / Shuffle direction | Maximum body channel delta | Mean body delta / 255 | Body pixels above 16 | Maximum shadow delta |
| -------------------------- | -------------------------: | --------------------: | -------------------: | -------------------: |
| Tight forward              |                         11 |                 0.103 |                    0 |                    9 |
| Tight backward             |                        117 |                 1.134 |                2,370 |                   15 |
| Balanced forward           |                         12 |                 0.118 |                    0 |                   10 |
| Balanced backward          |                        137 |                 1.323 |                2,612 |                   16 |
| Heavy forward              |                         11 |                 0.108 |                    0 |                    9 |
| Heavy backward             |                        125 |                 1.205 |                2,513 |                   16 |
| Loose forward              |                         84 |                 1.024 |                2,397 |                    2 |
| Loose backward             |                         92 |                 0.891 |                1,811 |                    2 |

The body region contains 102,870 pixels. Balanced backward changes above 16 are about 2.54% of it;
the maximum alone exaggerates the area affected. Three subsequent idle images are identical in
both body and shadow regions. The front card retains its paint rank and promotion. Shadow strength
is already effectively 1; the shadow raster moves with the body. This is the expected physical
anchor correction through a finite-slope projection, not an independent shadow or compositor jump.

The audit also samples all four presets in Firefox at 1280/DPR1 and Chromium and WebKit at
390/DPR2. The same physical correction has different edge raster deltas (Balanced backward maxima
178, 192 and 202 respectively); idle body and shadow remain pixel-identical. These are automated
desktop engines and emulated DPRs, not physical-device or perceptual-study certification.

Two valid custom Balanced variants were tested through the actual tuning controls: rest distance
0.1 / speed 5, and distance 5 / speed 20. The last backward translations were approximately 0.110px
and 1.485px. The larger setting visibly permits a larger correction. It is not honest to certify
every valid custom threshold as imperceptible. Lowering global thresholds was not used as a fix.
A second finishing spring would add lifetime and input races; remapping the endpoint would change
the relation between the existing physical state and the drawn card. Neither is justified solely
by a maximum raster delta. For the supplied presets the measured subpixel correction is retained
as the existing rest contract; normal-speed perceptual acceptance remains explicitly reviewable.

## Evidence and verification

New recordings, frozen PNGs, traces, failed-oracle counterexamples, scripts and measurement logs
are local ignored artifacts under `.artifacts/deck-review/` in the isolated worktree. The
`composition-{before,after}-chromium-{1280,1440,390,320}-{shuffle,direct}` directories contain real-time
recordings and per-frame traces. The before server is the original verified Studio checkout.
`before-1280-shuffle.webm`, `after-1280-shuffle.webm` and their `-slow.mp4` counterparts provide
normal and quarter-speed review. `before-chromium-1280-1`, `after-reference-chromium-1280-1`,
`after-firefox-1280-1`, `after-chromium-390-2` and `after-webkit-390-2` hold frozen settlement frames;
`after-chromium-1280-1` holds the two custom configurations. `raster-summary.json` identifies the
exact image pair for each comparison. Evidence remains local; it is not a public benchmark.

## Performance

Three paired Chromium samples at 1280px on this Windows host, using the same Vite development
runtime and 24 remove/re-add mutations per sample, produced the following medians. They are local
diagnostic comparisons, not production or device guarantees. Trace instrumentation and allocation
sampling are enabled in both cases. Some evidence encoding overlapped the early samples; these
numbers should not be used to claim a speed improvement.

| Metric                                                  |         Before |          After |
| ------------------------------------------------------- | -------------: | -------------: |
| rAF p95 / worst                                         | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| Frames above 33.4 ms                                    |              0 |              0 |
| Mutation through Vue microtasks                         |         5.6 ms |         5.2 ms |
| Explicit `getBoundingClientRect` calls during mutations |              0 |              0 |
| Layout count / style recalculations                     |       61 / 747 |       61 / 747 |
| Layout work, cumulative                                 |       35.22 ms |       35.68 ms |
| Script work, cumulative                                 |      113.82 ms |      137.80 ms |
| Paint work, cumulative                                  |    1,425.59 ms |    1,302.53 ms |
| Raster task work, cumulative                            |      857.45 ms |      915.90 ms |
| Peak page compositor layers                             |             55 |             56 |
| Promoted Deck bodies after mutations                    |              3 |              3 |
| Sampled allocation bytes                                |        236,340 |        270,056 |

The host foreground adds one compositor layer in these Chromium samples. This is a real cost;
the CSS change adds no JS allocations, readers or listeners, and explicit Deck promotion stays
bounded at three bodies. Sampled allocations and script timing vary between runs and include the
development runtime and test driver. After garbage collection, every run went from 4,115 nodes /
428 listeners to 4,114 / 427; retained heap rose about 0.07-0.12 MB across twelve cycles. No growing
shell or listener inventory was observed. This is bounded retention evidence, not a heap-leak proof.

## Gate record

The focused three-engine suite completed with 55 passes and its two existing Chromium-only skips.
The additional combined interruption case passed in all three engines; the two affected narrow
paint cases passed three focused repetitions each after the hover correction. No assertion or
individual test timeout was weakened. Static, unit, API and packed-consumer checks are part of `pnpm verify`.

The first remote run failed its Chromium general owner because the existing Lab Gallery scroll
restoration test read `overflow: hidden` after native close but before the queued `close` handler
completed; its automatic retry passed and the no-flakes policy correctly rejected the job. The
Studio is not mounted in that test. The readiness correction in `coverflow-gallery.spec.ts` waits
for the same exact original scroll styles with `expect.poll`, because native focus return and
invisibility do not prove that the component's close handler has completed. No Gallery, View
Transition or Coverflow implementation changed. The original failure remains in
`ci-general-evidence/` and `ci-chromium-general.log`; a retry is not presented as a clean first run.
The corrected assertion passed five repetitions in each engine (15 total); Firefox and WebKit
used a local focused configuration because this Lab spec's regular owner is Chromium.

The same run exhausted the WebKit Studio job's six-minute budget at test 66 of 68, with no
assertion failure. Its eight new paired-raster tests took about 90 seconds on two workers. Only
that owner's job budget increases to eight minutes; general owners, worker counts, individual
test deadlines and all visual assertions remain unchanged. The cancellation and progress are
retained in `ci-webkit-studio.log`.

The local delivery record `.artifacts/deck-review/gates.md` identifies aggregate command outcomes
and the CI run for the delivered branch head. These bounded visual and performance measurements
do not substitute for the repository's full gate or exact-head CI. The branch is delivered for
review, without merging, deploying or publishing a package.
