import { describe, expect, test } from "vitest";

import { StackedDeckModel } from "../src/stacked-deck-model";
import {
  createStackedDeckFrame,
  resolveStackedDeckFrame,
  resolveStackedDeckNeighbor,
  resolveStackedDeckTuning,
  type MutableStackedDeckFrame,
  type StackedDeckDirectProjection,
  type StackedDeckPose,
  type StackedDeckTuning,
} from "../src/stackedDeck";
import oracle from "./fixtures/direct-physics-oracle.json" with { type: "json" };

/**
 * Differential certification against the accepted Direct physical model.
 *
 * The fixture is sampled from the bounded implementation this projection's mechanics were accepted
 * on ({@link oracle.provenance.generatedFrom}). Cyclic topology may choose which semantic card is
 * adjacent; it may not give the adjacent physical exchange a second answer. Everything here is
 * therefore normalised by physical role and physical slot, never by semantic id, so a wrapped
 * exchange is held to exactly the contract an interior one is.
 */

const CHANNELS = [
  "translateX",
  "translateY",
  "scale",
  "rotate",
  "shadowStrength",
  "layer",
] as const;
type Channel = (typeof CHANNELS)[number];

/** Rendering tolerance: below a twentieth of a pixel nothing can paint differently. */
const TOLERANCE: Record<Channel, number> = {
  translateX: 0.05,
  translateY: 0.05,
  scale: 0.0002,
  rotate: 0.005,
  shadowStrength: 0.002,
  layer: 0,
};

const ITEM_COUNT = oracle.deck.itemCount;
const ORIGIN = oracle.deck.originIndex;
const IDS = Array.from({ length: ITEM_COUNT }, (_unused, index) => `item-${index}`);

const tuning: StackedDeckTuning = resolveStackedDeckTuning({
  stageWidth: oracle.provenance.stage.width,
  stageHeight: oracle.provenance.stage.height,
  reducedMotion: oracle.provenance.reducedMotion,
});

function expectPose(pose: StackedDeckPose, expected: readonly (number | string)[], where: string) {
  for (const [index, channel] of CHANNELS.entries()) {
    const value = expected[index] as number;
    expect(
      Math.abs(pose[channel] - value),
      `${where} ${channel}: expected ${value}, received ${pose[channel]}`,
    ).toBeLessThanOrEqual(TOLERANCE[channel]);
  }
}

interface DirectSample {
  readonly originIndex: number;
  readonly direction: -1 | 1;
  readonly signedTravel: number;
  readonly settlement: number;
  readonly translateX: number;
  readonly phase?: "held" | "parking" | "returning";
}

/** Resolves one Direct frame the way the adapter drives this projection. */
function resolveSample(sample: DirectSample, storage: MutableStackedDeckFrame) {
  const model = new StackedDeckModel({ ids: IDS, initialId: IDS[sample.originIndex]! });
  model.openInteraction(sample.originIndex, sample.direction);
  const state = model.update({
    phase: sample.phase === "held" ? "dragging" : "settling",
    physicalPosition: sample.signedTravel,
    targetIndex: null,
    nearestIndex: sample.originIndex,
  });
  // The adapter keeps direction at zero until travel is non-zero, so a frame with no travel yet
  // names no neighbour at all.
  const direction = sample.signedTravel === 0 ? 0 : sample.direction;
  const projection: StackedDeckDirectProjection = {
    direction,
    originIndex: sample.originIndex,
    settlement: sample.settlement,
    signedTravel: sample.signedTravel,
    targetIndex:
      direction === 0
        ? null
        : resolveStackedDeckNeighbor(sample.originIndex, direction, ITEM_COUNT),
    translateX: sample.translateX,
    translateY: 0,
    ...(sample.phase === undefined ? {} : { phase: sample.phase }),
  };
  return resolveStackedDeckFrame(
    { itemCount: ITEM_COUNT, traversal: state.traversal, tuning, direct: projection },
    storage,
  );
}

