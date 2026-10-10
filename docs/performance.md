# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |   Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | ------: | ---------: | ------------------: |
| Core              |  47,441 |     13,500 |     47,500 / 13,500 |
| Vue root          | 130,814 |     33,394 |    132,000 / 33,500 |
| Vue carousel      |  38,418 |     10,877 |     52,000 / 15,000 |
| Vue Coverflow     |  48,952 |     14,348 |     49,750 / 14,600 |
| Vue Stacked Deck  |  50,873 |     14,885 |     51,250 / 15,000 |
| Vue sheet         |  50,216 |     14,186 |     51,000 / 14,500 |
| Vue dialog        |  11,786 |      3,891 |      12,500 / 4,100 |
| Vue media gallery |  53,873 |     14,323 |     60,000 / 16,000 |
| Vue motion        |  10,771 |      3,551 |      16,000 / 5,500 |
| Base CSS          |  26,802 |      4,624 |      27,000 / 5,000 |

The performance-budget files run once through `pnpm test:unit`. They cover 60/120-sample drag
streams, repeated interruption, 1/20/100/1,000 items, bounded render windows, simultaneous
instances, resize/mutation storms, wheel coalescing, reactive publication counts, playback disposal,
and listener cleanup.

Package byte budgets do not stand in for media-transfer budgets. `MediaGalleryDialog` defaults to
`current-only`: while closed it renders no images, while open it mounts current and adjacent preview
sources and exactly one full source for the current item. One adjacent move removes the stale full
layer and promotes the newly current full source. `adjacent-full` is an explicit measured opt-in.
Browser request coverage guards this policy, including retry isolation and rapid-navigation cleanup.

Responsive candidate choice and transfer bytes remain host-owned because the package does not know
the consumer's encoded assets, layout allocation, cache state, or device-pixel ratio. A dogfood
consumer must measure requested URLs and encoded transfer at representative widths and DPRs, then
record budgets for initial open and one adjacent move. Do not infer those results from `srcset`
markup or `fetchpriority` alone.

The segment-local stacked-deck traversal and frame resolvers fit under the core ceiling. Both hot
paths mutate caller-owned storage, perform no DOM measurement, and allocate no arrays or sort keys.

The configured ceilings are regression boundaries, not targets. Direct keeps the established core
and Vue minification strategies and must fit those existing ceilings through implementation scope,
not a bundler switch. Packed TypeScript, runtime, browser, Router, and Nuxt consumer gates verify the
emitted bindings. The tight unchanged base-CSS margin remains a useful regression signal rather than
a reason to widen an unrelated budget.

`applyEnvelopeElasticity` takes its active sides as scalars rather than an options object, so the
per-pointermove constraint path allocates nothing. Stacked Deck intentionally keeps one persistent
shell and one `#card` subtree per item. Its DOM, frame projection, and style updates are therefore
linear in item count. The high-level component does not observe the advanced `pileLayers` projection,
so it does not also allocate that array each frame; custom composable consumers pay that linear cost
only when they observe it. Explicit `will-change: transform` promotion is bounded to the exchanging
pair while moving and returns to zero cards at rest, avoiding one forced GPU layer per parked shell.
Direct keeps one shallow presentation object and one authoritative frame. Interruption replaces that
object after capturing the current resolved poses; there is no presentation queue. Its optional
two-axis callback returns before presentation mutation for Shuffle, so raw-vector samples do not add
a second Shuffle frame invalidation beyond the shared scalar gesture update.

This is a small-deck physical model, not virtualization. There is no arbitrary hard item cap, but
large collections retain the full slotted content and update every shell pose. Consumers using more
than a compact card set should profile their real content, memory, paint, and input latency instead of
assuming the bounded promotion count makes the whole surface constant-cost.

## Manual profiling

For real 60/120 Hz certification, use a physical 120 Hz display and Chrome/Firefox performance
tools. Record main-thread long tasks, layout reads, Vue updates, retained listeners, and active Motion
playback while dragging, interrupting springs, resizing, opening dialogs repeatedly, and exercising
an intentionally large Stacked Deck. Update architecture only when traces show unnecessary
frame-level reactive work.

## Product-polish comparison

Measured from production builds on the same Windows host, Chromium, 390 × 844 touch viewport,
median of five cold contexts per CPU setting. Baseline is the completed Playground before polish;
after includes the five original SVG screens and the new public Grid/Sheet presentation.

| Metric                         |           Before |            After |
| ------------------------------ | ---------------: | ---------------: |
| FCP / LCP, native CPU          |     200 / 200 ms |     200 / 272 ms |
| Blocking time, native CPU      |            98 ms |           105 ms |
| FCP / LCP, 4× CPU slowdown     | 1,176 / 1,176 ms | 1,728 / 1,728 ms |
| Blocking time, 4× slowdown     |         1,009 ms |         1,377 ms |
| Layout shift                   |           0.0000 |           0.0000 |
| JS, recompressed gzip          |        129.6 KiB |        132.7 KiB |
| CSS, recompressed gzip         |         16.9 KiB |         17.6 KiB |
| Requested media, recompressed  |         30.4 KiB |         43.4 KiB |
| DOM nodes                      |            1,009 |              805 |
| JS heap, native CPU            |           4.5 MB |           4.9 MB |
| Coverflow drag p95, native CPU |          16.8 ms |          16.8 ms |
| Coverflow drag p95, 4× CPU     |          33.3 ms |          33.3 ms |

