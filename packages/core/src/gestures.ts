/**
 * Thresholds that decide whether a completed pointer gesture was a manipulation or a tap. Both are
 * interaction contract rather than theme: below the activation threshold nothing has been dragged,
 * and the intent ratio is what keeps a page scroll from being read as a swipe.
 */
export const DIRECT_MANIPULATION_TUNING = {
  /** Total displacement, in CSS pixels, past which a gesture has manipulated the surface. */
  activationThreshold: 8,
  /** How much more horizontal than vertical a manipulation must be to own the surface. */
  horizontalIntentRatio: 1.25,
} as const;

export type DirectManipulationAction = "none" | "open" | "select" | "swipe";

export interface DirectManipulationResolution {
  readonly action: DirectManipulationAction;
  readonly shouldFocusStage: boolean;
}

export interface DirectManipulationInput {
  readonly cancelled: boolean;
  readonly crossedDragThreshold: boolean;
  readonly horizontalIntent: boolean;
  readonly involvedMultiplePointers: boolean;
  /** Whether the item the gesture began on was already inspectable when it began. */
  readonly openEligibleAtStart: boolean;
  readonly releasedOnOrigin: boolean;
}

/**
 * Resolves what a completed gesture asked for.
 *
 * The decision is made from where the gesture began, not from where the surface ended up: a tap
 * that opens an item must mean the item the finger went down on, and a gesture that manipulated
 * the surface must never also count as a tap on whatever happens to be under the release point.
 */
export function resolveDirectManipulationGesture(
  input: DirectManipulationInput,
): DirectManipulationResolution {
  if (input.cancelled || input.involvedMultiplePointers) {
    return { action: "none", shouldFocusStage: false };
  }
  if (input.crossedDragThreshold) {
    return input.horizontalIntent
      ? { action: "swipe", shouldFocusStage: true }
      : { action: "none", shouldFocusStage: false };
  }
  if (!input.releasedOnOrigin) {
    return { action: "none", shouldFocusStage: false };
  }
  return input.openEligibleAtStart
    ? { action: "open", shouldFocusStage: false }
    : { action: "select", shouldFocusStage: false };
}

export type SnapKeyboardAction = "end" | "home" | "next" | "previous";

export interface SnapKeyboardInput {
  readonly key: string;
  readonly altKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly defaultPrevented?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
  /**
   * Whether something inside the surface has already claimed the keyboard — a text field, a
   * slider, a nested composite widget. Resolving that is a DOM question, so the adapter answers it.
   */
  readonly ownedByDescendant?: boolean | undefined;
}

/** The semantic navigation an Arrow/Home/End press asks for, or nothing at all. */
export function resolveSnapKeyboardAction(
  input: SnapKeyboardInput,
): SnapKeyboardAction | undefined {
  if (
    input.defaultPrevented === true ||
    input.altKey === true ||
    input.ctrlKey === true ||
    input.metaKey === true ||
    input.ownedByDescendant === true
  ) {
    return undefined;
  }

  switch (input.key) {
    case "ArrowLeft":
      return "previous";
    case "ArrowRight":
      return "next";
    case "Home":
      return "home";
    case "End":
      return "end";
    default:
      return undefined;
  }
}
