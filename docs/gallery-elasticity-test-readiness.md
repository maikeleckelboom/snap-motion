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

Reapplying resistance on a held remeasurement remains an independent engine follow-up. A future
fix should define the raw/presented drag-coordinate contract and certify actual resize and decode
measurements while held. The improved readiness check must not be treated as proof that this
engine behavior has been fixed. The controlled probe, before/after JSON and first-failure evidence
remain uncommitted in `.artifacts/playground/polish/`.
