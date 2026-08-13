# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |   Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | ------: | ---------: | ------------------: |
| Core              |  45,408 |     12,929 |     47,500 / 13,500 |
| Vue root          | 131,012 |     33,324 |    132,000 / 33,500 |
| Vue carousel      |  38,418 |     10,877 |     52,000 / 15,000 |
| Vue Coverflow     |  48,722 |     14,290 |     49,750 / 14,600 |
| Vue Stacked Deck  |  50,325 |     14,689 |     51,250 / 15,000 |
| Vue sheet         |  50,035 |     14,143 |     51,000 / 14,500 |
| Vue dialog        |  11,605 |      3,858 |      12,500 / 4,100 |
| Vue media gallery |  51,838 |     13,846 |     60,000 / 16,000 |
| Vue motion        |  10,771 |      3,551 |      16,000 / 5,500 |
| Base CSS          |  26,991 |      4,689 |      27,000 / 5,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

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

The configured ceilings are regression boundaries, not targets. The beta.7 cross-realm repair adds
one shared realm-checking chunk to the root and to entries that own focus, input, or measurement.
Only the Vue root, Coverflow, Stacked Deck, Sheet, and dialog ceilings move. Their final limits leave
988 / 176, 1,028 / 310, 925 / 311, 965 / 357, and 895 / 242 bytes of raw / gzip headroom
respectively. Carousel, Gallery, and motion absorb the same shared chunk within their unchanged
ceilings. The tight unchanged base-CSS margin remains a useful regression signal rather than a
reason to widen unrelated budgets.

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
