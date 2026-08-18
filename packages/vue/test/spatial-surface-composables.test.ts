import {
  STACKED_DECK_INTERIOR_ELASTICITY,
  tightPreset,
  type ControllerConfiguration,
  type ElasticityOptions,
  type ReleaseTargetPolicy,
  type SpringConfiguration,
} from "@snap-motion/core";
import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, nextTick, ref, type ComputedRef, type Ref } from "vue";

import { useCoverflowMotion } from "../src/coverflow/use-coverflow-motion";
import { useStackedDeckMotion } from "../src/stacked-deck/use-stacked-deck-motion";

interface SurfaceHarness {
  readonly controlledId: Ref<string | undefined>;
  readonly elasticity: Ref<ElasticityOptions | undefined>;
  readonly ids: Ref<readonly string[]>;
  readonly programmaticImpulse: Ref<number | undefined>;
  readonly releasePolicy: Ref<Partial<ReleaseTargetPolicy> | undefined>;
  readonly navigateTo: (id: string) => boolean;
  readonly settledId: ComputedRef<string | undefined>;
  readonly spring: Ref<SpringConfiguration | undefined>;
  readonly configuration: () => ControllerConfiguration;
  readonly wrapper: VueWrapper;
}

function mountSurface(
  kind: "deck" | "rail",
  initialIds: readonly string[],
  initialControlledId: string | undefined,
  onSettled = vi.fn<(id: string, index: number, reason: string) => void>(),
): SurfaceHarness {
  const ids = ref<readonly string[]>(initialIds);
  const controlledId = ref<string | undefined>(initialControlledId);
  const elasticity = ref<ElasticityOptions>();
  const programmaticImpulse = ref<number>();
  const releasePolicy = ref<Partial<ReleaseTargetPolicy>>();
  const spring = ref<SpringConfiguration>();
  let surface:
    | ReturnType<typeof useStackedDeckMotion<string>>
    | ReturnType<typeof useCoverflowMotion<string>>;

  const Harness = defineComponent({
    setup() {
      const viewport = ref<HTMLElement>();
      const options = {
        controlledId,
        elasticity,
        ids,
        onSettled,
        programmaticImpulse,
        reducedMotionOverride: computed(() => true),
        releasePolicy,
        spring,
        viewport,
      };
      surface =
        kind === "deck"
          ? useStackedDeckMotion<string>(options)
          : useCoverflowMotion<string>(options);
      return () => h("div", { ref: viewport });
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  return {
    controlledId,
    configuration: () => surface.motion.controller.configuration,
    elasticity,
    ids,
    programmaticImpulse,
    releasePolicy,
    navigateTo: (id) => surface.navigateTo(id),
    settledId: computed(() => surface.settledId.value),
    spring,
    wrapper,
  };
}

describe.each([
  ["stacked deck", "deck"],
  ["coverflow", "rail"],
] as const)("%s controlled composable authority", (_name, kind) => {
  it("uses controlledId as the initial destination without a redundant initialId", async () => {
    const harness = mountSurface(kind, ["a", "b", "c"], "c");
    await nextTick();

    expect(harness.settledId.value).toBe("c");
    harness.wrapper.unmount();
  });

  it("remembers an unavailable controlled destination until async data provides it", async () => {
    const settled = vi.fn<(id: string, index: number, reason: string) => void>();
    const harness = mountSurface(kind, ["a"], "c", settled);
    await nextTick();
    expect(harness.settledId.value).toBe("a");

    harness.ids.value = ["a", "b", "c"];
    await nextTick();

    expect(harness.settledId.value).toBe("c");
    expect(settled).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledWith("c", 2, "external");
    harness.wrapper.unmount();
  });

  it("restores the same controlled item after removal and reintroduction", async () => {
    const harness = mountSurface(kind, ["a", "b", "c"], "c");
    await nextTick();

    harness.ids.value = ["a", "b"];
    await nextTick();
    expect(harness.settledId.value).toBe("b");

    harness.ids.value = ["a", "b", "c"];
    await nextTick();
    expect(harness.settledId.value).toBe("c");
    harness.wrapper.unmount();
  });

  it("reconciles IDs and controlled state changed in the same Vue update", async () => {
    const harness = mountSurface(kind, ["a"], "a");
    await nextTick();

    harness.ids.value = ["a", "b", "c"];
    harness.controlledId.value = "c";
    await nextTick();

    expect(harness.settledId.value).toBe("c");
    expect(harness.navigateTo("missing")).toBe(false);
    harness.wrapper.unmount();
  });

  it("reinstalls complete defaults after reactive physics overrides are removed", async () => {
    const harness = mountSurface(kind, ["a", "b", "c"], "b");
    await nextTick();
    const customSpring: SpringConfiguration = {
      stiffness: 300,
      damping: 25,
      mass: 1.1,
      restSpeed: 4,
      restDistance: 0.25,
    };
    const customElasticity: ElasticityOptions = {
      min: { resistance: 1.4, maxDistance: 90 },
      max: false,
    };

    harness.spring.value = customSpring;
    harness.releasePolicy.value = { flingVelocity: 222, projectionSeconds: 0.4 };
    harness.elasticity.value = customElasticity;
    harness.programmaticImpulse.value = 111;
    await nextTick();
    expect(harness.configuration()).toMatchObject({
      spring: customSpring,
      releasePolicy: { flingVelocity: 222, projectionSeconds: 0.4 },
      elasticity: customElasticity,
      programmaticImpulse: 111,
    });

    // Removing one property from a partial object restores that property, not its stale override.
    harness.releasePolicy.value = { flingVelocity: 222 };
    await nextTick();
    expect(harness.configuration().releasePolicy.projectionSeconds).toBe(
      tightPreset.release.projectionSeconds,
    );

    harness.spring.value = undefined;
    harness.releasePolicy.value = undefined;
    harness.elasticity.value = undefined;
    harness.programmaticImpulse.value = undefined;
    await nextTick();
    const reset = harness.configuration();
    expect(reset.spring).toEqual(tightPreset.spring);
    expect(reset.programmaticImpulse).toBe(tightPreset.programmaticImpulse);
    expect(reset.releasePolicy).toEqual({
      ...tightPreset.release,
      ...(kind === "deck" ? { maxAnchorSkip: 1 } : {}),
    });
    expect(reset.elasticity).toEqual(
      kind === "deck" ? STACKED_DECK_INTERIOR_ELASTICITY : tightPreset.elasticity,
    );
    expect(reset.dragEnvelopeElasticity).toEqual(
      kind === "deck" ? STACKED_DECK_INTERIOR_ELASTICITY : {},
    );
    harness.wrapper.unmount();
  });
});
