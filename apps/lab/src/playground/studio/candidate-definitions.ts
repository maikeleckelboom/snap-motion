/**
 * The Motion Studio's candidates as plain data: no framework, no engine import, so the model, the
 * tests and the browser specs all read one catalogue. `candidates.ts` resolves them into numbers.
 *
 * The `pitch` and `suitedFor` lines are authored guidance, and the interface says so. They are an
 * opinion about where a behaviour fits, never a measurement.
 */

export type CandidateExchange = "shuffle" | "direct";
export type CandidateSurface = "rail" | "deck";
export type CandidateFeel = "tight" | "balanced" | "heavy" | "loose" | "tuning";

export const candidateIds = [
  "rail-tight",
  "rail-balanced",
  "rail-loose",
  "rail-yours",
  "deck-shuffle",
  "deck-direct",
  "deck-heavy",
] as const;
export type CandidateId = (typeof candidateIds)[number];

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
    id: "rail-tight",
    name: "Tight rail",
    surface: "rail",
    feel: "tight",
    pitch: "Firm landings with little give.",
    suitedFor:
      "Dense lists a person moves through all day, where speed matters more than flourish.",
  },
  {
    id: "rail-balanced",
    name: "Balanced rail",
    surface: "rail",
    feel: "balanced",
    pitch: "Between Tight and Loose: quick, with a visible settle.",
    suitedFor: "A sensible default for browsing a handful of screens.",
  },
  {
    id: "rail-loose",
    name: "Loose rail",
    surface: "rail",
    feel: "loose",
    pitch: "Soft landings and the widest elastic edge.",
    suitedFor: "Relaxed browsing where the motion can be part of the experience.",
  },
  {
    id: "rail-yours",
    name: "Your tuning",
    surface: "rail",
    feel: "tuning",
    pitch: "The rail, moving with whatever the Motion Tuning bar below is set to.",
    suitedFor: "Checking a setting you tuned yourself against the presets.",
  },
  {
    id: "deck-shuffle",
    name: "Shuffle deck",
    surface: "deck",
    exchange: "shuffle",
    feel: "balanced",
    pitch: "The top card passes behind the pile.",
    suitedFor: "Going through screens one at a time, in order.",
  },
  {
    id: "deck-direct",
    name: "Direct deck",
    surface: "deck",
    exchange: "direct",
    feel: "balanced",
    pitch: "The card stays attached to the point you grab, vertical movement included.",
    suitedFor: "Touch-first interfaces where the card should follow the finger exactly.",
  },
  {
    id: "deck-heavy",
    name: "Heavy shuffle deck",
    surface: "deck",
    exchange: "shuffle",
    feel: "heavy",
    pitch: "The Shuffle deck with the heaviest spring: a release travels one card at most.",
    suitedFor: "Deliberate, weighty paging where an accidental flick should not skip ahead.",
  },
];

export const candidateById: ReadonlyMap<CandidateId, CandidateDefinition> = new Map(
  candidateDefinitions.map((definition) => [definition.id, definition]),
);

export function isCandidateId(value: string): value is CandidateId {
  return candidateById.has(value as CandidateId);
}
