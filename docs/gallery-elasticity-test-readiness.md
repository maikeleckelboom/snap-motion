# Gallery elasticity comparison readiness

The Lab live-settings check compares the same 240px held overdrag under Balanced, a zero elastic
limit, and Loose. It also checks the retained semantic item and mounted demo identity. Those
assertions remain unchanged.

The comparison needs fixed, decoded media geometry. The Lab mounts five images, including a
deliberately delayed fixture. Every successful decode calls `motion.remeasure()` after the DOM
update, even when that image is not the active one. Starting the gesture before these writes finish
can include a remeasurement in what the test describes as a pure elasticity comparison.

## Baseline evidence

The first product-polish source-browser run failed in Firefox with Balanced at 41.74px and Loose
at 22.28px. The first CI run had the same Gallery reading in WebKit and passed on its automatic
retry. Focused ordinary runs passed on both the original and polished source, so those passes alone
did not establish the cause.

A controlled browser probe holds a 240px Loose overdrag, then dispatches a resize notification while
keeping the actual viewport width fixed. It produces the same values on the exact starting commit
`9b388f82f5ff81f6a667208d270974f9c65dbc4f` and the polished implementation:

| State                     | Position | Phase    | Viewport width |
| ------------------------- | -------: | -------- | -------------: |
| Held before remeasurement |  50.44px | dragging |          594px |
| Held after remeasurement  |  22.28px | dragging |          594px |

The controller's existing dragging measurement path constrains the already resisted position
again. With Loose's unchanged elasticity, applying the nonlinear resistance to 240px gives
50.44px; applying it to 50.44px gives 22.28px. This establishes a pre-existing sensitivity to
remeasurement during elastic overdrag. The matching CI reading is consistent with a late decode
measurement, although the original failed attempt has no trace proving that exact callback.

## Isolated test repair and follow-up

`heldEdgeOverdrag()` now requires all five image load states to be `loaded`, then drains the existing
two-frame layout boundary before starting the gesture. This observes the fixture readiness required
by the comparison. It does not change the expected displacement, relax a tolerance, remove an
assertion, substitute a sleep, or alter the live-settings and mount-identity contracts.

Other Gallery tests still exercise delayed loading, active motion, resize and interruption. Core,
Vue, preset definitions, media fixtures and the Lab implementation remain unchanged in this
product-polish milestone.

At the product-polish boundary, reapplying resistance remained an independent engine follow-up.
The improved readiness check alone did not prove that engine behavior fixed. Original evidence
remains uncommitted in `.artifacts/playground/polish/`.

## Final integration correction

The controller now retains raw held travel independently of its resisted presentation. Remeasurement
rebases both the drag origin and raw travel by the same semantic-coordinate delta, then constrains
raw travel once under the new bounds. Repeating an unchanged measurement is idempotent. New pointer
samples, release policy, springs and preset values retain their existing contracts.

A deterministic regression failed before the correction (48px became 18.46px) and passes afterwards.
It covers five repeated measurements, coordinate rebasing, a subsequent pointer sample and release.
A real Gallery browser regression changes the delayed fixture's source while holding a stationary
240px Loose overdrag, admits its decode, waits for rendered remeasurement and verifies unchanged
position and retained dragging ownership. The fixture comparison still awaits decoded geometry;
its original displacement, target and mount-identity assertions remain.
