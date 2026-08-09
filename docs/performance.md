# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |   Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | ------: | ---------: | ------------------: |
| Core              |  45,908 |     13,055 |     47,500 / 13,500 |
| Vue root          | 117,264 |     29,864 |    118,000 / 30,000 |
| Vue carousel      |  36,238 |     10,294 |     52,000 / 15,000 |
| Vue Coverflow     |  45,080 |     13,303 |     47,000 / 14,000 |
| Vue Stacked Deck  |  46,497 |     13,694 |     47,000 / 14,000 |
| Vue sheet         |  41,953 |     12,068 |     42,000 / 12,500 |
| Vue dialog        |   6,505 |      2,480 |      10,000 / 3,500 |
| Vue media gallery |  40,960 |     11,118 |     60,000 / 16,000 |
| Vue motion        |   9,375 |      3,182 |      16,000 / 5,500 |
| Base CSS          |  25,767 |      4,518 |      27,000 / 5,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

The segment-local stacked-deck traversal and frame resolvers fit under the core ceiling. Both hot
paths mutate caller-owned storage, perform no DOM measurement, and allocate no arrays or sort keys.

The configured ceilings are regression boundaries, not targets. At this measurement the Vue root is
the closest artifact, with 736 raw bytes and 136 gzip bytes of headroom. Treat that narrow margin as
a reason to remove accidental weight and remeasure; change a ceiling only for deliberate product
growth that still leaves a meaningful boundary.

`applyEnvelopeElasticity` takes its active sides as scalars rather than an options object, so the
per-pointermove constraint path allocates nothing. Stacked Deck validates a component pile layer by
reading the item at the projected index and comparing its ID before rendering; it builds no item map,
parallel view projection, or per-layer wrapper objects. The lab explicitly invalidates Vue's
shallow signals after reuse, applies compositor hints only to visible cards, and gives hidden cards
`will-change: auto` with no pointer input.

## Manual profiling

For real 60/120 Hz certification, use a physical 120 Hz display and Chrome/Firefox performance
tools. Record main-thread long tasks, layout reads, Vue updates, retained listeners, and active Motion
playback while dragging, interrupting springs, resizing, opening dialogs repeatedly, and running a
100-item window. Update architecture only when traces show unnecessary frame-level reactive work.
