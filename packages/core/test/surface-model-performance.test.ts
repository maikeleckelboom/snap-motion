import { describe, expect, it } from "vitest";

import budgets from "../../../config/performance-budgets.json";
import { CoverflowModel } from "../src/coverflow-model";
import { StackedDeckModel } from "../src/stacked-deck-model";

/**
 * The product-model layer is on the snapshot hot path, so it is part of the performance evidence
 * rather than an exception to it.
 *
 * Two kinds of claim are made here. The structural ones are exact and deterministic: what the
 * models allocate per published frame is a design decision, and a regression in it is a regression
 * whatever machine the suite runs on. The wall-clock one is a proxy with generous headroom — it
 * exists to catch an order-of-magnitude mistake, not to measure this machine.
 */

const HZ = [60, 120] as const;
/** One second of traffic. A surface that is being dragged publishes every frame for that long. */
const SECONDS = 1;

function idsFor(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `item-${index}`);
}

/** One second of continuous direct manipulation, sampled at a display's refresh rate. */
function* dragTraffic(hz: number, itemCount: number) {
  const samples = hz * SECONDS;
  for (let sample = 0; sample < samples; sample += 1) {
    // A slow sweep across the whole collection, which is the worst case for hysteresis and for
    // traversal: every frame crosses something.
    const physicalIndex = ((sample / samples) * (itemCount - 1) + 0.37) % (itemCount - 1);
    yield {
      phase: "dragging" as const,
      physicalIndex,
      physicalPosition: physicalIndex,
      targetIndex: null,
      nearestIndex: Math.round(physicalIndex),
    };
  }
}

describe("surface model publication budgets", () => {
  it.each(HZ)("allocates exactly one deck state per %i Hz snapshot, and nothing else", (hz) => {
    const deck = new StackedDeckModel({ ids: idsFor(20) });
    deck.beginInteraction();

    const traversalStorage = deck.state.traversal;
    const published = new Set<object>();
    for (const input of dragTraffic(hz, 20)) {
      const state = deck.update(input);
      published.add(state);
      // The traversal is resolved through reused storage, so a frame costs one state envelope and
      // no geometry. That is the whole reason the primitive takes an output parameter.
      expect(state.traversal).toBe(traversalStorage);
    }

    expect(published.size).toBe(hz * SECONDS);
  });

  it.each(HZ)("allocates exactly one rail state per %i Hz snapshot", (hz) => {
    const rail = new CoverflowModel({ ids: idsFor(20) });
    const published = new Set<object>();
    for (const input of dragTraffic(hz, 20)) published.add(rail.update(input));

    expect(published.size).toBe(hz * SECONDS);
  });

  it("keeps a second of 120 Hz traffic across many surfaces inside the proxy budget", () => {
    const decks = Array.from({ length: budgets.simultaneousInstances }, () => {
      const deck = new StackedDeckModel({ ids: idsFor(20) });
      deck.beginInteraction();
      return deck;
    });
    const rails = Array.from(
      { length: budgets.simultaneousInstances },
      () => new CoverflowModel({ ids: idsFor(20) }),
    );
    const traffic = [...dragTraffic(120, 20)];

    const started = performance.now();
    for (const input of traffic) {
      for (const deck of decks) deck.update(input);
      for (const rail of rails) rail.update(input);
    }
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThanOrEqual(budgets.surfaceModelSecondMs);
  });

  it("keeps a command and a synchronization off the per-frame path entirely", () => {
    const deck = new StackedDeckModel({ ids: idsFor(20) });
    const traversalStorage = deck.state.traversal;

    for (let action = 0; action < budgets.navigationBurstActions; action += 1) {
      deck.resolveRelativeCommand(action % 2 === 0 ? 1 : -1, { owned: false });
      deck.synchronize(action % 20);
      // Direct adoption rewrites the same traversal storage rather than replacing it, so a burst
      // of synchronizations costs no more than a burst of frames.
      expect(deck.state.traversal).toBe(traversalStorage);
    }
  });
});
