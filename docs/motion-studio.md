# Motion Studio

Section 06 of the public Playground, "Choose the motion". It is a small product for one decision:
which motion should switch between an interface's screens? You shortlist candidate behaviours, run
two of them side by side on the same screens, read what differs, and record a choice and the code
that gives it.

It is application code in `apps/lab/src/playground/studio/`. It adds no package API, no dependency
and no motion logic: it composes the public `Coverflow`, `StackedDeck` and `Sheet` components and
owns only content, layout, application state and orchestration. Why it replaced the first Studio,
and what was wrong with that one, is in the [UX diagnosis](studio-ux-audit.md).

## The workflow

| Step        | What the visitor does                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Candidates  | Browse seven live behaviours. Open one to run it alone; shortlist some.          |
| Shortlist   | The first is the reference **A**. The rest ride a Deck; the front card is **B**. |
| Compare     | A and B run side by side on the same screens with the same input.                |
| Differences | A table of what differs, and the two step responses on one axis.                 |
| Decision    | Choose A or B, say why, and open the implementation.                             |

## Candidates

A candidate is a behaviour a product could ship:

| Candidate          | Surface | Exchange | Feel                           |
| ------------------ | ------- | -------- | ------------------------------ |
| Tight rail         | Rail    | none     | Tight                          |
| Balanced rail      | Rail    | none     | Balanced                       |
| Loose rail         | Rail    | none     | Loose                          |
| Your tuning        | Rail    | none     | the Playground's Motion Tuning |
| Shuffle deck       | Deck    | Shuffle  | Balanced                       |
| Direct deck        | Deck    | Direct   | Balanced                       |
| Heavy shuffle deck | Deck    | Shuffle  | Heavy                          |

A rail is `Coverflow`; a deck is `StackedDeck`. The sample content is the same five product screens
the Playground's own Coverflow and Deck sections use, so the Studio fetches no media of its own.

`candidate-definitions.ts` holds the catalogue as plain data (no framework, no engine import), so the
model, the unit tests and the browser specs read one source. `candidates.ts` resolves a definition
into numbers for the page's current tuning. "Your tuning" is the only candidate that follows it; every
other candidate's numbers come from its own preset and never move. That is what keeps the Motion
Tuning bar under section 06 meaningful: tune it, then compare the result with the presets.

### Declared, computed and authored

Three kinds of statement appear, and the interface keeps them apart:

- **Declared**: the settings a candidate is given. Stiffness, damping, mass, fling threshold,
  release projection, elastic edge, control impulse, largest step. They are read from the same
  mapping functions (`springFromSettings`, `carouselReleaseFromSettings`, `deckReleaseFromSettings`,
  `symmetricElasticityFromSettings`) the live surfaces use.
- **Computed**: settle time and overshoot, from stepping the preset's spring once on a one-screen
  move with the engine's own `advanceBoundedSpring`, stopped by the surfaces' rest rule. They
  describe the spring alone. They are not release velocity, not a frame rate, and not a measurement
  of this page. The table marks each such row "computed" and a legend says so.
- **Authored**: the one-line pitch and "suggested use" of each candidate. They are opinions, and the
  detail says "Authored guidance, not a measurement".

Nothing in the Studio reports a measurement, and no figure is invented. Two presets can settle
alike; the table then names the release settings that differ instead of pretending the springs do.

## State ownership

`studio-model.ts` is the one owner of the Studio's application state. Regions read it and ask the
workspace's commands to change it; none keeps a copy. Identity is a stable candidate ID, never an
index.

| State                  | Meaning                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `shortlist`            | The ordered candidates being considered, at most four.                             |
| `referenceId` (A)      | The pinned reference. A member of the shortlist whenever it is not empty.          |
| `candidateId` (B)      | The shortlisted candidate compared with A. Never A. The Deck's front card.         |
| `deckIds`              | The shortlist without A: what the Deck holds.                                      |
| `decidedId`, `reason`  | The choice and the why. Independent of the shortlist.                              |
| `inspectedId`          | Which candidate's detail is open in the list, or none.                             |
| `view`                 | Candidates or Compare. Only the narrow layout shows one at a time.                 |
| `overlay`, `sheetId`   | The one native modal, and which candidate it describes.                            |
| `presentedCandidateId` | **Presentation, not selection.** The card the Deck reports in front.               |
| `shownCandidateId`     | B as the visitor can see it: the presented card while the Deck is mounted, else B. |

The roles are explicit rather than overloaded:

- The first shortlisted candidate is A. Later ones become B only when B is vacant, so adding never
  changes a comparison under way.
- Removing A promotes B, so the comparison stays meaningful. Removing B moves B to the card that took
  its place, else the new last. Pinning B swaps the pair. Choosing B for a candidate outside the
  shortlist shortlists it when there is room.
