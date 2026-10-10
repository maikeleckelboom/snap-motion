# Motion Studio

Section 06 of the public Playground, "Everything in motion". It is a small product built from the
five surfaces the page demonstrates one at a time: browse a collection of motion studies, select
one, explore the collection spatially, compare studies on a deck, inspect their plates, and refine
a note, all on one selection and one set of motion settings.

It is application code in `apps/lab/src/playground/studio/`. It adds no package API, no dependency
and no motion logic: it composes the public components and composables and owns only content,
layout, application state and orchestration.

## The workflow and the surface behind each step

| Step    | Surface                                                                                      |
| ------- | -------------------------------------------------------------------------------------------- |
| Browse  | The Paged Grid: `useCarouselMotion` with `createPagedGridGeometry`, as `PagedGridDemo` does. |
| Explore | `Coverflow`, with the whole collection and the active study at its centre.                   |
| Compare | `StackedDeck` over an ordered comparison of up to five studies, Shuffle or Direct.           |
| Inspect | `MediaGalleryDialog` over every plate of every study.                                        |
| Refine  | `Sheet`: details, comparison membership, a short note, and the study's plates.               |

The workspace is not the five demonstrations mounted side by side. Those wrappers carry their own
example state and controls; the Studio mounts the underlying components around one model.

## The collection

Twelve studies in four motion types (Path, Surface, Sequence, Response), named for the geometry
the Playground already uses (Orbit, Traverse, Fold, Relay, Drift, Return, Arc, Spiral, Step) plus
Pivot, Cascade and Settle. Each study has a stable ID, a name, a motion type, a summary, four
authored attributes and three plates:

- **Study plate**: the cover, 10:7, shown in the Grid, the Coverflow, the Deck and the Gallery.
- **Route**: the study's path on a grid, with labelled anchors and its attributes.
- **Timing**: an illustrative response curve.

`node scripts/generateStudioPlates.ts` writes the 36 SVGs into `apps/lab/src/assets/studio/`
(about 170 KiB together, largest 13 KiB). The plates, like the Playground's earlier ones, are
illustrations. The Route and Timing plates say so on their face, and the attributes are authored
descriptions of a study. Nothing in the Studio reports a measurement.

`studies.ts` is plain data with no asset URLs or framework imports, so the model, the tests and the
plate generator all read one source. `catalog.ts` attaches the generated plates and builds the
Gallery's item list from them: a plate is a Gallery item, so the Gallery has no second catalog.

## State ownership

`studio-model.ts` is the one owner of the Studio's application state. Surfaces read it and ask it
to change; none keeps a copy. Identity is always a stable ID, never an index.

| State               | Meaning                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `activeId`          | The study being worked on, everywhere. Always in the collection; need not be compared.      |
| `comparisonIds`     | The ordered comparison: unique, at most five.                                               |
| `deckId`            | The comparison cursor: the card the Deck names. A member of the comparison, or `undefined`. |
| `notes`             | Local edits, by study ID. Kept while the page is open; nothing is persisted.                |
| `view`              | Browse, Explore or Compare. Only the narrow layout shows one at a time.                     |
| `filter`, `density` | How the collection is presented. The filter never changes `activeId` or the comparison.     |
| `overlay`           | Which of `none`, `gallery`, `sheet` owns modality, and whether it is open.                  |
| `inspectionMediaId` | The plate the Gallery is showing: the Gallery's controlled item, not a study.               |

`activeId` and `deckId` are deliberately two facts. The Deck's card must belong to the comparison;
the active study need not. So:

- selecting a study outside the comparison never adds it and never points the Deck at an ID it does
  not hold; the Deck keeps its card and says so ("Fold is on top. Orbit is the active study"), with
  a control to make its card active;
- selecting a study that is in the comparison moves the Deck to it;
- a card chosen on the Deck sets both;
- adding the active study puts it on top of the Deck, since it is the study in hand; adding a first
  member always names a cursor;
- removing the Deck's current card moves the cursor to the card that took its place (else the new
  last card), and never changes the active study.

The comparison has three states. With two or more studies the Deck mounts. With one it is replaced
by a plain card and a statement that exchanging needs two. With none it is an empty state with a way
forward. A Deck is never mounted with a collection it cannot exchange within.

`studio-model.test.ts` pins these rules without a browser.

## Cross-surface synchronization

The Snap Motion surfaces separate four facts: the accepted semantic selection (`activeId`), the
intended destination, the item dominant in the projection, and the item at mechanical rest. The
Studio never collapses them, and never turns a frame into a selection.

