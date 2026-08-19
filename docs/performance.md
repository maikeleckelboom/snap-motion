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
