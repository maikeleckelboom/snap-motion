# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |   Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | ------: | ---------: | ------------------: |
| Core              |  45,408 |     12,929 |     47,500 / 13,500 |
| Vue root          | 128,320 |     32,625 |    129,000 / 32,800 |
| Vue carousel      |  37,376 |     10,563 |     52,000 / 15,000 |
| Vue Coverflow     |  47,658 |     13,974 |     47,750 / 14,000 |
| Vue Stacked Deck  |  49,322 |     14,412 |     49,500 / 14,500 |
| Vue sheet         |  47,514 |     13,481 |     48,000 / 13,600 |
| Vue dialog        |   9,116 |      3,200 |      10,000 / 3,500 |
| Vue media gallery |  48,106 |     12,859 |     60,000 / 16,000 |
| Vue motion        |   9,524 |      3,218 |      16,000 / 5,500 |
| Base CSS          |  26,975 |      4,692 |      27,000 / 5,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

The segment-local stacked-deck traversal and frame resolvers fit under the core ceiling. Both hot
paths mutate caller-owned storage, perform no DOM measurement, and allocate no arrays or sort keys.

The configured ceilings are regression boundaries, not targets. The beta.6 focus-ownership repair
deliberately grows the shared native-dialog path, so only the affected Vue root and Sheet ceilings
move from 127,500 / 32,500 and 46,500 / 13,250 respectively. Their new limits leave 680 / 175 and
486 / 119 bytes of raw / gzip headroom. The tighter unchanged Coverflow and base-CSS margins remain
useful regression signals rather than reasons to widen unrelated budgets.

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
