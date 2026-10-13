# Development verification

How to get feedback while changing code, and when to pay for the broad gates.

The authoritative gates are unchanged: `pnpm verify` locally, and the full Verify workflow with its
fourteen owners, `failOnFlakyTests`, source admission and exact-commit certification in CI. They are
for a change that is believed to be finished. They are the wrong tool for finding the next defect: a
broad run that finds one failure, followed by one correction and another broad run, spends ten
minutes per defect. [Test architecture](test-architecture-and-performance.md) says why the broad
gates are expensive and why that cost is mostly intentional.

## Five levels

Move outward only when the level inside is green. Times are local, on the Windows development host (level 5 is one complete `pnpm verify` there: 30 min,
run while CI ran; the historical isolated Linux figure is 13 min), measured on the Motion Studio's tests (see [Studio test cost](#studio-test-cost)).

| Level | Question                                    | Command                                                                        | Cost                  |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------ | --------------------- |
| 1     | Does the logic hold? Does it type and lint? | `pnpm check:lab` (lint, architecture, lab typecheck, lab unit tests)           | 7 s                   |
|       | One unit file                               | `pnpm exec vitest run apps/lab/test/studio-model.test.ts`                      | 2 s                   |
| 2     | Does this behaviour work in a real browser? | `pnpm exec playwright test e2e/studio.spec.ts --project=chromium -g "<title>"` | 3 s per test          |
| 3     | Do the affected specs pass together?        | `pnpm test:studio` (Chromium, every Studio spec)                               | 60 s                  |
| 4     | Do the other engines agree?                 | `pnpm test:studio:witness` (Firefox and WebKit owners)                         | 2.4 min               |
| 5     | Is it ready to ship?                        | `pnpm verify`, then the full Verify run in CI                                  | 30 min here, 8 min CI |

Level 2 and 3 need a dev server. Playwright reuses one that is already running, so start it once and
leave it:

```bash
pnpm dev --host 127.0.0.1 --port 4173
```

