# Frozen donor sources

These files are provenance snapshots only. They are excluded from builds, type checking,
linting, and formatting, and production code must never import them.

Retrieved on 2026-07-17 from the following repository revisions.

## vSlides and directional carousel

- Repository: <https://github.com/maikeleckelboom/new-design>
- Branch: `develop`
- Revision inspected: `e8778bb93a27b7f2cedf96575472bca77b000c09`
- Sources:
  - `src/components/vSlides/VSlides.vue`
  - `src/components/vSlides/VSlidesGrid.vue`
  - `src/components/vSlides/VSlidesWrapper.vue`
  - `src/components/vSlides/VSlidesPaginator.vue`
  - `src/components/vSlides/VSlidesProgress.vue`
  - `src/components/vSlides/index.ts`
  - `src/composables/useGridProperties.ts`
  - `src/components/vCarousel/VCarousel.vue`

The original vSlides work explored configurable rows, columns, and gaps; a clipped viewport
with one transform-driven track; direct dragging with boundary elasticity; physical spring
settling; and directional pagination. The smaller VCarousel experiment explored direction-aware
single-stage replacement. This work was explored before AI-assisted development. The 2026
system was reconstructed from first principles rather than refactored from these files.

The reconstruction retains semantic paging, direction-aware navigation, shared scalar motion,
responsive layout policy, and the compact spring character as tuning evidence. It deliberately
retires the mixed gesture and motion stacks, raw `offsetLeft` and `scrollWidth` authority,
incorrect fixed-grid gap arithmetic, numeric anchor deduplication, index keys,
IntersectionObserver-driven active state, Tab interception, global `touch-action: none`, wheel
amplification, debug output, dead experiments, and unbounded or unreachable targets.

## Bottom sheet

- Repository: <https://github.com/maikeleckelboom/portfolio-2026-v1>
- Branch: `main`
- Revision inspected: `694304c0d70fa44292abf662e28008471a88a834`
- Sources:
  - `app/components/sheet/bottomSheet.vue`
  - `app/components/sheet/useBottomSheetMotion.ts`
  - `app/components/sheet/useBottomSheetMotion.test.ts`
  - `package.json`

The reconstruction retains the native dialog shell, semantic full/comfortable/compact/hidden
snap points, pure target helpers, nonlinear top elasticity, Pointer Event capture, opener focus
restoration, scrollable body, safe-area treatment, viewport measurement, reduced-motion path,
and scrim opacity derived from the physical sheet position.

It deliberately retires Popmotion, fixed-duration keyframe settling, final-event-pair velocity,
the unused `panelHeight` input, premature active-snap mutation, missing stale-callback guards,
and resize behavior that could not retarget an active settle or preserve pointer-relative drag.

Commit-pinned source links are available by replacing the branch name in each GitHub source URL
with the revision recorded above.
