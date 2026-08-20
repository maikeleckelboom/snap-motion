import type { ControllerMeasurement, ControllerSnapshot } from "@snap-motion/core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useSnapMotion, type UseSnapMotionOptions } from "../src/motion/use-snap-motion";
import { ManualAnimationDriver } from "./manual-driver";

type Id = "a" | "b" | "c";

const ANCHOR_PITCH = 100;

/** The scalar the deck's own resistance is made of, so a drift here is the drift a hand feels. */
function measurementAt(offset: number): ControllerMeasurement<Id> {
  return {
    anchors: [
      { id: "a", order: 0, position: offset },
      { id: "b", order: 1, position: offset - ANCHOR_PITCH },
      { id: "c", order: 2, position: offset - 2 * ANCHOR_PITCH },
    ],
    bounds: { min: offset - 2 * ANCHOR_PITCH, max: offset },
    rebaseFromId: "b",
  };
}

function pointer(type: string, clientX: number) {
  return new PointerEvent(type, {
    bubbles: true,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    cancelable: true,
    clientX,
    isPrimary: true,
    pointerId: 41,
    pointerType: "mouse",
  });
}

/**
 * One pointer interaction over a surface whose drag origin is the middle anchor, driven by absolute
 * hand positions rather than per-sample increments — which is what a browser reports, and what makes
 * a coalesced jump across the press point expressible.
 */
function heldDrag(
  driver: ManualAnimationDriver,
  overrides: Partial<UseSnapMotionOptions<Id>> = {},
) {
  let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        motion = useSnapMotion(options(driver, { initialTargetId: "b", ...overrides }));
        return () => h("div", { onPointerdown: motion!.onPointerDown });
      },
    }),
  );
  const surface = wrapper.element as HTMLElement;
  surface.setPointerCapture = () => {};
  surface.releasePointerCapture = () => {};
  surface.dispatchEvent(pointer("pointerdown", 0));
  return {
    motion: motion!,
    to(clientX: number) {
      window.dispatchEvent(pointer("pointermove", clientX));
      return motion!.position.value;
    },
    unmount: () => wrapper.unmount(),
  };
}

function options(
  driver: ManualAnimationDriver,
  overrides: Partial<UseSnapMotionOptions<Id>> = {},
): UseSnapMotionOptions<Id> {
  return {
    anchors: [
      { id: "a", order: 0, position: 0 },
      { id: "b", order: 1, position: -100 },
      { id: "c", order: 2, position: -200 },
    ],
    axis: "x",
    bounds: { min: -200, max: 0 },
    driver,
    initialTargetId: "a",
    releasePolicy: {
      projectionSeconds: 0.18,
      flingVelocity: 500,
      maxAnchorSkip: 2,
      forwardSign: -1,
    },
    ...overrides,
  };
}

