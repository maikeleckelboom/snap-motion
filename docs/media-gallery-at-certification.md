# Media gallery assistive-technology certification

> Prepared for manual assistive-technology certification

This dossier is the operator script for the hardened
`@snap-motion/vue/media-gallery` primitive. It prepares repeatable human testing; it does not record
or imply a passing NVDA, VoiceOver, or TalkBack result.

Automated tests can prove DOM, focus, event, image-fallback, and accessibility-tree contracts. Only
a human operating and listening to the named assistive technology on the real platform can record
spoken output, reading-control behavior, modal quality, or a certification result.

## Harness

Use Node and pnpm versions pinned by the repository.

For a test on the development computer:

```powershell
pnpm build:packages
pnpm --filter @snap-motion/lab dev
```

Open the Vite origin printed in the terminal and append `?demo=gallery-at`.

For a physical phone on the same trusted network:

```powershell
pnpm build:packages
pnpm --filter @snap-motion/lab dev --host 0.0.0.0
```

Open the printed network origin on the phone and append `?demo=gallery-at`. Do not expose the
development server to an untrusted network.

The stable harness heading is `Media gallery AT certification harness`. Its visible status is
`Prepared for manual assistive-technology certification`.

### Deterministic scenarios

| Scenario ID       | Stable start                               | Required observation                                                        |
| ----------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `baseline`        | Item 2 of 3; both directions open          | dialog entry/exit, order, navigation, status timing, zoom, and focus return |
| `first-item`      | Item 1 of 3                                | named first boundary with Previous unavailable                              |
| `final-item`      | Item 3 of 3                                | named final boundary with Next unavailable                                  |
| `single-item`     | Item 1 of 1                                | unavailable boundaries and one exposed named image                          |
| `preview-only`    | Valid preview; no full image               | named image without loading status or Retry                                 |
| `delayed-full`    | Valid preview; full image held 1.5 seconds | pending/loading state followed by successful full-image reveal              |
| `retry-success`   | First full image fails; Retry succeeds     | understandable failure-to-success transition in one run                     |
| `full-failure`    | Valid preview; full image always fails     | failure status, named preview fallback, Retry, and usable close             |
| `preview-failure` | Invalid preview; no full image             | preview failure status and no invented full-image Retry                     |
| `long-localized`  | One item with long Dutch content           | wrapping, reading order, 320 CSS-pixel layout, and physical 200% zoom       |

The lab-only Vite middleware serves the deterministic invalid, delayed, and retry-changing sources
in development and preview. No scenario depends on a Playwright intercept, third-party network, or
package API change.

### Non-live event trace

The event trace records `open-requested`, `opened`, `indexChanged`, `requestClose`, `update:open`,
`closed`, and a bounded post-close `focus-restored` sample, including index and reason where the
public event supplies them. `focus-restored` must identify `at-open-gallery` for a normal close. It has
`aria-live="off"` and no `status`, `alert`, or `log` role. It must not compete with the primitive's
own status output. Read it after a run and compare it with the operator's timestamped notes.

Event order is evidence about Vue events, not evidence that equivalent speech was heard.

### Automated visual evidence

The Chromium harness test regenerates this focused local directory:

```text
.artifacts/media-gallery-at-certification/
```

It captures `01-harness-setup.png`, `02-standard-open.png`, `03-one-item-state.png`,
`04-failure-state.png`, `05-mobile-harness.png`, and `06-event-trace-after-close.png`. These
captures prove the configured harness states were visually inspected; they do not contain or imply
NVDA, VoiceOver, TalkBack, spoken-output, rotor, or reading-control evidence.

## Result vocabulary

Every step and matrix row uses one of these values:

- `Pass` — a human performed the step with the named AT/browser pair and observed the expected
  result
- `Fail` — the observed behavior contradicted the expected result; link an issue
- `Blocked` — setup or platform behavior prevented the step; record the blocker and do not convert
  it to Pass
- `Not run` — no human result exists

Do not use automated Playwright, axe, accessibility-tree snapshots, or this prepared dossier as a
`Pass`.

## Common preparation

Perform these steps separately for every matrix row:

1. Start from a clean harness load at `?demo=gallery-at`; do not reuse state from another AT.
2. Record date, tester, physical device or VM, OS build, browser name/version, AT version, input
   hardware, speech language/voice, browser zoom, display scaling, and motion preference.
