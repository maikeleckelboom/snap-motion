# Native pointer capture ownership

## Diagnosis

Starting `dev`: `a0e3c1f93f4fdc5d6d80fa1ba708093b7b4b19f1`.

A native CDP touch on an image in a StackedDeck card reproduced premature cancellation on that
unchanged production source. The image obtained implicit capture. Horizontal intent caused
`usePointerDrag` to request capture on the deck. When the browser processed this transfer, the
image's `lostpointercapture` bubbled through the deck. Both `usePointerDrag` and
`useSurfaceGesture` accepted that event based only on its pointer ID. The low-level callback
returned the controller to the drag origin; StackedDeck's deferred cancellation callback also
restored its interaction origin. The deck entered `settling` before release.

The baseline native trace for pointer ID 2 was:

| Event              | Origin | Image captured | Deck captured | Phase at observation |
| ------------------ | ------ | -------------- | ------------- | -------------------- |
| pointerdown        | image  | true           | false         | idle                 |
| gotpointercapture  | image  | true           | false         | idle                 |
| pointermove        | image  | true           | false         | idle                 |
| lostpointercapture | image  | false          | true          | dragging             |
| gotpointercapture  | deck   | false          | false         | settling             |
| pointermove        | deck   | false          | false         | settling             |

Capture-event observations occur at the deck's capture-phase listener, before its cancellation
handlers. The first movement requests ownership after that observation. The descendant loss then
caused cancellation to release the deck's pending capture before its `gotpointercapture` arrived.
All recorded events were browser-trusted. No pointer release or cancellation had occurred.

## Ownership rule

The accepted pointerdown's `currentTarget` is the fixed capture owner for that gesture. The
low-level drag recognizer already stored it; the surface recognizer now stores the same element.
Both apply one internal predicate: capture loss must name the tracked pointer, originate on that
stored owner, and find that the owner no longer has capture.

`event.currentTarget` on the loss event alone cannot distinguish bubbling. `event.target` alone
cannot distinguish a stale loss after the owner has acquired capture again.
[`hasPointerCapture`](https://www.w3.org/TR/pointerevents/#dom-element-haspointercapture)
includes pending capture, so checking it also protects a newly requested capture before the browser
dispatches `gotpointercapture`. The existing generation guard continues to retire deferred
surface results after replacement or teardown; it does not establish DOM capture ownership.

Actual pointerup and pointercancel retain their existing terminal paths. A genuine owner loss
still cancels safely. A secondary pointer's cancellation now removes that contact from the active
set without terminating the primary: otherwise reuse of that ID in a subsequent gesture could
escape multiple-contact arbitration. This related defect was reproduced by a focused regression.

Release and cancellation now share each recognizer's completion path. The surface resolves the
outcome once, synchronously arms or clears compatibility-click suppression, and publishes behind
the existing generation guard. Low-level listener registration uses the installed VueUse
`useEventListener` (`@vueuse/core`); its explicit cleanup handles remove listeners synchronously
before capture release. Registration occurs only after an accepted browser pointerdown, preserving
SSR behavior. These consolidations keep the correction inside the unchanged entrypoint size budgets.

## Coverage and scope

`packages/vue/test/pointerCaptureOwnership.test.ts` exercises both shared recognizers together:
descendant loss during pending intent and active touch/mouse/pen drag, normal release, genuine
cancel and owner loss, recapture after interruption, a changed surface ref, distinct pointer IDs,
and repeated secondary-contact cancellation. Existing epoch tests retain queued-result coverage.

`e2e/pointerCapture.spec.ts` uses the existing Chromium project with a touch-capable context and
native `Input.dispatchTouchEvent`. For both Shuffle and Direct, it proves image implicit capture,
transfer to the deck, bubbling descendant loss, continued dragging and movement, then either
normal next-card settlement, pointercancel restoration, or genuine capture-loss restoration.
Each run attaches its trusted pointer lifecycle and final current/settled state. Polling waits for
the actual native events; there are no fixed delays. The lab's decorative image opts out of hit
testing, so this test enables image hit testing to represent ordinary consumer card content.

StackedDeck and Coverflow both use these shared recognizers. Other consumers of `usePointerDrag`,
including carousel and Sheet input, receive the low-level ownership correction. No public API,
physics, selection rules, Sheet presentation, dependency, snapshot, tolerance, or release record
changes are required. No production tracing is added.

## Final local validation (2026-09-12)

Pinned runtime: Node 24.16.0 and pnpm 11.13.1. Source/test hashes and complete logs are retained
under `.artifacts/native-pointer-capture/`; no runtime inputs changed during focused revalidation.

| Check                                                                                                 | Result                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared input and spatial-surface unit selection                                                       | 56 passed                                                                                       |
| Native CDP touch, six cases repeated five times                                                       | 30 passed, no retries                                                                           |
| Complete unit suite                                                                                   | 864 passed in 70 files                                                                          |
| Formatting, lint, architecture, package/app builds, types, API reports, size budgets, release history | Passed                                                                                          |
| Browser-free packed Core, TypeScript 7, minimum-Vue SFC/Vite/SSR consumers                            | Passed                                                                                          |
| Packed Nuxt preference matrix                                                                         | 45 passed; three WebKit baseline failures, reproduced on an unchanged rerun and starting commit |
| Main browser suite                                                                                    | 342 passed; three failed, followed by the focused evidence below                                |
| Built preview                                                                                         | 1 passed                                                                                        |
| Framework fixtures                                                                                    | 12 passed                                                                                       |

The first aggregate attempt stopped at size enforcement. Completion/listener consolidation brought
all entrypoints under unchanged budgets. The final `pnpm verify` attempt passed through package
certification and stopped at the packed WebKit matrix; it did **not** pass as an aggregate command.
The remaining browser, preview and framework commands were then run separately.

The packed failures are `wide-no-preference-system`, `wide-no-preference-false` and
`wide-reduce-false`. Each measured 0.4094390869140625px of visible side-panel width against the
unchanged requirement of more than 40px. The same three cells failed with identical measurements
on an isolated, clean checkout of the starting commit. This is a pre-existing Windows/WebKit
geometry failure, before pointer interaction. The matrix failure prevents that script's subsequent
standalone Chromium Sheet composition block from running locally; the separate Sheet/browser and
framework suites still ran. No geometry assertion was modified.

The main-suite failures were:

- Firefox Sheet reopening (`sheetContent.spec.ts:441`): movement 198.348999px against the existing
  limit below 160px. Its immediate rerun passed; five repeats passed four and failed one at
  268.009979px. Ten repeats on the unchanged starting commit passed five and failed five with the
  same assertion, establishing inherited intermittency without claiming a changed failure rate.
- WebKit Direct third-hand and airborne-reversal cases (`stacked-deck-direct.spec.ts:900,966`):
  expected landing records were absent under the aggregate run. Both immediate focused reruns and
  all five repeats per case passed with unchanged inputs. These are recorded as transient failures
  closed by focused revalidation, not as an aggregate pass or a physics fix.

The previously documented raster mismatch did not recur in this main run. Existing screenshot
identities, raster assertions, timeouts, thresholds and tolerances remain intact.

A final successful Direct trace retained pointer ID 2 throughout: image pointerdown/implicit
capture, image capture loss with deck capture true and phase dragging, deck capture acquisition,
four further deck movements while dragging, deck pointerup while still dragging, and normal deck
capture release during settling. The final result was `phase=idle`, `current=team`, `settled=team`
from the initial `map` card. The full trace is also attached by the native regression itself.
