/**
 * The Motion Studio's candidates as plain data: no framework, no engine import, so the model, the
 * tests and the browser specs all read one catalogue. `candidates.ts` resolves them into numbers.
 *
 * A candidate is a way to browse the photos shared in a conversation: a layout (an item carousel or a
 * stacked deck), an exchange where the layout has one, and a feel (one of the engine's presets). Six
 * are fixed reference configurations. The seventh, `custom`, is the only one a visitor can change:
 * its layout, exchange, base preset and numbers live in `studio-custom.ts`, never here.
 *
 * The `pitch` and `suitedFor` lines are authored guidance, and the interface says so. They are an
 * opinion about where a behaviour fits, never a measurement.
 */

export type CandidateExchange = "shuffle" | "direct";
/** What the visitor browses with: a strip of items, or a pile of cards. */
export type CandidateSurface = "carousel" | "deck";
/** The engine's presets. A preset is a fixed reference: nothing edits it. */
export type CandidateFeel = "tight" | "balanced" | "heavy" | "loose";

export const candidateIds = [
  "carousel-tight",
  "carousel-balanced",
  "carousel-loose",
  "deck-shuffle",
  "deck-direct",
  "deck-heavy",
  "custom",
] as const;
export type CandidateId = (typeof candidateIds)[number];

/** The one candidate a visitor can change. Every other candidate is an immutable reference. */
export const CUSTOM_ID = "custom" satisfies CandidateId;

export interface CandidateDefinition {
  readonly id: CandidateId;
  readonly name: string;
  readonly surface: CandidateSurface;
  /** Only a Stacked Deck has an exchange. */
  readonly exchange?: CandidateExchange;
  readonly feel: CandidateFeel;
  /** One authored line saying what the behaviour is like. */
  readonly pitch: string;
  /** Authored guidance on where it fits. It is an opinion, never a measurement. */
  readonly suitedFor: string;
}

export const candidateDefinitions: readonly CandidateDefinition[] = [
  {
    id: "carousel-tight",
    name: "Tight carousel",
    surface: "carousel",
    feel: "tight",
    pitch: "Items land firmly, with little give.",
    suitedFor:
      "Dense media a person flips through all day, where speed matters more than flourish.",
  },
  {
    id: "carousel-balanced",
    name: "Balanced carousel",
    surface: "carousel",
    feel: "balanced",
    pitch: "Between Tight and Loose: quick, with a visible settle.",
    suitedFor: "A sensible default for browsing a conversation's photos.",
  },
  {
    id: "carousel-loose",
    name: "Loose carousel",
    surface: "carousel",
    feel: "loose",
    pitch: "Soft landings and the widest elastic edge.",
    suitedFor: "Relaxed browsing where the motion can be part of the experience.",
  },
  {
    id: "deck-shuffle",
    name: "Shuffle deck",
    surface: "deck",
    exchange: "shuffle",
    feel: "balanced",
    pitch: "The top photo passes behind the pile.",
    suitedFor: "Going through photos one at a time, in order.",
  },
  {
    id: "deck-direct",
    name: "Direct deck",
    surface: "deck",
    exchange: "direct",
    feel: "balanced",
    pitch: "The photo stays attached to the point you grab, vertical movement included.",
    suitedFor: "Touch-first interfaces where the photo should follow the finger exactly.",
  },
  {
    id: "deck-heavy",
    name: "Heavy shuffle deck",
    surface: "deck",
    exchange: "shuffle",
    feel: "heavy",
    pitch: "The Shuffle deck with the heaviest spring: a release travels one photo at most.",
    suitedFor: "Deliberate, weighty paging where an accidental flick should not skip ahead.",
  },
  {
    id: "custom",
    name: "Custom",
    surface: "carousel",
    feel: "balanced",
    pitch: "Your own variant. Change its layout, exchange and spring under B.",
    suitedFor: "Trying a setting of your own against the presets.",
  },
];

export const candidateById: ReadonlyMap<CandidateId, CandidateDefinition> = new Map(
  candidateDefinitions.map((definition) => [definition.id, definition]),
);

export function isCandidateId(value: string): value is CandidateId {
  return candidateById.has(value as CandidateId);
}
