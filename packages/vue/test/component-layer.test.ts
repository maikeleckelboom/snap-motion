import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import CarouselNext from "../src/carousel/components/CarouselNext.vue";
import CarouselPrevious from "../src/carousel/components/CarouselPrevious.vue";
import CarouselRoot from "../src/carousel/components/CarouselRoot.vue";
import CarouselSlide from "../src/carousel/components/CarouselSlide.vue";
import CarouselStatus from "../src/carousel/components/CarouselStatus.vue";
import CarouselTrack from "../src/carousel/components/CarouselTrack.vue";
import CarouselViewport from "../src/carousel/components/CarouselViewport.vue";

describe("production carousel components", () => {
  it("owns the APG boundary, native controls, slide groups, inertness, and settled status", async () => {
    const wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two"],
        label: "Featured work",
        reducedMotionOverride: true,
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

    expect(wrapper.emitted("requestActiveId")?.at(-1)).toEqual(["two", "next"]);
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
    expect(wrapper.get(".snap-motion-carousel-slide").attributes("dir")).toBe("rtl");
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
