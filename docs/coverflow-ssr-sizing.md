# Coverflow SSR and evidence sizing correction

The integration base is `main` at `10ad963540bc16e79625baa6a7c9d7ca0be4907c`.
Work was initially isolated on `fix/coverflow-ssr-sizing`, targeting `main` in PR #18.
The immutable private beta.10 record retains source authority
`3a21db7ccaebe9b4ac769cd9c4104aa53a10fd4d`; this source correction is not a new candidate.

## Independent reproduction

The existing `.artifacts/packages` archives match the beta.10 record's hashes. Two complete fresh
packed Nuxt builds reproduced the Coverflow preference defect with the browser preference set
before navigation. Both system-reduce contexts produced three Coverflow style diagnostics;
both no-preference contexts produced none for Coverflow. Explicit true and false produced no
Coverflow mismatch. Detailed Vue production hydration diagnostics were enabled, never suppressed.
The supplied external-consumer findings agree with this independent evidence. The optional local
maikel.site report path was unavailable; no consumer source was changed.

The parked left card's server transform contained `translate3d(-448.000px, 0, -300.000px)
rotateY(62.000deg)`; the hydrating reduced-motion client expected
`translate3d(-336.000px, 0, 0)` without yaw. Material yaw, sheen, edge offset and edge strength also
differed. The centered card differed in transform syntax even at zero travel. Semantic, visual and
settled selection remained `project`; the mismatch was preference-driven presentation.

The probe captures raw server HTML, actual first hydrating VNodes, hydration-time DOM, mounted
state, card styles, geometry and unfiltered hydration/error diagnostics. The hydration-time DOM can
already contain Vue-patched attributes, so raw response bytes are the SSR authority.

VueUse 14.4.0's `usePreferredReducedMotion` reads `matchMedia().matches` during setup via
`useMediaQuery`. The package forwarded that browser-only result directly through `useSnapMotion`.
SSR necessarily used false. Shared `useReducedMotionPreference` now gates system adoption on
VueUse's `useMounted`; explicit overrides bypass that gate. Existing controller watches retain
live preference changes and immediate reduced-motion settlement. Standalone effect scopes adopt
immediately because they have no component hydration lifecycle.

## Other surfaces

Stacked Deck also emitted preference-dependent first styles: parked rotations were -2/+2 degrees
on the server and zero on the reduced-motion client. It uses the same shared correction; there is
no Deck geometry redesign. Carousel's initial rendered styles were preference-independent, but
its shared motion controller receives the same corrected adoption lifecycle.

The first audit also exposed a separate Sheet initial measurement mismatch in every preference
cell at a 1000px viewport: SSR emitted hidden position 801px from its 800px fallback, while setup
in the browser emitted 1001px. `useSheetMotion` now constructs initial geometry without browser
measurement and retains its existing live measurement path. The failing evidence remains in the
before directories. The test viewport was not adjusted to conceal this mismatch.

Media Gallery already adopts system preference in `onMounted` and uses its own authority; Modal
Dialog has no reduced-motion projection. Their existing packed composition checks remain intact.

## Sizing decision

The 280..420px clamp originated in the Lab and moved unchanged into Core with the surface model.
History documents why pitch, side spacing, yaw and perspective must agree, but provides no distinct
accessibility or layout rationale for 420px as a public product maximum. The default is retained.

The one new public control is preferred `cardWidth`, in CSS pixels. Merely raising the ceiling
would leave a 1120px stage at 448px under the 40% ratio. An explicit preferred size may use 60% of
measured allocation, retains compact sizing, and reserves visible neighbours. The package scales
camera distance and side depth above 420px, keeps pitch equal to first-side travel and derives
stack spacing from the same card. No transform or private-geometry patch is required.

| Allocation                       | Request | Card      | Pitch | Stack gap | Perspective | Side depth |
| -------------------------------- | ------- | --------- | ----- | --------- | ----------- | ---------- |
| 1120px default, before and after | omitted | 420 × 294 | 336   | 143       | 900         | -300       |
| 1120px wide                      | 720     | 672 × 470 | 538   | 228       | 1440        | -480       |
| 1280px wide                      | 720     | 720 × 504 | 576   | 245       | 1542.857    | -514.286   |
| 342px mobile, before and after   | 720     | 280 × 196 | 224   | 95        | 900         | -300       |
| 280px constrained host, after    | 720     | 248 × 174 | 198   | 84        | 900         | -300       |

Below the historical compact floor the measured host now wins, preserving a 16px focus gutter.
The existing card aspect ratio, 62-degree side yaw, hide-after policy and default fallback/CSS stage
width contract remain intact. Reactive size changes remeasure through existing semantic authority.

Narrow WebKit probing also exposed competing initial measurements: the separate VueUse element-size
watcher could reset to its SSR fallback after the controller had already adopted narrow anchors.
Coverflow now adopts its measured content width inside the same measurement that builds its anchors.
The same observer feedback remained in mobile Stacked Deck after the Coverflow correction, so Deck
uses the shared width reader at that same lifecycle point. Its tuning, compact floor and exchange
geometry are unchanged.
Reactive preferred-size updates remeasure before rendering, without a queued post-unmount write.
Carousel's shared observer callback is coalesced onto the next animation frame because a spatial
measurement can change stage height; this prevents ResizeObserver delivery loops. Explicit resize
and mounted measurement still run immediately. Existing Carousel and Deck interaction suites audit
this shared scheduling change.

## Surface focus

The stylesheet already gave Carousel's viewport a themeable keyboard ring; Coverflow and Stacked
Deck were missing from that rule. Both now use the shared `:focus-visible` selector and focus width
and color properties. The three surfaces suppress outlines under `:focus:not(:focus-visible)` and
while local pointer input owns focus.
Sheet's focus rules are unchanged. Dialog and Gallery already have control-specific focus-visible
treatments and have no comparable drag-surface transfer.

A real drag revealed why CSS alone was insufficient: the gesture adapter intentionally prevents
native mouse focus and transfers focus after a resolved swipe. Browsers could classify that script
transfer as visible focus. A small shared internal helper tracks pointer input on these three
focusable roots and clears it on keyboard input or focus departure. This complements native
`:focus-visible` without changing focus transfer, suppressing descendant indicators, or requiring
a consumer workaround. Keyboard input is observed on the owning document so Tab arriving from
outside also clears a prior tap that did not transfer focus.

Packed browser checks use real drags, subsequent arrow input, Tab/Shift+Tab, custom theme properties,
and forced colors on all three surfaces. They require pointer focus without a ring, keyboard focus
with a solid ring, and a nontransparent forced-colors indicator distinct from the canvas.

## Regression boundary and artifacts

`verify:packages:browser:prepared` now certifies a 16-cell matrix in Chromium, Firefox and WebKit:
default/wide × both system preferences × omitted/true/false, plus mobile/constrained hosts in both
system preferences. It compares first VNode styles with server bytes across Coverflow, Deck,
Carousel and Sheet, checks live preference changes and explicit authority, and exercises wide
pointer tracking/release, wheel, keyboard, focus, controlled handoff and collection reorder.
The representative fixture has three landscape screenshots and uses only high-level surfaces.
The workspace Nuxt fixture additionally exercises wide hydration in both preference modes.

Focused Core and Vue tests freeze default geometry, check responsive bounds and physical ratios,
validate preferred-size forwarding and unmount, and verify first-render preference lifecycle,
standalone scopes and Sheet's initial viewport. Packed type consumers accept numeric `cardWidth`
and reject a string while retaining item/ID inference.

Local review artifacts live under `.artifacts/coverflow-ssr-sizing/`: `before`, `before-repeat`,
`before-allocations/chromium`, and `verified-packed/<browser>`. These include HTML, first-render
and mounted-state JSON, diagnostics and screenshots. The packed screenshots use
`default-no-preference-system.png`, `wide-no-preference-system.png`,
`mobile-no-preference-system.png` and `narrow-host-no-preference-system.png`.
Windows Chromium review views are `final-windows-2/{default,wide,mobile,narrow-host}.png` with
measured state in `geometry.json`. Default desktop and mobile screenshots are byte-identical to
the corresponding before views; the wide view increases the focused face from 420 to 672px.
They are review artifacts, not new pixel baselines.
`focus-review/{coverflow,stacked-deck,carousel-viewport}-{none,active}.png` captures the complete
keyboard outline with surrounding space in normal and forced colors.

Verification runs in an isolated Linux checkout under WSL Ubuntu 26.04, using pinned Node 24.16.0
and pnpm 11.13.1. `verify-inputs-4.json` records the checked source hashes and execution inputs.
The original Windows checkout retains the immutable beta.10 archives. Ordinary transient packs
in the isolated checkout retain development manifest versions; no candidate preparation or npm
publication runs. Windows Chromium visual checks supplement all three Linux browser engines.
Windows Playwright WebKit did not project perspective correctly even in a bare HTML control;
that platform limitation is preserved in `browser-capabilities.json`, not worked around in CSS.

## API and package cost

The pending `coverflow-ssr-sizing` Changeset requests minor Core and Vue releases, combining the
public sizing addition with the hydration and focus corrections. Package versions and the beta.10
record are unchanged. API Extractor updates `core.api.md`, `vue-coverflow.api.md` and `vue.api.md`
for the single new optional size. No production dependency was added.

| Entry        | Before raw / gzip | After raw / gzip | Difference raw / gzip |
| ------------ | ----------------- | ---------------- | --------------------- |
| Core         | 53236 / 15368     | 53247 / 15375    | +11 / +7              |
| Vue root     | 137327 / 36499    | 138320 / 36960   | +993 / +461           |
| Carousel     | 38801 / 10968     | 39387 / 11155    | +586 / +187           |
| Coverflow    | 49451 / 14492     | 50390 / 14775    | +939 / +283           |
| Stacked Deck | 56535 / 16518     | 57429 / 16785    | +894 / +267           |
| Sheet        | 51244 / 14493     | 51341 / 14534    | +97 / +41             |
| Motion       | 10957 / 3628      | 11052 / 3668     | +95 / +40             |
| Base CSS     | 26802 / 4624      | 26974 / 4672     | +172 / +48            |

Dialog and Gallery sizes are unchanged. By explicit task authorization, only Vue root, Coverflow
and Stacked Deck caps increase to these exact measured costs, without extra headroom. All other
caps and the package-size gate remain unchanged.
Transient tarballs measure 35,245 bytes for Core (+39) and 82,621 for Vue (+510), compared with
the preserved beta.10 archives; they are verification output, not replacement candidate artifacts.

## Initial fix verification

`pnpm verify` passed with exit code 0 on the source recorded in `verify-inputs-4.json`:

- release-candidate history, formatting, lint and architecture checks
- package builds, tooling/application types, application builds and API Extractor reports
- 69 unit files / 848 tests
- every package-size limit and the browser-free packed runtime/type/export checks
- all 48 packed Nuxt preference/allocation cells across Chromium, Firefox and Linux WebKit,
  with zero captured hydration or runtime diagnostics, plus existing packed compositions
- 327 browser tests, including accessibility and shared-surface interaction regressions (18.9 minutes)
- one production-preview test and all nine framework fixtures, including the three new surface cases

Focused development checks passed before this gate, including geometry/component/reduced-motion
tests, the final pointer-modality unit regression, and real tap/drag/Tab/keyboard/forced-colors
checks in all three browser engines. The full gate makes the packed matrix explicit in its report;
standalone packed verification also passed during development.

The complete final log is `pnpm-verify-4.log`. Earlier evidence is retained: the first attempt stopped
on the new fixture's module-resolution placement, the second on package-size limits, and the third
was interrupted to close the tap-to-Tab focus edge case. Those causes were corrected before the
final successful gate; no assertions, tolerances, timeouts or browser coverage were weakened.
Only this evidence document changed after the final runtime snapshot, and its formatting was
checked separately. No source blocker remains from local verification; remote CI status belongs
to the delivery PR.

## Neutral image-panel follow-up

External review required the screenshot itself to read as the physical panel. Inspection at
`b58f85e` confirmed that the package already has the correct structural default: one transformed
DIV directly contains the slot, with transparent background, zero border and padding, no radius
or shadow, and visible card overflow. The root owns the shared camera and clips the receding rail
at the stage allocation, preventing document overflow. There is no decorative inner wrapper.

The earlier representative probe, however, styled its IMG with a white background, 8px radius and
generic shadow. Its 16:10 SVGs were contained in 10:7 boxes, adding a visible mat. Those fixture
choices are removed. The artwork now has an explicit 1600×1120 canvas, extending its application
background and sidebar without distorting or cropping its content. A direct IMG uses only block
layout, 100% dimensions and `object-fit: contain`; it does not override package material or transforms.
Lab's separate authored `.screen-chrome` remains an example of consumer material, not a requirement
of the high-level component.

No production source, CSS, public API, package size or size cap changes in this follow-up, and no
frameless prop is added. The pending Changeset and spatial-surface documentation make the existing
ownership explicit. Focus behavior from the initial fix remains intact.

The new browser contract rejects package or fixture backgrounds, borders, padding, radii, generic
shadows, clipping paths and decorative pseudo-content. It checks that a single direct image shares
the complete physical box with zero offset, that the shell owns the transform, and that matching
artwork leaves at most the subpixel inset caused by the existing integer card-height rounding.
The same check runs through all 48 packed preference/allocation cells, plus three additional
workspace Nuxt cases. A component test protects the direct slot/physical-shell DOM relationship.

The old fixture fails this new assertion, recorded in `panel-before-test.log` and
`panel-before-material.json`. Focused checks pass in Chromium, Firefox and Linux WebKit at default,
mobile, wide and 280px host allocations, including pointer, keyboard and forced-colors focus.
Updated review screenshots and computed panel evidence live in
`image-panels/<browser>/{default,mobile,wide,narrow-host}.{png,json}`. These intentionally supersede
the earlier probe's material presentation while preserving its geometry.

## Remote CI evidence from the initial fix

The initial push and PR runs (`34549535887`, `34549546433`) both passed package verification,
Windows portability, browser integration (including packed Nuxt) and cross-browser interoperability.
Their Chromium 2/2 shards failed the unchanged Stacked Deck fast-alternation pile-envelope case:
4423 sampled pixels against a 4421 bound; each passed on retry. The gate correctly remains failed.

The same failure is present in [ancestor run 34416586484](https://github.com/maikeleckelboom/snap-motion/actions/runs/34416586484)
at `7c18043713b841545a0a2ce2c48cfb09c0995774`, before this branch. Five unchanged local repetitions
passed (`ci-pile-recheck.log`). This is inherited intermittent raster-envelope evidence, not a new
Coverflow material regression; the two-pixel excess remains unexplained and its tolerance is not
changed. Historical and current failed logs are retained alongside the local full-gate pass.

## Follow-up verification result

The final follow-up ran `pnpm verify` against `verify-inputs-5.json`. The aggregate **failed**
because the same inherited Chromium pile-envelope case failed once and passed on retry:
326 browser tests passed and one was flaky (19.5 minutes). `failOnFlakyTests` remains enabled.
The failed run is preserved in `pnpm-verify-5.log`, `gate-5-browser-results` and
`gate-5-browser-blob`; it is not relabelled as a pass.

All preceding gate steps passed: release-history immutability, formatting, lint/architecture,
package/application builds and types, API reports, size limits, 69 unit files / 849 tests,
browser-free packed consumers, and all 48 packed Nuxt preference/allocation cells. Every packed
cell now also certifies neutral shell/image material and edge-to-edge content, with zero captured
hydration/runtime diagnostics. Those artifacts are in `verified-image-panels/<browser>`.

Five fresh unchanged repetitions of the inherited failure passed afterward
(`ci-pile-recheck-after.log`), in addition to the five focused repetitions before the aggregate.
The skipped downstream commands ran separately: production-preview build and its one test passed,
then all 12 framework-fixture tests passed, including the three new image-panel cases
(`panel-remaining-verification.log`, exit 0). No additional failure was observed.

Only this evidence report changed after the runtime snapshot; its final formatting was checked
separately. This follow-up changes no production code, API report or package size. The neutral-panel
requirement is covered, while the inherited intermittent pile-envelope assertion remains a
repository certification limitation. No tolerance, retry policy, timeout, assertion or browser
coverage was weakened to conceal it, and the full aggregate was not repeated just to obtain a
different exit code.