1. **One owner, controlled surfaces.** Coverflow, the Deck and the Gallery are bound one way
   (`:active-id`) and report through `activeIdRequest`. The model accepts a request as it arrives:
   nothing in this composition refuses one, so there is no guard to race. No surface is left
   uncontrolled.
2. **A gesture is not echoed.** A request from a surface updates the model; the surface's own
   mechanics were already travelling to that target, so the confirming prop changes nothing.
3. **Followers adopt exactly.** A surface that did not originate a change receives the new
   `activeId` as an external prop change, which the components define as exact adoption: no travel
   request, no echo, no announcement. The Deck follows only when the active study is one of its
   members.
4. **The rail travels when asked, instead of jumping.** While the Coverflow is mounted it owns the
   spatial presentation of the selection. A command from another surface (a Grid tile, a Deck card)
   is routed through `navigateTo`, so the rail glides on its own spring and its request is what
   updates the model. Without a rail (a narrow layout showing another view) the model adopts the
   selection directly and the rail mounts on it later, with no entrance spring.
5. **The Grid navigates, and measures.** The Grid is the low-level carousel, so it has no `activeId`
   to adopt. A selection from elsewhere moves it to the study's page with `moveTo`, unless the
   visitor's own pointer currently owns it. A change of filter or density changes the pages
   themselves, so it is a measurement: `remeasure` with the page that holds the active study, and no
   travel.
6. **Overlays synchronize on close, not on every step.** The Gallery's active item is a plate.
   Browsing plates changes only `inspectionMediaId`. When the visitor leaves the Gallery on another
   study's plate, that study becomes active once, so every surface behind the modal adopts it
   exactly while it fades.
7. **No fake settlement.** The Studio announces committed outcomes (a study added or removed, a note
   saved, a view or filter changed, a return from the Gallery) on one polite status region. Selection
   announcements come from the surfaces' own settlement messages while one is mounted, and from the
   workspace only when none is.

Stale asynchronous work cannot overwrite newer intent. The one asynchronous step the Studio owns,
the Sheet-to-Gallery handoff, carries a generation that every later open, close and unmount
invalidates.

## Gallery and Sheet: one modal owner

Both are native modals with their own lifecycles. The repository does not certify a Gallery opened
above an open Sheet, so the Studio does not do it.

- `overlay` records the single owner. `openGallery` and `openSheet` refuse while another owns
  modality, and modality is returned only when the native dialog has actually closed (`closed`), not
  when a close is requested.
- A Gallery action inside the Sheet (the plate buttons) closes the Sheet first. When the Sheet's
  native `closed` has fired, the Studio waits for the observable condition that focus has a stable
  owner again, bounded at the six frames the library's own focus verification uses, and only then
  opens the Gallery. It is a wait for a fact, not a timer. A frame-by-frame sample in the specs
  confirms there is never more than one open dialog through the handoff.
- Nothing opens the Sheet over a Gallery. The Gallery has no application action that could.

Focus returns to the control the visitor started from: Inspect, a plate chip, the front Coverflow
card or the Deck (a card tap), and Details. If that control is unavailable the fallback is the
active-study panel, which is always present. The document's scroll position is unchanged by either
overlay, and both are reopenable the moment they have closed.

### Gallery View Transitions: not reproduced

The Playground's Gallery section returns to the thumbnail of the item it was left on using the
Lab's `runMediaTransition` helper. That helper needs the host to run `showModal()` and `close()`
inside the transition's update callback and to name an element inside the dialog as the destination.
`MediaGalleryDialog` owns its native dialog (it calls `showModal()` after its own open watcher, and
`close()` after its closing state) and exposes no media element as a public surface. Composing the
two would mean either wrapping the controlled `open` flip and hoping the component's internal
timing lands inside the callback, or assigning a `view-transition-name` to the package's private DOM.
Either violates lifecycle ownership, so the Studio uses the Gallery's native opening and closing.

The visible limitation is that there is no shared-element flight between a Studio surface and the
Gallery. The return itself is verified: the correct study becomes active, focus lands on the
opener, scroll is unchanged, and no stale modal state remains.

## Shared physics

The Studio reads the Playground's one physics configuration. `PlaygroundApp` owns
`useSharedPhysics()`; the Studio receives `settings` and the reduced-motion override as props, like
the five demonstrations, and `use-studio-physics.ts` maps them onto each surface with the existing
`lab-settings` functions. It creates no second store and holds no settings of its own.

