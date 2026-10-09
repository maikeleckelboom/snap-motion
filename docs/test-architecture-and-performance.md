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

### Verification ownership

Repository admission always runs (history integrity plus classification) and publishes
five independent owners, each with one documented purpose. Package authority builds and
packs the one archive set; Linux verification runs format, lint, typecheck, unit tests,
API and size checks over it; Windows portability runs the pnpm/assembly tests and
`pack:packages`; source browsers run the lab matrix; package integration runs preview,
fixtures and packed Nuxt. Dependencies are closed: Linux needs the authority, and
browsers or integration need Linux, so a lab-only E2E change still runs lint and
typecheck over the spec.

| Path class (exact)                                                                                                                                        | Owners required                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Root `*.md`, `docs/**/*.md`, `.changeset/*.md`, `config/release-candidates/*.json`, `config/test-performance-{before,after}.json`                         | none (metadata format gate only)       |
| Release tooling and its tests (`release-candidate*`, `sourceVerification*`, `verify-release-candidate`, `release-blockers.json`, `release-candidate.yml`) | package authority, Linux               |
| `pnpm-cli.test`, `release-package-assembly.test`, `verify-packages`, `packages/**/*.md`                                                                   | adds Windows                           |
| `pack-packages`, `release-package-assembly`, `pnpm-cli`, `packedArchive`                                                                                  | authority, Linux, Windows, integration |
| `verifyPackagesBrowser`, `certifySurfacePreferences`, `e2e/{media,playground}-preview.spec.ts`, `fixture-e2e/**`, `fixtures/packed-consumers/**`          | authority, Linux, integration          |
| other `e2e/**`                                                                                                                                            | authority, Linux, source browsers      |
| everything else (source, manifests, lockfile, config, CI, classifier, unknown, nested Markdown)                                                           | every owner                            |

Mixed changes take the union; a metadata file can never downgrade another path. Empty,
invalid, unreachable or unavailable diffs, unknown events and manual dispatch require every
owner. Lightweight runs add a `Metadata format` job (`pnpm format:check`) because the
Linux suite that normally enforces repository-wide formatting is skipped. The admission
summary lists each owner as required (with its triggering paths) or skipped.

The final gate asserts, for every owner, required ⇒ success and not required ⇒ skipped;
anything else (failure, cancellation, an unexpected skip or an unexpected run) fails, and
incoherent flag sets are rejected. Only a run requiring all five owners writes the verified
source archive evidence. Candidate preparation additionally requires GitHub's job snapshot
to show all fourteen source owners successful exactly once, so a lightweight or partial
Verify run, even at the candidate's exact SHA, can never satisfy it, and a newer
lightweight run does not shadow an earlier full run.

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

## Final measured results

