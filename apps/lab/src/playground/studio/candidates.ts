import {
  carouselReleaseFromSettings,
  deckReleaseFromSettings,
  settingsFromPreset,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "../../fixtures/lab-settings";
import type { LabPhysicsSettings } from "../../fixtures/lab-types";
import { modifiedPhysicsKeys } from "../../fixtures/physics-parameters";
import { presetLabel } from "../preset-facts";
import { PREVIEW_TRAVEL_PX, sampleSpringResponse, type SpringResponse } from "../spring-response";
import {
  CUSTOM_ID,
  type CandidateDefinition,
  type CandidateExchange,
  type CandidateFeel,
  type CandidateId,
  type CandidateSurface,
} from "./candidate-definitions";
import type { CustomCandidateState } from "./studio-custom";

export {
  CUSTOM_ID,
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
 * The Motion Studio's candidates: ways to browse the photos shared in a conversation.
 *
 * A candidate is a layout (an item carousel or a stacked deck), an exchange where the layout has one,
 * and a feel (an engine preset). It is all declared data: the numbers shown for it are read from the
 * same preset and mapping functions the live surfaces use, so a candidate cannot describe a behaviour
 * it does not run.
 *
 * Two kinds of fact are kept apart everywhere they appear:
 *
 * - *declared* values are the settings themselves (stiffness, damping, mass, the largest step);
 * - *calculated* values (settle time, overshoot) come from stepping the engine's own spring on one
 *   fixed-distance move. They describe the spring alone. Nothing here is measured from a running page.
 *
 * The `pitch` and `suitedFor` lines are authored guidance, and the interface says so.
 */

/** A candidate with every value the interface reads, resolved for the Custom candidate's state. */
export interface CandidateBehavior {
  readonly id: CandidateId;
  readonly name: string;
  readonly surface: CandidateSurface;
  readonly surfaceLabel: string;
  readonly exchange: CandidateExchange | undefined;
  readonly exchangeLabel: string;
  /** The preset the numbers are, or began as. */
  readonly feel: CandidateFeel;
  /** "Balanced", or for an edited Custom, "Balanced, 2 edited". */
  readonly feelLabel: string;
  /** True for the one candidate a visitor can change. */
  readonly custom: boolean;
  /** How many settings differ from the base preset. Always 0 for a reference candidate. */
  readonly edited: number;
  readonly pitch: string;
  readonly suitedFor: string;
  /** The settings the live surface is given. */
  readonly settings: LabPhysicsSettings;
  readonly response: SpringResponse;
  /** Calculated from the spring: whole milliseconds to rest, or `undefined` if it never rests in 4 s. */
  readonly settleMs: number | undefined;
  /** Calculated from the spring: the largest excursion past the target, in percent of the move. */
  readonly overshootPercent: number;
  /** Declared: how many items one release may travel. A deck always takes exactly one. */
  readonly maxStep: number;
}

export function surfaceLabel(surface: CandidateSurface) {
  return surface === "carousel" ? "Item carousel" : "Stacked deck";
}

export function exchangeLabel(exchange: CandidateExchange | undefined) {
  if (exchange === undefined) return "None";
  return exchange === "shuffle" ? "Shuffle" : "Direct";
}

/** The one-line shape of a behaviour: what it browses with and how it feels. */
export function describeShape(behavior: CandidateBehavior): string {
  const exchange = behavior.exchange === undefined ? "" : `${behavior.exchangeLabel}, `;
  return `${behavior.surfaceLabel}, ${exchange}${behavior.feelLabel}`;
}

/**
 * Resolves a candidate. Only Custom reads `custom`; every other candidate's numbers come from its own
 * preset, so they never move however Custom is edited.
 */
export function resolveCandidate(
  definition: CandidateDefinition,
  custom: CustomCandidateState,
): CandidateBehavior {
  const isCustom = definition.id === CUSTOM_ID;
  const surface = isCustom ? custom.surface : definition.surface;
  const exchange =
    surface === "deck" ? (isCustom ? custom.exchange : definition.exchange) : undefined;
  const feel = isCustom ? custom.base : definition.feel;
  const settings = isCustom ? custom.settings : settingsFromPreset(definition.feel);
  const edited = isCustom ? modifiedPhysicsKeys(settings, settingsFromPreset(feel)).length : 0;
  const response = sampleSpringResponse(settings);
  const feelName = presetLabel(feel);
  const behavior: CandidateBehavior = {
    id: definition.id,
    name: definition.name,
    surface,
    surfaceLabel: surfaceLabel(surface),
    exchange,
    exchangeLabel: exchangeLabel(exchange),
    feel,
    feelLabel: edited > 0 ? `${feelName}, ${edited} edited` : feelName,
    custom: isCustom,
    edited,
    pitch: definition.pitch,
    suitedFor: definition.suitedFor,
    settings,
    response,
    settleMs:
      response.settleSeconds === undefined ? undefined : Math.round(response.settleSeconds * 1000),
    overshootPercent: Math.round(response.overshoot * 1000) / 10,
    maxStep: surface === "deck" ? 1 : Math.max(1, Math.round(settings.maxAnchorSkip)),
  };
  // Custom's pitch states what it currently is, so a shortlist card and a row never describe a
  // candidate that has since been changed.
  return isCustom
    ? { ...behavior, pitch: `${describeShape(behavior)}. Your own variant.` }
    : behavior;
}

// ------------------------------------------------------------------------------- the comparison

/** Declared settings versus values calculated from them. The interface labels the two apart. */
export type DifferenceSource = "declared" | "calculated";

export interface DifferenceRow {
  readonly key: string;
  readonly label: string;
  readonly a: string;
  readonly b: string;
  readonly differs: boolean;
  readonly source: DifferenceSource;
}

function row(key: string, label: string, a: string, b: string, source: DifferenceSource) {
  return { key, label, a, b, differs: a !== b, source } satisfies DifferenceRow;
}

const elasticEdge = (behavior: CandidateBehavior) =>
  `${behavior.settings.elasticResistance} resistance, ${behavior.settings.maxElasticDistance} px limit`;

const ms = (value: number | undefined) => (value === undefined ? "Over 4 s" : `${value} ms`);

/**
 * Every row of the advanced table: what each candidate declares, then what its spring calculates.
 * This is the complete record. The comparison a visitor reads first is {@link compareCandidates}.
 */
export function differenceRows(a: CandidateBehavior, b: CandidateBehavior): DifferenceRow[] {
  return [
    row("surface", "Layout", a.surfaceLabel, b.surfaceLabel, "declared"),
    row("exchange", "Exchange", a.exchangeLabel, b.exchangeLabel, "declared"),
    row("feel", "Base preset", presetLabel(a.feel), presetLabel(b.feel), "declared"),
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
    row("settle", "Settles in", ms(a.settleMs), ms(b.settleMs), "calculated"),
    row("overshoot", "Overshoot", `${a.overshootPercent}%`, `${b.overshootPercent}%`, "calculated"),
  ];
}

/** One thing a visitor can see or feel differs. It says what, in the visitor's terms. */
export interface NotableDifference {
  readonly key:
    | "layout"
    | "exchange"
    | "settle"
    | "overshoot"
    | "flick"
    | "release"
    | "edge"
    | "buttons";
  readonly title: string;
  readonly a: string;
  readonly b: string;
  /** What it means to the person using it. It never says which is better. */
  readonly meaning: string;
  readonly source: DifferenceSource;
}

export interface Comparison {
  /** True when A and B are one configuration, so there is nothing to tell apart. */
  readonly same: boolean;
  /** The two candidates lay out their items differently: the springs are not the only difference. */
  readonly layoutDiffers: boolean;
  /** The springs are identical although the layouts differ: what you feel is then layout alone. */
  readonly identicalSprings: boolean;
  /** One or two sentences: the biggest difference first. */
  readonly headline: string;
  /** Present when the layouts differ. It says plainly that equal springs would still not feel equal. */
  readonly caveat: string | undefined;
  /** The differences that matter, most meaningful first. Empty when nothing differs. */
  readonly notable: readonly NotableDifference[];
  /** What does not differ, as short labels. */
  readonly unchanged: readonly string[];
}

/** Below this the settle times read as the same, whatever the arithmetic says. */
const SAME_SETTLE_MS = 20;

const SPRING_KEYS = ["stiffness", "damping", "mass", "restSpeed", "restDistance"] as const;

const sameSpring = (a: CandidateBehavior, b: CandidateBehavior) =>
  SPRING_KEYS.every((key) => a.settings[key] === b.settings[key]);

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * What differs between two candidates, in the order a person cares about it.
 *
 * The layout comes first because it changes what is being compared at all: an item carousel moves a
 * strip of unequal-width items over their own distances, a deck exchanges one photo at a time. Two
 * identical springs on those two layouts still do not feel alike, and the comparison says so. Then
 * what a deck does with a release, then what the spring does, then the release and edge settings.
 *
 * It says nothing about which is better: that is the decision, and it belongs to the person making it.
 * Calculated figures are labelled as such and never as measurements of this page.
 */
export function compareCandidates(a: CandidateBehavior, b: CandidateBehavior): Comparison {
  const rows = differenceRows(a, b);
  const everyRowSame = rows.every(({ differs }) => !differs);
  const layoutDiffers = a.surface !== b.surface;
  const identicalSprings = layoutDiffers && sameSpring(a, b);
  const notable: NotableDifference[] = [];
  const unchanged: string[] = [];
  const track = (key: string, label: string, differs: boolean) => {
    if (!differs) unchanged.push(label);
    return differs;
  };

  if (track("layout", "Layout", layoutDiffers)) {
    notable.push({
      key: "layout",
      title: "Layout",
      a: a.surfaceLabel,
      b: b.surfaceLabel,
      meaning:
        "They move different things over different distances: a carousel slides a strip of items " +
        "of unequal width, a deck exchanges one photo at a time.",
      source: "declared",
    });
  }
  if (a.surface === "deck" && b.surface === "deck") {
    if (track("exchange", "Exchange", a.exchange !== b.exchange)) {
      notable.push({
        key: "exchange",
        title: "Exchange",
        a: a.exchangeLabel,
        b: b.exchangeLabel,
        meaning:
          "Shuffle sends the top photo behind the pile. Direct keeps it attached to the point you grab.",
        source: "declared",
      });
    }
  }

  if (a.settleMs !== undefined && b.settleMs !== undefined) {
    const delta = b.settleMs - a.settleMs;
    if (track("settle", "Settling time", Math.abs(delta) >= SAME_SETTLE_MS)) {
      notable.push({
        key: "settle",
        title: "Settling",
        a: ms(a.settleMs),
        b: ms(b.settleMs),
        meaning: `B comes to rest ${Math.abs(delta)} ms ${delta > 0 ? "later" : "sooner"} than A, calculated from the springs on one ${PREVIEW_TRAVEL_PX} px move.`,
        source: "calculated",
      });
    }
  } else if (a.settleMs !== b.settleMs) {
    notable.push({
      key: "settle",
      title: "Settling",
      a: ms(a.settleMs),
      b: ms(b.settleMs),
      meaning: "At least one spring does not come to rest within four seconds.",
      source: "calculated",
    });
  } else {
    unchanged.push("Settling time");
  }

  if (track("overshoot", "Overshoot", a.overshootPercent !== b.overshootPercent)) {
    const larger = b.overshootPercent > a.overshootPercent ? "B" : "A";
    notable.push({
      key: "overshoot",
      title: "Overshoot",
      a: `${a.overshootPercent}%`,
      b: `${b.overshootPercent}%`,
      meaning: `${larger} swings further past its target before it settles, calculated from the spring alone.`,
      source: "calculated",
    });
  }

  if (track("flick", "Flick travel", a.maxStep !== b.maxStep)) {
    notable.push({
      key: "flick",
      title: "Flick travel",
      a: `${a.maxStep} ${plural(a.maxStep, "photo", "photos")}`,
      b: `${b.maxStep} ${plural(b.maxStep, "photo", "photos")}`,
      meaning: "How many photos one release is allowed to carry.",
      source: "declared",
    });
  }

  const releaseDiffers =
    a.settings.flingVelocity !== b.settings.flingVelocity ||
    a.settings.projectionSeconds !== b.settings.projectionSeconds;
  if (track("release", "Release", releaseDiffers)) {
    notable.push({
      key: "release",
      title: "Release",
      a: `${a.settings.flingVelocity} px/s, ${a.settings.projectionSeconds} s`,
      b: `${b.settings.flingVelocity} px/s, ${b.settings.projectionSeconds} s`,
      meaning: "How fast a flick has to be to count, and how far a fast release carries on.",
      source: "declared",
    });
  }

  if (track("edge", "Elastic edge", elasticEdge(a) !== elasticEdge(b))) {
    notable.push({
      key: "edge",
      title: "Edge give",
      a: elasticEdge(a),
      b: elasticEdge(b),
      meaning:
        "How far the first or last photo can be pulled past the end, and how firmly it resists.",
      source: "declared",
    });
  }

  if (
    track(
      "buttons",
      "Buttons and keys",
      a.settings.programmaticImpulse !== b.settings.programmaticImpulse,
    )
  ) {
    notable.push({
      key: "buttons",
      title: "Buttons and keys",
      a: `${a.settings.programmaticImpulse} px/s`,
      b: `${b.settings.programmaticImpulse} px/s`,
      meaning: "The push a Next or Previous press gives before the spring takes over.",
      source: "declared",
    });
  }

  const same = everyRowSame;
  const caveat = layoutDiffers
    ? identicalSprings
      ? "The springs are identical, but the layouts are not. Whatever feels different here is the layout, not the physics."
      : "These are different layouts, so the springs are not the only thing that differs. Equal springs would still not feel equal."
    : undefined;

  let headline: string;
  if (same) {
    headline =
      "A and B are configured the same, so they behave the same. Change B to see what a setting does.";
  } else if (layoutDiffers) {
    headline = `A is an ${a.surfaceLabel.toLowerCase()} and B is a ${b.surfaceLabel.toLowerCase()}: you are comparing layouts as much as springs.`;
  } else {
    const lead = notable.slice(0, 2).map((item) => item.title.toLowerCase());
    headline =
      lead.length === 0
        ? "The layout and the main settings match; only advanced settings differ."
        : `Same layout. B differs in ${lead.join(" and ")}.`;
  }

  return {
    same,
    layoutDiffers,
    identicalSprings,
    headline,
    caveat,
    notable,
    unchanged,
  };
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

/**
 * What a consumer writes to get this behaviour. A deck is the package's `StackedDeck`. An item
 * carousel is `useCarouselMotion`: `CarouselRoot` takes no physics, and the item layer is the
 * application's own, because `CarouselSlide` makes every slide but the current one inert.
 */
export function implementationSnippet(behavior: CandidateBehavior): string {
  const props = implementationProps(behavior);
  const physics = [
    `const spring = ${formatProps(props.spring)};`,
    `const releasePolicy = ${formatProps(props.releasePolicy)};`,
    `const elasticity = ${formatProps(props.elasticity)};`,
  ];
  if (behavior.surface === "carousel") {
    return [
      `import { createVariableWidthGeometry } from "@snap-motion/core";`,
      `import { useCarouselMotion } from "@snap-motion/vue/carousel";`,
      "",
      ...physics,
      "",
      "const motion = useCarouselMotion({",
      "  anchors,",
      "  bounds,",
      "  // Measure each item's layout box, then centre it with createVariableWidthGeometry.",
      "  measure,",
      "  spring,",
      "  releasePolicy,",
      "  elasticity,",
      `  programmaticImpulse: ${props.programmaticImpulse},`,
      "  track,",
      "  viewport,",
      "});",
    ].join("\n");
  }
  return [
    `import { StackedDeck } from "@snap-motion/vue/stacked-deck";`,
    "",
    ...physics,
    "",
    `<StackedDeck`,
    `  exchange="${behavior.exchange ?? "shuffle"}"`,
    `  :items="photos"`,
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
