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
timings are exact to GitHub's one-second resolution. The latest-attempt API
snapshot retains successful first-attempt executions; Chromium 2 uses its passing
second execution. Four existing conditional skips remain.

| Layer                            |                                                  Baseline |
| -------------------------------- | --------------------------------------------------------: |
| Unit suite                       |                             17s; 930 tests; Linux job 88s |
| Chromium 1                       |                       177s test step; 229s job; 104 tests |
| Chromium 2                       |               432s passing test step; 104 tests; 478s job |
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

Repeated CI also exposed a Gallery mixed-aspect snap-back takeover race: one native
rAF sometimes arrived after settlement. The original test reproduced two failures
in ten WebKit/two-worker runs. Its native WAAPI dialog entrance still finishes in
real time; the track coroutine then requests all three controlled rAF frames before
the test advances 64ms. Every original settling-state, 0.1px continuity, movement,
node-identity, final rebase and title assertion remains. Thirty focused repetitions
across three engines passed; two full-spec repetitions added 34 passes and eight
existing skips, with no failures/retries. This affected concurrency defect was fixed,
not dismissed as an unrelated flake.

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

## Implemented ownership and artifact reuse

Chromium has three deterministic, disjoint file groups: general (122 tests), deck
(42), and Direct/pile/reversal (44). New source specs default to general; no unknown
spec silently falls out of certification. A unit test checks the complete file
partition and production-preview exclusion. Firefox (55), WebKit interoperability
(55), and WebKit cyclic deck (13) run as separate jobs. These owners use two workers
and an official Playwright 1.61.1 container matched to the package pin. Preview and
framework fixture certification retain their small existing one-worker jobs.
The existing extra 25 WebKit Direct and 12 WebKit pile tests are promoted from
local-only release verification to two independent source-CI owners. They certify
native Direct capture/paint authority and pile-perimeter compositing in WebKit.
This closes the coverage gap that otherwise appears when candidate materialization
stops running the local gate. Complete local verification retains both projects.

The extra WebKit Direct spec initially retained its original one-worker cap. Its
airborne reversal capture failed once in two complete two-worker repetitions and
once in ten focused two-worker repetitions; ten focused one-worker repetitions
passed. Chromium CI then reproduced the same transient-state race: two native
frames sometimes outlasted the 230ms release being inspected. The capture scenario
now installs the clock before startup and drives its original browser coroutine
in 16ms frames, waiting for explicit coroutine readiness. All original physical
capture, landing-progress, inventory, 2px continuity and 0.00001 scale/rotation
assertions remain. Twenty focused repetitions across Chromium/WebKit passed in
31.7s; two complete repetitions of Chromium Direct/pile/reversal and WebKit Direct
passed all 138 selections without retries. This permits two workers for WebKit
Direct too. Every other native Direct paint/capture witness retains real time.
WebKit pile also passed both complete repetitions at two workers. No source owner
requires serialization after these synchronization fixes; preview and packed
fixture drivers retain their small existing sequential certification flow.

Each original source-CI owner passed two complete local repetitions at two workers:
Chromium general 244 passes, deck 84, Direct/pile/reversal 88; Firefox and WebKit
each 106 passes plus four existing skips; WebKit cyclic 26 passes. There were no
failures or retries across those 662 selections. The corrected general run excludes
preview, whose built entrypoint belongs to integration. Diagnostic writers now use
per-test output paths, avoiding collisions during parallel/repeated execution.

No source-browser tests are deleted. Source CI still selects Chromium 208 and
Firefox 55; WebKit increases from 68 to 105 by inheriting the 37 existing local
release cases. Four existing engine-conditional skips remain. Complete local
browser counts remain Chromium 208, Firefox 55, and WebKit 105.
Preview adds one Chromium test; framework fixtures add 12; packed preferences
retain all 48 three-engine cells. The unit suite keeps all 930 original tests and
adds deterministic tests for partitioning, classification, reporting and evidence.

The package-authority job builds once, packs once, and checks static consumers.
Linux verification and integration both download that exact artifact by ID and
proceed concurrently; neither repacks or rebuilds package authority. Integration still
builds preview and framework fixtures, then certifies the same tarballs through
Nuxt. The production-root lab build and non-root preview remain separate because
they prove different entry/base-path behavior. Separate jobs may build application
fixtures again; transferring the larger Nuxt output has not demonstrated a gain.

Authority includes raw `temp/declarations` alongside public `dist` and tarballs:
API checking consumes those generated declarations. A fresh consumer reproduced
the missing-input failure, then passed API checking with transferred declarations
and no package rebuild. The workflow contract derives every API Extractor input
from the package configurations and requires its containing path to be transferred.

Source-browser and package-integration classification are independent. Pure lab
E2E changes require source browsers; packed/preview fixture and package-assembly
changes require integration. Documentation/candidate records and the two named
timing-audit JSON files require neither; other configuration paths fail closed.
Release-history tooling keeps its existing browser-irrelevant allowlist. Production
source (including Core math and feature modules), dependencies, shared styles,
configuration, CI, malformed/missing diffs, and unknown paths require both. Feature
source is deliberately not narrowed until a dependency/consumer map can justify it.
Every skip and the union of mixed changes is tested; the final gate requires each
owner to succeed or skip exactly as classified and also requires Linux/Windows.

Each source owner emits Playwright JSON, per-project/spec/test totals, retries,
skips, the twenty slowest tests, and a soft Step Summary. Setup, installation,
build and package-consumer costs remain distinct workflow steps. Use
`pnpm test:timing:ci <run-id> <output.json>` to export job and step timings from
the exact GitHub attempt. Durations are reporting signals, never hard assertions.

Release preparation retrieves the full GitHub-certified archive set instead of
rerunning `pnpm verify`. New records bind exact SHA, branch, run, attempt, archive
metadata and hashes to remotely retrieved evidence. Local marker files are rejected.
Historical candidate reconstruction remains a distinct source-to-bytes proof.
See [releasing](releasing.md) for expiry, full-rerun, and clean-source requirements.

The first optimized full GitHub run passed in 331s. It exposed a remaining dependency
cost: integration (177s) waited for all Linux verification (123s). The separate
package-authority owner removes that barrier while keeping one build/pack and one
fast unit suite. Its additional setup is an explicit cost of letting source checks
and packed-browser certification proceed concurrently from the same immutable bytes.
