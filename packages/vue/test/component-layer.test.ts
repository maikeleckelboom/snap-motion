import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import CarouselNext from "../src/carousel/components/CarouselNext.vue";
import CarouselPrevious from "../src/carousel/components/CarouselPrevious.vue";
import CarouselRoot from "../src/carousel/components/CarouselRoot.vue";
import CarouselSlide from "../src/carousel/components/CarouselSlide.vue";
import CarouselStatus from "../src/carousel/components/CarouselStatus.vue";
import CarouselTrack from "../src/carousel/components/CarouselTrack.vue";
import CarouselViewport from "../src/carousel/components/CarouselViewport.vue";
import ModalDialog from "../src/dialog/components/ModalDialog.vue";

describe("production carousel components", () => {
  it("owns the APG boundary, native controls, slide groups, inertness, and settled status", async () => {
    let wrapper: VueWrapper;
    wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two"],
        label: "Featured work",
        reducedMotionOverride: true,
        "onUpdate:activeId": (id: string) => void wrapper.setProps({ activeId: id }),
      },
      slots: {
        default: () => [
          h(CarouselPrevious),
          h(CarouselViewport, null, {
            default: () =>
              h(
                CarouselTrack,
                { endInset: 24, startInset: "1rem" },
                {
                  default: () => [
                    h(CarouselSlide, { id: "one", label: "One, 1 of 2" }, () => "One"),
                    h(CarouselSlide, { id: "two", label: "Two, 2 of 2" }, () => "Two"),
                  ],
                },
              ),
          }),
          h(CarouselNext),
          h(CarouselStatus),
        ],
      },
    });
    await nextTick();

    expect(wrapper.attributes("role")).toBe("group");
    expect(wrapper.attributes("aria-roledescription")).toBe("carousel");
    const slides = wrapper.findAll('[role="group"][aria-roledescription="slide"]');
    expect(slides).toHaveLength(2);
    expect(wrapper.get(".snap-motion-carousel-track").attributes("style")).toContain(
      "padding-inline-start: 1rem",
    );
    expect(wrapper.get(".snap-motion-carousel-track").attributes("style")).toContain(
      "padding-inline-end: 24px",
    );
    expect(wrapper.get(".snap-motion-carousel-track").attributes("dir")).toBe("ltr");
    expect(slides[0]?.attributes("inert")).toBeUndefined();
    expect(slides[1]?.attributes()).toHaveProperty("inert");
    expect(wrapper.get(".snap-motion-carousel-previous").attributes()).toHaveProperty("disabled");

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")?.at(-1)).toEqual(["two", { reason: "next" }]);
    await nextTick();
    expect(slides[0]?.attributes()).toHaveProperty("inert");
    expect(slides[1]?.attributes("inert")).toBeUndefined();
    expect(wrapper.get('[role="status"]').text()).toBe("Two, 2 of 2");
  });

  it("keeps physical track coordinates LTR while restoring RTL slide content", async () => {
    const wrapper = mount(CarouselRoot, {
      props: {
        activeId: "one",
        direction: "rtl",
        ids: ["one"],
        reducedMotionOverride: true,
      },
      slots: {
        default: () =>
          h(CarouselViewport, null, {
            default: () =>
              h(CarouselTrack, null, {
                default: () => h(CarouselSlide, { id: "one", label: "One" }),
              }),
          }),
      },
    });
    await nextTick();

    expect(wrapper.get(".snap-motion-carousel").attributes("dir")).toBe("rtl");
    expect(wrapper.get(".snap-motion-carousel-track").attributes("dir")).toBe("ltr");
    // Content direction is restored by the structural custom-property contract, not stamped on slides.
    expect(wrapper.get(".snap-motion-carousel-slide").attributes("dir")).toBeUndefined();
    expect(
      (wrapper.get(".snap-motion-carousel").element as HTMLElement).style.getPropertyValue(
        "--snap-motion-content-direction",
      ),
    ).toBe("rtl");
  });

  it("rolls an ignored controlled request back without changing semantics or settling it", async () => {
    const wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two"],
        reducedMotionOverride: true,
      },
      slots: {
        default: () => [
          h(CarouselViewport, null, {
            default: () =>
              h(CarouselTrack, null, {
                default: () => [
                  h(CarouselSlide, { id: "one", label: "One" }),
                  h(CarouselSlide, { id: "two", label: "Two" }),
                ],
              }),
          }),
          h(CarouselNext),
          h(CarouselStatus),
        ],
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["two", { reason: "next" }]]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe("one");
    expect(wrapper.get('[role="status"]').text()).toBe("");
    expect((wrapper.vm as unknown as { activeId: string }).activeId).toBe("one");
    expect(
      (wrapper.vm as unknown as { synchronizeTo: (id: string) => boolean }).synchronizeTo("two"),
    ).toBe(false);
    wrapper.unmount();
  });

  it("retains a valid mechanical anchor while the controlled ID is unavailable", async () => {
    const wrapper = mount(CarouselRoot, {
      props: {
        activeId: "future",
        ids: ["one", "two"],
        reducedMotionOverride: true,
      },
      slots: {
        default: () => [
          h(CarouselViewport, null, {
            default: () =>
              h(CarouselTrack, null, {
                default: () => [
                  h(CarouselSlide, { id: "one", label: "One" }),
                  h(CarouselSlide, { id: "two", label: "Two" }),
                ],
              }),
          }),
          h(CarouselNext),
          h(CarouselStatus),
        ],
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await Promise.resolve();
    await nextTick();
    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["two", { reason: "next" }],
      ["two", { reason: "next" }],
    ]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect((wrapper.vm as unknown as { activeId: string }).activeId).toBe("future");
    expect(wrapper.get('[role="status"]').text()).toBe("");
    wrapper.unmount();
  });

  it("mirrors arrow keys as soon as the page's own direction changes, without remounting", async () => {
    document.documentElement.dir = "ltr";
    let wrapper: VueWrapper;
    wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "two",
        // `auto`: the carousel takes its direction from the page rather than stating one.
        direction: "auto",
        ids: ["one", "two", "three"],
        label: "Inherited direction",
        reducedMotionOverride: true,
        "onUpdate:activeId": (id: string) => void wrapper.setProps({ activeId: id }),
      },
      slots: {
        default: () =>
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
      },
    });
    await nextTick();
    const root = wrapper.element as HTMLElement;
    const press = (key: string) =>
      root.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));

    press("ArrowRight");
    await nextTick();
    expect(wrapper.emitted("activeIdRequest")?.at(-1)).toEqual(["three", { reason: "keyboard" }]);

    // The page turns around under a carousel that is already mounted. Nothing reactive tracks
    // computed style, so this is exactly the case a memoized direction would get wrong.
    root.style.direction = "rtl";
    root.dir = "rtl";
    await Promise.resolve();
    await nextTick();
    press("ArrowRight");
    await nextTick();
    expect(wrapper.emitted("activeIdRequest")?.at(-1)).toEqual(["two", { reason: "keyboard" }]);
    press("ArrowLeft");
    await nextTick();
    expect(wrapper.emitted("activeIdRequest")?.at(-1)).toEqual(["three", { reason: "keyboard" }]);

    // An `auto` carousel imposes no direction of its own, so its slides keep inheriting the
    // page's — rather than being stamped with whatever it resolved once.
    for (const slide of wrapper.findAll(".snap-motion-carousel-slide")) {
      expect(slide.attributes("dir")).toBeUndefined();
    }
    wrapper.unmount();
    document.documentElement.removeAttribute("dir");
  });

  it("navigates from a non-first controlled initial ID", async () => {
    const wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "two",
        ids: ["one", "two", "three"],
        label: "Controlled gallery",
        reducedMotionOverride: true,
      },
      slots: {
        default: () => [
          h(CarouselViewport, null, {
            default: () =>
              h(CarouselTrack, null, {
                default: () => [
                  h(CarouselSlide, { id: "one", label: "One, 1 of 3" }),
                  h(CarouselSlide, { id: "two", label: "Two, 2 of 3" }),
                  h(CarouselSlide, { id: "three", label: "Three, 3 of 3" }),
                ],
              }),
          }),
          h(CarouselNext),
        ],
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();
    expect(wrapper.emitted("update:activeId")?.at(-1)).toEqual(["three"]);
  });

  it("reconciles a controlled ID and collection through one atomic watcher", async () => {
    const wrapper = mount(CarouselRoot, {
      props: {
        activeId: "one",
        ids: ["one", "two"],
        reducedMotionOverride: true,
      },
      slots: {
        default: () =>
          h(CarouselViewport, null, {
            default: () => h(CarouselTrack),
          }),
      },
    });
    await nextTick();

    await wrapper.setProps({ activeId: "three", ids: ["two", "three"] });
    await nextTick();
    await nextTick();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe(
      "three",
    );
    expect(wrapper.emitted("activeIdRequest")).toBeUndefined();

    await wrapper.setProps({ ids: ["two"] });
    await nextTick();
    await nextTick();
    await wrapper.setProps({ ids: ["two", "three"] });
    await nextTick();
    await nextTick();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe(
      "three",
    );
  });

  it("moves focus to the viewport before a focused active ID is removed", async () => {
    const wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two"],
        label: "Mutable gallery",
        reducedMotionOverride: true,
      },
      slots: {
        default: () =>
          h(CarouselViewport, null, {
            default: () =>
              h(CarouselTrack, null, {
                default: () => [
                  h(CarouselSlide, { id: "one", label: "One, 1 of 2" }, () =>
                    h("button", "Inspect"),
                  ),
                  h(CarouselSlide, { id: "two", label: "Two, 2 of 2" }),
                ],
              }),
          }),
      },
    });
    await nextTick();
    const inspect = wrapper.get("button");
    inspect.element.focus();

    await wrapper.setProps({ ids: ["two"] });
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get(".snap-motion-carousel-viewport").element);
  });
});

describe("production modal dialog", () => {
  it("keeps a refused controlled close request open and repeatable", async () => {
    const wrapper = mount(ModalDialog, {
      attachTo: document.body,
      props: { open: true },
      slots: { title: () => "Dialog title", default: () => "Dialog body" },
    });
    await nextTick();

    await wrapper.get(".snap-motion-dialog-close").trigger("click");
    await wrapper.get(".snap-motion-dialog-close").trigger("click");
    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    expect(wrapper.emitted("openRequest")).toEqual([
      [false, { reason: "close-button" }],
      [false, { reason: "close-button" }],
    ]);
    expect(wrapper.emitted("closed")).toBeUndefined();

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(wrapper.get("dialog").attributes("open")).toBeUndefined();
    expect(wrapper.emitted("closed")).toEqual([[]]);
    wrapper.unmount();
  });
});
