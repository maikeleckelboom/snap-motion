import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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
