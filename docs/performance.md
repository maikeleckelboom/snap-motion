# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |   Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | ------: | ---------: | ------------------: |
| Core              |  45,408 |     12,929 |     47,500 / 13,500 |
| Vue root          | 130,105 |     33,244 |    131,000 / 33,500 |
| Vue carousel      |  37,376 |     10,563 |     52,000 / 15,000 |
| Vue Coverflow     |  47,658 |     13,974 |     47,750 / 14,000 |
| Vue Stacked Deck  |  49,322 |     14,412 |     49,500 / 14,500 |
| Vue sheet         |  48,846 |     13,838 |     49,500 / 14,000 |
| Vue dialog        |  10,387 |      3,547 |      11,000 / 3,700 |
| Vue media gallery |  49,405 |     13,196 |     60,000 / 16,000 |
| Vue motion        |   9,524 |      3,218 |      16,000 / 5,500 |
| Base CSS          |  26,994 |      4,698 |      27,000 / 5,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

The segment-local stacked-deck traversal and frame resolvers fit under the core ceiling. Both hot
paths mutate caller-owned storage, perform no DOM measurement, and allocate no arrays or sort keys.

The configured ceilings are regression boundaries, not targets. The complete beta.6 focus-ownership
repair deliberately grows the shared native-dialog path, so only the affected Vue root, Sheet, and
dialog ceilings move. Their final limits leave 895 / 256, 654 / 162, and 613 / 153 bytes of raw /
gzip headroom respectively. The Gallery remains within its unchanged ceiling. The tighter unchanged
Coverflow and base-CSS margins remain useful regression signals rather than reasons to widen
unrelated budgets.

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
