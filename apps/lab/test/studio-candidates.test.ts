import { MOTION_PRESETS } from "@snap-motion/core";
import { describe, expect, it } from "vitest";

import {
  carouselReleaseFromSettings,
  deckReleaseFromSettings,
  settingsFromPreset,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "../src/fixtures/lab-settings";
import { sampleSpringResponse } from "../src/playground/spring-response";
import {
  candidateById,
  candidateDefinitions,
  candidateIds,
  differenceRows,
  implementationProps,
  implementationSnippet,
  resolveCandidate,
  responseChart,
  summarizeDifference,
  type CandidateId,
} from "../src/playground/studio/candidates";

const tuning = settingsFromPreset("balanced");
const resolve = (id: CandidateId, settings = tuning) =>
  resolveCandidate(candidateById.get(id)!, settings);

describe("the candidate catalogue", () => {
  it("has unique ids, every one declared, each with authored guidance", () => {
    expect(new Set(candidateIds).size).toBe(candidateIds.length);
    expect(candidateDefinitions.map(({ id }) => id)).toEqual([...candidateIds]);
    for (const definition of candidateDefinitions) {
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.pitch.length).toBeGreaterThan(0);
      expect(definition.suitedFor.length).toBeGreaterThan(0);
    }
  });

  it("gives an exchange to a deck and to nothing else", () => {
    const hasExchange = candidateDefinitions.map(({ exchange, id }) => [
      id,
      exchange !== undefined,
    ]);
    const isDeck = candidateDefinitions.map(({ id, surface }) => [id, surface === "deck"]);
    expect(hasExchange).toEqual(isDeck);
  });

  it("offers different behaviours, not one behaviour under several names", () => {
    const signature = candidateDefinitions.map((definition) => {
      const behavior = resolve(definition.id);
      return JSON.stringify([
        behavior.surface,
        behavior.exchange,
        // "Your tuning" starts as Balanced, so it intentionally matches the Balanced rail.
        definition.feel === "tuning" ? "balanced" : behavior.feel,
      ]);
    });
    const distinct = new Set(signature);
    // The only deliberate duplicate is "Your tuning" equalling its starting preset.
    expect(distinct.size).toBe(candidateDefinitions.length - 1);
  });
});

describe("resolving a candidate", () => {
  const presetCandidates = candidateDefinitions.filter(({ feel }) => feel !== "tuning");
  for (const definition of presetCandidates) {
    it(`reads ${definition.id}'s own preset numbers, whatever the page is tuned to`, () => {
      const source = MOTION_PRESETS[definition.feel as keyof typeof MOTION_PRESETS];
      const behavior = resolve(definition.id, settingsFromPreset("loose"));
      expect(behavior.settings.stiffness).toBe(source.spring.stiffness);
      expect(behavior.settings.damping).toBe(source.spring.damping);
      expect(behavior.settings.mass).toBe(source.spring.mass);
    });
  }

  it("follows the page's tuning only for the candidate that says so", () => {
    const heavy = settingsFromPreset("heavy");
    expect(resolve("rail-yours", heavy).settings).toEqual(heavy);
    const moved = presetCandidates.map(({ id }) => resolve(id, heavy));
    const unmoved = presetCandidates.map(({ id }) => resolve(id, tuning));
    expect(moved).toEqual(unmoved);
  });

  it("computes its response with the engine's own stepper, not a second model", () => {
    const behavior = resolve("rail-loose");
    expect(behavior.response).toEqual(sampleSpringResponse(settingsFromPreset("loose")));
    expect(behavior.settleMs).toBe(Math.round(behavior.response.settleSeconds! * 1000));
    expect(behavior.overshootPercent).toBe(Math.round(behavior.response.overshoot * 1000) / 10);
  });

  it("says a deck takes one card per release and a rail takes its preset's skip", () => {
    expect(resolve("deck-shuffle").maxStep).toBe(1);
    expect(resolve("rail-tight").maxStep).toBe(
      Math.max(1, Math.round(MOTION_PRESETS.tight.release.maxAnchorSkip)),
    );
    expect(resolve("rail-yours", settingsFromPreset("heavy")).maxStep).toBe(
      Math.max(1, Math.round(MOTION_PRESETS.heavy.release.maxAnchorSkip)),
    );
  });
});

