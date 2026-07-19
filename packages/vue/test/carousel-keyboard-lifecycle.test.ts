import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import CarouselNext from "../src/carousel/components/CarouselNext.vue";
import CarouselPaginationItem from "../src/carousel/components/CarouselPaginationItem.vue";
import CarouselRoot from "../src/carousel/components/CarouselRoot.vue";
import CarouselSlide from "../src/carousel/components/CarouselSlide.vue";
import CarouselTrack from "../src/carousel/components/CarouselTrack.vue";
import CarouselViewport from "../src/carousel/components/CarouselViewport.vue";

function carouselChildren(extra: unknown[] = []) {
  return [
    h(CarouselViewport, null, {
      default: () =>
        h(CarouselTrack, null, {
          default: () => [
            h(CarouselSlide, { id: "one", label: "One" }),
            h(CarouselSlide, { id: "two", label: "Two" }),
            h(CarouselSlide, { id: "three", label: "Three" }),
          ],
        }),
    }),
    ...extra,
  ];
}

async function flushSettlement() {
  await Promise.resolve();
  await nextTick();
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("carousel scoped keyboard and controlled lifecycle", () => {
  it("disables viewport and scoped automatic keyboard navigation when configured off", async () => {
    const activeId = ref("one");
    const host = mount(CarouselRoot, {
      props: {
        activeId: activeId.value,
        ids: ["one", "two"],
        keyboardNavigation: false,
        reducedMotionOverride: true,
        "onUpdate:activeId": (id: string) => {
          activeId.value = id;
        },
      },
      slots: { default: () => carouselChildren() },
    });
    await nextTick();
    const right = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    host.get(".snap-motion-carousel-viewport").element.dispatchEvent(right);

    expect(right.defaultPrevented).toBe(false);
    expect(activeId.value).toBe("one");
  });

  it("navigates dialog-wide from initial close focus and retains focus", async () => {
    const activeId = ref("one");
    const host = mount(
      defineComponent({
        setup() {
          return () =>
            h("dialog", { open: true }, [
              h("button", { id: "close" }, "Close"),
              h(
                CarouselRoot,
                {
                  activeId: activeId.value,
                  ids: ["one", "two", "three"],
                  reducedMotionOverride: true,
                  "onUpdate:activeId": (id: string) => {
                    activeId.value = id;
                  },
                },
                { default: () => carouselChildren() },
              ),
            ]);
        },
      }),
      { attachTo: document.body },
    );
    await nextTick();
    const close = host.get("#close").element as HTMLButtonElement;
    close.focus();

    const right = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    close.dispatchEvent(right);
    await flushSettlement();

    expect(right.defaultPrevented).toBe(true);
    expect(activeId.value).toBe("two");
    expect(document.activeElement).toBe(close);

    close.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowLeft" }),
    );
    await flushSettlement();
    expect(activeId.value).toBe("one");
    expect(document.activeElement).toBe(close);
    host.unmount();
  });

  it("does not steal owned keys or prevent a non-looping boundary", async () => {
    const host = mount(
      defineComponent({
        setup() {
          return () =>
            h("dialog", { open: true }, [
              h("input", { id: "caption" }),
              h(
                CarouselRoot,
                { activeId: "one", ids: ["one", "two"], reducedMotionOverride: true },
                { default: () => carouselChildren() },
              ),
            ]);
        },
      }),
      { attachTo: document.body },
    );
    await nextTick();
    const input = host.get("input").element;
    const owned = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    input.dispatchEvent(owned);
    expect(owned.defaultPrevented).toBe(false);

    const viewport = host.get(".snap-motion-carousel-viewport").element;
    const boundary = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowLeft",
    });
    viewport.dispatchEvent(boundary);
    expect(boundary.defaultPrevented).toBe(false);
    host.unmount();
  });

  it("emits exact ordered user and route lifecycles without echoes or no-op duplicates", async () => {
    const events: string[] = [];
    const wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two", "three"],
        reducedMotionOverride: true,
        onRequestActiveId: (id: string, reason: string) => events.push(`request:${id}:${reason}`),
        onSettled: (id: string) => events.push(`settled:${id}`),
        onTargetChanged: (id: string, reason: string) => events.push(`target:${id}:${reason}`),
        "onUpdate:activeId": (id: string) => events.push(`update:${id}`),
      },
      slots: {
        default: () =>
          carouselChildren([
            h(CarouselNext),
            h(CarouselPaginationItem, { id: "three", label: "Third" }),
          ]),
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await flushSettlement();
    expect(events).toEqual(["target:two:next", "request:two:next", "update:two", "settled:two"]);

    await wrapper.setProps({ activeId: "two" });
    await flushSettlement();
    expect(events).toHaveLength(4);

    await wrapper.get(".snap-motion-carousel-pagination-item").trigger("click");
    await flushSettlement();
    expect(events.slice(4)).toEqual([
      "target:three:picker",
      "request:three:picker",
      "update:three",
      "settled:three",
    ]);

    await wrapper.setProps({ activeId: "one" });
    await flushSettlement();
    expect(events.slice(8)).toEqual(["target:one:route", "settled:one"]);
    wrapper.unmount();
  });

  it("records wheel target selection as one first-class controlled action", async () => {
    vi.useFakeTimers();
    const wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two", "three"],
        reducedMotionOverride: true,
      },
      slots: { default: () => carouselChildren() },
    });
    await nextTick();
    const viewport = wrapper.get(".snap-motion-carousel-viewport").element as HTMLElement;
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 100 });
    (wrapper.vm as unknown as { motion: { remeasure: () => void } }).motion.remeasure();

    viewport.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 80 }),
    );
    vi.advanceTimersByTime(90);
    await flushSettlement();
    expect(wrapper.emitted("targetChanged")).toEqual([["two", "wheel"]]);
    expect(wrapper.emitted("requestActiveId")).toEqual([["two", "wheel"]]);
    expect(wrapper.emitted("update:activeId")).toEqual([["two"]]);
    expect(wrapper.emitted("settled")).toEqual([["two"]]);
    wrapper.unmount();
  });

  it("uses one explicit primary when a dialog contains multiple carousels", async () => {
    const primaryId = ref("one");
    const secondaryId = ref("one");
    const host = mount(
      defineComponent({
        setup() {
          const renderCarousel = (primary: boolean) =>
            h(
              CarouselRoot,
              {
                activeId: primary ? primaryId.value : secondaryId.value,
                ids: ["one", "two"],
                keyboardPrimary: primary,
                reducedMotionOverride: true,
                "onUpdate:activeId": (id: string) => {
                  if (primary) primaryId.value = id;
                  else secondaryId.value = id;
                },
              },
              { default: () => carouselChildren() },
            );
          return () =>
            h("dialog", { open: true }, [
              h("button", { id: "close" }, "Close"),
              renderCarousel(true),
              renderCarousel(false),
            ]);
        },
      }),
      { attachTo: document.body },
    );
    await nextTick();
    host
      .get("#close")
      .element.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }),
      );
    await flushSettlement();
    expect(primaryId.value).toBe("two");
    expect(secondaryId.value).toBe("one");
    host.unmount();
  });
});
