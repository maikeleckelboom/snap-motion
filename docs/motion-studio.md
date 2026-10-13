# Motion Studio

Section 06 of the public Playground, "Choose the motion". It is a small product for one decision: how
should browsing the photos in a conversation feel? You shortlist candidate behaviours, run two of them
side by side on the same photos, change the one you are testing, read what differs, and record a choice
and the code that gives it.

It is application code in `apps/lab/src/playground/studio/`. It adds no package API, no dependency and
no motion logic: it composes the public `useCarouselMotion`, `StackedDeck`, `ModalDialog` and `Sheet`,
and owns only content, layout, application state and orchestration. Why the first Studio was replaced is
in the [UX diagnosis](studio-ux-audit.md); the later move from an abstract rail to a real task is
described under [The task](#the-task).

## The workflow

Configure B, try both, read what differs, refine, decide.

| Step        | What the visitor does                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Candidates  | Browse seven behaviours. Open one to try it alone; shortlist some.                         |
| Shortlist   | The first is the reference **A**. The rest ride a Deck; the front card is **B**.           |
| Try both    | A and B run side by side on the same photos with the same input. Tap, drag, press keys.    |
| Tune B      | Change B's layout, exchange, preset or any number, under the stages, and see it at once.   |
| Differences | What you will notice, most meaningful first; the technical record behind Advanced details. |
| Decision    | Choose A or B, say why, and open the implementation.                                       |

## The task

The Studio compares behaviours on a task a visitor recognises at once: browsing the photos shared in a
conversation. The conversation is fictional ("Ridge Crew", five friends on a weekend hike) and so is
every name and message. Nothing is borrowed from a messaging product, and the test suite asserts no
product name appears. The eleven pictures are the Playground's own seeded illustrations
(`scripts/generate-playground-media.mjs` writes both sets): six already used by the Gallery and five
more under `src/assets/shared-media/`, local content-hashed assets with no network involved.

Both stages are the same small messaging screen: a header ("Ridge Crew, Shared media, 11 photos"),
the photos, and what a person sees about the one in view (who sent it, when, with what message), with
Previous, Next and **Open photo**. Shapes vary on purpose (a very tall frame, a panorama, a square), so
the item carousel's widths are genuinely unequal. `media/shared-media-data.ts` is the data (no framework,
no asset import); `media/shared-media.ts` gives each item its image.

A tap or **Open photo** opens the photo in a viewer: the package's native `ModalDialog` with the whole
picture, who sent it, when and what they said. It is deliberately one photo, because the Studio compares
how the browsing surface behaves and has no motion of the viewer's to evaluate. It does not browse.

## Candidates

A candidate is a way to browse those photos: a layout, an exchange where the layout has one, and a feel.

| Candidate          | Layout        | Exchange | Feel     |
| ------------------ | ------------- | -------- | -------- |
| Tight carousel     | Item carousel | none     | Tight    |
| Balanced carousel  | Item carousel | none     | Balanced |
| Loose carousel     | Item carousel | none     | Loose    |
| Shuffle deck       | Stacked deck  | Shuffle  | Balanced |
| Direct deck        | Stacked deck  | Direct   | Balanced |
| Heavy shuffle deck | Stacked deck  | Shuffle  | Heavy    |
| Custom             | either        | either   | any      |

The six references are fixed. `candidate-definitions.ts` holds the catalogue as plain data (no framework,
no engine import) so the model, the unit tests and the browser specs read one source; `candidates.ts`
resolves a definition into numbers. Custom is the one candidate a visitor can change, and its state lives
in `studio-custom.ts`.

### Declared, calculated and authored

Three kinds of statement appear, and the interface keeps them apart:

- **Declared**: the settings a candidate is given (stiffness, damping, mass, fling threshold, release
  projection, elastic edge, control impulse, largest step), read from the same mapping functions
  (`springFromSettings`, `carouselReleaseFromSettings`, `deckReleaseFromSettings`,
  `symmetricElasticityFromSettings`) the live surfaces use.