Section 06 carries the standard Motion Tuning bar (presets, Modified, Reset, Customize) like every
other section, so the shared editor is reachable from the Studio, and a compact "Motion · Balanced"
indicator in the workspace bar links to it. A preset or an edit made in any section reaches the
Studio, and one made beside the Studio reaches every other section. The Studio's Shuffle and Direct
choice is the page's `exchange`, shared with section 02.

`studio.spec.ts` proves the sharing by behaviour, not by reading the store: a held overdrag on the
Studio's Grid follows an elastic limit set beside the Sheet demonstration, Reset from the Studio's
bar restores it, and an edit made in the Studio's editor changes the standalone Paged Grid.

## Activation boundary

`MotionStudio.vue` renders a complete, light introduction: the section's pitch, the six verbs of the
workflow, an inline-SVG miniature of the workspace and an "Open Motion Studio" button. The
workspace is a dynamic import that loads only on activation (it is warmed on pointer-enter, focus
or touch of the button), and once opened it stays mounted, so scrolling away or changing view never
discards the selection, the comparison or a note. A direct `#studio` visit lands on the section with
the button in view. Activation moves focus to the workspace, since the button leaves the DOM.

The introduction reserves no height for the workspace. It is the section's complete content, so
the page is stable as it loads, and opening the workspace grows the section downward in response to
the visitor's own input without moving anything above it.

Measurements are in [performance](performance.md#motion-studio-activation).

## Layout and accessibility

Wide (62rem and up) is a two-by-two composition with hairline dividers: the collection beside the
spatial view, the active study beside the comparison. Narrower, one view shows at a time (Browse,
Explore, Compare) behind a persistent switch, with the active study and its actions always beneath
it. Only the shown view's surface is mounted, so switching never keeps duplicate hidden systems
alive; the model carries the state across. The three views are held within a card of each other in
height so switching barely moves the page.

- Native semantics first: buttons, a labelled `ul` for the comparison, a `dl` of attributes, real
  headings (section h2, workspace h3, regions h4), `aria-pressed` on toggles, `aria-current` on the
  active tile and the Deck's card.
- Grid tiles are `role="button"` elements rather than `<button>`s because the surface does not start
  a drag on a native control, and the whole tile is what a visitor grabs. They are named
  ("Fold, surface study, in comparison, has a note"), focusable, and operable with Enter and Space.
  A tap is resolved from the press and release on the surface, because the surface captures a mouse
  pointer and the browser then reports the click on the surface, not the tile.
- Arrow keys act on the surface that owns focus: each of the Coverflow and the Deck is given its
  own region as its focus scope, the Grid pages only when the Grid itself is focused, and a key
  pressed on a tile or button stays that control's. There are never two handlers for one key.
- Everything has a non-drag path: tiles, step buttons, the tray, the Make-active control, and the
  Gallery and Sheet controls.
- Reduced motion follows the Playground's setting and reaches the Gallery and Sheet as well as the
  surfaces.

Automated checks (axe at rest, on a phone in every view, with each overlay, and in the empty and
single comparison states) are not a substitute for assistive-technology testing; none has been done
on physical NVDA, VoiceOver or TalkBack setups.

## Tests

- `apps/lab/test/studio-*.test.ts`: catalog identity, the model's selection, comparison, edit and
  overlay rules, and the physics mapping.
- `e2e/studio.spec.ts`: activation, the journey, ownership and sync, the comparison's states, the
  Gallery and Sheet lifecycles and handoff, shared physics, reduced motion, keyboard, the narrow
  layout, interruption, and document-level listener balance.
- `e2e/studio-layout.spec.ts` (Chromium): the seven widths, stability, scroll lock with real
  scrollbars, natural scrolling and touch, touch targets, and axe.
- `e2e/playground-preview.spec.ts`: the built page under a non-root base, including the Studio's
  chunk and plates.

## Known limitations

- No shared-element transition between a surface and the Gallery (see above).
- Notes live in memory for the page's lifetime; there is no persistence.
- The Studio's Gallery spans every study's plates, so swiping past a study's last plate enters the
  next study's. That is intentional, and closing synchronizes the active study, but a very long
  collection would want a narrower scope.
- The collection filter and density apply to the Grid. The Coverflow and the Gallery always show the
  whole collection in its canonical order.
- Assistive-technology behaviour is unverified on physical devices.