3. Enable the AT before interacting with the harness. Confirm speech works on ordinary browser
   chrome and page headings.
4. Set the lab Motion control to `Full` for the baseline status-timing step. Repeat the baseline
   navigation once with `Reduced`.
5. Keep the event trace empty at the start of each scenario. Record exact speech when it matters;
   do not paraphrase a defect.
6. If browser or AT commands differ from this dossier, record the actual command and version. Do
   not silently substitute a mouse-only path.
7. Create the run from
   [the reusable results template](media-gallery-at-results-template.md) before testing.

## Shared acceptance contracts

Use these contract IDs in every platform result.

| ID  | Contract                                                                                       |
| --- | ---------------------------------------------------------------------------------------------- |
| C01 | The opener is named from the selected scenario and opens one native modal dialog.              |
| C02 | Entry exposes `Media gallery certification`; initial focus is `Close gallery`.                 |
| C03 | Background lab controls are not reached while the dialog is modal.                             |
| C04 | Exactly one committed image is exposed with the scenario's alt text.                           |
| C05 | Previous/next names include the destination title; unavailable boundaries are conveyed.        |
| C06 | Item status is emitted once after semantic commit, without stale or duplicate item messages.   |
| C07 | Zoom controls expose names/state; image navigation returns zoom to Fit.                        |
| C08 | Full failure keeps the named preview, exposes Retry, and leaves navigation/close usable.       |
| C09 | Preview failure is conveyed without exposing a full-image Retry.                               |
| C10 | Close exits the dialog and restores focus to the exact opener.                                 |
| C11 | Preview-only media exposes no loading state or Retry.                                          |
| C12 | Delayed full media exposes pending/loading, then succeeds without a failure state.             |
| C13 | Retry-changing media fails once, then the provided Retry succeeds in the same run.             |
| C14 | Long localized content remains readable and operable at 320 CSS pixels and physical 200% zoom. |

Record an issue if the AT speaks a technically present element in an unusable order, repeats status
excessively, loses context, or traps the operator, even when the DOM contract appears correct.

## Required scenario sweep

After each platform's baseline script, complete this sweep with the same AT/browser pair. Reloading
is optional, but every scenario must be selected by its named radio before opening; scenario changes
must not open the dialog or move focus away from the selected radio.

1. Run `first-item`. Confirm the visible contract says item 1 of 3, open, and verify Previous is
   unavailable while Next names its destination (C05).
2. Run `final-item`. Confirm the visible contract says item 3 of 3, open, and verify Next is
   unavailable while Previous names its destination (C05).
3. Run `single-item`. Verify both directions are unavailable, exactly one named image is practical
   to navigate, and background controls remain unavailable (C03-C05).
4. Run `preview-only`. Wait at least two seconds without interacting. Verify the named image remains
   available and no loading message or Retry is exposed (C11).
5. Run `delayed-full`. Without issuing another command, record the pending/loading output and the
   later successful state. Verify the preview remains named while pending and no failure or Retry is
   exposed (C12).
6. Run `retry-success`. Record the first failure and named preview fallback, activate Retry once,
   then verify the failure clears and the image remains operable (C13).
7. Run `full-failure`. Record the failure, named preview, and Retry. Activate Retry once and verify
   the failure remains understandable and Close remains reachable (C08).
8. Run `preview-failure`. Record the preview failure and verify no full-image Retry is exposed
   (C09).
9. Run `long-localized` at the platform's normal size, then at 320 CSS pixels where the browser
   offers responsive emulation or an equivalent narrow physical viewport. Separately set physical
   browser zoom to 200 percent on desktop. Verify long names, title, description, alternative text,
   status, controls, and focus are not clipped or made unreachable (C14). Do not record automated
   zoom-equivalent coverage as the physical zoom result.
10. After closing each scenario, inspect the non-live trace. Verify it ends with `closed`, then
    `focus-restored` identifying `at-open-gallery`. Activate `Clear event trace`; verify it empties
    the trace without changing the selected scenario or opening the dialog (C10).

## NVDA and Firefox on Windows

### Setup

