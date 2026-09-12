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
  it("places a raw image slot directly in the physical transform shell", () => {
    const wrapper = mount(TypedCoverflow, {
      props: { items: screens },
      slots: {
        card: ({ item }: CoverflowCardState<Screen, ScreenId>) =>
          h("img", { src: `${item.id}.png`, alt: item.title }),
      },
    });
    try {
      for (const card of wrapper.findAll<HTMLElement>(".snap-motion-coverflow-card")) {
        expect([...card.element.children].map((child) => child.tagName)).toEqual(["IMG"]);
        expect(card.element.style.transform).toContain("translate3d");
      }
    } finally {
      wrapper.unmount();
    }
  });

  it("adopts narrow allocation and anchors together without changing selection", async () => {
    const wrapper = mountCoverflow({ cardWidth: 720 });
    try {
      await nextTick();
      const root = wrapper.get<HTMLElement>(".snap-motion-coverflow");
      let allocation = 280;
      Object.defineProperty(root.element, "clientWidth", {
        configurable: true,
        get: () => allocation,
      });
      for (const [width, expected] of [
        [280, "248px"],
        [1120, "672px"],
      ] as const) {
        allocation = width;
        window.dispatchEvent(new Event("resize"));
        await nextTick();
        expect(root.element.style.getPropertyValue("--snap-motion-coverflow-card-width")).toBe(
          expected,
        );
        for (const attribute of ["data-active-id", "data-visual-id"]) {
          expect(root.attributes(attribute)).toBe("system");
        }
        expect((wrapper.vm as unknown as CoverflowInstance).settledId).toBe("system");
        expect(
          wrapper.get<HTMLElement>('[data-item-id="system"]').element.style.transform,
        ).toContain("translate3d(0.000px, 0, 0)");
      }
      expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it("forwards reactive preferred card size without changing semantic selection", async () => {
    const wrapper = mountCoverflow({ cardWidth: 720 });
    try {
      await nextTick();
      const root = wrapper.get<HTMLElement>(".snap-motion-coverflow");
      expect(
        Number.parseFloat(
          root.element.style.getPropertyValue("--snap-motion-coverflow-card-width"),
        ),
      ).toBeGreaterThan(600);
      await wrapper.setProps({ cardWidth: 360 });
      expect(root.element.style.getPropertyValue("--snap-motion-coverflow-card-width")).toBe(
        "360px",
      );
      await wrapper.setProps({ cardWidth: undefined });
      expect(root.element.style.getPropertyValue("--snap-motion-coverflow-card-width")).toBe(
        "420px",
      );
      expect(root.attributes("data-active-id")).toBe("system");
      expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
    // A pending size remeasurement must not write to the disposed controller.
    await nextTick();
  });

  it("renders every item on one rail with accessible position labels", async () => {
    const wrapper = mountCoverflow();
    await nextTick();

    const root = wrapper.get(".snap-motion-coverflow");
    const cards = wrapper.findAll(".snap-motion-coverflow-card");
    expect(cards).toHaveLength(screens.length);
    expect(root.attributes("aria-roledescription")).toBe("carousel");
    expect(root.attributes("tabindex")).toBe("0");
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
