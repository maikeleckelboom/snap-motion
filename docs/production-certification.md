# Production certification

## Conformance target

Snap Motion targets WCAG 2.2 AA and the relevant WAI-ARIA Authoring Practices carousel and modal
dialog patterns. Focus indicators and pointer targets additionally aim for the stronger WCAG AAA
measurements where visually practical.

This repository does not claim that the components are "fully accessible." Automated rules and
browser keyboard tests cannot establish assistive-technology interoperability.

## Automated evidence

`pnpm verify` certifies:

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

Axe passing is a regression gate, not a conformance claim.

## Manual assistive-technology release gate

Run this matrix on representative physical devices before maikel.site integration. Record the OS,
browser/AT versions, result, issue link, and retest date. A blank result means certification is not
complete.

| Environment                  | Required checks                                              | Result                             |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| NVDA + Firefox on Windows    | names, dialog entry/exit, slide status, radio snap selection | Not yet executed                   |
| NVDA + Chromium on Windows   | names, dialog entry/exit, slide status, radio snap selection | Not yet executed                   |
| VoiceOver + Safari on macOS  | rotor order, modal containment, status timing                | Not yet executed                   |
| VoiceOver + Safari on iOS    | touch reading order, modal containment, snap picker          | Not yet executed                   |
| TalkBack + Chrome on Android | swipe order, modal containment, snap picker                  | Not yet executed                   |
| Windows forced-colors        | focus visibility, controls, selected radio state             | Not yet executed                   |
| Browser zoom 200% and 400%   | reflow, no obscured focus/content                            | Automated; physical review pending |
| Text-only zoom               | wrapping, control labels, no clipping                        | Not yet executed                   |

## Manual script

For each screen reader/browser pair:

1. Open the lightbox from its named button and verify the close button receives focus.
2. Read the dialog name and carousel name; ensure neither redundantly repeats "carousel."
3. Tab through close, available boundary controls, viewport, active-slide controls, and back.
4. Use viewport Arrow keys, Home, and End. Confirm focus remains on the viewport and status speaks
   only after the physical target becomes active.
5. Repeatedly activate previous/next and verify focus does not move or disappear at a boundary.
6. Close with Escape and the visible close button; verify logical focus restoration.
7. Open the bottom sheet, verify title focus, select every height with the radio group, and close via
   Escape and the visible button.
8. Change the route while open, use browser Back, delete the active item, and unmount the overlay.
   Confirm focus never lands on body or remains inside inert content.

maikel.site integration remains blocked until every required row has a recorded passing result or a
documented, accepted browser/AT limitation.
