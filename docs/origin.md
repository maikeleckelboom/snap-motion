# Origin

Snap Motion reconstructs two related interaction lines.

The first is the `vSlides` experiment in
[`maikeleckelboom/new-design`](https://github.com/maikeleckelboom/new-design/tree/develop/src/components/vSlides).
It explored a responsive multi-row and multi-column rail, direct dragging, boundary rubberbanding,
directional controls, and compact spring motion. A smaller
[`VCarousel.vue`](https://github.com/maikeleckelboom/new-design/blob/develop/src/components/vCarousel/VCarousel.vue)
experiment explored direction-aware replacement of one full-stage slide. The original vSlides work
was explored before AI-assisted development.

The second line is the native-dialog
[`bottom sheet`](https://github.com/maikeleckelboom/portfolio-2026-v1/tree/main/app/components/sheet)
in `portfolio-2026-v1`. It contributed semantic snap points, pure snap helpers, nonlinear top
elasticity, Pointer Event capture, viewport measurement, focus restoration, a scrollable modal
shell, and scrim opacity derived from the physical position.

The 2026 reconstruction was built from first principles. It retains the donors' strongest ideas:
semantic paging, one transform scalar, physical settling, direction-aware navigation, elastic hard
boundaries, pure target policy, native dialog accessibility, and semantic restoration after resize.

It discards obsolete implementation details: mixed gesture and motion stacks, raw offsets as
semantic state, `scrollWidth` as geometry authority, index identity, IntersectionObserver-based
restoration, Tab interception, global touch suppression, wheel amplification, final-event-pair
velocity, fixed-duration sheet easing, phantom panel-height input, and debug or dead source.

Exact frozen sources, branches, revisions, paths, and retrieval date are recorded in
[`legacy/README.md`](../legacy/README.md).
