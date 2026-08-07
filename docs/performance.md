# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |  Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | -----: | ---------: | ------------------: |
| Core              | 33,312 |      9,484 |      33,500 / 9,500 |
| Vue root          | 70,807 |     19,391 |     72,000 / 20,000 |
| Vue carousel      | 34,840 |      9,970 |     52,000 / 15,000 |
| Vue sheet         | 41,433 |     11,968 |     42,000 / 12,500 |
| Vue dialog        |  6,125 |      2,403 |      10,000 / 3,500 |
| Vue media gallery | 40,704 |     11,065 |     60,000 / 16,000 |
| Vue motion        |  7,858 |      2,721 |      16,000 / 5,500 |
| Base CSS          | 22,206 |      3,664 |      23,000 / 4,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

The segment-local stacked-deck traversal and frame resolvers fit under the core ceiling. Both hot
paths mutate caller-owned storage, perform no DOM measurement, and allocate no arrays or sort keys.

The raw core ceiling is 33,500 bytes. It rose from 33,000 for the interaction-envelope extension
points: a declared drag origin, the optional envelope elasticity that turns interior drag limits
into bounded resistance instead of a dead stop, and optional traversal bounds with their validation.
That is 525 raw and 144 gzip bytes over the previous measurement. The 9,500-byte gzip ceiling did
not move and still holds with 16 bytes of headroom, so the transferred cost of the addition stays
inside the budget the repository already accepted. `applyEnvelopeElasticity` takes its active sides
as scalars rather than an options object, so the per-pointermove constraint path allocates nothing. The lab explicitly invalidates Vue's shallow
signals after reuse, applies compositor hints only to visible cards, and gives hidden cards
`will-change: auto` with no pointer input.

The Vue root, sheet, and raw CSS ceilings increased narrowly for the four-side descriptors,
dimension-complete measurement policy, side-change remapping, fixed-width horizontal structure,
four-edge continuation and safe-area rules, and shared centered-content shells. Gzip remains within
the former sheet and CSS ceilings; the new limits preserve less than 4% raw headroom on the sheet
and CSS artifacts and less than 4% compressed headroom on the root graph.

## Manual profiling

For real 60/120 Hz certification, use a physical 120 Hz display and Chrome/Firefox performance
tools. Record main-thread long tasks, layout reads, Vue updates, retained listeners, and active Motion
playback while dragging, interrupting springs, resizing, opening dialogs repeatedly, and running a
100-item window. Update architecture only when traces show unnecessary frame-level reactive work.
