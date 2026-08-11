import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import Coverflow from "../src/coverflow/components/Coverflow.vue";
import type { CoverflowCardState } from "../src/coverflow/coverflow-contracts";

const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;

type ScreenId = (typeof screens)[number]["id"];
type Screen = (typeof screens)[number];

/** Instantiating the generic component up front is what lets the harness keep the item type. */
const TypedCoverflow = Coverflow<Screen>;

interface CoverflowInstance {
  activeId: ScreenId | undefined;
  canNext: boolean;
  canPrevious: boolean;
  isInspectEligible: (index: number) => boolean;
  next: () => boolean;
  previous: () => boolean;
  navigateTo: (id: ScreenId) => boolean;
  settledId: ScreenId | undefined;
  synchronizeTo: (id: ScreenId, announce?: boolean) => boolean;
  visualId: ScreenId | undefined;
}

function mountCoverflow(props: Record<string, unknown> = {}) {
  return mount(TypedCoverflow, {
    props: {
      items: screens,
      itemLabel: (item: Screen) => item.title,
      label: "Project screens",
      reducedMotionOverride: true,
      ...props,
    },
    slots: {
      card: (card: CoverflowCardState<Screen, ScreenId>) =>
        h("div", { class: "screen", "data-depth": card.presentation.depth.toFixed(2) }, [
          card.item.title,
        ]),
    },
  });
}

function useControlledAnimationFrames() {
  let nextFrame = 1;
  let timestamp = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    const frame = nextFrame;
    nextFrame += 1;
    callbacks.set(frame, callback);
    return frame;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((frame) => {
    callbacks.delete(frame);
  });

  return {
    pending: () => callbacks.size,
    async flushUntilIdle(root: () => ReturnType<typeof mountCoverflow>["element"]) {
      for (let count = 0; count < 600; count += 1) {
        if ((root() as HTMLElement).dataset.phase === "idle" && callbacks.size === 0) return;
        const entry = callbacks.entries().next().value as
          | [number, FrameRequestCallback]
          | undefined;
        if (!entry) throw new Error("Coverflow motion stopped before reaching idle");
        callbacks.delete(entry[0]);
        timestamp += 16;
        entry[1](timestamp);
        await Promise.resolve();
        await nextTick();
      }
      throw new Error("Coverflow motion did not reach idle within the controlled frame bound");
    },
  };
}