Full source run [37507407043](https://github.com/maikeleckelboom/snap-motion/actions/runs/37507407043)
passed all fourteen owners at `983324eecd40abd1e16f80b416dde1e2cbf9f6c0`, attempt 1.
[The after profile](../config/test-performance-after.json) retains every source,
preview and fixture spec/project/test, the top twenty tests, job/step durations,
coverage counts, repeat evidence, and candidate/reconstruction measurements.
The following rows distinguish native test time from job and parallel cohort time.

| Layer                          |                                                Before |                                                After |
| ------------------------------ | ----------------------------------------------------: | ---------------------------------------------------: |
| Units                          |                                930 tests; 17s CI step |           984 tests; 20s CI step; 19.04s native wall |
| Chromium longest job           |                478s passing execution; 432s test step |                             192s job; 140s test step |
| Chromium cohort wall           |                                    472s first attempt |                                                 192s |
| Chromium aggregate test steps  |                            609s across two executions |                  327s across three concurrent owners |
| Firefox                        |    Shared 607s job; approximately 118s test intervals |                         126s job; 74.5s native tests |
| WebKit interoperability        |    Shared 607s job; approximately 137s test intervals |                        151s job; 100.4s native tests |
| WebKit cyclic deck             |    Shared 607s job; approximately 294s test intervals |                        154s job; 101.1s native tests |
| WebKit Direct                  | Existing local-only owner; no independent CI baseline |                        242s job; 190.3s native tests |
| WebKit pile                    | Existing local-only owner; no independent CI baseline |                        217s job; 165.2s native tests |
| Interoperability cohort wall   |                 607s combined job; 123 selected cases |          283s across five owners; 160 selected cases |
| Browser integration            |           177s job; 51s installation; 70s packed Nuxt |             168s job; 26s container; 82s packed Nuxt |
| Normal browser-relevant Verify |             626s measured first-attempt critical path |                          310s successful full matrix |
| Candidate preparation          |   Entire local `pnpm verify`; not independently timed | 4.51s isolated certified fetch/materialization probe |
| Candidate reconstruction       |                      45s job; 19s reconstruction step |                     49s job; 19s reconstruction step |

The 626s baseline attempt failed on the documented Sheet flake; it is measured
execution cost, not a passing full-run claim. The passing Chromium 2 execution is
reported separately. The final source critical path is 50.5% shorter, while
source CI inherits all 37 existing WebKit release-only cases. Chromium jobs are
170s/135s/192s including setup, compared with 229s/478s; their test steps are
109s/78s/140s. Aggregate Chromium job time drops from 707s across the recorded
executions to 497s despite a third setup. No case, engine witness, or assertion
is removed to obtain these results.

The final CI revolution scenarios take 6.75s/7.93s in Chromium and 9.35s/10.13s
in WebKit, retaining both variants, both directions, every settlement, and added
representative transition tracing. Cross-browser CI selected 160 cases, with
156 passes and four unchanged conditional skips. Source Chromium passed all 208.
Preview/fixtures passed all 13; packed certification retained sixteen preference
cells per engine. The original 930 unit tests remain; 54 new tooling/architecture
tests account for the count increase.

Browser installation is absent in the matched containers, but container startup
still costs 25-34s per owner. Parallel setup has a measured cost; the main gain is
concurrent engines, balanced work and controlled spring frames. This run also
queued Firefox and WebKit Direct for 41s after other browser owners started. Thus
the interoperability cohort's 283s exceeds its longest individual 242s job.

Concurrency is context-local: clocks, lab state, preferences and debug publications
belong to each page/context. The shared Vite server serves immutable source and
has no mutable per-test server state; jobs own separate hosts/ports. Diagnostic
filenames use per-test output paths. Two workers were retained after repeated
whole-owner coverage; higher worker counts were unnecessary to meet the critical
path target and would add contention on two-core runners. The final full CI matrix
had no unexpected or flaky outcomes and no test retries. Earlier newly exposed
Gallery/Direct timing failures were investigated and fixed, not waived.

One complete isolated Linux `pnpm verify` passed in 778s, including 977 units at
that revision, all 368 source-browser selections (364 passes/four existing skips),
packed consumers, preview and fixtures. Subsequent synchronization and CI-input
repairs received focused repeats and final exact-source GitHub certification.
The full local browser matrix still took 618s: running all engines and native paint
witnesses on one host remains expensive. Focused development commands avoid paying
that aggregate cost during iteration; Windows `pnpm check:fast` measured 65.6s.

The candidate probe performs real authoritative GitHub retrieval, archive inspection,
formatting, exclusive sandbox assembly and hash comparison at the certified source.
Fetch took 3.46s and assembly 1.05s. It creates no repository candidate, changes no
version and leaves the already-recorded beta.14 ineligible. An independent old
candidate timing is unavailable; the old full-gate dependency is established by
the command graph, not represented as an invented measurement. Reconstruction of
the existing immutable record passed in
[37497899550](https://github.com/maikeleckelboom/snap-motion/actions/runs/37497899550),
retaining the historical-source-to-archive identity proof.

Remaining costs are intentional paint evidence and package consumer preparation.
The slowest final test is WebKit pile perimeter ownership (75.8s): it already uses
controlled time and checks real screenshots against physical publication geometry.
WebKit Direct visual authority takes 40.2s; native capture/paint witnesses continue
to use real frames. Packed Nuxt build/hydration takes 82s. Removing screenshot or
compositor assertions would trade confidence for speed and is outside this pass.

### Lightweight verification measurement

| Verify run                                                | Wall clock | Owners that ran                                      |
| --------------------------------------------------------- | ---------: | ---------------------------------------------------- |
| Audit/docs-only commit `8dfb8ec` (before)                 |       180s | admission, authority, Linux, Windows, certification  |
| Docs-only commit `0dd6363` (after)                        |        57s | admission, metadata format, certification            |
| Ownership-change commit `2a49902` (full, run 37518319646) |       291s | all fourteen source owners; complete matrix retained |

The lightweight path is roughly 3x faster than the previous audit-only run and its
cost is admission plus one installed `format:check`. The runtime-source path is
unchanged (291s versus the earlier 310s full matrix) and still requires every owner.
A candidate-record-only commit takes the same path; history integrity and record
validity are enforced by admission, whose append-only tests (modify, delete, rename,
valid add, invalid add) are unchanged.
