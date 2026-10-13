/**
 * The public sections, in page order: five single surfaces, then the Studio that composes them.
 * `navTitle` is the short name the navigation uses when a section's heading is too long for it.
 */
export const playgroundSections = [
  {
    id: "coverflow",
    number: "01",
    title: "Coverflow",
    category: "Spatial navigation",
    summary:
      "Move through a rail of screens. Bring one forward, then reverse direction before it settles.",
    hints: ["Drag or flick", "← → keys", "Tap the front screen to inspect"],
  },
  {
    id: "stacked-deck",
    number: "02",
    title: "Stacked Deck",
    category: "Card exchange",
    summary:
      "Reveal the next card, one exchange at a time. Keep going in either direction, or catch a card mid-move.",
    hints: ["Drag the top card", "← → keys", "Shuffle or Direct"],
  },
  {
    id: "paged-grid",
    number: "03",
    title: "Paged Grid",
    category: "Collection layout",
    summary:
      "Browse a collection of motion studies. Change its shape and size while keeping your place.",
    hints: ["Drag or flick", "← → keys", "Add and remove items"],
  },
  {
    id: "gallery",
    number: "04",
    title: "Gallery",
    category: "Media exploration",
    summary:
      "Open a landscape, move between images, then zoom in. Close the viewer and continue exploring the gallery.",
    hints: ["Click a thumbnail", "← → keys", "Zoom with + and −"],
  },
  {
    id: "sheet",
    number: "05",
    title: "Sheet",
    category: "Edge surfaces",
    summary:
      "Bring content in from any edge. Drag between snap points while the body scrolls independently.",
    hints: ["Drag the handle", "Esc closes", "Pick a snap point"],
  },
  {
    id: "studio",
    number: "06",
    title: "Choose the motion",
    navTitle: "Studio",
    category: "Decision",
    summary:
      "Browse a conversation's shared photos two ways at once, tune the second, read what differs and record your choice.",
    hints: ["Tap or swipe the photos", "Tune B beside A", "Same input to both"],
  },
] as const;

export type PlaygroundSection = (typeof playgroundSections)[number];
export type PlaygroundSectionId = PlaygroundSection["id"];

/** The name the navigation shows for a section. */
export function sectionNavTitle(section: PlaygroundSection): string {
  return "navTitle" in section ? section.navTitle : section.title;
}
