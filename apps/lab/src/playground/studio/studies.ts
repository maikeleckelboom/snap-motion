/**
 * The Motion Studio's canonical collection, as plain data.
 *
 * It holds no asset URLs and no framework imports so the model, the tests and the plate generator
 * (`scripts/generateStudioPlates.ts`) can all read the same source of truth. `catalog.ts` attaches
 * the generated plates.
 *
 * Attributes are authored descriptions of what each study is, never measurements: nothing here
 * claims a timing, a frame rate or any other reading from the engine.
 */

export const studyCategories = [
  { id: "path", label: "Path" },
  { id: "surface", label: "Surface" },
  { id: "sequence", label: "Sequence" },
  { id: "response", label: "Response" },
] as const;

export type StudyCategoryId = (typeof studyCategories)[number]["id"];

/** Every study ships the same three plates: the cover, its route, and an illustrative curve. */
export const studyMediaKinds = ["cover", "route", "timing"] as const;
export type StudyMediaKind = (typeof studyMediaKinds)[number];

export const studyMediaLabels: Record<StudyMediaKind, string> = {
  cover: "Study plate",
  route: "Route",
  timing: "Timing",
};

export interface StudyAttribute {
  readonly label: string;
  readonly value: string;
}

export interface StudyDefinition {
  readonly id: string;
  readonly name: string;
  /** The study's own motion type, shown under its name. */
  readonly kind: string;
  readonly category: StudyCategoryId;
  readonly summary: string;
  /** What the cover plate depicts, for the alternative text of the plate. */
  readonly motif: string;
  /** The paper colour of the cover plate; the tile and the Coverflow card take it from here. */
  readonly tone: string;
  readonly attributes: readonly StudyAttribute[];
}

