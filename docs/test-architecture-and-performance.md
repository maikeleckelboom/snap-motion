# Test architecture and verification performance

## Baseline, 6 October 2026

The pass started on clean `dev` at `a0377e13dc098c8e814a2c39724ce7b4696df312`.
Its package source is `8fa65ecf4215c4586cb007655cf54b277c83e229`; the intervening
commit adds only the immutable beta.14 candidate record. Verify run
[37470543891](https://github.com/maikeleckelboom/snap-motion/actions/runs/37470543891)
is the source baseline. `config/test-performance-before.json` preserves job/step
durations, every spec and project, individual tests, and the twenty slowest tests.
Serial line-reporter start-to-next-start intervals estimate test duration including
hooks and the next test's launch. They are not precise reporter durations. Job API
timings are exact to GitHub's one-second resolution. Chromium 2 uses its passing
second attempt; other jobs use attempt 1. Four existing conditional skips remain.

| Layer                            |                                                  Baseline |
| -------------------------------- | --------------------------------------------------------: |
| Unit suite                       |                             17s; 930 tests; Linux job 88s |
| Chromium 1                       |                       177s test step; 229s job; 104 tests |
| Chromium 2                       | 432s passing test step; 104 tests; first-attempt job 478s |
| Chromium parallel critical path  |          432s tests plus setup; 609s aggregate test steps |
| Firefox                          |        approximately 118s serial test intervals; 55 tests |
| WebKit interoperability          |                              approximately 137s; 55 tests |
| WebKit Stacked Deck              |                              approximately 294s; 13 tests |
| Combined interoperability        |        554s test step; 607s job; 123 selected, 119 passed |
| Browser integration              | 177s job; installation 51s; packed Nuxt certification 70s |
| Browser container initialization |                                                       26s |
| Chromium installation            |                                               23s and 25s |
| Windows portability              |                            16s test/packing step; 76s job |

The main deck (168s), Direct (119s), pile (72s), and Direct reversal (30s)
dominate Chromium 2. WebKit's two revolution scenarios take approximately 77s and
66s versus 24s each in Chromium. Each retains 28 settlements across two variants
and both directions. The healthy unit layer is not a sharding target.

The baseline first attempt had a Sheet reopen flake: `reopens an active close
continuously and ignores obsolete completion` observed `closed` instead of
transient `closing`; its retry passed. `failOnFlakyTests` correctly rejected that
attempt. The passing rerun is not evidence that serial execution prevents flakes.

## Layer ownership

- Units/components/models: exhaustive mathematical, state-machine, lifecycle,
  and callback invariants. Keep one fast suite on Linux; Windows owns CLI and
  package portability only.
- Chromium: the complete source behavioral matrix, partitioned by measured work
  rather than count. General interactions, cyclic deck, and Direct/pile geometry
  have distinct groups.
- Firefox: native pointer/focus/dialog behavior, Sheet layout, surface preference
  adoption, deck consumer/trace behavior, and gallery interruption. Gecko provides
  an independent event, layout, and focus implementation.
- WebKit: the same interoperability witnesses plus cyclic deck geometry, clipping,
  authority, shell continuity, and gestures. Its transform/compositing and pointer
  implementation already produce substantially different timing from Chromium.
- Production preview and framework fixtures: built entrypoints, router teardown,
  SSR/hydration, and production base paths.
- Packed consumers: exact archives, export/type boundaries, transitive Core,
  Nuxt SSR/hydration, and the complete three-engine preference matrix.
- Candidate construction: exact certified source, aligned unrecorded version,
  archives, hashes, metadata, and provenance.
- Candidate reconstruction: historical source and reproducible archive identity;
  source behavior belongs to source certification.

## Proposed optimization and safeguards

Install the Playwright clock before application startup for repeated-settlement
tests, let the browser measure real geometry, then drive rAF in explicit increments.
Sample transition states and retain every revolution, identity, drift, continuity,
and final-state assertion. Do not alter production spring constants. Keep native
pointer/compositor witnesses in real time where that is the behavior under test.

Use three stable Chromium file groups based on the baseline costs. Run Firefox,
WebKit interoperability, and WebKit cyclic certification as independent jobs.
Compare one and two workers repeatedly before choosing concurrency; context-local
clocks, local fixture state, and `testInfo.outputPath` make parallelism plausible,
but frame-sensitive real-time tests still need measured evidence.

Reuse a single package build and archive set across CI package consumers. Compare
the official version-matched Playwright container with installation overhead.
Keep fail-closed changed-path admission and a stable final Browser certification
gate. Unknown paths, missing diffs, shared runtime/CSS, and infrastructure changes
must require the broad matrix.

Candidate optimization must query authoritative GitHub evidence for the exact
source SHA and retrieve the certified archives. A locally editable verification
marker is insufficient. Historical records and reconstruction remain immutable.

## Controlled settlement evidence

An isolated Linux checkout used Node 24.16.0, pnpm 11.13.1, and Playwright 1.61.1.
The original two scenarios passed at one worker. Converted scenarios and Sheet
reopen then passed three repetitions at two workers: 21 passes, no retries/failures.

| Scenario                                      | Chromium before | Chromium after range | WebKit before | WebKit after range |
| --------------------------------------------- | --------------: | -------------------: | ------------: | -----------------: |
| Button revolutions, both variants/directions  |           24.2s |             5.6-6.0s |         40.6s |         10.1-10.5s |
| Pointer revolutions, both variants/directions |           24.2s |             6.1-6.6s |         35.5s |         10.4-10.8s |

These local before/after figures share a machine; the CI WebKit baseline is slower.
Every original 28-settlement sequence, six-decimal local-zero assertion, and shell
inventory remains. Each variant/direction additionally traces a representative
exchange through intermediate rAF publications. Shuffle retains opaque-shell and
continuous-handoff assertions; Direct retains finite unclipped DOM poses because
its independently released shells have different top/target roles. Existing
real-time pointer, compositing, takeover, and full-frame exchange tests remain.
No production duration or spring is changed. Sampling every frame of all 28
settlements added unnecessary WebKit style-resolution cost, so the added tracing
is representative while the original exhaustive rest checks still cover every step.

Sheet reopen installs the clock before fixture startup, reaches an actual opening
frame, closes for 32ms, and reopens without transport-time drift. Its continuity
assertion tightens from 160px to 0.1px. Advancing past both obsolete and current
completion times still proves the reopened dialog survives and returns focus.

Playwright controls rAF/performance clocks; it does not accelerate native WAAPI or
CSS animation timelines. The deck's bounded spring uses rAF, and these tests read
the actual DOM, while dedicated real-time paint witnesses retain compositor proof.
See the [official clock documentation](https://playwright.dev/docs/clock).

## Structural performance budgets

- Exhaustive state-machine permutations belong in deterministic model tests.
- Repeated browser settlements use controlled time unless native timing is itself
  the assertion. Document every serial-only owner and its demonstrated reason.
- Every browser owner retains its explicit behavioral purpose and coverage count.
- CI emits per-spec/project/test timings and slow-test summaries without hard
  wall-clock assertions. Runner variability never changes assertion strength.
- Changed-path skips and the final certification gate have deterministic tests.
- Development follows focused test, affected suite, fast checks, then one final
  source gate. Release materialization is a separate operation.
