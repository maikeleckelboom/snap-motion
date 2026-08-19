# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |   Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | ------: | ---------: | ------------------: |
| Core              |  40,784 |     12,798 |     47,500 / 13,500 |
| Vue root          | 102,527 |     30,110 |    132,000 / 33,500 |
| Vue carousel      |  28,904 |      9,522 |     52,000 / 15,000 |
| Vue Coverflow     |  37,241 |     12,617 |     49,750 / 14,600 |
| Vue Stacked Deck  |  42,520 |     14,101 |     51,250 / 15,000 |
| Vue sheet         |  37,951 |     12,440 |     51,000 / 14,500 |
| Vue dialog        |   8,592 |      3,480 |      12,500 / 4,100 |
| Vue media gallery |  38,303 |     12,557 |     60,000 / 16,000 |
| Vue motion        |   8,163 |      3,145 |      16,000 / 5,500 |
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

The configured ceilings are regression boundaries, not targets, and Direct does not raise them.
Core and Vue use Terser for published ESM so the additional public geometry and presentation state
fit the existing ceilings without compressing source architecture into opaque helpers. Packed
TypeScript, runtime, browser, Router, and Nuxt consumer gates verify those emitted bindings. The
tight unchanged base-CSS margin remains a useful regression signal rather than a reason to widen an
unrelated budget.

`applyEnvelopeElasticity` takes its active sides as scalars rather than an options object, so the
per-pointermove constraint path allocates nothing. Stacked Deck intentionally keeps one persistent
shell and one `#card` subtree per item. Its DOM, frame projection, and style updates are therefore
linear in item count. The high-level component does not observe the advanced `pileLayers` projection,
so it does not also allocate that array each frame; custom composable consumers pay that linear cost
only when they observe it. Explicit `will-change: transform` promotion is bounded to the exchanging
pair while moving and returns to zero cards at rest, avoiding one forced GPU layer per parked shell.
An interrupted Direct reconciliation can temporarily add its one retired shell beside the new pair;
it does not create an accumulating exchange queue. Direct mutates one shallow presentation object
per interaction and reuses the authoritative frame. Its optional two-axis callback is disabled for
Shuffle, so raw-vector samples do not add a second Shuffle frame invalidation beyond the shared
scalar gesture update.

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