export const studyDefinitions = [
  {
    id: "orbit",
    name: "Orbit",
    kind: "Circular path",
    category: "path",
    summary: "A continuous route around a fixed point. One radius, one direction, no end.",
    motif: "a dark disc overlapped by a lighter disc, with a small rust satellite on a thin ring",
    tone: "#e6b091",
    attributes: [
      { label: "Route", value: "Circle" },
      { label: "Anchors", value: "4 quarter turns" },
      { label: "Direction", value: "Clockwise" },
      { label: "Rest", value: "At an anchor" },
    ],
  },
  {
    id: "traverse",
    name: "Traverse",
    kind: "Point to point",
    category: "path",
    summary: "A direct route between two anchors, with room to reverse before arriving.",
    motif: "a bold zigzag line that ends in a rust node",
    tone: "#e4ded1",
    attributes: [
      { label: "Route", value: "Straight legs" },
      { label: "Anchors", value: "5 turning points" },
      { label: "Direction", value: "Forward, reversible" },
      { label: "Rest", value: "At the end node" },
    ],
  },
  {
    id: "fold",
    name: "Fold",
    kind: "Surface study",
    category: "surface",
    summary: "A surface that opens along a crease and keeps its proportions as it turns.",
    motif: "two overlapping squares divided by a rust crease",
    tone: "#cbd3d9",
    attributes: [
      { label: "Surface", value: "Two panels" },
      { label: "Hinge", value: "Diagonal crease" },
      { label: "Direction", value: "Opens outward" },
      { label: "Rest", value: "Flat or folded" },
    ],
  },
  {
    id: "relay",
    name: "Relay",
    kind: "Sequence",
    category: "sequence",
    summary: "Hands one motion to the next, so each step starts where the last one rests.",
    motif: "four circles of falling size linked by a rust baton",
    tone: "#ded4bb",
    attributes: [
      { label: "Stages", value: "4 handoffs" },
      { label: "Order", value: "Left to right" },
      { label: "Overlap", value: "None" },
      { label: "Rest", value: "After the last stage" },
    ],
  },
  {
    id: "drift",
    name: "Drift",
    kind: "Free movement",
    category: "response",
    summary: "Unpinned movement that eases toward a resting place instead of snapping to it.",
    motif: "scattered circles of different sizes trailing along a gentle wave",
    tone: "#d9ccc8",
    attributes: [
      { label: "Route", value: "Open wave" },
      { label: "Anchors", value: "Soft, one at rest" },
      { label: "Direction", value: "Any" },
      { label: "Rest", value: "Where it eases to" },
    ],
  },
  {
    id: "return",
    name: "Return",
    kind: "Spring response",
    category: "response",
    summary: "A spring that overshoots once and settles back to its anchor.",
    motif: "a decaying spring curve crossing a rust rest line",
    tone: "#bec9d0",
    attributes: [
      { label: "Response", value: "Underdamped spring" },
      { label: "Overshoot", value: "Once" },
      { label: "Direction", value: "Back to anchor" },
      { label: "Rest", value: "On the rest line" },
    ],
  },
  {
    id: "arc",
    name: "Arc",
    kind: "Curved path",
    category: "path",
    summary: "A curved route with one clear sweep from start to end.",
    motif: "nested quarter-circle sweeps ending in a rust node",
    tone: "#e4ded1",
    attributes: [
      { label: "Route", value: "Quarter sweep" },
      { label: "Anchors", value: "2 ends" },
      { label: "Direction", value: "Counter-clockwise" },
      { label: "Rest", value: "At the far end" },
    ],
  },
  {
    id: "spiral",
    name: "Spiral",
    kind: "Circular path",
    category: "path",
    summary: "A path that circles inward, trading radius for rotation.",
    motif: "an inward spiral drawn in dark ink with a rust centre",
    tone: "#e6b091",
    attributes: [
      { label: "Route", value: "Inward spiral" },
      { label: "Anchors", value: "Centre" },
      { label: "Direction", value: "Clockwise" },
      { label: "Rest", value: "At the centre" },
    ],
  },
  {
    id: "step",
    name: "Step",
    kind: "Anchor sequence",
    category: "sequence",
    summary: "Discrete anchors, one after another, with a clear rest at every step.",
    motif: "a rising staircase of blocks with one rust step",
    tone: "#cbd3d9",
    attributes: [
      { label: "Stages", value: "5 steps" },
      { label: "Order", value: "Ascending" },
      { label: "Overlap", value: "None" },
      { label: "Rest", value: "At every step" },
    ],
  },
  {
    id: "pivot",
    name: "Pivot",
    kind: "Hinged surface",
    category: "surface",
    summary: "A panel turning about a fixed corner while its far edge sweeps an arc.",
    motif: "a rectangle drawn at three angles around a rust pivot point",
    tone: "#d9ccc8",
    attributes: [
      { label: "Surface", value: "One panel" },
      { label: "Hinge", value: "Fixed corner" },
      { label: "Direction", value: "Clockwise" },
      { label: "Rest", value: "Square to the page" },
    ],
  },
  {
    id: "cascade",
    name: "Cascade",
    kind: "Staggered sequence",
    category: "sequence",
    summary: "Several elements follow the same motion, each starting slightly later.",
    motif: "five horizontal bars offset in a stagger, the middle one in rust",
    tone: "#ded4bb",
    attributes: [
      { label: "Stages", value: "5 staggered bars" },
      { label: "Order", value: "Top to bottom" },
      { label: "Overlap", value: "Partial" },
      { label: "Rest", value: "All aligned" },
    ],
  },
  {
    id: "settle",
    name: "Settle",
    kind: "Damped rest",
    category: "response",
    summary: "Rings of diminishing movement as a surface comes to rest.",
    motif: "concentric rings shrinking toward a rust core",
    tone: "#bec9d0",
    attributes: [
      { label: "Response", value: "Damped" },
      { label: "Overshoot", value: "None" },
      { label: "Direction", value: "Inward" },
      { label: "Rest", value: "At the core" },
    ],
  },
] as const satisfies readonly StudyDefinition[];

export type StudyId = (typeof studyDefinitions)[number]["id"];

/** Where a visitor starts: a study with neighbours on both sides, and a deck worth shuffling. */
export const initialActiveStudyId: StudyId = "fold";
export const initialComparisonIds: readonly StudyId[] = ["fold", "arc", "relay"];