1. Start NVDA, then Firefox. Record both exact versions and whether Firefox is 32-bit or 64-bit.
2. Load the harness and use `H` or the Elements List (`NVDA+F7`) to confirm the harness heading.
3. Use Tab to reach the scenario radios. Select `Baseline, three items`, set Motion to `Full`, and
   clear the trace.

### Script

1. Tab to `Open Baseline, three items` and press Enter. Verify C01 and C02. Use `NVDA+Tab` to record
   the focused control's exact speech.
2. If NVDA remains in browse mode, use `NVDA+Space` to enter focus mode and record that transition.
   With `Close gallery` still focused, press Right Arrow once. Verify `Tall document, 3 of 3` is
   announced once after the visual/semantic commit, focus remains on Close, and trace order is
   `indexChanged` after `opened` (C04-C06).
3. Press Left Arrow once and verify `Wide timeline, 2 of 3` once. Repeat with Motion set to
   `Reduced`; no prior-item message may arrive after the new committed item.
4. Tab forward through the dialog, naming every stop. Confirm background controls are absent,
   disabled boundaries are conveyed, destination-aware labels are intelligible, and traversal
   remains inside the dialog (C03 and C05).
5. Activate `Zoom in`, verify the zoom readout/state is understandable, activate `Fit`, then zoom
   again and activate Next. Verify the item changes and zoom returns to 100% (C07).
6. With focus on a dialog control, press Home and End. Record boundary behavior, message count, and
   whether NVDA intercepted either key.
7. Press Escape. Verify the dialog closes, focus returns to the exact opener, and the trace ends
   with `requestClose` reason `escape`, `update:open false`, `closed`, then `focus-restored`
   identifying `at-open-gallery` (C10).
8. Complete the required scenario sweep above and record C05 and C08-C14 separately.

## NVDA and Chrome or Edge on Windows

Choose Chrome or Edge for a run and record the exact browser. A result from one does not silently
certify the other.

### Setup

1. Start NVDA, then the chosen Chromium browser. Record exact versions and browser channel.
2. Load the harness, confirm the heading with NVDA navigation, select `baseline`, set Motion to
   `Full`, and clear the trace.

### Script

1. Open from the keyboard and verify C01-C02 with `NVDA+Tab`.
2. Confirm or explicitly enter focus mode with `NVDA+Space`. From Close, press Right Arrow, Left
   Arrow, Home, and End one at a time. For each committed item, record exact speech, duplicates,
   timing relative to the visible commit, retained focus, and the corresponding trace entry
   (C04-C06).
3. Tab and Shift+Tab through at least two complete cycles. Confirm modal containment and stable
   order, including the destination-aware navigation names and zoom group (C03, C05, C07).
4. Activate Zoom in twice, Zoom out once, and Fit. Navigate once while zoomed and verify the new
   item returns to Fit (C07).
5. Close with the visible button, reopen, then close with Escape. Verify C10 and record both close
   reasons from the trace.
6. Complete the required scenario sweep. Record any difference from Firefox rather than copying
   its result.
7. Set Motion to `Reduced`, rerun one next/previous cycle, and record whether any stale or duplicate
   status appears.

## VoiceOver and Safari on macOS

`VO` means the configured VoiceOver modifier, normally Control+Option.

### Setup

1. Enable VoiceOver and open Safari. Record macOS, Safari, and VoiceOver versions.
2. Ensure Safari is configured to move keyboard focus to page controls. Record whether macOS Full
   Keyboard Access and VoiceOver Quick Nav are enabled.
3. Load the harness. Use `VO+U` to inspect headings and form controls, then select `baseline`, set
   Motion to `Full`, and clear the trace.

### Script

1. Move to the opener with VO navigation and activate it with `VO+Space`. Verify C01-C02 and record
   the initial dialog phrase.
2. Open the rotor with `VO+U`. Inspect headings and form controls inside the modal. Record their
   order and confirm background lab controls are absent from practical modal navigation (C03).
3. Turn Quick Nav off when necessary so physical arrow keys reach the focused control. From Close,
   press Right Arrow and Left Arrow. Record exact item status, duplicates, timing, retained focus,
   and trace order (C04-C06).
4. Use Tab/Shift+Tab and VO navigation for two cycles. Confirm control names, boundary state,
   destination titles, the single exposed image, and zoom group (C04-C07).
