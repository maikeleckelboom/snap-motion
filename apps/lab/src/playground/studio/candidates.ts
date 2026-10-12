import {
  carouselReleaseFromSettings,
  deckReleaseFromSettings,
  settingsFromPreset,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "../../fixtures/lab-settings";
import type { LabPhysicsSettings } from "../../fixtures/lab-types";
import { presetLabel } from "../preset-facts";
import { sampleSpringResponse, type SpringResponse } from "../spring-response";
import type {
  CandidateDefinition,
  CandidateExchange,
  CandidateFeel,
  CandidateId,
  CandidateSurface,
} from "./candidate-definitions";

export {
  candidateById,
  candidateDefinitions,
  candidateIds,
  isCandidateId,
} from "./candidate-definitions";
export type {
  CandidateDefinition,
  CandidateExchange,
  CandidateFeel,
  CandidateId,
  CandidateSurface,
} from "./candidate-definitions";

/**
 * The Motion Studio's candidates: motion behaviours a product team could ship for one interaction,
 * switching between the screens of an application.
 *
 * A candidate is a surface (a Coverflow rail or a Stacked Deck), an exchange where the surface has
 * one, and a feel (a preset, or the Playground's own Motion Tuning). It is all declared data: the
 * numbers shown for it are read from the same preset and mapping functions the live surfaces use, so
 * a candidate cannot describe a behaviour it does not run.
 *
 * Two kinds of fact are kept apart everywhere they appear:
 *
 * - *declared* values are the settings themselves (stiffness, damping, mass, the largest step);
 * - *computed* values (settle time, overshoot) come from stepping the engine's own spring on one
 *   card-width move. They describe the spring alone. Nothing here is measured from a running page.
 *
 * The `pitch` and `suitedFor` lines are authored guidance, and the interface says so.
 */

/** A candidate with every value the interface reads, resolved for one set of tuning settings. */
export interface CandidateBehavior {
  readonly id: CandidateId;
  readonly name: string;
  readonly surface: CandidateSurface;
  readonly surfaceLabel: string;
  readonly exchange: CandidateExchange | undefined;
  readonly exchangeLabel: string;
  readonly feel: CandidateFeel;
  readonly feelLabel: string;
  readonly pitch: string;
  readonly suitedFor: string;
  /** The settings the live surface is given. */
  readonly settings: LabPhysicsSettings;
  readonly response: SpringResponse;
  /** Computed from the spring: whole milliseconds to rest, or `undefined` if it never rests in 4 s. */
  readonly settleMs: number | undefined;
  /** Computed from the spring: the largest excursion past the target, in percent of the move. */
  readonly overshootPercent: number;
  /** Declared: how many cards one release may travel. A deck always takes exactly one. */
  readonly maxStep: number;
}

export function surfaceLabel(surface: CandidateSurface) {
  return surface === "rail" ? "Rail" : "Deck";
}

export function exchangeLabel(exchange: CandidateExchange | undefined) {
  if (exchange === undefined) return "None";
  return exchange === "shuffle" ? "Shuffle" : "Direct";
}

/**
 * Resolves a candidate against the page's tuning. Only "Your tuning" reads `tuning`; every other
 * candidate's numbers come from its own preset, so they never move.
 */
export function resolveCandidate(
  definition: CandidateDefinition,
  tuning: LabPhysicsSettings,
): CandidateBehavior {
  const settings = definition.feel === "tuning" ? tuning : settingsFromPreset(definition.feel);
  const response = sampleSpringResponse(settings);
  return {
    id: definition.id,
    name: definition.name,
    surface: definition.surface,
    surfaceLabel: surfaceLabel(definition.surface),
    exchange: definition.exchange,
    exchangeLabel: exchangeLabel(definition.exchange),
    feel: definition.feel,
    feelLabel: definition.feel === "tuning" ? "Your tuning" : presetLabel(definition.feel),
    pitch: definition.pitch,
    suitedFor: definition.suitedFor,
    settings,
    response,
    settleMs:
      response.settleSeconds === undefined ? undefined : Math.round(response.settleSeconds * 1000),
    overshootPercent: Math.round(response.overshoot * 1000) / 10,
    maxStep: definition.surface === "deck" ? 1 : Math.max(1, Math.round(settings.maxAnchorSkip)),
  };
}

// ---------------------------------------------------------------------------------- differences

export interface DifferenceRow {
  readonly key: string;
  readonly label: string;
  readonly a: string;
  readonly b: string;
  readonly differs: boolean;
  /** Declared settings versus values computed from them. The interface labels the two apart. */
  readonly source: "declared" | "computed";
}

function row(
  key: string,
  label: string,
  a: string,
  b: string,
  source: DifferenceRow["source"],
): DifferenceRow {
  return { key, label, a, b, differs: a !== b, source };
}

const elasticEdge = (behavior: CandidateBehavior) =>
  `${behavior.settings.elasticResistance} resistance, ${behavior.settings.maxElasticDistance} card limit`;

const ms = (value: number | undefined) => (value === undefined ? "Over 4 s" : `${value} ms`);

/** The rows of the comparison: what each candidate declares, then what its spring computes. */
export function differenceRows(a: CandidateBehavior, b: CandidateBehavior): DifferenceRow[] {
  return [
    row("surface", "Surface", a.surfaceLabel, b.surfaceLabel, "declared"),
    row("exchange", "Exchange", a.exchangeLabel, b.exchangeLabel, "declared"),
    row("feel", "Feel", a.feelLabel, b.feelLabel, "declared"),
    row(
      "stiffness",
      "Stiffness",
      String(a.settings.stiffness),
      String(b.settings.stiffness),
      "declared",
    ),
    row("damping", "Damping", String(a.settings.damping), String(b.settings.damping), "declared"),
    row("mass", "Mass", String(a.settings.mass), String(b.settings.mass), "declared"),
    row("step", "Largest step", `${a.maxStep}`, `${b.maxStep}`, "declared"),
    row(
      "fling",
      "Fling threshold",
      `${a.settings.flingVelocity} px/s`,
      `${b.settings.flingVelocity} px/s`,
      "declared",
    ),
    row(
      "projection",
      "Release projection",
      `${a.settings.projectionSeconds} s`,
      `${b.settings.projectionSeconds} s`,
      "declared",
    ),
    row("edge", "Elastic edge", elasticEdge(a), elasticEdge(b), "declared"),
    row(
      "impulse",
      "Control impulse",
      `${a.settings.programmaticImpulse}`,
      `${b.settings.programmaticImpulse}`,
      "declared",
    ),
    row("settle", "Settles in", ms(a.settleMs), ms(b.settleMs), "computed"),
    row("overshoot", "Overshoot", `${a.overshootPercent}%`, `${b.overshootPercent}%`, "computed"),
  ];
}

const RELEASE_KEYS = ["step", "fling", "projection", "edge", "impulse"];

/** Below this the settle times read as the same, whatever the arithmetic says. */
const SAME_SETTLE_MS = 20;

/**
 * Two plain sentences on what separates the candidates, built only from the rows above. It never
 * says which is better: that is the decision, and it belongs to the person making it.
 */
export function summarizeDifference(a: CandidateBehavior, b: CandidateBehavior): string {
  if (a.id === b.id) return "These are the same candidate.";
  const parts: string[] = [];
  if (a.surface !== b.surface) {
    parts.push(
      `${a.name} is a ${a.surfaceLabel.toLowerCase()}; ${b.name} is a ${b.surfaceLabel.toLowerCase()}.`,
    );
  } else if (a.exchange !== b.exchange) {
    parts.push(
      `Same surface, with a ${exchangeLabel(a.exchange)} exchange against ${exchangeLabel(b.exchange)}.`,
    );
  } else {
    parts.push("Same surface and exchange, so the difference is in the feel.");
  }
  if (a.settleMs === undefined || b.settleMs === undefined) {
    parts.push("At least one spring does not come to rest within four seconds.");
  } else {
    const delta = b.settleMs - a.settleMs;
    if (Math.abs(delta) < SAME_SETTLE_MS) {
      parts.push(`Both settle in about ${a.settleMs} ms.`);
    } else {
      parts.push(
        `${b.name} settles ${Math.abs(delta)} ms ${delta > 0 ? "later" : "sooner"} than ${a.name}.`,
      );
    }
    if (a.overshootPercent !== b.overshootPercent) {
      parts.push(`Overshoot is ${a.overshootPercent}% against ${b.overshootPercent}%.`);
    }
  }
  // Presets can settle alike and still carry a release differently; say so when they do.
  const release = differenceRows(a, b)
    .filter(({ key, differs }) => differs && RELEASE_KEYS.includes(key))
    .map(({ label }) => label.toLowerCase());
  if (release.length > 0) parts.push(`A release carries differently: ${release.join(", ")}.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------------- implementation

function formatProps(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent);
}

/**
 * The props that give a consumer this behaviour, with the values the live preview was given. The
 * object literals come from the same mapping functions the surfaces use, so the snippet cannot
 * drift from the preview.
 */
export function implementationProps(behavior: CandidateBehavior) {
  const spring = springFromSettings(behavior.settings);
  const elasticity = symmetricElasticityFromSettings(behavior.settings);
  const releasePolicy =
    behavior.surface === "deck"
      ? deckReleaseFromSettings(behavior.settings)
      : carouselReleaseFromSettings(behavior.settings);
  return {
    elasticity,
    programmaticImpulse: behavior.settings.programmaticImpulse,
    releasePolicy,
    spring,
  };
}

export function implementationSnippet(behavior: CandidateBehavior): string {
  const props = implementationProps(behavior);
  const component = behavior.surface === "deck" ? "StackedDeck" : "Coverflow";
  const entry = behavior.surface === "deck" ? "stacked-deck" : "coverflow";
  const exchange = behavior.exchange === undefined ? "" : `\n  exchange="${behavior.exchange}"`;
  return [
    `import { ${component} } from "@snap-motion/vue/${entry}";`,
    "",
    `const spring = ${formatProps(props.spring)};`,
    `const releasePolicy = ${formatProps(props.releasePolicy)};`,
    `const elasticity = ${formatProps(props.elasticity)};`,
    "",
    `<${component}${exchange}`,
    `  :items="screens"`,
    `  :spring="spring"`,
    `  :release-policy="releasePolicy"`,
    `  :elasticity="elasticity"`,
    `  :programmatic-impulse="${props.programmaticImpulse}"`,
    "/>",
  ].join("\n");
}

// ---------------------------------------------------------------------------------- response chart

export interface ResponseCurve {
  readonly id: CandidateId;
  /** An SVG path in the chart's own coordinates. */
  readonly path: string;
}

export interface ResponseChart {
  readonly width: number;
  readonly height: number;
  /** The horizontal extent, in seconds. */
  readonly seconds: number;
  /** Where progress 1 (the target) sits, in chart units. */
  readonly targetY: number;
  readonly curves: readonly ResponseCurve[];
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PAD = 8;

/**
 * The step responses of the given candidates on one shared time axis, so the same horizontal
 * distance means the same time for each. The vertical axis spans the largest overshoot present.
 */
export function responseChart(behaviors: readonly CandidateBehavior[]): ResponseChart {
  const seconds = Math.max(
    0.2,
    ...behaviors.map((behavior) => behavior.response.settleSeconds ?? 4),
  );
  const top = Math.max(
    1.05,
    ...behaviors.map((behavior) => 1 + behavior.response.overshoot + 0.05),
  );
  const plotWidth = CHART_WIDTH - CHART_PAD * 2;
  const plotHeight = CHART_HEIGHT - CHART_PAD * 2;
  const x = (time: number) => CHART_PAD + (time / seconds) * plotWidth;
  const y = (progress: number) => CHART_PAD + plotHeight - (progress / top) * plotHeight;
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    seconds,
    targetY: y(1),
    curves: behaviors.map((behavior) => {
      const points = behavior.response.samples.map(
        ({ progress, time }) => `${x(time).toFixed(1)} ${y(progress).toFixed(1)}`,
      );
      // After it rests, a curve holds the target to the end of the shared axis.
      const last = behavior.response.samples.at(-1)!;
      if (last.time < seconds)
        points.push(`${x(seconds).toFixed(1)} ${y(last.progress).toFixed(1)}`);
      return { id: behavior.id, path: `M${points.join(" L")}` };
    }),
  };
}
