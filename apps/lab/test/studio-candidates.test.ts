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
  CUSTOM_ID,
  candidateById,
  candidateDefinitions,
  candidateIds,
  compareCandidates,
  describeShape,
  differenceRows,
  implementationProps,
  implementationSnippet,
  resolveCandidate,
  responseChart,
  type CandidateId,
} from "../src/playground/studio/candidates";
import {
  createCustomCandidate,
  type CustomCandidateState,
} from "../src/playground/studio/studio-custom";

const fresh = (): CustomCandidateState => createCustomCandidate().state.value;
const resolve = (id: CandidateId, custom: CustomCandidateState = fresh()) =>
  resolveCandidate(candidateById.get(id)!, custom);

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

  it("never names a rail: the user-facing words are the item carousel and the stacked deck", () => {
    const words = candidateDefinitions
      .map((definition) => {
        const behavior = resolve(definition.id);
        return [
          definition.name,
          definition.pitch,
          definition.suitedFor,
          behavior.surfaceLabel,
          describeShape(behavior),
        ].join(" ");
      })
      .join(" ");
    expect(words).not.toMatch(/\brail\b/i);
  });

  it("gives an exchange to a deck and to nothing else", () => {
    for (const definition of candidateDefinitions.filter(({ id }) => id !== CUSTOM_ID)) {
      expect(definition.exchange !== undefined).toBe(definition.surface === "deck");
    }
  });

  it("offers different behaviours, not one behaviour under several names", () => {
    const signature = candidateDefinitions
      .filter(({ id }) => id !== CUSTOM_ID)
      .map((definition) => {
        const behavior = resolve(definition.id);
        return JSON.stringify([behavior.surface, behavior.exchange, behavior.feel]);
      });
    expect(new Set(signature).size).toBe(signature.length);
  });
});

describe("resolving a candidate", () => {
  const references = candidateDefinitions.filter(({ id }) => id !== CUSTOM_ID);
  for (const definition of references) {
    it(`reads ${definition.id}'s own preset numbers, whatever Custom has become`, () => {
      const source = MOTION_PRESETS[definition.feel];
      const custom: CustomCandidateState = {
        surface: "deck",
        exchange: "direct",
        base: "heavy",
        settings: { ...settingsFromPreset("heavy"), stiffness: 777 },
      };
      const behavior = resolve(definition.id, custom);
      expect(behavior.settings.stiffness).toBe(source.spring.stiffness);
      expect(behavior.settings.damping).toBe(source.spring.damping);
      expect(behavior.settings.mass).toBe(source.spring.mass);
      expect(behavior.custom).toBe(false);
      expect(behavior.edited).toBe(0);
    });
  }

  it("changes only Custom when Custom changes", () => {
    const heavy: CustomCandidateState = {
      surface: "deck",
      exchange: "direct",
      base: "heavy",
      settings: settingsFromPreset("heavy"),
    };
    const moved = references.map(({ id }) => resolve(id, heavy));
    const unmoved = references.map(({ id }) => resolve(id));
    expect(moved).toEqual(unmoved);
    const custom = resolve(CUSTOM_ID, heavy);
    expect(custom.settings).toEqual(heavy.settings);
    expect(custom.surface).toBe("deck");
    expect(custom.exchange).toBe("direct");
  });

  it("gives a carousel no exchange, whatever Custom last held for one", () => {
    const behavior = resolve(CUSTOM_ID, { ...fresh(), surface: "carousel", exchange: "direct" });
    expect(behavior.exchange).toBeUndefined();
    expect(behavior.exchangeLabel).toBe("None");
  });

  it("counts what was changed from the base preset, and says so in its label", () => {
    const base = fresh();
    expect(resolve(CUSTOM_ID, base).feelLabel).toBe("Balanced");
    const edited = resolve(CUSTOM_ID, {
      ...base,
      settings: { ...base.settings, stiffness: base.settings.stiffness + 25, mass: 2 },
    });
    expect(edited.edited).toBe(2);
    expect(edited.feelLabel).toBe("Balanced, 2 edited");
    expect(edited.pitch).toContain("Balanced, 2 edited");
  });

  it("computes its response with the engine's own stepper, not a second model", () => {
    const behavior = resolve("carousel-loose");
    expect(behavior.response).toEqual(sampleSpringResponse(settingsFromPreset("loose")));
    expect(behavior.settleMs).toBe(Math.round(behavior.response.settleSeconds! * 1000));
    expect(behavior.overshootPercent).toBe(Math.round(behavior.response.overshoot * 1000) / 10);
  });

  it("says a deck takes one photo per release and a carousel takes its preset's skip", () => {
    expect(resolve("deck-shuffle").maxStep).toBe(1);
    expect(resolve("carousel-tight").maxStep).toBe(
      Math.max(1, Math.round(MOTION_PRESETS.tight.release.maxAnchorSkip)),
    );
    const custom: CustomCandidateState = {
      surface: "carousel",
      exchange: "shuffle",
      base: "heavy",
      settings: settingsFromPreset("heavy"),
    };
    expect(resolve(CUSTOM_ID, custom).maxStep).toBe(
      Math.max(1, Math.round(MOTION_PRESETS.heavy.release.maxAnchorSkip)),
    );
    expect(resolve(CUSTOM_ID, { ...custom, surface: "deck" }).maxStep).toBe(1);
  });
});