5. Activate Zoom in, Zoom out, and Fit with `VO+Space`. Navigate while zoomed and verify Fit is
   restored on the new item (C07).
6. Close with Escape. Verify focus returns to the opener. Reopen and close with the visible button;
   compare the two close reasons in the trace (C10).
7. Complete the required scenario sweep. Record rotor order, exact failure/loading speech, Retry
   operability, image alt text, wrapping, and C05 and C08-C14 results.
8. Set Motion to `Reduced` and rerun one navigation cycle. Record any change in status timing.

## VoiceOver and Safari on iPhone

Use a physical iPhone. Do not infer this row from macOS Safari or WebKit automation.

### Setup

1. Record iPhone model, iOS version, Safari version where available, VoiceOver voice/language,
   orientation, text size, display zoom, and whether a hardware keyboard is connected.
2. Enable VoiceOver before loading the network harness URL. Select `baseline`, set Motion to `Full`,
   and clear the trace using explore-by-touch or swipe navigation.

### Script

1. Move to the opener with right/left swipes and activate with a one-finger double-tap. Verify the
   dialog context and Close focus (C01-C02).
2. Swipe right through the complete dialog order, then left back to the start. Record every
   practical stop, image alt text, boundary state, and whether background controls become reachable
   (C03-C05).
3. Focus Next and double-tap. Wait without additional gestures. Record the exact status, duplicate
   count, and timing; compare it to the trace after closing (C06).
4. Navigate to Zoom in, Zoom out, and Fit and activate each. Verify their state is understandable.
   Navigate to a new item while zoomed and verify the readout returns to 100% (C07).
5. Use the rotor to inspect available headings, form controls, and images. Record order and any
   missing or duplicated committed image.
6. Close with the visible Close control and verify focus returns to the opener (C10). If a hardware
   keyboard is present, separately test Escape and physical Left/Right; label this supplemental.
7. Complete the required scenario sweep; record C04-C05 and C08-C14. For `long-localized`, record
   actual text size/display zoom and use the narrowest supported physical orientation.
8. Repeat one baseline navigation with Motion `Reduced`.
9. Do not disable VoiceOver to force a direct one-finger media swipe. If VoiceOver reserves a
   gesture, record the AT-owned behavior; explicit Previous/Next controls remain the required path.

## TalkBack and Chrome on Android

Use a physical Android device. Do not infer this row from Chromium automation.

### Setup

1. Record manufacturer/model, Android build, Chrome version, Android Accessibility Suite/TalkBack
   version, TalkBack verbosity, reading-control configuration, orientation, font size, display
   size, and connected keyboard.
2. Enable TalkBack before loading the network harness URL. Select `baseline`, set Motion to `Full`,
   and clear the trace.

### Script

1. Move to the opener with TalkBack next/previous-item gestures and double-tap to activate. Verify
   dialog context and Close focus (C01-C02).
2. Swipe through the entire dialog in both directions. Record practical order, image description,
   boundary state, control names, and whether background controls are reachable (C03-C05).
3. Focus Next and double-tap. Wait without another gesture. Record exact status, duplicates, timing,
   retained context, and later trace correspondence (C06).
4. Activate Zoom in, Zoom out, and Fit. Navigate while zoomed and verify the next committed item
   returns to 100% (C07).
5. Use configured TalkBack reading controls to inspect headings and controls. Record the control
   used and actual traversal; do not assume another tester has the same reading-control set.
6. Close with the visible Close control and verify focus returns to the opener (C10). With a
   connected keyboard, separately test Escape and physical Left/Right as supplemental evidence.
7. Complete the required scenario sweep. Record exact pending/failure output, the named fallback
   preview, Retry operability, localized wrapping, and C04-C05/C08-C14.
8. Repeat one baseline navigation with Motion `Reduced`.
9. Do not disable TalkBack to force a direct one-finger media swipe. Record TalkBack-reserved
   gestures as AT behavior and use explicit Previous/Next controls for the required navigation path.

## Completion rule

A matrix row is complete only when its result file identifies the exact environment, records every
shared contract and platform step, preserves exact observed speech for material announcements,
links failures, and names the human tester. Repository automation remaining green is required for
the harness but is not a substitute.

Keep [release blockers](release-blockers.md) at `Not executed` until real human results exist.