- **Calculated**: settle time and overshoot, from stepping the spring once on a fixed 400 px move with
  the engine's own `advanceBoundedSpring`, stopped by the surfaces' rest rule. They describe the spring
  alone. They are not release velocity, not a frame rate, not the distance either layout really
  travels, and not a measurement of this page. Every place that shows one says "calculated"; the word
  "measured" does not appear (`studio-candidates.test.ts` and `studio-tune.spec.ts` assert it).
- **Authored**: each candidate's one-line pitch and "suggested use". They are opinions, and the detail
  says "Authored guidance, not a measurement".

Calculated values are never an input. The editor shows them beside the settings that produce them,
labelled "calculated, not editable", and `studio-tune.spec.ts` asserts that nothing in that line, and
no spinbutton in the editor, is one.

## The item carousel

`media/MediaCarousel.vue`: a strip of photos of different shapes, several in view at once, the selected
one centred and its neighbours showing on either side. Item height is the one responsive quantity;
each width follows from the photo's aspect ratio, capped (58 % of the strip) so the next photo always
shows beyond the selected one. ResizeObserver remeasurement is the package's own (`useCarouselMotion`
observes the viewport and the track).

### Why `useCarouselMotion`, not `CarouselRoot`

Checked against the package rather than assumed:

- `CarouselRoot` takes no `spring`, `releasePolicy`, `elasticity` or `programmaticImpulse`, and does not
  expose its motion's `configure`. A behaviour under test cannot be given to it.
- `CarouselSlide` renders `:inert="inactive"`: every slide but the active one is inert and out of the
  accessibility tree. That is right for a gallery whose neighbours are decoration. Here a neighbour is
  something to tap.

So the strip uses the composable (the package's own escape hatch, as `VariableRailFixture` and the
lightbox demo do) and owns the layer the composable leaves to the application. Nothing fights the
package: the strip does not use `CarouselSlide`, and nothing removes an `inert` the package set. The
motion engine is not duplicated; drag, flick, spring, elastic edge, wheel, keyboard stepping,
interruption and remeasurement are all `useCarouselMotion`.

The geometry is `createVariableWidthGeometry` from `@snap-motion/core` through a measurement of the
items' layout boxes (`media/media-strip.ts`). Track insets of half the viewport less half the first or
last item put every centre, those two included, within reach, so no two anchors collapse onto a clamped
boundary and a step never moves nothing (the failure `geometry-strategies.md` describes).

### What the application owns, and how

