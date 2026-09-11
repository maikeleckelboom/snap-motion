# Sheet presentation and durable card state

This pass starts from clean `dev` at `9501562f4a8205efbbc8ac92e5a306475bf950d8`.
It changes reusable package behavior and evidence; it does not change maikel.site or release records.

## Diagnosis and ownership

- **Theme inversion:** the package scrim already defaults to black. The inspected site overrides it
  with `--color-content-primary`, which becomes light in dark mode. That consumer override must be
  removed downstream; the package must not fight authored CSS with `!important`. Light/dark tests
  certify the package's black default. Forced colors retains its accessible system-color policy.
- **Coupled backdrop:** the scrim was already a sibling of the panel, but its opacity followed the
  panel scalar. Partial/content snaps therefore also reduced dimming. High-level Sheet now gives
  the viewport-fixed scrim its own lifecycle fade, independent of panel translation and dragging.
- **First frame:** `showModal()` exposes the dialog before opening measurement and Vue's buffered
  style update. Closed panels are now explicitly concealed. Measured opening geometry is committed
  before applying initial focus, with a microtask barrier and generation checks, without a timer or
  animation-frame delay. This closes a paintability gap; it is not proof that every prior opening
  produced a visible flash.
- **Entrance:** the generic tight spring was also used for top Sheets. The top default now uses
  stiffness **360**, damping **38**, mass **0.9**, rest speed **12**, rest distance **0.5**. The same
  spring governs opening, closing, snap changes and drag release for that side. Other sides retain
  stiffness 520 / damping 42 / mass 0.7. Explicit spring configuration stays authoritative across
  side changes. There is no fixed panel duration or Bézier easing: settlement depends on distance,
  velocity and rest thresholds. The default 1px hidden overshoot and immediate response remain.
- **Touch emphasis:** active and settled state already persisted in the surface models and slots.
  The inspected site binds image treatment to hover and keyboard focus, so that treatment is not
  persistent selection. Both card shells now expose the existing `active`, `visual` and `settled`
  projections as CSS data attributes. Consumers can style durable selection without relying on
  accessibility focus. No hover latch, synthetic keyboard focus, or new selection model is added.

The high-level scrim opens in **240ms**, closes in **180ms**, and uses
`cubic-bezier(0.2, 0, 0, 1)` with zero delay. Interrupted fades reverse from the current computed
opacity. Reduced motion removes both the fade and panel animation through the existing authoritative
preference lifecycle. The advanced `useSheetMotion().scrimOpacity` remains its documented scalar
projection for custom rendering; only the high-level component adopts lifecycle dimming.

## Public contract

No TypeScript prop, export, slot shape or CSS custom property is added. The DOM styling hooks
`data-active`, `data-visual` and `data-settled` on each Coverflow/StackedDeck card mirror existing slot
booleans. Coverflow now publishes `data-settled-id` on its root, as StackedDeck already does. Sheet
publishes `data-reduced-motion` for its owned fade. Panel neutrality, `cardWidth`, narrow geometry,
SSR preferences, keyboard focus, forced colors, interaction authority and announcements remain intact.

Motion decision: existing spring plus CSS opacity; restrained continuity. The panel persists, while
the scrim establishes modal context. Native dialog controls remain independently usable throughout
opening and interruption. No View Transition, dependency, delay, content stagger or second transform
controller is introduced.

## Verification

The baseline comparison uses the exact starting source with only the new regression tests added.
Pinned Node 24.16.0 and pnpm 11.13.1 run in an isolated Linux checkout; packed validation writes its
temporary archives there, preserving the original beta.10 archives.

The baseline regression selection fails on the previous spring, absent durable DOM hooks, and
paintable closed panel. The prior slot/model selection remains correct; these failures do not
establish a pre-existing canonical-selection defect.

The same-toolchain emitted graph comparison uses the reviewed source (`2e464ef`, whose only
differences from the starting head are documentation). Raw/gzip increases are: Vue root +1,192/+317;
Coverflow +282/+53; StackedDeck +216/+40; Sheet +694/+207; CSS +361/+58. The affected raw/gzip budgets
increase by those deltas, retaining their prior headroom; CSS gzip remains within its unchanged
budget. The Motion graph has unchanged raw size and a one-byte gzip shift from generated chunk
references. Core, Carousel, Dialog and MediaGallery measured sizes are unchanged. Budget authority
remains `config/size-budgets.json`; no enforcement, dependency edge check or browser assertion is
removed. The extra code implements the lifecycle guard, top spring policy, reduced-motion fade and
durable styling projections. Test/trace instrumentation is confined to validation files.

The final stable implementation passed `CI=true SNAP_MOTION_TEST_PORT=4573 pnpm verify`: 852 unit
tests in 69 files, 48 packed Nuxt preference/sizing cells, 339 browser tests across Chromium, Firefox
and WebKit, one built-preview test, and 12 framework fixture tests. No failure or diagnostic retry
occurred. Formatting, lint, architecture, type checking, API reports, emitted sizes, package exports,
packed consumers and release-history checks passed. API reports are unchanged. The earlier focused
selection passed 78 unit tests and all 12 new browser cases across the three engines.

Five additional Chromium raster repetitions with retries disabled passed on the current source.
The same five-repeat selection on pre-PR `main` (`10ad963`) passed four and failed one with exactly
4,423 pixels against the unchanged 4,421 limit. The failure therefore still reproduces on the
baseline; the current pass is not evidence that it is fixed or that its rate changed. The separate
unexplained Direct center-coverage assertion passed in both Chromium and WebKit during the full run.
Its previous ten-repeat recoveries remain historical evidence, not new runs from this pass.

The opening traces and final panel images were reviewed for each engine. In the 390×844 partial
Sheet fixture, the single-run observations were:

| Engine   | First observed movement | Scrim reaches 0.559 | Panel settled |
| -------- | ----------------------: | ------------------: | ------------: |
| Chromium |                  22.1ms |               239ms |       555.3ms |
| Firefox  |                    27ms |               245ms |         562ms |
| WebKit   |                   127ms |               310ms |         601ms |

These measurements include browser scheduling and probe overhead; they are not fixed durations,
physical-display latency claims or human approval of feel. No Android device was connected. Native
browser touch taps and synthetic touch-pointer drag coverage establish automated behavior; physical
touch-device acceptance remains separate. The inspected site's foreground-color scrim override and
hover/focus-only image treatment also remain downstream integration work, outside this checkout.

The complete diff review found only the intended Sheet implementation, durable card attributes,
regressions, cross-browser selection, packed assertions, scoped size budgets, documentation and a
Vue patch Changeset. No Core physics, existing raster/Direct assertions, timeout, tolerance,
dependency, release record or original beta.10 archive changed. Production code contains no debug
instrumentation. Source hashes remained stable through the aggregate run; subsequent edits only
record these results and clarify documentation. Evidence is retained in
`.artifacts/sheet-touch-hardening/` and the isolated validation checkout's `.artifacts/sheet-touch/`.
