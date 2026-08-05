# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry             |  Bytes | Gzip bytes | Budget bytes / gzip |
| ----------------- | -----: | ---------: | ------------------: |
| Core              | 32,684 |      9,343 |     35,000 / 10,000 |
| Vue root          | 62,347 |     17,064 |     65,000 / 17,500 |
| Vue carousel      | 34,554 |      9,888 |     52,000 / 15,000 |
| Vue bottom sheet  | 33,050 |      9,855 |     40,000 / 12,500 |
| Vue dialog        |  6,134 |      2,409 |      10,000 / 3,500 |
| Vue media gallery | 40,704 |     11,065 |     60,000 / 16,000 |
| Vue motion        |  7,625 |      2,656 |      16,000 / 5,500 |
| Base CSS          | 16,960 |      3,044 |      18,000 / 4,000 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

The core ceiling increased for the additive public stacked-deck frame resolver. The measured frame
path mutates caller-owned poses, performs no DOM measurement, and allocates no arrays or sort keys.
The lab only applies compositor hints to visible cards; compact hidden cards resolve to
`will-change: auto` and cannot receive pointer input.

## Manual profiling

For real 60/120 Hz certification, use a physical 120 Hz display and Chrome/Firefox performance
tools. Record main-thread long tasks, layout reads, Vue updates, retained listeners, and active Motion
playback while dragging, interrupting springs, resizing, opening dialogs repeatedly, and running a
100-item window. Update architecture only when traces show unnecessary frame-level reactive work.