describe("the difference between two candidates", () => {
  it("marks exactly the rows that differ, and labels each as declared or computed", () => {
    const rows = differenceRows(resolve("rail-tight"), resolve("rail-loose"));
    expect(rows.map(({ a, b, differs }) => differs === (a !== b))).not.toContain(false);
    expect(rows.find(({ key }) => key === "surface")!.differs).toBe(false);
    expect(rows.find(({ key }) => key === "stiffness")!.differs).toBe(true);
    expect(rows.filter(({ source }) => source === "computed").map(({ key }) => key)).toEqual([
      "settle",
      "overshoot",
    ]);
  });

  it("finds nothing different between a candidate and itself", () => {
    const rows = differenceRows(resolve("deck-direct"), resolve("deck-direct"));
    expect(rows.every(({ differs }) => !differs)).toBe(true);
    expect(summarizeDifference(resolve("deck-direct"), resolve("deck-direct"))).toMatch(/same/i);
  });

  it("explains a change of surface, of exchange and of feel in different words", () => {
    const surface = summarizeDifference(resolve("rail-balanced"), resolve("deck-shuffle"));
    const exchange = summarizeDifference(resolve("deck-shuffle"), resolve("deck-direct"));
    const feel = summarizeDifference(resolve("rail-tight"), resolve("rail-loose"));
    expect(surface).toMatch(/rail.*deck/i);
    expect(exchange).toMatch(/Shuffle.*Direct/);
    expect(feel).toMatch(/difference is in the feel/);
  });

  it("never says which candidate is better", () => {
    const verdicts = candidateIds.flatMap((a) =>
      candidateIds
        .map((b) => ({ pair: `${a} / ${b}`, text: summarizeDifference(resolve(a), resolve(b)) }))
        .filter(({ text }) => /better|worse|best|recommend/i.test(text)),
    );
    expect(verdicts).toEqual([]);
  });

  it("says which settles later, and by how much, only when the difference is real", () => {
    const heavy = resolve("deck-heavy");
    const shuffle = resolve("deck-shuffle");
    const text = summarizeDifference(shuffle, heavy);
    const delta = heavy.settleMs! - shuffle.settleMs!;
    expect(text).toContain(
      Math.abs(delta) < 20 ? "about" : `${Math.abs(delta)} ms ${delta > 0 ? "later" : "sooner"}`,
    );
  });

  it("names the release settings that differ when the springs settle alike", () => {
    const text = summarizeDifference(resolve("rail-tight"), resolve("rail-loose"));
    expect(text).toMatch(/release carries differently/i);
  });
});

describe("the implementation", () => {
  it("is built from the same mappings the live surfaces use", () => {
    const behavior = resolve("rail-loose");
    const props = implementationProps(behavior);
    const settings = settingsFromPreset("loose");
    expect(props.spring).toEqual(springFromSettings(settings));
    expect(props.elasticity).toEqual(symmetricElasticityFromSettings(settings));
    expect(props.releasePolicy).toEqual(carouselReleaseFromSettings(settings));
    expect(props.programmaticImpulse).toBe(settings.programmaticImpulse);
  });

  it("gives a deck a release policy without the skip the deck fixes for itself", () => {
    const props = implementationProps(resolve("deck-shuffle"));
    expect(props.releasePolicy).toEqual(deckReleaseFromSettings(settingsFromPreset("balanced")));
    expect("maxAnchorSkip" in props.releasePolicy).toBe(false);
  });

  for (const id of candidateIds) {
    it(`prints a snippet for ${id} whose numbers are the candidate's`, () => {
      const behavior = resolve(id);
      const snippet = implementationSnippet(behavior);
      const props = implementationProps(behavior);
      const entry = behavior.surface === "deck" ? "stacked-deck" : "coverflow";
      expect(snippet).toContain(`@snap-motion/vue/${entry}`);
      const spring = /const spring = (\{[\s\S]*?\});/.exec(snippet)![1]!;
      expect(JSON.parse(spring)).toEqual(props.spring);
      const release = /const releasePolicy = (\{[\s\S]*?\});/.exec(snippet)![1]!;
      expect(JSON.parse(release)).toEqual(props.releasePolicy);
      expect(snippet).toContain(`:programmatic-impulse="${props.programmaticImpulse}"`);
      // A deck names its exchange; a rail has none to name.
      expect(snippet.includes(`exchange="${behavior.exchange}"`)).toBe(
        behavior.exchange !== undefined,
      );
      expect(snippet.includes("exchange=")).toBe(behavior.exchange !== undefined);
    });
  }
});

describe("the response chart", () => {
  it("puts every curve on one shared time axis and keeps overshoot inside the plot", () => {
    const a = resolve("rail-tight");
    const b = resolve("rail-loose");
    const chart = responseChart([a, b]);
    expect(chart.curves.map(({ id }) => id)).toEqual(["rail-tight", "rail-loose"]);
    expect(chart.seconds).toBeCloseTo(Math.max(a.settleMs!, b.settleMs!) / 1000, 1);
    for (const { path } of chart.curves) {
      const numbers = [...path.matchAll(/-?\d+(\.\d+)?/g)].map(([value]) => Number(value));
      expect(numbers.length).toBeGreaterThan(8);
      const ys = numbers.filter((_, index) => index % 2 === 1);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(chart.height);
    }
    expect(chart.targetY).toBeGreaterThan(0);
  });

  it("draws one candidate as one curve", () => {
    expect(responseChart([resolve("deck-direct")]).curves).toHaveLength(1);
  });
});
