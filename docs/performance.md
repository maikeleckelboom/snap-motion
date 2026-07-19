# Performance and size

CI uses deterministic proxy metrics instead of pretending to certify real frame rate on shared
runners. `config/performance-budgets.json` limits publications, mounted/preload windows, active
animations, interruption bursts, simultaneous instances, and resize/mutation storms.

Current packed build graph measurements are enforced by `pnpm size:check`:

| Entry            |  Bytes | Gzip bytes | Budget bytes / gzip |
| ---------------- | -----: | ---------: | ------------------: |
| Core             | 19,115 |      5,668 |      24,000 / 7,500 |
| Vue root         | 54,111 |     15,300 |     60,000 / 17,500 |
| Vue carousel     | 31,848 |      9,381 |     52,000 / 15,000 |
| Vue bottom sheet | 27,122 |      8,714 |     40,000 / 12,500 |
| Vue dialog       |  5,968 |      2,441 |      10,000 / 3,500 |
| Vue motion       |  7,262 |      2,640 |      16,000 / 5,500 |
| Base CSS         |  3,695 |        971 |       5,000 / 1,600 |

`pnpm performance:check` covers 60/120-sample drag streams, repeated interruption, 1/20/100/1,000
items, bounded render windows, simultaneous instances, resize/mutation storms, wheel coalescing,
reactive publication counts, playback disposal, and listener cleanup.

## Manual profiling

For real 60/120 Hz certification, use a physical 120 Hz display and Chrome/Firefox performance
tools. Record main-thread long tasks, layout reads, Vue updates, retained listeners, and active Motion
playback while dragging, interrupting springs, resizing, opening dialogs repeatedly, and running a
100-item window. Update architecture only when traces show unnecessary frame-level reactive work.