describe("the advanced rows", () => {
  it("marks exactly the rows that differ, and labels each as declared or calculated", () => {
    const rows = differenceRows(resolve("carousel-tight"), resolve("carousel-loose"));
    expect(rows.map(({ a, b, differs }) => differs === (a !== b))).not.toContain(false);
    expect(rows.find(({ key }) => key === "surface")!.differs).toBe(false);
    expect(rows.find(({ key }) => key === "stiffness")!.differs).toBe(true);
    expect(rows.filter(({ source }) => source === "calculated").map(({ key }) => key)).toEqual([
      "settle",
      "overshoot",
    ]);
  });

  it("never labels anything as measured", () => {
    const rows = differenceRows(resolve("carousel-tight"), resolve("deck-direct"));
    expect(new Set(rows.map(({ source }) => source))).toEqual(new Set(["declared", "calculated"]));
  });
});

describe("the comparison a visitor reads", () => {
  it("finds nothing different between a candidate and itself", () => {
    const comparison = compareCandidates(resolve("deck-direct"), resolve("deck-direct"));
    expect(comparison.same).toBe(true);
    expect(comparison.notable).toEqual([]);
    expect(comparison.headline).toMatch(/configured the same/i);
  });

  it("puts a change of layout first, and says equal springs would still not feel equal", () => {
    const comparison = compareCandidates(resolve("carousel-balanced"), resolve("deck-shuffle"));
    expect(comparison.layoutDiffers).toBe(true);
    expect(comparison.notable[0]!.key).toBe("layout");
    expect(comparison.caveat).toMatch(/layouts/i);
    expect(comparison.headline).toMatch(/item carousel.*stacked deck/i);
  });

  it("says plainly when the springs are identical and only the layout differs", () => {
    // Shuffle deck and Balanced carousel are both the Balanced preset.
    const comparison = compareCandidates(resolve("carousel-balanced"), resolve("deck-shuffle"));
    expect(comparison.identicalSprings).toBe(true);
    expect(comparison.caveat).toMatch(/identical/i);
    expect(comparison.caveat).toMatch(/layout, not the physics/i);
  });

  it("does not claim identical springs when they differ", () => {
    const comparison = compareCandidates(resolve("carousel-tight"), resolve("deck-shuffle"));
    expect(comparison.identicalSprings).toBe(false);
    expect(comparison.caveat).toMatch(/not the only thing/i);
  });

  it("has no caveat for one layout", () => {
    expect(
      compareCandidates(resolve("carousel-tight"), resolve("carousel-loose")).caveat,
    ).toBeUndefined();
  });

  it("explains an exchange change between two decks, and only then", () => {
    const decks = compareCandidates(resolve("deck-shuffle"), resolve("deck-direct"));
    expect(decks.notable.map(({ key }) => key)).toEqual(["exchange"]);
    expect(decks.notable[0]!.meaning).toMatch(/Shuffle.*Direct/);
    const layouts = compareCandidates(resolve("carousel-balanced"), resolve("deck-direct"));
    expect(layouts.notable.map(({ key }) => key)).not.toContain("exchange");
  });

  it("orders what matters first: layout, exchange, then the spring, then the settings", () => {
    const order = [
      "layout",
      "exchange",
      "settle",
      "overshoot",
      "flick",
      "release",
      "edge",
      "buttons",
    ];
    for (const a of candidateIds) {
      for (const b of candidateIds) {
        const keys = compareCandidates(resolve(a), resolve(b)).notable.map(({ key }) => key);
        expect(keys).toEqual(keys.toSorted((x, y) => order.indexOf(x) - order.indexOf(y)));
      }
    }
  });

  it("lists only what differs, and what does not as unchanged", () => {
    const comparison = compareCandidates(resolve("carousel-tight"), resolve("carousel-loose"));
    expect(comparison.unchanged).toContain("Layout");
    expect(comparison.notable.map(({ title }) => title)).not.toContain("Layout");
    const covered = new Set(comparison.notable.map(({ title }) => title));
    expect(covered.size).toBe(comparison.notable.length);
  });

  it("labels settling and overshoot as calculated, never as measured", () => {
    const comparison = compareCandidates(resolve("carousel-tight"), resolve("carousel-loose"));
    const calculated = comparison.notable.filter(({ source }) => source === "calculated");
    expect(calculated.length).toBeGreaterThan(0);
    for (const { key } of calculated) expect(["settle", "overshoot"]).toContain(key);
    const text = JSON.stringify(comparison);
    expect(text).not.toMatch(/measured (on|in|from)/i);
    expect(text).not.toMatch(/frame rate|fps/i);
  });

  it("never says which candidate is better", () => {
    const verdicts = candidateIds.flatMap((a) =>
      candidateIds
        .map((b) => ({
          pair: `${a} / ${b}`,
          text: JSON.stringify(compareCandidates(resolve(a), resolve(b))),
        }))
        .filter(({ text }) => /better|worse|best|recommend/i.test(text)),
    );
    expect(verdicts).toEqual([]);
  });

  it("says which settles later, and by how much, only when the difference is real", () => {
    const heavy = resolve("deck-heavy");
    const shuffle = resolve("deck-shuffle");
    const delta = heavy.settleMs! - shuffle.settleMs!;
    const settle = compareCandidates(shuffle, heavy).notable.find(({ key }) => key === "settle");
    const phrase = `${Math.abs(delta)} ms ${delta > 0 ? "later" : "sooner"}`;
    expect(settle === undefined).toBe(Math.abs(delta) < 20);
    expect(settle?.meaning ?? phrase).toContain(phrase);
  });

  it("follows Custom's edits: a stiffer Custom against its own base differs, a reset does not", () => {
    const base = fresh();
    const reference = resolve("carousel-balanced", base);
    expect(compareCandidates(reference, resolve(CUSTOM_ID, base)).same).toBe(true);
    const stiffer = resolve(CUSTOM_ID, {
      ...base,
      settings: { ...base.settings, stiffness: base.settings.stiffness + 100 },
    });
    const comparison = compareCandidates(reference, stiffer);
    expect(comparison.same).toBe(false);
    expect(comparison.layoutDiffers).toBe(false);
    expect(comparison.headline).toMatch(/^Same layout\./);
  });
});

