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

## Sheet responsiveness and content comparison

The Sheet work starts from clean `7876641d4de5b723962c02389c4c245e0580ea8c` on
`feat/stacked-deck-cyclic-topology`; local and freshly fetched remote matched with no intervening
delta. Work is isolated on `feat/sheet-content-motion`. The audit's
[GitHub run](https://github.com/maikeleckelboom/snap-motion/actions/runs/34407279897) was cancelled:
admission, Linux/Windows package checks, browser integration and Chromium shard 1 passed; shard 2
was cancelled, and cross-browser tests passed before post-job cancellation. Browser certification
correctly failed. Check-run annotations establish that Chromium shard 2 and cross-browser both
exceeded the six-minute job limit; this is not an unexplained cancellation or a green remote
baseline. Chromium stopped at test 65/85. Cross-browser needed 5.1 minutes for tests plus about 52
seconds of setup, then timed out during cleanup. The focused workflow correction gives Chromium
12 minutes and cross-browser 15 minutes, accommodating the expanded 101-test cross-browser job.
Per-test deadlines, retries, project selection and required-check behavior are unchanged.

The exact clean baseline passed its first local `CI=true SNAP_MOTION_TEST_PORT=4273 pnpm verify`
with the pinned Node 24.16.0/pnpm 11.13.1 toolchain: 786 unit tests, 253 E2E tests, one preview test,
six framework fixture tests, and all package/API/size/SSR/hydration gates. There were no retries.
Its 219 ResizeObserver-loop diagnostic entries in existing Coverflow/StackedDeck scenarios remain
baseline observations, not Sheet regressions or proof of harmlessness. The original dirty `21cbc01`
visual manifest cannot prove the captured source; the 29 later final-input hashes match the audit
tree, and a small clean Direct recapture replaces that uncertain comparison input.

### Diagnosis and decision

On the real top Menu, the negative panel translation and positive inner viewport offset cancel.
Header/body screen coordinates stay stable while clipping exposes a growing viewport. The previous
160px hidden overshoot makes the spring travel invisibly before exposing content and after hiding
it. The default now uses 1px beyond the physical edge. Spring parameters and open anchors are
unchanged; dismissal midpoint and scrim normalization use the new hidden anchor. Explicit custom
overshoot remains supported. No second counter-transform, text scaling, blur or opacity masking is
introduced.

Other baseline-failing regressions confirmed omitted Boolean preference coercion, interrupted
reopening resetting native body scroll, and focus entering a zero-height opening body. The fix
preserves the preference tri-state and current spring velocity, removes duplicate initial
remeasurement, preserves scroll while the same native dialog remains open, and completes the
semantic snap when body focus requires it. Focused descendants scroll only within the native body;
layout reads happen on focus reconciliation, not each animation frame.

The retained lab route is `?demo=sheet-content&view=fixtures`. Compare the same menu, viewport,
panel spring and interaction with Control, a 140ms body-opacity reveal from .55 to 1, and that reveal
with an 8px side-appropriate offset. Menus, forms, long text, media and short bodies are selectable.
The experiments use one body participant and are lab-only. The recommended package presentation is
Control: readable content immediately has full contrast, the top header/body remain stable, and
the simpler body reveal mostly finishes before clipping exposes the first complete navigation
link. Adding an offset introduces text movement without a demonstrated readability or response
benefit. A group stagger was not justified. There is no new presentation prop, escape hatch,
per-descendant controller or required application wiring. Human approval of feel is still pending.

The actual maikel.site review uses detached site revision
`ed3431b23c5af6f2269975c3f4862caefd572d57`, with unchanged top-origin compact Menu, inline desktop
navigation, local visibility, route dismissal and responsive focus policy. A uses its committed
beta.9 artifact from `9b43d3d8aa2c5e87b127c8ab89bf9951f7e4213b`; B substitutes the exact audit
artifact; C substitutes the candidate tarballs. Only those two archive references/integrities change
in the detached consumer lockfile. All other dependency resolutions and committed vendor artifacts
stay fixed. The active site checkout is not edited or pushed.

In three quiet Chromium runs per artifact at 390×844/no-preference, B→final C median first visible
area was 87.0→19.5ms, first fully exposed navigation link 105.5→78.2ms, and open settlement
553.8→494.9ms. Closing is a tradeoff: the visible height crossed 48px at 145.0→218.3ms, 8px at
156.6→319.8ms, and 1px at 160.8→402.2ms. Native dismissal/focus return was 528.3→523.0ms,
roughly unchanged. The invisible interval after the last pixel shrinks, while the visible collapse is less
abrupt. Leave spring tuning unchanged pending normal-speed human review of this tradeoff. Chromium
RAF p95 stayed around 18ms; one B recording had a long task. This is measured response/geometry,
not proof of better perceived closing or physical display performance.

The final capture source identity is `7876641-dirty-6b299e546cff`. All 15 lab recordings (three
treatments in tall/short Chromium menus, a Chromium form, Firefox and WebKit menus) have stable
start/end fingerprints, per-file source hashes, and zero captured errors. The final normal-speed
consumer series is `C-final-quiet{1,2,3}` plus Firefox/WebKit; earlier `C-quiet` recordings are
superseded by the lifecycle correction. No public/private application content is copied into the lab.

All artifacts retain the existing `0.1.0-beta.9` manifest version; SHA-256 identifies the actual bytes:

| Artifact          | Vue SHA-256                                                        | Core SHA-256                                                       |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A installed       | `028aa178f691fae36d2c9b37f68094c846e4fa2fe514a1303e2e32a961566e7c` | `9b28baf94c1036fe5a2dc01c8fda48edc13ff9a4422e7c14308fb41568daa222` |
| B audit baseline  | `f71e236bf0eabad14b55a43303996dfa65c0d0f7798e1072eeb594fddb1c147d` | `95f275f3ab4c0b8e68436c2b87ccdbe5880e4f58a64422eb7feb20b1d99c2d9d` |
| C final candidate | `07e5a014b15a2c4bd49beeead24ff2719fb36a25ae8997c7ee0371480a2f9db3` | `95f275f3ab4c0b8e68436c2b87ccdbe5880e4f58a64422eb7feb20b1d99c2d9d` |

### Correctness evidence and limitations

The high-level preference tests first failed four cases on the audit source, then passed all nine
with the tri-state fix. Mechanical tests first failed eight cases and passed after the hidden-anchor
and momentum fixes. Early keyboard focus, custom initial focus and reopening-scroll tests also
failed before their focused fixes. Tests cover omitted preferences, explicit overrides, changes
while open/during motion, all four sides, full/partial/content snaps, overflow and nested controls,
native tab order, Escape, route close, resize, side changes, dynamic content, zoom, drag takeover,
dismissal, cancellation and reversal. Existing multi-snap/SSR/responsive-host tests remain in place.

An intermediate three-browser Sheet matrix was **78 passed / 3 failed**. The failures were a
fractional rectangle versus integer scroll-height comparison and two assumptions that WebKit's
native Tab sequence includes links. The assertions now account for integer scroll measurement and
compare traversal with an independent native-controls probe. These are test-oracle corrections,
not suppressed product failures. A separate interim empty-style sample overlapped fixture editing;
it did not recur after source freeze. Final focused revalidation passed 54 focus/reopen cases
(three repeats in all three browsers), 12 affected geometry/preference/drag cases and three repeated
Firefox geometry cases. Preserve these results separately from the earlier failed aggregate.

The first final-gate attempt stopped at recording-script lint errors, corrected with focused lint
and tooling type checks. A later run passed 804 unit tests and packed SSR/hydration before the agent
stopped it during E2E: final review reproduced an introduced focus-reconciliation defect that
suppressed pending `settled` events. Focus now completes through the existing motion callback,
retaining pending reasons, authority rollback and stale-callback rejection. These interrupted
attempts are preserved; neither is a successful aggregate.

The next aggregate recorded 809 unit passes and one unchanged StackedDeck revision-identity harness
timeout (5.227 seconds against its 5-second deadline). The exact test then passed, followed by three
complete 16-test file passes with the same deadline and unchanged implementation. This is an
isolated harness timeout with no established precise cause; no product assertion failed. The failed
aggregate remains recorded separately from focused recovery and subsequent verification.

The final `CI=true SNAP_MOTION_TEST_PORT=4373 pnpm verify` ran on source fingerprint
`7876641-dirty-582caaf60482`. Formatting, lint, architecture, builds, types, API reports, size,
packed consumer inference, SSR/hydration and all 810 unit tests passed. The browser aggregate was
**326 passed / 1 flaky**, so the fail-on-flaky gate correctly returned exit 1. All 84 Sheet cases
passed across Chromium, Firefox and WebKit. This is a failed aggregate, not an all-green result.

The unchanged WebKit Direct test at `e2e/stacked-deck-direct.spec.ts:795` admitted a position sample
with about 0.100902px remaining travel, then required less than 0.05px. Its 0.999 fractional readiness
threshold permits about 0.197427px in this fixture. The test, harness, Core geometry and StackedDeck
motion files match the clean audit source byte-for-byte: this is a baseline test-readiness defect.
Its configured retry passed, followed by three unchanged focused repetitions with retries disabled.
No StackedDeck source/test, per-test deadline or assertion tolerance was changed. A future bounded
repair should wait for the existing matching rendered Direct projection at parking settlement 1,
then capture controller phase and DOM position together while preserving the current assertions.

Because the aggregate stopped before its tail, `pnpm build:preview:prepared`,
`pnpm test:preview:prepared` and `pnpm test:fixtures:prepared` ran separately on the same source:
preview build, one preview test and six framework tests passed. Final actual-site validation passed
all nine configured browser tests, interaction probes in all three engines, and resting/active
preference probes in all three engines against the final C bytes above. The 15 final lab recordings
still match the tested source files; only this results documentation is added afterward.

The final aggregate logged 220 ResizeObserver-loop entries in existing Coverflow/StackedDeck and
lab scenarios, including the extra retry; none occurred in either Sheet test file. Preserve these
baseline diagnostics without treating them as harmless or broadening this task into their audit.

The [pushed verification run](https://github.com/maikeleckelboom/snap-motion/actions/runs/34416586484)
at `7c18043713b841545a0a2ce2c48cfb09c0995774` passed admission, Linux, Windows, packed browser
integration, Chromium shard 1 and cross-browser interoperability. Chromium shard 2 completed with
**93 passed / 1 flaky**, so Browser certification correctly failed. The extended job budgets let
both previously interrupted jobs finish; they did not make their assertions less strict.

This separate flaky case is `e2e/stacked-deck-pile.spec.ts:79`: a screenshot classified 4423 exposed
pixels against an endpoint envelope plus tolerance of 4421. Five relevant test, harness and runtime
files match the audit baseline byte-for-byte. Its retry and three unchanged local repetitions passed,
but the two-pixel excess remains unexplained. The oracle applies its default unreleased bound after
a flick release, and reads DOM poses after taking/decoding the screenshot; these limit causal
interpretation without proving an explanation. No tolerance, deadline or StackedDeck code was
changed. Preserve the remote failure artifact separately from the successful repetitions.

The final-source custom-focus probe passed all eight full-snap near/deep cases on two runs. Its
first RAF callback repeatedly arrived around 1.4 seconds after opening. A bounded diagnostic found
the focused region already visibly reconciled by 5.6ms and a timer executing at 5.9ms, before the
first RAF at 1472.6ms. This is an unexplained standalone-probe RAF scheduling observation, not
evidence that Sheet reconciliation took 1.4 seconds or a performance acceptance result. The warmed
actual-menu recordings remain the response comparison.

A sole small horizontal snap retains the existing full-width physical surface. At a 280px left
snap in a 390px viewport, a 200px-wide input inset 28px can rest at screen x=-58..142; the same
clipping reproduces on the exact audit baseline. Native vertical focus reveal cannot fix this
horizontal geometry. This remains a baseline limitation, not a claim that every target fits every
partial snap. Full-snap near/deep custom focus was verified on all four sides; top/deep focus now
reveals the input within the visible body instead of leaving it clipped below it.

Normal-speed videos, diagnostic strips and raw geometry traces use the source identity, browser
version, viewport and preference in each capture manifest. Run the command in
[Contributing](../CONTRIBUTING.md#sheet-presentation-comparison), open Menu, wait for rest, close,
then repeat at a short viewport and with early Tab/Escape and interrupted reopening. The
`--travel=baseline` lab option changes only hidden travel on the candidate source; the real
consumer's A/B recordings are the actual installed/audit package comparison. RAF gaps and
time-to-first-fully-exposed-link are diagnostics, not physical refresh-rate, compositor, reading
speed or assistive-technology certification.

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