- **Items.** Every item is a labelled group (`aria-roledescription="slide"`, "Pine ridge at noon, from
  Noor, 6 of 11") that is visible to a pointer and to assistive technology. The selected one is
  `aria-current`. None is inert.
- **Focus.** No item is focusable. A focusable item that scrolled into view would make the browser
  scroll the clipped viewport out from under the transform. The strip is the one tab stop: arrows, Home
  and End move the selection (the composable's own keyboard policy), Enter and Space open it, and
  **Open photo** is the visible control for the same thing.
- **A tap.** The package's drag recogniser decides whether a gesture moved the strip. The other half,
  whether one that did not was a tap and on what, is `media/use-item-tap.ts`, and it reuses core's
  `resolveDirectManipulationGesture` and `DIRECT_MANIPULATION_TUNING` instead of inventing a second
  threshold. A press that travelled 8 px or more opens nothing wherever it is released, a press that
  began while the strip was still moving is a _catch_ (it stops the strip and opens nothing), and a
  second finger ends the question. The decision is made from where the press began.
- **Selection.** Opening a photo selects it: the strip moves it to the middle while the viewer opens,
  and it is already there when the viewer closes. A photo that has to travel is never also being
  transitioned (see [View Transitions](#native-view-transitions)).
- **Nested controls.** The recogniser refuses a drag that begins on a `button` or link, so an item is
  not a button. That is why a tap, not a click, is the interaction, and why the keyboard path above exists.

### Package gaps this found

Recorded here rather than worked around silently or fixed by changing the package:

1. `CarouselRoot` cannot carry physics.
2. A multi-item carousel needs an opt-in for slides that stay interactive (or a documented pattern for
   the layer above). `CarouselSlide`'s inertness is correct for its job.
3. Coverflow and the Stacked Deck suppress the click that follows a consumed drag; the carousel path has
   no equivalent, so a host that puts a link in a slide would follow it after a drag. The strip avoids
   the question by opening on a resolved tap, never on `click`.

## State ownership

`studio-model.ts` is the one owner of the Studio's application state. Regions read it and ask the
workspace's commands to change it; none keeps a copy. Identity is a stable candidate ID, never an index.

| State                  | Meaning                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `shortlist`            | The ordered candidates being considered, at most four.                             |
| `referenceId` (A)      | The pinned reference. A member of the shortlist whenever it is not empty.          |
| `candidateId` (B)      | The shortlisted candidate compared with A. Never A. The Deck's front card.         |
| `deckIds`              | The shortlist without A: what the Deck holds.                                      |
| `shortlistExchange`    | How the **Shortlist's own Deck** turns its cards. The list's, not B's.             |
| `decidedId`, `reason`  | The choice and the why. Independent of the shortlist.                              |
| `inspectedId`          | Which candidate's detail is open in the list, or none.                             |
| `view`                 | Candidates or Compare. Only the narrow layout shows one at a time.                 |
| `overlay`              | The one native modal: none, the implementation sheet, or the photo viewer.         |
| `sheetId`, `mediaId`   | Which candidate the sheet describes; which photo the viewer shows.                 |
| `presentedCandidateId` | **Presentation, not selection.** The card the Deck reports in front.               |
| `shownCandidateId`     | B as the visitor can see it: the presented card while the Deck is mounted, else B. |

The Custom candidate's configuration is not in the model. It has its own single owner,
`studio-custom.ts`: `{ surface, exchange, base preset, complete settings }`.

The roles are explicit rather than overloaded:

- The first shortlisted candidate is A. Later ones become B only when B is vacant, so adding never
  changes a comparison under way.
- Removing A promotes B, so the comparison stays meaningful. Removing B moves B to the card that took its
  place, else the new last. Pinning B swaps the pair. Choosing B for a candidate outside the shortlist
  shortlists it when there is room.
- `adoptCandidate` puts a candidate in B's place and, when the shortlist is full, gives B's slot to it
  instead of refusing. It exists for editing B (below).
- A is never compared with itself, whatever order the controls are used in. `studio-model.test.ts` holds a
  seeded random walk of 40 sequences of 150 operations (adopt and the list's exchange included) and
  checks every invariant after each.

### Semantic authority and what is seen

The Stacked Deck separates four facts: the accepted selection, the destination, the card drawn in front
(`visualId`) and the card at rest (`settledId`). The Studio never collapses them:

- B, the selection, changes the instant a card is chosen. Nothing delays it, and no timer or snap is
  used to make the text keep up.
- Every name beside the Deck (B in the summary, the caption, the stage and the table) reads
  `shownCandidateId`, which follows the card the Deck is drawing in front. A name therefore changes on
  the frame the visitor can see the card change, never before.
- The editor for B edits the **accepted** B (the model's `candidateId`) and shows it, because an edit
  applies to that candidate the moment it is made.
- The presentation is a mirror: reported by the Deck, kept apart, and never read as intent. A report for
  a card that has since left the Deck is ignored.

`studio.spec.ts` samples every animation frame through forward, backward, rapid and interrupted
exchanges, and `studio-tune.spec.ts` repeats the frame trace with the Shortlist's Deck set to Direct.

## Configuring B

`StudioTuneB.vue`, directly under the stages and their driver, before the differences, so changing a
setting and seeing what it did share a view. It offers every choice a candidate has:

- **Layout**: Item carousel or Stacked deck.
- **Exchange**: Shuffle or Direct. It is a stacked deck's choice; for a carousel the control stays,
  refuses input and says why, so nothing jumps when the layout changes.
- **Motion preset**: Tight, Balanced, Heavy, Loose. A preset replaces the numbers, as it does in the
  Playground's own tuning.
- **Fine-tune the physics**: the Playground's own `PhysicsGroups`, over B's numbers. A deck's fixed skip
  is shown as fixed.
- **Start from the Playground's tuning**: see below.

### References are immutable; the first edit makes a copy

Editing B while B is a reference does not change the reference. `studio-tune.ts` copies B's whole
configuration into Custom, applies the edit, and puts Custom in B's place. The panel says so before the
visitor changes anything ("Loose carousel is a fixed reference. Change anything below and B becomes a
Custom copy"), and announces it. Afterwards every edit changes Custom directly. A stays exactly where it
was, the reference stays on the shortlist (unless the shortlist is full, in which case the copy takes
B's slot), and `studio-tune.spec.ts` asserts the reference's own numbers, layout and stage are
unchanged. A stage whose candidate continues (a copy, or a change of layout) keeps the photo it was on;
any other change of role starts level with the stage that stayed.

One case cannot copy: Custom is already A. Custom is one candidate, so it cannot also be B's copy. The
panel says so, disables its controls, and offers **Swap A and B**.

### One owner, and what it never touches

| Holds physics                  | Owner                      | Edited by                               |
| ------------------------------ | -------------------------- | --------------------------------------- |
| The six reference candidates   | the engine's presets       | nothing                                 |
| Custom (B's copy)              | `studio-custom.ts`         | the editor under the stages             |
| The Playground's Motion Tuning | `useSharedPhysics` (page)  | the tuning bar; read by the sheet only  |
| The Shortlist Deck's animation | the package's own defaults | nothing; only its exchange (the list's) |

- Editing B never writes the Playground's tuning. The relationship is one explicit, one-way copy, a
  button that takes the tuning set under the section into B once. Nothing holds a reference back, and
  afterwards the two are independent (asserted both ways).
- The Playground tuning's own changes move no candidate on their own.
- The Shortlist's Deck takes its exchange from `shortlistExchange`, labelled "How these cards turn" and
  "This is how the list you are swiping turns. It does not change how A or B behaves". Nothing reads it
  to configure a comparison.

## The Deck and the shortlist

The Deck holds every shortlisted candidate except A. With none it is absent; with one it stays mounted
but `disabled` and `inert`, so that card is the same physical object either side of the two-candidate
boundary and the package reconciles the change like any other; with two or more it is interactive. Its
keyboard scope is its own root: an arrow on a button beside it stays that button's. Its exchange is
Shuffle or Direct, chosen on the list.

The shortlist's members are also a list with the actions that cannot be dragged: Compare as B, Pin as A
and Remove, plus Swap A and B. Everything a drag can do, a button can. A tap on the Deck's front card
opens that candidate; a drag turns the Deck and opens nothing.

## Try both

A and B are two live stages of the same size, with the same photos, driven through the same `next` and
`previous`. Each surface owns its own selection; the comparison adds only the rule for where a stage
begins.

**Level stages.** A stage mounted by a change of role begins on the photo of the stage that stayed: A's
when B changed, B's when A changed, the reference's when both did (a swap). It is the surface's own
semantic selection that carries over, so a stage still travelling hands over where it is going. A stage
whose candidate _continues_ (editing B, or changing its layout) keeps its own photo instead. Nothing the
stage that stayed is doing is interrupted.

**A replay starts from one defined place.** Replay first sends both stages to the middle photo, each by
its own spring, and starts the run only when both have reported being at rest there: the photo in
front, the selection, the phase and the surface's own settled announcement all agree. The condition is
the surfaces' state, not a time. The run is then forward twice, back once, forward once at a fixed
cadence, so a slowly settling spring is interrupted by the next step exactly as it would be in use.

**Nothing outlives what invalidated it.** Each replay carries a generation. A newer replay, Step, Back,
Reset, any change of A or B, **any change of B's configuration** (layout, exchange or a number), a
pointer, wheel or navigation key on either stage, opening a photo, and unmounting all invalidate both the
wait for rest and the steps still waiting. Taking over by hand announces that the replay stopped.

**A replay answers to the roles, not to the card the Deck has drawn.** The change of A or B that cancels
a replay is the semantic one, observed synchronously. B is accepted the instant it is chosen, while the
Deck is still drawing the card that was B, so a replay that waited for the drawn card kept driving a
stage the visitor had already replaced. `studio-ab-conditions.spec.ts` chooses B with the Deck's own
Next, on a paused clock, just short of a scheduled step, and requires the replay to be over at once.

Settlement is owned by the surface, not the Studio. A controlled Coverflow checks each settlement against
the host's authority one microtask after reporting it; a host that reacted to the rest by asking for
another destination used to roll the stale settlement back and swallow the real one. That race, first
seen in the Studio and isolated in the package, is fixed in `Coverflow` (`df26701`) and certified by
`settlement-authority.test.ts` and `controlled-settlement-chaining.test.ts`. The wait for the stages to
rest is `whenReady` (`studio-replay.ts`), the condition a replay needs, not a workaround.

**Exploration stays possible and is never silent.** Either surface can still be dragged or driven from
the keyboard, because how a behaviour feels under a hand is what is being judged. When that leaves the
stages on different photos (a drag, or a deck wrapping where a carousel ends) one status line under the
driver says so (`Apart`, with both photos named) and Reset, which puts both on the middle photo, takes an
accent border and is described by that line. The line is in a fixed place with room for two lines, so
the stages coming apart, together or into a replay never moves anything below it.

Changing B replaces only B's stage. A's element stays the same element.

## Reading the difference

"What you will notice" is a feedback loop, not a report. `compareCandidates` (in `candidates.ts`) builds
it from the same rows the advanced table shows:

- **A headline**: one or two sentences, biggest difference first. It never says which is better; that is
  the decision and belongs to the person making it.
- **A layout call-out**, when the layouts differ: "These are different layouts, so the springs are not the
  only thing that differs. Equal springs would still not feel equal." When the springs are in fact
  identical it says so ("Whatever feels different here is the layout, not the physics"), because that is
  the case where a visitor is most likely to credit the wrong cause.
- **The differences that matter, most meaningful first**: layout, exchange (between two decks), settling,
  overshoot, flick travel, release, edge give, buttons and keys. Each says what it means to a person, and
  carries "calculated" where it is. Only what differs is listed; the rest is one line, "Same in both".
- **Advanced details**, closed until asked for: the complete table of declared and calculated rows, with
  the two step responses on one axis. Technical parameters and calculated spring data live here.

Two identical configurations say so ("configured the same, so they behave the same") instead of
inventing a difference.

## Decision and implementation

Choose A or B, say why (240 characters), and open the implementation: a Sheet with the candidate's facts
and the code that gives the behaviour, built from the same mappings as the preview. A deck's code is a
`StackedDeck`; an item carousel's is `useCarouselMotion` (never Coverflow, `CarouselRoot` or
`CarouselSlide`). Revising keeps the reason. A decision survives its candidate leaving the shortlist, and
survives Custom changing: it records which candidate, and Custom is shown as it is now.

## Native View Transitions

The Studio uses the browser's own `document.startViewTransition` for three changes of application state.
It is feature detected, skipped under reduced motion (the page's setting included), and falls back to the
plain state change.

| Change                                  | Names for the length of the transition                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Switching views on a narrow layout      | `studio-view` on the layout region                                      |
| Opening or leaving a candidate's detail | `studio-detail` on the Candidates region; `studio-glyph` on its glyph   |
| Opening a photo, and closing the viewer | `studio-photo` on the thumbnail's picture, then on the viewer's picture |

Rules the implementation (`studio-transition.ts`) keeps:

- A name is set on an element only while one transition runs and removed after, so a snapshot never holds
  the same name twice and the page's stacking is unchanged at rest. A newer transition skips an older
  one's animation but never its state change. A stale transition cannot clear a newer one's names.
- It never runs over a Snap Motion exchange. Those own their physics, and a snapshot would replace the
  very motion being evaluated. For photos that is a rule about the lifecycle, enforced where it can be
  known: the surface says whether the photo it is opening was **already the selected one and at rest**
  (`MediaOpenRequest.atRest`). A tap on a neighbour, an open during a settle, or an open while the strip
  is still moving opens with no transition, because the photo has to travel and the strip keeps moving
  behind the modal. Closing returns to the thumbnail only if that surface is still at rest and the
  thumbnail is on screen.
- The photo viewer is `ModalDialog`, whose public lifecycle permits this: its `open` prop is applied by
  `showModal()` and `close()` in the same flush, so the update closure the transition runs puts the viewer
  in the new snapshot. (The Gallery's `MediaGalleryDialog` does not allow it, which is why the Studio does
  not use it for this: it owns its native dialog and exposes no media element, so naming one would mean
  reaching into private DOM.)
- It is document-level, because every supported engine has that form. A document transition freezes the
  rest of the page for its few hundred milliseconds, so it is used only for a change the visitor just
  asked for. A touch that lands during one is cancelled by the browser, as on any page; the touch specs
  wait for the transition to end before they swipe.
- Focus and scroll are settled after the update: the detail's heading on opening, the row's opener on
  leaving; the surface or the control the visitor used when the viewer closes.

`studio-transitions.spec.ts` wraps the real API from outside and reads back what the browser did.
`studio-media-touch.spec.ts` does the same for photos: the names the snapshot held on each side, that it
became ready, the pseudo-element animations it ran, that none runs for a neighbour, a moving strip or
reduced motion, and that nothing is left named afterwards.

## Shared physics and reduced motion

The Studio reads the Playground's one physics configuration in two places only: the implementation
sheet's own motion, and the explicit **Start from the Playground's tuning** copy. It creates no second
store. Section 06 carries the standard Motion Tuning bar like every other section, and a compact
"Playground tuning" indicator in the workspace bar links to it.

Reduced motion follows the Playground's setting and reaches every surface, the Sheet and the View
Transitions. Under it the surfaces adopt a change at once and no transition starts.

## One modal owner

The Sheet and the photo viewer are native modals with their own lifecycles. `overlay` records the single
owner, `openSheet` and `openMedia` refuse while another is open, and modality is returned only when the
native dialog has actually closed (`closed`), not when a close is requested. Focus returns to the control
the visitor started from (the surface for a tap or Enter, the button for **Open photo**); the fallback
is the workspace. The page behind a viewer does not scroll (the gutter is reserved, so nothing shifts).

No control is disabled while a modal is open. The page behind a native modal is inert, and the model
refuses a second overlay anyway. Disabling an opener makes WebKit's native close restore focus to the
opener's focusable ancestor instead, found twice by the cross-engine run, and asserted.

## Activation boundary

`MotionStudio.vue` renders a complete, light introduction and loads the workspace only when the visitor
opens it (warmed on pointer-enter, focus or touch of the button). Once opened it stays mounted, so
scrolling away or changing view never discards the shortlist, the comparison or the decision. Activation
moves focus to the workspace. The introduction reserves no height for the workspace. The eleven photos
load with the workspace, not with the page above it. The earlier activation measurements were taken for
the design this replaced and have not been repeated for this one.

## Layout and accessibility

Wide (62rem and up) puts the Shortlist first on the left, so the Deck that chooses B stands level with
the two stages it drives (Deck, stages, driver and the status line are in one 800 px viewport at 1280×800
and 1440×900, asserted), with the Candidates to add from below it; comparing is on the right: the stages,
the editor for B, what you will notice, and the decision. Narrower, one view shows at a time (Candidates,
or Compare with the Shortlist inside it) behind a persistent switch. On a phone the two stages stack at
the same size, with the editor directly after them.

The stage's Previous and Next sit in its header and **Open photo** beside its caption, so a stage is a
phone-sized messaging screen without a row of controls that would push the status line out of the 800 px
viewport.

- Native semantics first: buttons, labelled groups, a real `table` with a caption, `th scope`, headings,
  `aria-pressed` toggles, `details`/`summary` for both disclosures, `role="img"` with a text alternative
  for the chart.
- A differing row is marked with a bar and the word "differs", not by colour alone.
- Every drag has a button: the Deck's step buttons and member actions, each stage's Previous, Next and
  **Open photo**, and the driver's Back and Step.
- Touch targets are at least 44 px on a coarse pointer, asserted on a phone (the stage's three controls).
- axe passes at rest, with a detail open, decided, with the Sheet open, in the reference-only and empty
  states, and on a phone in each view. Automated checks are not a substitute for assistive technology
  testing; none has been done on physical NVDA, VoiceOver or TalkBack setups.

## Tests

Unit (no browser, `pnpm check:lab`):

- `studio-model.test.ts`: every rule of the model, adopt, the list's exchange, the viewer's modal, and the
  seeded invariant walk.
- `studio-candidates.test.ts`: the catalogue (no "rail" anywhere), that each reference reads its own
  preset whatever Custom becomes, the comparison (layout first, the call-out, identical springs, never a
  verdict, never "measured") and that every snippet's numbers are the candidate's.
- `studio-custom.test.ts`: the Custom candidate's state, and editing B (copy on first edit, the reference
  untouched, a full shortlist, Custom as A, no B).
- `studio-media.test.ts`: the shared collection, and the strip's geometry (every centre reachable, unequal
  steps, re-derived anchors, a track a pixel short).
- `use-item-tap.test.ts`: the tap decision on real DOM events (a tap, a drag, a catch, a second finger,
  a cancel, a secondary button).
- `studio-transition.test.ts`, `studio-replay.test.ts`, `studio-stage.test.ts`: as before.

Browser:

- `e2e/studio.spec.ts` (every engine): activation, the journey, every size of shortlist, equal
  conditions, text that follows the card, keyboard and focus, the detail, the Sheet, a phone, and click
  versus drag on the Deck.
- `e2e/studio-media.spec.ts` (every engine): several photos of different widths in view with the next one
  peeking (at 1280 and 390), a tap on the selected, a neighbour and either side, drag is not a tap, a
  catch, the keyboard (arrows, Enter, Space, Home, End, boundary focus), and the viewer as a correct modal.
- `e2e/studio-tune.spec.ts` (every engine): the editor, the copy a reference becomes, switching layout
  and back, Shuffle against Direct (the photo follows a vertical drag only under Direct), physics editing
  (and that the numbers reach the live surface), the Playground's tuning never written and copied only
  when asked, Custom as A, reading the difference, the Shortlist's own Deck, interrupted motion and
  reduced motion.
- `e2e/studio-media-touch.spec.ts` (Chromium): real touch swipes and taps, a vertical swipe that scrolls
  the page, a resized and a resizing stage, and the photo View Transition.
- `e2e/studio-transitions.spec.ts`, `studio-ab-conditions.spec.ts`, `studio-deck-reconciliation.spec.ts`
  (every engine), `studio-layout.spec.ts` (Chromium): as before, on the new stages.
- `e2e/playground-preview.spec.ts`: the built page under a non-root base, including the Studio's chunk.

In CI the Studio specs are not part of the general owners. Chromium runs them as the `studio` group;
Firefox and WebKit run the cross-engine ones as `firefox-studio` and `webkit-studio`
(`config/browserOwnership.ts`, `scripts/browserOwnership.test.ts`). See
[test architecture](test-architecture-and-performance.md#motion-studio) and
[development verification](development-verification.md).

## Known limitations

- Calculated values describe the spring alone. Release velocity, rendered frame rate and the behaviour of
  a real interface are not measured here.
- The Studio's shortlist, Custom candidate, decision and reason live in memory for the page's lifetime;
  nothing is persisted or shared.
- The viewer shows one photo. It does not browse, zoom or play; close it and tap another.
- An item carousel ends where a deck wraps, so the replayed run and repeated Steps legitimately leave
  them apart; the status line says so.
- A tap during a View Transition (for the few hundred milliseconds a view change holds the page) is
  cancelled by the browser.
- Custom is a single candidate: when it is the reference, B cannot be copied into it until the roles are
  swapped.
- No assistive-technology testing on physical devices, and the item carousel's neighbours are reachable
  to a screen-reader user through arrows and **Open photo**, not by activating each slide.
- Recordings and screenshots in this change were captured in Chromium on Windows; the other engines are
  covered by the cross-engine specs, not by recordings.