- A is never compared with itself, whatever order the controls are used in. `studio-model.test.ts`
  holds a seeded random walk of 40 sequences of 150 operations and checks every invariant after each.

### Semantic authority and what is seen

The Stacked Deck separates four facts: the accepted selection, the destination, the card drawn in
front (`visualId`) and the card at rest (`settledId`). The Studio never collapses them:

- B, the selection, changes the instant a card is chosen. Nothing delays it, and no timer or snap is
  used to make the text keep up.
- Every name beside the Deck (B in the summary, the caption, the stage and the table) reads
  `shownCandidateId`, which follows the card the Deck is drawing in front. A name therefore changes on
  the frame the visitor can see the card change, never before.
- The presentation is a mirror: reported by the Deck, kept apart, and never read as intent.
  A report for a card that has since left the Deck is ignored.

`studio.spec.ts` samples every animation frame through forward, backward, rapid and interrupted
exchanges, and requires every piece of text to name the card in front on every frame. The first
Studio failed that: its names changed about 95 ms early.

## The Deck and the shortlist

The Deck holds every shortlisted candidate except A. With none it is absent; with one it stays
mounted but `disabled` and `inert`, so that card is the same physical object either side of the
two-candidate boundary and the package reconciles the change like any other; with two or more it is
interactive. Its keyboard scope is its own root: an arrow on a button beside it stays that button's.

The shortlist's members are also a list with the actions that cannot be dragged: Compare as B, Pin as
A and Remove, plus Swap A and B. Everything a drag can do, a button can.

A tap on the Deck's front card opens that candidate; a drag turns the Deck and opens nothing.

## Compare

A and B are two live previews. They are the same size and show the same five screens, and are driven
through the same `next` and `previous`. Each surface still owns its own selection; Compare adds only
the rule for where a stage begins, so the stages are on the same screen whenever the visitor has not
moved one of them.

**Level stages.** A stage mounted by a change of role begins on the screen of the stage that stayed:
A's screen when B changed, B's when A changed, the reference's when both did (a swap). It is the
surface's own semantic selection that carries over, so a stage that is still travelling hands over
where it is going, and the new stage starts at rest there instead of on the middle screen. Nothing
the stage that stayed is doing is interrupted.

**A replay starts from one defined place.** Replay first sends both stages to the middle screen, each
by its own spring, and starts the run only when both have reported being at rest there: the card in
front, the selection, the phase and the surface's own settled announcement all agree. The condition
is the surfaces' state, not a time. The run is then forward twice, back once, forward once at a fixed
cadence, so a slowly settling spring is interrupted by the next step exactly as it would be in use.
The run stops short of the last screen because a rail ends where a deck wraps.

**Nothing outlives what invalidated it.** Each replay carries a generation. A newer replay, Step,
Back, Reset, any change of A or B, a pointer, wheel or navigation key on either stage, and unmounting
all invalidate both the wait for rest and the steps still waiting. Taking over by hand announces that
the replay stopped.

**A replay answers to the roles, not to the card the Deck has drawn.** The change of A or B that
cancels a replay is the semantic one, observed synchronously. B is accepted the instant it is chosen,
while the Deck is still drawing the card that was B, so a replay that waited for the drawn card kept
driving a stage the visitor had already replaced, and delivered a scheduled step to it.
`studio-ab-conditions.spec.ts` chooses B with the Deck's own Next, on a paused clock, just short of a
scheduled step, while the Deck still draws the previous B, and requires the replay to be over at once.
Settlement is owned by the surface, not the Studio. A controlled Coverflow checks each settlement
against the host's authority one microtask after reporting it. Before `df26701` a host that reacted
to the rail's rest, or to the request behind it, by asking for another destination changed that
authority first; the stale settlement was then rolled back to the new authority, so the rail jumped
there instead of travelling and the `settled` event for the real destination was swallowed. That
race, first seen in the Studio and then isolated in the package, is confirmed and fixed in
`Coverflow`: it discards a queued settlement when the host redirects its authority elsewhere and
reports only its latest settlement, as `StackedDeck` already did. The package tests are
`settlement-authority.test.ts` (real springs, a host moving on in the settlement stack or the moment
rest is reported) and `controlled-settlement-chaining.test.ts` (a deterministic manual animation
driver and a host whose post-flush watcher calls `next()` on `phase === "idle"`, on both
surfaces). The Studio's wait for the stages to be at rest no longer works around a defect; it is the
condition a replay needs.
The wait for both stages to rest is `whenReady` (`studio-replay.ts`). It replaced an immediate watcher
that stopped itself from its own callback: on the path where the stages were already at rest the
callback ran before `watch` had returned the handle to stop, so the watcher outlived the replay and
called back again each time both stages next came to rest on the start screen.