describe(`Direct physics differential against ${oracle.provenance.generatedFrom.slice(0, 7)}`, () => {
  test("resolves the tuning the contract was measured with", () => {
    expect(tuning).toEqual(oracle.provenance.tuning);
    // The fixture stores each pose as a tuple, so the reader and the recording have to agree on
    // what each position in it means.
    expect(oracle.channels).toEqual([...CHANNELS]);
  });

  test("rests every persistent shell at its accepted physical slot", () => {
    const storage = createStackedDeckFrame(ITEM_COUNT);
    const frame = resolveSample(
      {
        originIndex: ORIGIN,
        direction: 1,
        signedTravel: 0,
        settlement: 0,
        translateX: 0,
        phase: "held",
      },
      storage,
    );
    const slots = Object.entries(oracle.restPileBySlot);
    expect(slots).toHaveLength(ITEM_COUNT);
    for (const [slot, expected] of slots) {
      const index = ORIGIN + Number(slot);
      expectPose(frame.poses[index]!, expected, `rest slot ${slot}`);
    }
  });

  for (const [name, expectedCase] of Object.entries(oracle.cases)) {
    const direction = expectedCase.direction as -1 | 1;
    const phase: DirectSample["phase"] = name.startsWith("held")
      ? "held"
      : name.startsWith("park")
        ? "parking"
        : name.startsWith("return")
          ? "returning"
          : undefined;

    test(`reproduces the accepted source and target path: ${name}`, () => {
      const storage = createStackedDeckFrame(ITEM_COUNT);
      const targetIndex = ORIGIN + direction;
      expect(expectedCase.t.length).toBeGreaterThan(0);
      for (let sampleIndex = 0; sampleIndex < expectedCase.t.length; sampleIndex += 1) {
        const frame = resolveSample(
          {
            originIndex: ORIGIN,
            direction,
            signedTravel: expectedCase.signedTravel[sampleIndex]!,
            settlement: expectedCase.settlement[sampleIndex]!,
            translateX: expectedCase.translateX[sampleIndex]!,
            ...(phase === undefined ? {} : { phase }),
          },
          storage,
        );
        const at = `${name} t=${expectedCase.t[sampleIndex]}`;
        expectPose(frame.poses[ORIGIN]!, expectedCase.source[sampleIndex]!, `${at} source`);
        expectPose(frame.poses[targetIndex]!, expectedCase.target[sampleIndex]!, `${at} target`);
      }
    });
  }

  /**
   * The ring's whole purpose is to supply a neighbour where the bounded model had none. What it
   * supplies has to be the same exchange: with identities hidden, a wrap must be the interior
   * motion, so both are compared to one contract rather than to each other.
   */
  test("makes a cyclic wrap physically isomorphic to an interior exchange", () => {
    const storage = createStackedDeckFrame(ITEM_COUNT);
    const expectedCase = oracle.cases.heldBackward;
    // The first ordinal: bounded, this exchange does not exist; cyclic, the ring wraps to the last.
    const wrapOrigin = 0;
    const wrapTarget = resolveStackedDeckNeighbor(wrapOrigin, -1, ITEM_COUNT);
    expect(wrapTarget).toBe(ITEM_COUNT - 1);
    for (let sampleIndex = 0; sampleIndex < expectedCase.t.length; sampleIndex += 1) {
      const frame = resolveSample(
        {
          originIndex: wrapOrigin,
          direction: -1,
          signedTravel: expectedCase.signedTravel[sampleIndex]!,
          settlement: expectedCase.settlement[sampleIndex]!,
          translateX: expectedCase.translateX[sampleIndex]!,
          phase: "held",
        },
        storage,
      );
      const at = `wrap t=${expectedCase.t[sampleIndex]}`;
      expectPose(frame.poses[wrapOrigin]!, expectedCase.source[sampleIndex]!, `${at} source`);
      expectPose(frame.poses[wrapTarget]!, expectedCase.target[sampleIndex]!, `${at} target`);
    }
  });

  /**
   * The one physical behaviour cyclicity is allowed to add, held to the terms it is allowed on.
   *
   * A ring exchange leaves exactly one shell with nowhere to go along the fold, so it crosses to
   * the other side. That crossing is the only motion in this projection with no counterpart in the
   * accepted bounded model, and it earns its place only by being unobservable: the shell may paint
   * at either of the two folded rests it is exact at, and nothing in between.
   */
  test("keeps the cyclic fold shell's crossing free of painted material", () => {
    const storage = createStackedDeckFrame(ITEM_COUNT);
    const half = tuning.cardWidth / 2;
    const columns = Array.from({ length: 1201 }, (_unused, index) => -600 + index);
    // Forward from the centre ordinal: the shell two slots behind on the left is the one the ring
    // carries across to the right.
    const wrapIndex = ORIGIN - 2;
    const restingX: number[] = [];
    for (let step = 0; step <= 200; step += 1) {
      const travel = step / 200;
      const frame = resolveSample(
        {
          originIndex: ORIGIN,
          direction: 1,
          signedTravel: travel,
          settlement: 0,
          translateX: -travel * tuning.motionPitch,
          phase: "held",
        },
        storage,
      );
      const bodies = frame.poses.map((pose) => ({
        left: pose.translateX - pose.scale * half,
        right: pose.translateX + pose.scale * half,
        layer: pose.layer,
      }));
      const painted = columns.filter((x) => {
        let best = -1;
        for (let index = 0; index < bodies.length; index += 1) {
          const body = bodies[index]!;
          if (x < body.left || x > body.right) continue;
          if (best < 0 || body.layer > bodies[best]!.layer) best = index;
        }
        return best === wrapIndex;
      }).length;
      if (painted === 0) continue;
      // It paints, so it must be standing at a rest: one of the two exact folded poses.
      restingX.push(frame.poses[wrapIndex]!.translateX);
    }
    const sourceRest = restingX[0]!;
    const destinationRest = restingX[restingX.length - 1]!;
    expect(Math.sign(sourceRest)).toBe(-1);
    expect(Math.sign(destinationRest)).toBe(1);
    expect(Math.abs(Math.abs(sourceRest) - Math.abs(destinationRest))).toBeLessThan(1);
    // A tenth of the shell's own excursion. It may be seen settling into a rest or leaving one,
    // which is ordinary motion; what it may not do is appear anywhere along the crossing itself,
    // and the crossing is the other nine tenths.
    const settledWithin = Math.abs(destinationRest - sourceRest) / 10;
    for (const x of restingX) {
      const rest = x < 0 ? sourceRest : destinationRest;
      expect(
        Math.abs(x - rest),
        `the cyclic fold shell painted material ${Math.abs(x - rest).toFixed(2)}px away from a folded rest`,
      ).toBeLessThan(settledWithin);
    }
  });

  /**
   * A press is not a landing.
   *
   * A hand can take hold of the deck while a previous release is still carrying a shell over it.
   * That release is not caught by the press: the shell keeps its own path and its own settlement,
   * so on the frame the press lands it is exactly where it already was, and it is still the thing
   * nearest the eye — nearer than the card the hand has just taken hold of, which is on the deck.
   */
  test("lets a release in flight finish its own path over the card a new hand holds", () => {
    const storage = createStackedDeckFrame(ITEM_COUNT);
    const releaseX = -tuning.motionPitch;
    const landed = ORIGIN + 1;

    function press(settlement: number) {
      const model = new StackedDeckModel({ ids: IDS, initialId: IDS[landed]! });
      model.openInteraction(landed, 1);
      const state = model.update({
        phase: "dragging",
        physicalPosition: 0,
        targetIndex: null,
        nearestIndex: landed,
      });
      return resolveStackedDeckFrame(
        {
          itemCount: ITEM_COUNT,
          traversal: state.traversal,
          tuning,
          direct: {
            direction: 0,
            landings: [
              {
                itemIndex: ORIGIN,
                releaseOrder: 1,
                settlement,
                translateX: releaseX,
                translateY: 0,
              },
            ],
            originIndex: landed,
            phase: "held",
            settlement: 0,
            signedTravel: 0,
            targetIndex: null,
            translateX: 0,
            translateY: 0,
          },
        },
        storage,
      );
    }

    // The frame the press lands on is the frame the release was already drawing.
    const pressed = press(0);
    expect(pressed.poses[ORIGIN]!.translateX).toBeCloseTo(releaseX, 6);
    expect(pressed.poses[ORIGIN]!.layer).toBeGreaterThan(pressed.poses[landed]!.layer);

    // It goes behind only once its own path has carried it clear of the deck's top.
    const clearSeparation = tuning.cardWidth + 2;
    for (let step = 0; step <= 200; step += 1) {
      const frame = press(step / 200);
      const shell = frame.poses[ORIGIN]!;
      if (shell.layer > frame.poses[landed]!.layer) continue;
      expect(
        Math.abs(shell.translateX),
        `the release went behind the deck at ${shell.translateX.toFixed(1)}px, which the top still covers`,
      ).toBeGreaterThanOrEqual(clearSeparation);
      break;
    }

    // Arrived: exactly the pose the deck draws for it, with no trace of the release left.
    const arrived = press(1);
    const settled = press(1);
    expect(arrived.poses[ORIGIN]!.translateX).toBeCloseTo(settled.poses[ORIGIN]!.translateX, 6);
    expect(arrived.poses[ORIGIN]!.layer).toBeLessThan(arrived.poses[landed]!.layer);
  });

  /**
   * No material changes without a physical motion that explains it.
   *
   * The frame is reduced to the material a viewer would actually see: at each sampled column of
   * the stage, the shell painting it is the frontmost one whose body covers that column. Ownership
   * of a column may only pass between two shells when an edge of one of them has swept across it.
   * A handover with no edge crossing is a depth change alone — the deck substituting one card for
   * another while neither moved, which is the defect this whole differential exists to catch.
   */
  test.each([
    ["held forward", 1, "held"],
    ["held backward", -1, "held"],
    ["release forward", 1, "parking"],
    ["release backward", -1, "parking"],
    ["return forward", 1, "returning"],
    ["return backward", -1, "returning"],
  ] as const)(
    "changes painted material only where motion explains it: %s",
    (_label, direction, phase) => {
      const storage = createStackedDeckFrame(ITEM_COUNT);
      const half = tuning.cardWidth / 2;
      const columns = Array.from({ length: 361 }, (_unused, index) => -450 + index * 2.5);
      const STEPS = 400;
      // Held sweeps the hand from rest to a whole pitch. A release holds the travel the hand let go
      // at and sweeps the shell's own settlement instead, which is the other complete Direct path.
      const releaseTravel = 0.55;

      function measure(step: number) {
        const held = phase === "held";
        const travel = held ? step : releaseTravel;
        const frame = resolveSample(
          {
            originIndex: ORIGIN,
            direction,
            signedTravel: direction * travel,
            settlement: held ? 0 : step,
            translateX: -direction * travel * tuning.motionPitch,
            phase,
          },
          storage,
        );
        const bodies = frame.poses.map((pose) => ({
          left: pose.translateX - pose.scale * half,
          right: pose.translateX + pose.scale * half,
          layer: pose.layer,
          paints: pose.visible && pose.opacity > 0,
        }));
        const owner = columns.map((x) => {
          let best = -1;
          for (let index = 0; index < bodies.length; index += 1) {
            const body = bodies[index]!;
            if (!body.paints || x < body.left || x > body.right) continue;
            if (best < 0 || body.layer > bodies[best]!.layer) best = index;
          }
          return best;
        });
        return { bodies, owner };
      }

      let previous = measure(0);
      for (let step = 1; step <= STEPS; step += 1) {
        const travel = step / STEPS;
        const current = measure(travel);
        for (let column = 0; column < columns.length; column += 1) {
          const before = previous.owner[column]!;
          const after = current.owner[column]!;
          if (before === after) continue;
          const x = columns[column]!;
          const crossed = [before, after].some((index) => {
            if (index < 0) return false;
            const from = previous.bodies[index]!;
            const to = current.bodies[index]!;
            return from.left <= x !== to.left <= x || from.right >= x !== to.right >= x;
          });
          expect(
            crossed,
            `travel ${travel.toFixed(3)}, column x=${x}: material passed from shell ${before} to shell ${after} without either one's edge crossing that column`,
          ).toBe(true);
        }
        previous = current;
      }
    },
  );
});
