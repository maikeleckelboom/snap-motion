# Motion Studio: UX diagnosis and redesign

This records what was wrong with the first Motion Studio, what was measured, and what replaced it.
The current design is in [Motion Studio](motion-studio.md).

## The task the Studio should serve

A product engineer or interaction designer is choosing how an interface should move when people
switch between its screens. They need to browse candidates, shortlist some, run them against each
other, see how they differ, and make a decision they can explain.

"Which motion behaviour should we use for this interaction, and why?"

The Studio can answer that honestly only with behaviours that actually run and differ, and only with
facts that are either settings or computed from settings. Nothing in it may present an illustration
as measured motion.

## Before: what the first Studio was

Six numbered pieces on one selection: **01 Browse** (a paged grid of twelve studies), **02 Explore**
(a Coverflow of the same twelve), **Active study** (an unnumbered inspector), **03 Compare** (a
Stacked Deck of up to five studies, Shuffle or Direct), a Gallery over three plates per study, and a
Sheet for details and a note.

### Could twelve illustrated studies support the task? No.

- The studies were illustrations of motion types (a circle for Orbit, a zig-zag for Traverse). None
  ran. Two studies could not be told apart by how they behave, because they did not behave.
- Their attributes were authored descriptions, and the "Route" and "Timing" plates were drawings.
  They were labelled illustrative, but they were the only substance a comparison could rest on.
- There was nothing to decide. A collection of pictures supports browsing; it does not support
  choosing between behaviours.

### What each part contributed

| Part         | What it did                                   | Its value for the task                  |
| ------------ | --------------------------------------------- | --------------------------------------- |
| 01 Browse    | Picked a study from a grid                    | Choosing a picture                      |
| 02 Explore   | Showed the same collection on a rail          | A second way to choose the same picture |
| Active study | Showed the picked study's name and attributes | Restating what was already selected     |
| 03 Compare   | Exchanged up to five cards on a deck          | Moved cards; compared nothing           |
| Gallery      | Opened plates of one study                    | Looking at illustrations                |
| Sheet        | Held attributes and a note                    | A note about a picture                  |

### The reported and reproduced defects

All of these were reproduced on the unmodified branch before anything was changed.

1. **Text ahead of the card.** On a Deck exchange the Active Study name and the Deck's caption
   changed the moment the control was pressed. The Deck's own `visualId` (the card drawn in front)
   changed about 95 ms later and `settledId` about 445 ms after that (Chromium, Balanced). For about
   a tenth of a second the page named one card while showing another, in both directions.
2. **A deck exchange moved an unrelated surface.** Because the Coverflow followed the Deck's card, a
   one-card Deck step sent the Explore rail through three unrelated studies on its way to the next.
3. **Keys acted across controls.** An arrow pressed on a tray button or on the step control moved the
   Deck and took focus onto it, although the documentation said a key on a button stays that
   control's. A key on the Deck itself advanced it exactly once (no double handling was found).
4. **Cards over the inspector.** Fixed on the composition-fix branch by making the inspector opaque.
   That removed the symptom; the competing selection was still there.

### Selection models that competed

- `activeId`, the study "being worked on", set by the Grid, the Coverflow, the Deck, the Gallery on
  close and a "Make active" link.
- `deckId`, the Deck's card, which was a member of the comparison while `activeId` need not be. The
  interface needed a sentence to explain when they differed ("Fold is on top. Orbit is the active
  study, and is not in the comparison").
- The visually dominant card and the settled card, which the Deck reports and the interface ignored.
- A tray whose buttons both selected and removed, and a Shuffle/Direct control that lived in the
  Studio but belonged to a different section.

### Missing comparison

A comparison needs two things held still against each other. The Deck held up to five things in a
pile and showed one. There was no reference, no second candidate, no shared input, and no
difference to read.

### States, discoverability and hierarchy

- Zero, one and many were handled (the one-card Deck was disabled and inert), but the explanations
  were about the Deck, not about what the visitor could do next.
- Terms overlapped: "active", "on top", "in comparison", "selected" and "current" described three
  facts. The numbers 01, 02, 03 ran in a page order that was not the order of a task.
- Two spatial surfaces and a grid answered one question. The eye had no single place to look.

## After: the decision workflow

### Journey

1. **Candidates.** Seven live behaviours, each with its surface, feel and a computed response curve.
   Shortlist some; open one to run it on its own.
2. **Shortlist.** The first shortlisted candidate is the reference **A**. The others ride a Stacked
   Deck; the card in front is **B**.
3. **Compare.** A and B run side by side at the same size, over the same screens, and take the same
   input. A table shows what differs, labelled declared or computed, with the step responses on one
   axis.
4. **Decision.** Choose A or B, say why, and read the code that gives that behaviour.

### What changed, and why

| Diagnosis                                  | Change                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Twelve pictures                            | Seven behaviours that run, drawn from the same presets and mappings the live surfaces use               |
| `activeId` versus `deckId` versus "on top" | A shortlist, an explicit reference A and compared candidate B; B is the Deck's front card, never a copy |
| Text ahead of the card                     | Every name beside the Deck reads the card the Deck reports in front; the semantic B is still immediate  |
| Deck moved an unrelated rail               | There is no second surface following the Deck                                                           |
| Arrow keys acting across controls          | The Deck is its own focus scope; no region forwards keys to it                                          |
| Nothing to compare                         | Matched stages, a shared driver, a table of differences, a shared response chart                        |
| Competing Shuffle/Direct control           | Exchange is an attribute of a candidate, not a page setting                                             |
| Cards over the inspector                   | No inspector overlaps the Deck; the compositing workaround is gone with the layout it served            |
| No decision                                | A recorded choice and reason, and the implementation that follows from it                               |
| Illustrations read as evidence             | Every number is labelled declared or computed; authored guidance is labelled authored                   |

### Terms

- **Shortlist**: the candidates being considered, at most four.
- **Reference (A)**: the pinned candidate everything else is compared against.
- **Candidate (B)**: the shortlisted candidate compared with A. It is the Deck's front card.
- **In front**: the card the Deck is drawing on top. During an exchange it trails B.
- **Decision**: the candidate chosen, and why.

### Sizes of shortlist

| Shortlisted | A     | Deck            | B          | Compare shows                   |
| ----------- | ----- | --------------- | ---------- | ------------------------------- |
| 0           | none  | absent          | none       | An empty state and the way on   |
| 1           | it    | absent          | none       | A's stage, a vacant B, a way on |
| 2           | first | one card, inert | the other  | Both stages and the differences |
| 3 to 4      | first | the rest        | front card | Both stages and the differences |

Removing the reference promotes B, so the comparison stays meaningful. Removing B moves B to the card
that took its place. Pinning B swaps the pair. A is never compared with itself.

### What is not claimed

- Computed values come from stepping each preset's spring once on a one-screen move with the engine's
  own stepper. They describe the spring alone: not release velocity, not a rendered frame rate, not
  this page's performance.
- The "suggested use" lines are opinions and are labelled authored.
- No assistive-technology testing on physical devices has been done.