describe("useSnapMotion", () => {
  it("mirrors controller state and ignores stale completion after interruption", () => {
    const driver = new ManualAnimationDriver();
    let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSnapMotion(options(driver));
          return () => h("div");
        },
      }),
    );

    motion?.moveTo("b");
    const first = driver.latest;
    first?.update(-40, -300);
    expect(motion?.position.value).toBe(-40);

    motion?.moveTo("c");
    const second = driver.latest;
    expect(first?.stopped).toBe(true);

    first?.complete();
    expect(motion?.targetId.value).toBe("c");
    second?.complete();
    expect(motion?.nearestId.value).toBe("c");
    expect(motion?.position.value).toBe(-200);

    wrapper.unmount();
  });

  it("finishes an active settle immediately when reduced motion is enabled", async () => {
    const driver = new ManualAnimationDriver();
    const reducedMotionOverride = ref<boolean>();
    let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSnapMotion(options(driver, { reducedMotionOverride }));
          return () => h("div");
        },
      }),
    );

    motion?.moveTo("b");
    expect(motion?.phase.value).toBe("settling");
    reducedMotionOverride.value = true;
    await nextTick();

    expect(driver.latest?.stopped).toBe(true);
    expect(motion?.phase.value).toBe("idle");
    expect(motion?.nearestId.value).toBe("b");
    expect(motion?.position.value).toBe(-100);
    wrapper.unmount();
  });

  it("stops playback and callbacks when its Vue scope is disposed", () => {
    const driver = new ManualAnimationDriver();
    const onChange = vi.fn<(snapshot: ControllerSnapshot<Id>) => void>();
    let motion: ReturnType<typeof useSnapMotion<Id>> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          motion = useSnapMotion(options(driver, { onChange }));
          return () => h("div");
        },
      }),
    );

    motion?.moveTo("b");
    const animation = driver.latest;
    wrapper.unmount();
    const callsAfterUnmount = onChange.mock.calls.length;
    animation?.update(-80, -100);
    animation?.complete();

    expect(animation?.stopped).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(callsAfterUnmount);
  });

  describe("pointer travel direction", () => {
    it("leaves the drag origin alone when the direction callback rebases nothing", () => {
      const driver = new ManualAnimationDriver();
      const directions: number[] = [];
      const drag = heldDrag(driver, {
        onPointerTravelDirection: (direction) => void directions.push(direction),
      });

      // Far enough past the physical bound that the surface is answering with resistance rather
      // than with the hand, which is the state the reconstruction used to read an origin back from.
      expect(drag.to(-150)).toBeCloseTo(-215.184, 3);
      // One coalesced sample back across the press point. The hand is 40 forward of where it
      // started, so the mass is 40 forward of the anchor it was measured from — no more.
      expect(drag.to(40)).toBe(-60);
      expect(directions).toEqual([-1, 1]);
      // Returning the hand to the press point returns the mass to the origin exactly.
      expect(drag.to(0)).toBe(-100);
      drag.unmount();
    });

    it("keeps repeated reversals free of accumulated drift", () => {
      const drag = heldDrag(new ManualAnimationDriver());

      for (let cycle = 0; cycle < 4; cycle += 1) {
        expect(drag.to(-180)).toBeCloseTo(-220.896, 3);
        expect(drag.to(180)).toBeCloseTo(20.896, 3);
      }
      expect(drag.to(0)).toBe(-100);
      // The same hand position reads the same scalar however it was arrived at.
      expect(drag.to(-40)).toBe(-140);
      expect(drag.to(40)).toBe(-60);
      expect(drag.to(-40)).toBe(-140);
      drag.unmount();
    });

    it("moves the drag origin by exactly the coordinate displacement a rebase applied", () => {
      const driver = new ManualAnimationDriver();
      let rebase: (() => void) | undefined;
      const drag = heldDrag(driver, {
        onPointerTravelDirection: () => rebase?.(),
      });

      // A rebase of a whole layout, while the previous sample sits deep in resistance: the
      // controller's position moved by nothing like the coordinate system did.
      expect(drag.to(-150)).toBeCloseTo(-215.184, 3);
      rebase = () => void drag.motion.remeasure(measurementAt(-300));
      const positionBeforeRebase = drag.motion.position.value;
      expect(drag.to(40)).toBe(-360);
      expect(drag.motion.position.value - positionBeforeRebase).not.toBeCloseTo(-300, 3);
      // The hand is still 40 forward of the press point, now measured in the rebased system.
      expect(drag.to(0)).toBe(-400);
      drag.unmount();
    });

    it("mirrors a resisted reversal under a right-to-left pointer mapping", () => {
      const drag = heldDrag(new ManualAnimationDriver(), {
        pointerDeltaMultiplier: () => -1,
      });

      // The same gesture as the left-to-right case, made by the mirrored hand.
      expect(drag.to(150)).toBeCloseTo(-215.184, 3);
      expect(drag.to(-40)).toBe(-60);
      expect(drag.to(0)).toBe(-100);
      drag.unmount();
    });

    it("rebases an unresisted reversal by the coordinate displacement and nothing else", () => {
      const driver = new ManualAnimationDriver();
      let rebase: (() => void) | undefined;
      const drag = heldDrag(driver, {
        onPointerTravelDirection: () => rebase?.(),
      });

      expect(drag.to(-40)).toBe(-140);
      rebase = () => void drag.motion.remeasure(measurementAt(-300));
      expect(drag.to(25)).toBe(-375);
      rebase = undefined;
      expect(drag.to(-25)).toBe(-425);
      drag.unmount();
    });
  });
});