describe("the implementation", () => {
  it("is built from the same mappings the live surfaces use", () => {
    const behavior = resolve("carousel-loose");
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
      const entry = behavior.surface === "deck" ? "stacked-deck" : "carousel";
      expect(snippet).toContain(`@snap-motion/vue/${entry}`);
      const spring = /const spring = (\{[\s\S]*?\});/.exec(snippet)![1]!;
      expect(JSON.parse(spring)).toEqual(props.spring);
      const release = /const releasePolicy = (\{[\s\S]*?\});/.exec(snippet)![1]!;
      expect(JSON.parse(release)).toEqual(props.releasePolicy);
      expect(snippet).toContain(
        `programmatic${behavior.surface === "deck" ? '-impulse="' : "Impulse: "}${props.programmaticImpulse}`,
      );
      // A deck names its exchange; a carousel has none to name.
      expect(snippet.includes(`exchange="${behavior.exchange}"`)).toBe(
        behavior.exchange !== undefined,
      );
      expect(snippet.includes("exchange=")).toBe(behavior.exchange !== undefined);
    });
  }

  it("builds the item carousel on useCarouselMotion, never on Coverflow", () => {
    const snippet = implementationSnippet(resolve("carousel-balanced"));
    expect(snippet).toContain("useCarouselMotion");
    expect(snippet).not.toMatch(/Coverflow|CarouselSlide/);
  });

  it("prints Custom's current numbers, edits included", () => {
    const base = fresh();
    const custom = resolve(CUSTOM_ID, {
      ...base,
      exchange: "direct",
      surface: "deck",
      settings: { ...base.settings, stiffness: 321 },
    });
    const snippet = implementationSnippet(custom);
    expect(snippet).toContain('exchange="direct"');
    expect(JSON.parse(/const spring = (\{[\s\S]*?\});/.exec(snippet)![1]!).stiffness).toBe(321);
  });
});

describe("the response chart", () => {
  it("puts every curve on one shared time axis and keeps overshoot inside the plot", () => {
    const a = resolve("carousel-tight");
    const b = resolve("carousel-loose");
    const chart = responseChart([a, b]);
    expect(chart.curves.map(({ id }) => id)).toEqual(["carousel-tight", "carousel-loose"]);
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