(Playwright's own default is port 4173; set `SNAP_MOTION_TEST_PORT` to use another.) Without one it
starts its own, which costs a few seconds per run.

### What belongs at which level

- **Level 1: exhaustive state.** Anything combinatorial belongs in a model test, not a browser.
  `studio-model.test.ts` checks every rule and a seeded walk of 40 × 150 operations in under half a
  second; the same coverage in a browser would take minutes and say less. A new rule gets a unit test
  first.
- **Level 2 and 3: real-browser behaviour.** Physical card continuity, native pointer capture, native
  dialogs and focus, layering, View Transitions, accessibility, reduced motion and the rendered result.
- **Level 4: engines that disagree.** Native dialog and focus restoration, pointer capture, and
  rendering are where Firefox and WebKit have caught what Chromium did not (WebKit's focus return after
  a native close, found twice in the Studio).
- **Level 5: everything, once.** Build, API, size, packed consumers, preview, fixtures and the full
  three-engine matrix.

### Choosing level 3 by path

The CI classifier is deliberately coarse (any source path needs every owner). Locally:

| You changed                                        | Run at level 3                                      |
| -------------------------------------------------- | --------------------------------------------------- |
| `apps/lab/src/playground/studio/**`, `e2e/studio*` | `pnpm test:studio`                                  |
| `packages/vue/src/stacked-deck/**`                 | `pnpm test:browser:stacked-deck`, then the Studio's |
| `packages/vue/src/sheet/**`                        | `pnpm test:browser:sheet`, then the Studio's        |
| `packages/vue/src/media-gallery/**`                | `pnpm test:browser:gallery`                         |
| A spec only                                        | `pnpm exec playwright test <spec> --only-changed`   |

`--only-changed` selects by changed _test files_ (and what they import). It cannot see application
code that only runs in the browser, so it is a spec filter, not an impact analysis.

## When something fails

1. **Record the first failure.** Not the last line of a long log: the first test that failed, and its
   message.
2. **Classify it.** Application behaviour; test expectation; harness synchronization (a wait that
   does not wait for the fact it needs); environment (a port, a browser, a clipboard permission); or a
   suspected flake.
3. **Reproduce it with the smallest test.** `-g "<title>"`, one project. `pnpm test:failed` re-runs
   exactly what failed last time.
4. **Correct the root cause.** Not the symptom, and not the timeout.
5. **Repeat it** (`--repeat-each=5`) to see it is stable, then run the affected group (level 3).
6. **Resume the broad gate** only when that failure is understood and gone. If a different failure
   appears, triage it on its own; do not restart the broad run to see what else is wrong.

What not to do: lengthen a timeout or add a sleep to hide a race; relax a tolerance without a
technical reason; turn a failure into a skip; rely on a retry as proof (`failOnFlakyTests` exists
because a passing retry hides a real race); change production physics to satisfy a test.

Use `pnpm test:timing:local <playwright arguments>` to see where a run's time went. It adds a JSON
reporter, runs exactly what it is given, and prints the same per-spec and slowest-test summary CI
publishes.

## Deterministic time

Where native timing is not what is being tested, install the browser clock before the page starts and
advance it explicitly (`page.clock.install()`, `runFor`). It controls `requestAnimationFrame`,
timers and `performance.now()`; it does not accelerate native Web Animations or CSS animations, so a
test of those keeps real time. The Studio's replay, which is a timer chain, is tested this way: a run
of four steps at 420 ms takes no wall time and cannot race.

## Studio test cost

The first Studio's browser specs (92 Chromium tests) took 105.9 s of wall time on two workers, 205 s
of aggregate test time. Half of that was one matrix: the comparison Deck's reconciliation spec ran the
same assertions at four widths in two exchange modes (16 tests, 98 s), because the layout it
protected had two regions that could overlap. The redesign removes that overlap, so the matrix is two
widths in the one exchange mode the Studio's Deck has, and every per-frame invariant is kept.

| Chromium, 2 workers, local | Before (first Studio) | After (this design) |
| -------------------------- | --------------------: | ------------------: |
| Tests                      |                    92 |                  70 |
| Wall time                  |               105.9 s |              61.8 s |
| Aggregate test time        |                 205 s |             119.7 s |
| Reconciliation spec        |       20 tests, 105 s |       6 tests, 19 s |
| Single slowest test        |                 9.6 s |               6.5 s |

The layout spec's nine sequential axe scans (one 13.6 s test) are now seven tests, one scan each, so
they run on separate workers and name the state that failed.

Firefox and WebKit run the journey, the transitions and the reconciliation specs: 98 tests, 94 pass and
4 are the Chromium-only checks skipped by design, in 2.4 minutes for both engines in one command.

CI times for these owners are in [test architecture](test-architecture-and-performance.md#motion-studio).

The numbers are one host, two workers, and a Vite development server. They show where time goes and
whether a change helped; they are not a CI prediction and are never asserted on.

### After the item carousel

The Studio's task changed from five screens on a rail to eleven photos in a conversation, and B became
editable (see [Motion Studio](motion-studio.md)). One host, two workers, a Vite development server:

| Local run                                    |                                   Result |
| -------------------------------------------- | ---------------------------------------: |
| `pnpm check:lab` (lint, typecheck, 243 unit) |                       about 9 s, passing |
| `pnpm test:studio` (Chromium)                |                       162 tests in 138 s |
| `pnpm test:studio:witness` (Firefox, WebKit) | 238 passed, 4 skipped by design, 6.1 min |
| `pnpm test:preview` (build, then built page) |             9 tests, 6 s after the build |

Three new browser specs carry the change (`studio-media`, `studio-tune`, `studio-media-touch`); the
tap decision, the strip's geometry, the Custom candidate and editing B are unit tests, so the
combinatorial parts (what editing B copies, what a full shortlist does, when a layout call-out appears)
cost no browser time. Two lessons from writing the browser specs belong here because they cost a
failing run each:

- A page that scrolls smoothly, and a View Transition that holds the page for a few hundred
  milliseconds, both cancel a touch or a pointer that arrives during them. A spec that aims input at a
  surface centres it, waits for the scroll to stop (`centreOnScreen` in `studioHelpers.ts`) and, after a
  view change, waits for `document.documentElement.dataset.studioTransition` to clear.
- Dragging or clicking a stage scrolls the page to reach it, so a stability assertion compares document
  coordinates (`y + scrollY`), not viewport ones.
