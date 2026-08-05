# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |  Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | -----: | ---------: | ------------------: |
| Core              | 32,683 |      9,340 |     35,000 / 10,000 |
| Vue root          | 70,665 |     19,355 |     72,000 / 20,000 |
| Vue carousel      | 34,698 |      9,918 |     52,000 / 15,000 |
| Vue sheet         | 41,353 |     11,933 |     42,000 / 12,500 |
| Vue dialog        |  6,125 |      2,403 |      10,000 / 3,500 |
| Vue media gallery | 40,704 |     11,065 |     60,000 / 16,000 |
| Vue motion        |  7,778 |      2,694 |      16,000 / 5,500 |
| Base CSS          | 22,206 |      3,664 |      23,000 / 4,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

The core ceiling increased for the additive public stacked-deck frame resolver. The measured frame
path mutates caller-owned poses, performs no DOM measurement, and allocates no arrays or sort keys.
The lab only applies compositor hints to visible cards; compact hidden cards resolve to
`will-change: auto` and cannot receive pointer input.

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
