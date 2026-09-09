# Production certification

## Conformance target

Snap Motion targets WCAG 2.2 AA and the relevant WAI-ARIA Authoring Practices carousel and modal
dialog patterns. Focus indicators and pointer targets additionally aim for the stronger WCAG AAA
measurements where visually practical.

This repository does not claim that the components are "fully accessible." Automated rules and
browser keyboard tests cannot establish assistive-technology interoperability.

## Automated evidence

`pnpm verify` certifies:

- default dialog-wide Left/Right navigation while the visible close button retains focus
- nested key ownership, form/media/radio exclusions, and multiple-carousel primary ownership
- exact controlled target/settle ordering for controls, keyboard, drag, wheel, pagination, and route
- LTR/RTL keys, drag, wheel, geometry, interruption, and remeasurement
- localized component messages and generic custom snap-point radio states
- table-driven side descriptors, mirrored release metamorphics, canonical hidden ordering, and
  direction-independent scrim progress
- four-side modal opening, drag/fling, interruption, physical RTL placement, safe-area mapping, and
  dynamic side remapping
- fixed-width horizontal partial reveals with stable line wrapping, native long-body scrolling, and
  no persistent idle `will-change`
- full-bleed vertical surfaces with shared centered content measure and continuation during elastic
  overdrag
- host-owned inline/right/bottom adaptive composition with one mounted host, preserved state,
  modal-to-inline focus transfer, rapid resizing, SSR, and hydration
- pagination semantics and bounded deterministic render/preload windows
- Node `renderToString()` with no browser globals
- deterministic multi-instance `useId()` relationships and cross-request markup
- no server-rendered dialog `open` attribute and no default Teleport
- controlled non-first active IDs before client measurement
- Vue Router push, replacement, Back, and direct-entry fallback behavior
- Nuxt SSR query overlay hydration with zero captured hydration warnings
- a meaningful JavaScript-disabled full media route
- axe checks for closed/open lightbox, every active slide, one-item boundaries, paged/inert grids,
  all sheet snaps, reduced motion, mobile layout, and 200%/400% zoom
- keyboard and focus behavior in Chromium, Firefox, and WebKit
- controller interruption, pointer, wheel, mutation, resize, and reduced-motion unit/E2E coverage
- forced-colors rules and automated emulation coverage
- actual packed CSS, exports, declarations, Vite, Router, and Nuxt consumer artifacts

Axe passing is a regression gate, not a conformance claim.

StackedDeck's Direct trace pairs immutable snapshots after Vue's DOM flush with computed CSS
matrices, transformed body geometry, explicit paint ranks, and persistent DOM identity. A separate
publication observer retains exact landing arrival and retirement even when the RAF recorder skips
samples. Retirement requires an observed completed landing; elapsed time that merely permits
completion is insufficient. Negative controls reject premature retirement, inconsistent snapshots,
and stationary overlapping depth swaps. When a moving body may have crossed and returned between
samples, the stress trace records an unobserved paint handoff rather than certifying its clearance;
exact-boundary core regressions separately exercise the continuous projection. Browser callback-order
tests exercise both recorder-before-update and
recorder-after-update scheduling. Neither nested microtasks nor Vue's DOM flush establishes a
post-paint boundary. Inert shells are excluded from ordinary hit testing, so rectangular-body paint
ordering is checked from computed geometry and depth; compositor pixels, rounded corners, shadows,
and physical display cadence still need visual/device review.

## Manual assistive-technology release gate

> Prepared for manual assistive-technology certification

Run this matrix on representative physical devices before public maikel.site production activation.
Private integration and dogfooding may use a verified, checksummed local release candidate, but do
not satisfy this gate. Record the OS, browser/AT versions, result, issue link, and retest date. A
blank result means certification is not complete.

| Environment                   | Required checks                                              | Result                             |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| NVDA + Firefox on Windows     | names, dialog entry/exit, slide status, radio snap selection | Prepared; not executed             |
| NVDA + Chrome/Edge on Windows | names, dialog entry/exit, slide status, radio snap selection | Prepared; not executed             |
| VoiceOver + Safari on macOS   | rotor order, modal containment, status timing                | Prepared; not executed             |
| VoiceOver + Safari on iPhone  | touch reading order, modal containment, snap picker          | Prepared; not executed             |
| TalkBack + Chrome on Android  | swipe order, modal containment, snap picker                  | Prepared; not executed             |
| Windows forced-colors         | focus visibility, controls, selected radio state             | Not yet executed                   |
| Browser zoom 200% and 400%    | reflow, no obscured focus/content                            | Automated; physical review pending |
| Text-only zoom                | wrapping, control labels, no clipping                        | Not yet executed                   |

## Manual script

The complete media-gallery scripts and evidence rules are in
[media gallery assistive-technology certification](media-gallery-at-certification.md). Record each
human run from the
[media gallery assistive-technology results template](media-gallery-at-results-template.md).

For the remaining component-wide screen reader/browser checks:

1. Open the lightbox and verify the visible close button receives focus.
2. Without pressing Tab, press Right Arrow, then Left Arrow. Verify the item changes, the close
   button retains focus, and status speaks only after each target physically settles.
3. Read the dialog and carousel names; ensure neither redundantly repeats "carousel."
4. Tab through close, available boundary controls, viewport, caption and active-slide controls.
5. Verify inputs, radio groups, media controls, composite widgets, and nested carousels retain their
   directional keys. Verify the unique primary carousel owns dialog-wide keys when two are present.
6. Test LTR and RTL. From the viewport, verify Left/Right, Home, End, repeated keys, and interruption.
7. Repeatedly activate previous, next, and pagination controls; verify focus and announcements.
8. Open the sheet on every physical side, verify title focus, select every enabled custom snap
   radio, and close via Escape and the visible button. Test a carousel in the scrollable sheet body.
9. Close the lightbox with Escape and the visible close button; verify logical focus restoration.
10. Change the route while open, use browser Back, delete the active item, and unmount the overlay.
    Confirm focus never lands on body or remains inside inert content.

Public maikel.site production activation remains blocked until every required row has a recorded
passing result or a documented, accepted browser/AT limitation.