describe("Coverflow", () => {
  it("renders every item on one rail with accessible position labels", async () => {
    const wrapper = mountCoverflow();
    await nextTick();

    const root = wrapper.get(".snap-motion-coverflow");
    const cards = wrapper.findAll(".snap-motion-coverflow-card");
    expect(cards).toHaveLength(screens.length);
    expect(root.attributes("aria-roledescription")).toBe("carousel");
    expect(root.attributes("data-active-id")).toBe("system");
    expect(root.attributes("data-visual-id")).toBe("system");
    expect(cards[1]!.attributes("aria-current")).toBe("true");
    expect(cards[1]!.attributes("aria-label")).toBe("System, 2 of 3");
    expect(cards.map((card) => card.attributes("data-item-id"))).toEqual([
      "overview",
      "system",
      "outcome",
    ]);
    wrapper.unmount();
  });

  it("parks neighbours and keeps the focused face frontal", async () => {
    const wrapper = mountCoverflow();
    await nextTick();

    const focused = wrapper.findAll(".screen")[1]!;
    expect(Number(focused.attributes("data-depth"))).toBe(0);
    expect(Number(wrapper.findAll(".screen")[0]!.attributes("data-depth"))).toBe(1);
    expect(Number(wrapper.findAll(".screen")[2]!.attributes("data-depth"))).toBe(1);
    wrapper.unmount();
  });

  it("publishes the durable selection on settlement and announces it once", async () => {
    const wrapper = mountCoverflow();
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(true);
    await nextTick();
    await nextTick();
    expect(rail.settledId).toBe("outcome");
    expect(rail.visualId).toBe("outcome");
    expect(wrapper.emitted("settled")).toEqual([["outcome", { reason: "next" }]]);
    expect(wrapper.emitted("update:activeId")).toEqual([["outcome"]]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).toBe(
      "Outcome, 3 of 3",
    );
    expect(rail.canNext).toBe(false);
    wrapper.unmount();
  });

  it("travels any distance in one command, because a rail is not a card transaction", async () => {
    const wrapper = mountCoverflow({ activeId: "overview" });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;
    expect(rail.settledId).toBe("overview");

    expect(rail.navigateTo("outcome")).toBe(true);
    expect(wrapper.emitted("activeIdRequest")?.at(-1)).toEqual([
      "outcome",
      { reason: "programmatic" },
    ]);
    await wrapper.setProps({ activeId: "outcome" });
    await nextTick();
    expect(rail.settledId).toBe("outcome");
    wrapper.unmount();
  });

  it("synchronizes silently when another surface already reported the change", async () => {
    const wrapper = mountCoverflow();
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.synchronizeTo("overview")).toBe(true);
    await nextTick();
    expect(rail.settledId).toBe("overview");
    expect(rail.visualId).toBe("overview");
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).toBe("");
    wrapper.unmount();
  });

  it("keeps controlled semantics authoritative when a navigation request is ignored", async () => {
    const wrapper = mountCoverflow({ activeId: "system" });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["outcome", { reason: "next" }]]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect(rail.activeId).toBe("system");
    expect(rail.settledId).toBe("system");
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).toBe("");
    expect(rail.synchronizeTo("outcome")).toBe(false);
    wrapper.unmount();
  });

  it("anchors rejection to the latest accepted controlled identity", async () => {
    const wrapper = mountCoverflow({ activeId: "overview" });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(true);
    await wrapper.setProps({ activeId: "system" });
    await Promise.resolve();
    await nextTick();
    expect(rail.settledId).toBe("system");

    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["system", { reason: "next" }],
      ["outcome", { reason: "next" }],
      ["outcome", { reason: "next" }],
    ]);
    expect(rail.activeId).toBe("system");
    expect(rail.visualId).toBe("system");
    expect(rail.settledId).toBe("system");
    wrapper.unmount();
  });

  it("lets external authority replace a pending request after an accepted destination", async () => {
    let acceptedFirstRequest = false;
    let wrapper: ReturnType<typeof mountCoverflow>;
    wrapper = mountCoverflow({
      activeId: "overview",
      "onUpdate:activeId": (id: ScreenId) => {
        if (!acceptedFirstRequest && id === "system") {
          acceptedFirstRequest = true;
          void wrapper.setProps({ activeId: "system" });
        } else if (id === "outcome") {
          void wrapper.setProps({ activeId: "overview" });
        }
      },
    });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(rail.settledId).toBe("system");

    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(rail.activeId).toBe("overview");
    expect(rail.visualId).toBe("overview");
    expect(rail.settledId).toBe("overview");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["outcome", { reason: "next" }]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain(
      "Outcome",
    );
    wrapper.unmount();
  });

  it("hands controlled ownership off from the latest authority, not a pending request", async () => {
    const wrapper = mountCoverflow({ activeId: "overview" });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(true);
    // Vue Test Utils has no removeProp API; undefined models an omitted optional runtime prop.
    await wrapper.setProps({ activeId: undefined } as never);
    await Promise.resolve();
    await nextTick();

    expect(rail.activeId).toBe("overview");
    expect(rail.visualId).toBe("overview");
    expect(rail.settledId).toBe("overview");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["system", { reason: "next" }]);
    wrapper.unmount();
  });

  it("does not resurrect authority from a completed controlled ownership epoch", async () => {
    const epochItems = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
      { id: "d", title: "D" },
    ] as const;
    const futureItem = { id: "future", title: "Future" } as const;
    type EpochItem = (typeof epochItems)[number] | typeof futureItem;
    const EpochCoverflow = Coverflow<EpochItem>;
    const wrapper = mount(EpochCoverflow, {
      props: {
        activeId: "a",
        items: epochItems,
        itemLabel: (item: EpochItem) => item.title,
        reducedMotionOverride: true,
      },
      slots: {
        card: ({ item }: CoverflowCardState<EpochItem, EpochItem["id"]>) => h("div", item.title),
      },
    });
    await nextTick();
    const rail = wrapper.vm as unknown as {
      activeId: EpochItem["id"] | undefined;
      navigateTo: (id: EpochItem["id"]) => boolean;
      settledId: EpochItem["id"] | undefined;
      visualId: EpochItem["id"] | undefined;
    };

    await wrapper.setProps({ activeId: undefined } as never);
    expect(rail.navigateTo("b")).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(rail.settledId).toBe("b");

    await wrapper.setProps({ activeId: "future" } as never);
    expect(rail.navigateTo("c")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(rail.activeId).toBe("future");
    expect(rail.visualId).toBe("b");
    expect(rail.settledId).toBe("b");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["c", { reason: "programmatic" }]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain("C");

    await wrapper.setProps({ items: [...epochItems, futureItem] } as never);
    await Promise.resolve();
    await nextTick();
    expect(rail.visualId).toBe("future");
    expect(rail.settledId).toBe("future");
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain(
      "Future",
    );
    expect((wrapper.emitted("settled") ?? []).filter(([id]) => id === "future")).toHaveLength(1);

    await wrapper.setProps({ activeId: undefined } as never);
    expect(rail.activeId).toBe("future");
    expect(rail.navigateTo("d")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(rail.activeId).toBe("d");
    expect(rail.visualId).toBe("d");
    expect(rail.settledId).toBe("d");
    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["b", { reason: "programmatic" }],
      ["c", { reason: "programmatic" }],
      ["d", { reason: "programmatic" }],
    ]);
    wrapper.unmount();
  });

  it("inherits an accepted in-flight uncontrolled destination into a new unavailable controlled epoch", async () => {
    const frames = useControlledAnimationFrames();
    const epochItems = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
      { id: "d", title: "D" },
    ] as const;
    const futureItem = { id: "future", title: "Future" } as const;
    type EpochItem = (typeof epochItems)[number] | typeof futureItem;
    const EpochCoverflow = Coverflow<EpochItem>;
    const wrapper = mount(EpochCoverflow, {
      props: {
        activeId: "a",
        items: epochItems,
        itemLabel: (item: EpochItem) => item.title,
        reducedMotionOverride: false,
      },
      slots: {
        card: ({ item }: CoverflowCardState<EpochItem, EpochItem["id"]>) => h("div", item.title),
      },
    });
    await nextTick();
    const rail = wrapper.vm as unknown as {
      activeId: string | undefined;
      navigateTo: (id: string) => boolean;
      settledId: string | undefined;
    };

    await wrapper.setProps({ activeId: undefined } as never);
    expect(rail.navigateTo("b")).toBe(true);
    await nextTick();
    expect(rail.activeId).toBe("b");
    expect(rail.settledId).toBe("a");
    expect(wrapper.get(".snap-motion-coverflow").attributes("data-phase")).not.toBe("idle");
    expect(frames.pending()).toBeGreaterThan(0);

    await wrapper.setProps({ activeId: "future" } as never);
    expect(rail.activeId).toBe("future");
    await frames.flushUntilIdle(() => wrapper.element);

    expect(rail.settledId).toBe("b");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["b", { reason: "programmatic" }]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain("B");

    expect(rail.navigateTo("c")).toBe(true);
    await nextTick();
    expect(rail.activeId).toBe("future");
    expect(rail.settledId).toBe("b");
    await frames.flushUntilIdle(() => wrapper.element);
    expect(rail.settledId).toBe("b");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["c", { reason: "programmatic" }]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain("C");

    const requestsBeforeFuture = wrapper.emitted("activeIdRequest") ?? [];
    await wrapper.setProps({ items: [...epochItems, futureItem] } as never);
    await Promise.resolve();
    await nextTick();
    expect(rail.activeId).toBe("future");
    expect(rail.settledId).toBe("future");
    expect(wrapper.emitted("activeIdRequest") ?? []).toEqual(requestsBeforeFuture);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain(
      "Future",
    );

    await wrapper.setProps({ activeId: undefined } as never);
    expect(rail.activeId).toBe("future");
    expect(rail.settledId).toBe("future");
    expect(rail.navigateTo("d")).toBe(true);
    await nextTick();
    expect(rail.activeId).toBe("d");
    await frames.flushUntilIdle(() => wrapper.element);
    expect(rail.settledId).toBe("d");
    wrapper.unmount();
  });

  it("lets valid controlled authority replace an in-flight uncontrolled destination", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountCoverflow({ activeId: "overview", reducedMotionOverride: false });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    await wrapper.setProps({ activeId: undefined } as never);
    expect(rail.navigateTo("system")).toBe(true);
    await nextTick();
    expect(rail.activeId).toBe("system");
    expect(rail.settledId).toBe("overview");

    await wrapper.setProps({ activeId: "outcome" });
    expect(rail.activeId).toBe("outcome");
    await frames.flushUntilIdle(() => wrapper.element);

    expect(rail.settledId).toBe("outcome");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual([
      "system",
      { reason: "programmatic" },
    ]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain(
      "System",
    );
    wrapper.unmount();
  });

  it("keeps the latest uncontrolled state when an unavailable controlled epoch is abandoned in flight", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountCoverflow({ activeId: "overview", reducedMotionOverride: false });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    await wrapper.setProps({ activeId: undefined } as never);
    expect(rail.navigateTo("system")).toBe(true);
    await nextTick();
    expect(rail.settledId).toBe("overview");
    await wrapper.setProps({ activeId: "future" } as never);
    await wrapper.setProps({ activeId: undefined } as never);
    await nextTick();
    await frames.flushUntilIdle(() => wrapper.element);

    expect(rail.activeId).toBe("system");
    expect(rail.settledId).toBe("system");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual([
      "system",
      { reason: "programmatic" },
    ]);
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).not.toContain(
      "System",
    );
    wrapper.unmount();
  });

  it("rolls back to a valid rail anchor while controlled authority is unavailable", async () => {
    const wrapper = mountCoverflow({ activeId: "future" });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(rail.next()).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["outcome", { reason: "next" }],
      ["outcome", { reason: "next" }],
    ]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect((rail as unknown as { activeId: string }).activeId).toBe("future");
    expect(rail.settledId).toBe("system");
    expect(wrapper.get('[data-testid="snap-motion-coverflow-status"]').text()).toBe("");
    wrapper.unmount();
  });

  it("refuses every input while disabled", async () => {
    const wrapper = mountCoverflow({ disabled: true });
    await nextTick();
    const rail = wrapper.vm as unknown as CoverflowInstance;

    expect(rail.next()).toBe(false);
    expect(rail.previous()).toBe(false);
    expect(rail.isInspectEligible(1)).toBe(false);
    wrapper.unmount();
  });
});
