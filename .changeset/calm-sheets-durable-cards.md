---
"@snap-motion/vue": patch
---

Conceal closed Sheet panels until measured opening geometry is committed, and give the viewport
scrim an independent 240ms entrance / 180ms exit fade. Top Sheets use a calmer spring while explicit
spring and reduced-motion overrides remain authoritative. Other Sheet sides retain their default
spring. Coverflow and StackedDeck card shells expose durable active, visual and settled styling
attributes independently of hover, press and keyboard focus, without adding panel material.