**Exploration stays possible and is never silent.** Either surface can still be dragged or driven
from the keyboard, because how a behaviour feels under a hand is what is being judged. When that
leaves the stages on different screens (a drag, or a deck wrapping where a rail ends) one status line
under the driver says so (`Apart`, with both screens named) and Reset, which is the control that puts
both back on the middle screen, takes an accent border and is described by that line. The line is in a
fixed place with room for two lines, so the stages coming apart, together or into a replay never moves
anything below it (the previous separate notice moved the content below it by 101 px on a desktop and
155 px on a phone). It follows where the stages are, so it clears when they are level again, however
they got there.

Changing B replaces only B's stage. A's element stays the same element.

## Decision and implementation

Choose A or B, say why (240 characters), and open the implementation: a Sheet with the candidate's
facts and the code that gives the behaviour, built from the same mappings as the preview. Revising
keeps the reason. A decision survives its candidate leaving the shortlist.

## Native View Transitions

The Studio uses the browser's own `document.startViewTransition` for two changes of application
state. It is feature detected, skipped under reduced motion (the page's setting included), and falls
back to the plain state change.

| Change                                  | Names for the length of the transition                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Switching views on a narrow layout      | `studio-view` on the layout region                                                |
| Opening or leaving a candidate's detail | `studio-detail` on the Candidates region; `studio-glyph` on the candidate's glyph |

Rules the implementation (`studio-transition.ts`) keeps:

- A name is set on an element only while one transition runs and removed after, so a snapshot never
  holds the same name twice and the page's stacking is unchanged at rest. Moving the shared name from
  the list's glyph to the detail's happens inside the update, so the new snapshot holds it once too.
- The update closures are absolute (they set a target, never toggle). A newer transition skips an
  older one's animation but never its state change: every update runs, in order, and the last wins.
  A stale transition cannot clear a newer one's names.
- It never runs over a Deck, Rail or Sheet exchange. Those own their physics and their native
  dialogs, and a snapshot would replace the very motion being evaluated.
- It is document-level, because every supported engine has that form (Chromium 149, Firefox 151 and
  WebKit 26.5 were probed; element-scoped transitions exist only in Chromium). A document transition
  freezes the rest of the page for its few hundred milliseconds, so it is used only for a change the
  visitor just asked for, and the root's own cross-fade is switched off for it.
- Focus and scroll are settled after the update: the detail's heading on opening, the row's opener on
  leaving. Nothing else moves the page.

`studio-transitions.spec.ts` wraps the real API from outside and reads back what the browser did: the
names the snapshot held, that the transition became ready, and the pseudo-element animations it ran.
In Chromium it also holds the shared element's group at the start and end of its animation and reads
its computed width: the start matches the list's glyph, the end the detail's, and they differ.

### The Gallery

The Studio no longer composes a Gallery: there is nothing to inspect that the live surfaces do not
show. The earlier finding stands for anyone who wants it: `runMediaTransition` needs the host to run
`showModal()` and `close()` inside the transition's update and to name an element inside the dialog,
while `MediaGalleryDialog` owns its native dialog and exposes no media element as a public surface.
Composing them would mean assigning a name to the package's private DOM or racing its internal timing.
The smallest contract that would allow it is a documented pair of hooks on the dialog: one that runs
the host's update around its own `showModal()`/`close()`, and one that returns the media element of the
active item. That is a package change, recorded here rather than made.

## Shared physics and reduced motion

The Studio reads the Playground's one physics configuration for the "Your tuning" candidate and for the
Sheet. It creates no second store. Section 06 carries the standard Motion Tuning bar like every other
section, and a compact "Your tuning" indicator in the workspace bar links to it.

Reduced motion follows the Playground's setting and reaches every surface, the Sheet and the View
Transitions. Under it the surfaces adopt a change at once and no transition starts.

## One modal owner

The Sheet is a native modal with its own lifecycle. `overlay` records the single owner, `openSheet`
refuses while another is open, and modality is returned only when the native dialog has actually
closed (`closed`), not when a close is requested. Focus returns to the control the visitor started
from; the fallback is the workspace.

No control is disabled while the Sheet is open. The page behind a native modal is inert, and the model
refuses a second overlay anyway. Disabling an opener makes WebKit's native close restore focus to the
opener's focusable ancestor instead, which the Sheet treats as the application's own hand-off. This
was found again by the cross-engine run on this design, and `studio.spec.ts` now asserts focus return.

## Activation boundary

`MotionStudio.vue` renders a complete, light introduction and loads the workspace only when the
visitor opens it (warmed on pointer-enter, focus or touch of the button). Once opened it stays mounted,
so scrolling away or changing view never discards the shortlist, the comparison or the decision.
Activation moves focus to the workspace. The introduction reserves no height for the workspace.

Measured in a production build under `/snap-motion/`, Chromium, median of five cold contexts
(local, Windows; not a guarantee, no physical phone):

| Metric                | 390 px native | 390 px, 4× CPU | 1280 px native | 1280 px, 4× CPU |
| --------------------- | ------------: | -------------: | -------------: | --------------: |
| Ready after the click |         63 ms |         445 ms |          98 ms |          913 ms |
| Extra blocking time   |          0 ms |         153 ms |           0 ms |          544 ms |
| DOM nodes added       |          +205 |           +205 |           +397 |            +397 |

The chunk is 14.3 KiB of script and 3.5 KiB of style, gzip, in two requests, and no media (the five
screens are the page's own, already loaded). The wide layout mounts three live surfaces and a Deck at
once, which is where the 4× cost comes from; the narrow layout mounts one view.

## Layout and accessibility

Wide (62rem and up) puts the Shortlist first on the left, so the Deck that chooses B stands level with
the two stages it drives (Deck, roster, stages and the status line are in one 800 px viewport), with the
Candidates to add from below it; comparing is on the right (the stages, the differences and the
decision). Nothing scrolls the page for the visitor. Narrower, one view shows at a
time (Candidates, or Compare with the Shortlist inside it) behind a persistent switch. On a phone the
two stages stack, at the same size.

- Native semantics first: buttons, a labelled list and ordered list, a real `table` with a caption,
  `th scope`, headings, `aria-pressed` toggles, `role="img"` with a text alternative for the chart.
- A differing row is marked with a bar and the word "differs", not by colour alone.
- Every drag has a button: the Deck's step buttons and member actions, the stages' Back and Step.
- Touch targets are at least 44 px on a coarse pointer, asserted on a phone.
- axe passes at rest, with a detail open, decided, with the Sheet open, in the reference-only and
  empty states, and on a phone in each view. Automated checks are not a substitute for assistive
  technology testing; none has been done on physical NVDA, VoiceOver or TalkBack setups.

## Tests

- `apps/lab/test/studio-model.test.ts`: every rule of the model, and the seeded invariant walk.
- `apps/lab/test/studio-candidates.test.ts`: the catalogue, that each candidate reads its own preset,
  the rows and the summary, and that every implementation snippet's numbers are the candidate's.
- `apps/lab/test/studio-transition.test.ts`: ownership, names, rapid and stale transitions, refusal
  and fallback, against a controllable stand-in for the browser API.
- `e2e/studio.spec.ts` (every engine): activation, the journey, every size of shortlist, equal
  conditions, text that follows the card, keyboard and focus, the detail, the Sheet, a phone, and
  click versus drag.
- `e2e/studio-transitions.spec.ts` (every engine): the real transitions, the fallback and reduced
  motion.
- `e2e/studio-ab-conditions.spec.ts` (every engine): level stages after a change of role, a replay
  that always begins from the same screen, nothing a replay scheduled outliving what invalidated it
  (on a paused clock), a replay that answers to the roles rather than to the card the Deck has drawn,
  and the fixed-height status row moving nothing below it.
- `e2e/studio-deck-reconciliation.spec.ts` (every engine): shortlist changes frame by frame.
- `e2e/studio-layout.spec.ts` (Chromium): seven widths, stability, touch targets, scroll lock with real
  scrollbars, axe.
- `e2e/playground-preview.spec.ts`: the built page under a non-root base, including the Studio's chunk.
- `apps/lab/test/studio-replay.test.ts` and `studio-stage.test.ts`: the replay's wait and the stage
  rules.
- `packages/vue/test/settlement-authority.test.ts` and `controlled-settlement-chaining.test.ts`: the
  package's settlement authority, which the Studio's replay relies on (see above).

The Studio's Deck is always a Shuffle deck. Direct is a candidate's behaviour, previewed on a stage
whose membership never changes; the package suites certify Direct reconciliation.

In CI the Studio specs are not part of the general owners. Chromium runs them as the `studio` group;
Firefox and WebKit run the cross-engine four as `firefox-studio` and `webkit-studio`. See
[test architecture](test-architecture-and-performance.md#motion-studio) and
[development verification](development-verification.md).

## Known limitations

- Computed values describe the spring alone. Release velocity, rendered frame rate and the behaviour
  of a real interface are not measured here.
- The Studio's shortlist, decision and reason live in memory for the page's lifetime; nothing is
  persisted or shared.
- A rail ends where a deck wraps, so the replayed run stops short of the last screen, and stepping a
  rail and a deck past the end legitimately leaves them apart; the notice says so.
- The wide composition keeps the Deck, both stages and the status line in one viewport at 1280×800 and
  1440×900 (`studio-layout.spec.ts`). Nothing is asserted for a shorter window, where the page may
  have to scroll between them.
- A document View Transition freezes the rest of the page briefly; it is used only for changes the
  visitor just asked for.
- No shared-element transition into a Gallery (see above).
- Assistive-technology behaviour is unverified on physical devices.
