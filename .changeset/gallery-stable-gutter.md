---
"@snap-motion/vue": patch
---

Stop `MediaGalleryDialog` from padding the document for a scrollbar it does not remove. A page that
reserves its gutter with `scrollbar-gutter: stable` keeps that space while scrolling is locked, so the
dialog's compensation narrowed every surface behind it by one scrollbar width. The compensation still
applies to documents that do not reserve a gutter.