Transfer values are response bodies recompressed locally with gzip, **not encoded network transfer**.
All five public plates resolve as external assets. The totals include the browser's initial lazy-thumbnail selection, which can
change when page sections become shorter. The five new plates total about 20 KiB of editable SVG
source; their repeated use in both surfaces shares URLs. No font download or production dependency
was added. The Lab's DOM remains 545 nodes; its shared bundle increases by about 2.5 KiB gzip because
the two entries share demo presentation code. Public Coverflow plates use asynchronous decoding
within reserved image bounds; this did not establish a measurable startup improvement.

Frame intervals sample four real mouse-drag round trips on desktop; they do not certify continuous
frame rate, input latency, a physical phone, or a high-refresh display. Native sampling had no frames
over 33.4 ms before or after. At 4× slowdown the Playground had 20 such frames before and 18 after,
with worst intervals of 50 ms and 66.7 ms respectively. An earlier after-sample reached 100 ms.
These are local samples, not a performance
guarantee. The first throttled measurement returned missing paint entries (zero); it was excluded
and rerun after waiting for a real first-paint entry, with no concurrent browser work.

The reduced DOM did not eliminate slower-device startup cost. Throttled first paint is roughly
552 ms later in the final sample, with 368 ms more blocking time. Intermediate after-run medians
ranged from 1.3 to 1.68 seconds, and the unchanged Lab also varied (416 ms baseline, 496 ms final).
This is directional local evidence, not an isolated attribution to any one asset or style. Keep it as a human launch-review
concern; the evidence does not justify changing mounting, geometry or the motion architecture in
this presentation milestone. Raw before/after logs and screenshots remain uncommitted in
`.artifacts/playground/polish/`.

## Initial Public Playground measurements

The Playground mounts all five surfaces on one page, so its cost was measured rather than assumed.
Production build under `/snap-motion/`, Chromium, 390 × 844 touch viewport, median of five runs; the
Lab Showcase with Coverflow alone is the reference.

| Metric                     | Playground (5 surfaces) |     Lab (1 surface) |
| -------------------------- | ----------------------: | ------------------: |
| FCP / LCP, native CPU      |                  216 ms |               96 ms |
| Blocking time, native CPU  |                  108 ms |                0 ms |
| FCP / LCP, 4× CPU slowdown |                1,184 ms |              396 ms |
| Blocking time, 4× slowdown |                  964 ms |              267 ms |
| Layout shift (CLS)         |                   0.000 |               0.000 |
| JS transferred (gzip)      |                 130 KiB |             141 KiB |
| CSS transferred (gzip)     |                16.8 KiB |            17.5 KiB |
| Media transferred (gzip)   |      30 KiB (11 images) |                   0 |
| DOM nodes / JS heap        |          1,008 / 4.5 MB |        545 / 2.8 MB |
| Coverflow drag, p95 frame  |     16.8 ms (0 > 33 ms) | 16.8 ms (0 > 33 ms) |

Five mounted surfaces drag as smoothly as one, and the shared code is not larger than the Lab's: both
entries share one chunk. Startup is the only cost, and a CPU profile attributes it to the first
document layout, forced by the first surface that measures its width (about 765 ms at 4× slowdown for
the whole page, against 158 ms for the Lab). Bisecting it showed no single cause: hiding any one stage
saves at most about 220 ms at 4×, closed dialogs are 243 of 1,008 nodes and cost no layout, and
removing the `:has()` rules, containment, `backdrop-filter`, 3D transforms, `will-change` or the
scrollbar gutter changed nothing measurable.

Deferring offscreen sections would remove roughly 40% of that startup but would have to reserve a
placeholder height for every demo; a wrong height moves anchor targets and a surface's measured
geometry. That risk is not justified by a 0.2 s first paint on desktop-class hardware, so every
surface mounts eagerly and keeps its state for the life of the page. The one deferral that is safe is
applied: the below-the-fold Gallery thumbnails use `loading="lazy"` and `decoding="async"` in public
presentation (transfer fell from 42 to 30 KiB), while the Lab's fixtures load exactly as before.

Document-level listeners are a fixed set. Each mounted surface holds its own window-level gesture
listeners (five pointerup, pointermove, pointercancel,
esize and orientationchange in all), and the
page adds two keydown listeners on document for its dialogs. After repeated cycles of both modals, every
editor, every preset and an inspection gallery, a settled page has exactly the same inventory; a closing
dialog briefly holds one ocus listener until its close event is consumed, which the test waits out.
