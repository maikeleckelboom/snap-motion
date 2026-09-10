---
"@snap-motion/vue": patch
---

Honor the system reduced-motion preference when Coverflow's override prop is omitted, including
changes during navigation. An active target settles immediately when system reduction is enabled.
Explicit true and false remain authoritative, and removing the override resumes system ownership.
