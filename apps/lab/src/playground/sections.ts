/**
 * The five public sections, in page order. `workbench` is the Lab demo id the section links to for
 * deeper inspection; it is a secondary path, never required to experience or tune the motion.
 */
export const playgroundSections = [
  {
    id: "coverflow",
    number: "01",
    title: "Coverflow",
    summary:
      "A perspective rail. The centre face stays solid while its neighbours park in angled depth, all driven by one scalar position.",
    hints: ["Drag or flick", "← → keys", "Tap the centre card to inspect"],
    workbench: "coverflow",
  },
  {
    id: "stacked-deck",
    number: "02",
    title: "Stacked Deck",
    summary:
      "A pile that exchanges exactly one adjacent card per gesture and continues around the ring with no first or last card.",
    hints: ["Drag the top card", "← → keys", "Shuffle or Direct"],
    workbench: "stacked-deck",
  },
  {
    id: "paged-grid",
    number: "03",
    title: "Paged Grid",
    summary:
      "A collection that snaps whole pages. Change rows, columns, spacing and item count; the geometry is re-measured around the page you are on.",
    hints: ["Drag or flick", "← → keys", "Add and remove items"],
    workbench: "grid",
  },
  {
    id: "gallery",
    number: "04",
    title: "Gallery",
    summary:
      "A modal media viewer. Open a plate from its thumbnail, swipe between plates, zoom and pan, and close back to where you started.",
    hints: ["Click a thumbnail", "← → keys", "Zoom with + and −"],
    workbench: "media",
  },
  {
    id: "sheet",
    number: "05",
    title: "Sheet",
    summary:
      "A modal sheet that attaches to any edge, with snap points, a native scrolling body and a dedicated drag handle.",
    hints: ["Drag the handle", "Esc closes", "Pick a snap point"],
    workbench: "sheet",
  },
] as const;

export type PlaygroundSection = (typeof playgroundSections)[number];
export type PlaygroundSectionId = PlaygroundSection["id"];
