import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick, watch } from "vue";

import Coverflow from "../src/coverflow/components/Coverflow.vue";
import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";

/**
 * A controlled host that issues a new destination in the same turn as a settlement. A surface
 * defers the check of its own settlement against the host's authority to a microtask, so by the time
 * that check runs the host may already have moved on. The stale settlement must be discarded: the
 * surface travels to the new destination, and the new destination is what it reports. The stacked
 * deck already honours this; the rail has to as well.
 */

const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;

type Screen = (typeof screens)[number];
type ScreenId = Screen["id"];

const surfaces = {
  rail: Coverflow<Screen>,
  deck: StackedDeck<Screen>,
} as const;

interface Surface {
  next: () => boolean;
  settledId: ScreenId | undefined;
  visualId: ScreenId | undefined;
  diagnostics: { phase: string };
}

/** What these tests use of a mounted surface, whichever of the two it is. */
interface MountedSurface {
  emitted: (event: string) => unknown[][] | undefined;
  setProps: (props: Record<string, unknown>) => Promise<void>;
  unmount: () => void;
  vm: unknown;
}

function mountSurface(kind: keyof typeof surfaces, props: Record<string, unknown>) {
  return mount(surfaces[kind] as never, {
    props: {
      items: screens,
      itemLabel: (item: Screen) => item.title,
      label: "Project screens",
      ...props,
    } as never,
    slots: { card: () => h("div", "card") },
  }) as unknown as MountedSurface;
}

describe("a rail reports only its latest settlement, as the deck does", () => {
  it("discards a queued settlement that a newer one has superseded", async () => {
    const wrapper = mountSurface("rail", { reducedMotionOverride: true });
    await nextTick();
    const rail = wrapper.vm as unknown as Surface & { previous: () => boolean };

    // The first settlement is queued and not yet checked when the next one is published.
    expect(rail.next()).toBe(true);
    expect(rail.previous()).toBe(true);
    await flushPromises();

    // One report, and it is the newer navigation's.
    expect(wrapper.emitted("settled")).toEqual([[rail.settledId, { reason: "previous" }]]);
    wrapper.unmount();
  });
});

describe.each(["rail", "deck"] as const)("a controlled %s and a host that moves on", (kind) => {
  it("reports the new destination, and never the stale one, when the host moves in the settlement stack", async () => {
    // The host accepts the first request and, in the same stack, already wants the next screen.
    let wrapper: MountedSurface;
    wrapper = mountSurface(kind, {
      activeId: "overview",
      reducedMotionOverride: true,
      "onUpdate:activeId": (id: ScreenId) => {
        if (id !== "system") return;
        void wrapper.setProps({ activeId: "system" });
        void wrapper.setProps({ activeId: "outcome" });
      },
    });
    await nextTick();
    const surface = wrapper.vm as unknown as Surface;

    expect(surface.next()).toBe(true);
    await flushPromises();
    await nextTick();

    expect(surface.settledId).toBe("outcome");
    expect(surface.visualId).toBe("outcome");
    expect(wrapper.emitted("settled")).toEqual([["outcome", { reason: "external" }]]);
    wrapper.unmount();
  });

  it("travels to the destination a host issues the moment the surface reports rest", async () => {
    const settled: ScreenId[] = [];
    let wrapper: MountedSurface;
    wrapper = mountSurface(kind, {
      activeId: "overview",
      reducedMotionOverride: false,
      "onUpdate:activeId": (id: ScreenId) => {
        if (id === "system") void wrapper.setProps({ activeId: "system" });
      },
      onSettled: (id: ScreenId) => settled.push(id),
    });
    await nextTick();
    const surface = wrapper.vm as unknown as Surface;

    // The host reacts to the surface's own state in the flush that published it: it sees the rail at
    // rest on System and asks for Outcome before the surface has checked that rest with the host.
    let afterRequest: { settled: ScreenId | undefined; phase: string } | undefined;
    const requestOutcome = async () => {
      await wrapper.setProps({ activeId: "outcome" });
      await nextTick();
      await Promise.resolve();
      afterRequest = { settled: surface.settledId, phase: surface.diagnostics.phase };
    };
    const stop = watch(
      () => surface.diagnostics.phase === "idle" && surface.settledId === "system",
      (resting) => {
        if (!resting) return;
        stop();
        void requestOutcome();
      },
      { flush: "post" },
    );

    surface.next();
    await vi.waitFor(() => expect(afterRequest).toBeDefined(), { timeout: 4_000 });
    // It is travelling, not already there: a synchronization to the new authority would have
    // teleported it and left no spring to watch.
    expect(afterRequest).toEqual({ settled: "system", phase: "settling" });

    await vi.waitFor(() => expect(surface.settledId).toBe("outcome"), { timeout: 4_000 });
    await flushPromises();
    expect(settled).toEqual(["outcome"]);
    wrapper.unmount();
  });
});
