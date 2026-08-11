import { createFixedStageGeometry } from "@snap-motion/core";
import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import CarouselNext from "../src/carousel/components/CarouselNext.vue";
import CarouselPrevious from "../src/carousel/components/CarouselPrevious.vue";
import CarouselRoot from "../src/carousel/components/CarouselRoot.vue";
import CarouselSlide from "../src/carousel/components/CarouselSlide.vue";
import CarouselStatus from "../src/carousel/components/CarouselStatus.vue";
import CarouselTrack from "../src/carousel/components/CarouselTrack.vue";
import CarouselViewport from "../src/carousel/components/CarouselViewport.vue";
import ModalDialog from "../src/dialog/components/ModalDialog.vue";

const fixedStageGeometry = {
  measure: ({ ids }: { ids: readonly string[] }) =>
    createFixedStageGeometry({ itemIds: ids, viewportSize: 320 }),
};

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

  it("rolls a rejected request back to the latest accepted controlled authority", async () => {
    let acceptedFirstRequest = false;
    let wrapper: VueWrapper;
    wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        ids: ["one", "two", "three"],
        reducedMotionOverride: true,
        "onUpdate:activeId": (id: string) => {
          if (!acceptedFirstRequest && id === "two") {
            acceptedFirstRequest = true;
            void wrapper.setProps({ activeId: id });
          }
        },
      },
      slots: {
        default: () => [
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
          h(CarouselNext),
          h(CarouselStatus),
        ],
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe("two");
    expect(wrapper.get('[role="status"]').text()).toBe("Two");
    expect(wrapper.emitted("settled")).toEqual([["two", { reason: "next" }]]);

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();
    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["two", { reason: "next" }],
      ["three", { reason: "next" }],
      ["three", { reason: "next" }],
    ]);
    expect(wrapper.emitted("settled")).toEqual([["two", { reason: "next" }]]);
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe("two");
    expect(wrapper.get('[role="status"]').text()).toBe("Two");
    wrapper.unmount();
  });

  it("retains request provenance when a second destination is confirmed after a delay", async () => {
    let acceptedFirstRequest = false;
    let wrapper: VueWrapper;
    wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        geometryStrategy: fixedStageGeometry,
        ids: ["one", "two", "three"],
        reducedMotionOverride: false,
        "onUpdate:activeId": (id: string) => {
          if (!acceptedFirstRequest && id === "two") {
            acceptedFirstRequest = true;
            void wrapper.setProps({ activeId: id });
          }
        },
      },
      slots: {
        default: () => [
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
          h(CarouselNext),
          h(CarouselStatus),
        ],
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();
    await vi.waitFor(() => {
      expect(wrapper.emitted("settled")).toEqual([["two", { reason: "next" }]]);
    });

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-phase")).not.toBe("idle");
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe("two");
    expect(wrapper.emitted("settled")).toEqual([["two", { reason: "next" }]]);

    await wrapper.setProps({ activeId: "three" });
    await vi.waitFor(() => {
      expect(wrapper.emitted("settled")).toEqual([
        ["two", { reason: "next" }],
        ["three", { reason: "next" }],
      ]);
    });
    expect(wrapper.get('[role="status"]').text()).toBe("Three");
    wrapper.unmount();
  });

  it("invalidates a pending second request when authority or the collection replaces it", async () => {
    let acceptedFirstRequest = false;
    let wrapper: VueWrapper;
    wrapper = mount(CarouselRoot, {
      attachTo: document.body,
      props: {
        activeId: "one",
        geometryStrategy: fixedStageGeometry,
        ids: ["one", "two", "three"],
        reducedMotionOverride: false,
        "onUpdate:activeId": (id: string) => {
          if (!acceptedFirstRequest && id === "two") {
            acceptedFirstRequest = true;
            void wrapper.setProps({ activeId: id });
          }
        },
      },
      slots: {
        default: () => [
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
          h(CarouselNext),
          h(CarouselStatus),
        ],
      },
    });
    await nextTick();

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();
    await vi.waitFor(() => {
      expect(wrapper.emitted("settled")).toEqual([["two", { reason: "next" }]]);
    });

    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-phase")).not.toBe("idle");
    await wrapper.setProps({ activeId: "one" });
    await vi.waitFor(() => {
      expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-phase")).toBe("idle");
      expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe(
        "one",
      );
    });
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["three", { reason: "next" }]);
    expect(wrapper.get('[role="status"]').text()).not.toBe("Three");

    await wrapper.setProps({ activeId: "two" });
    await vi.waitFor(() => {
      expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-phase")).toBe("idle");
      expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe(
        "two",
      );
    });
    await wrapper.get(".snap-motion-carousel-next").trigger("click");
    await nextTick();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-phase")).not.toBe("idle");
    await wrapper.setProps({ ids: ["one", "two"] });
    await vi.waitFor(() => {
      expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-phase")).toBe("idle");
    });
    await wrapper.setProps({ ids: ["one", "two", "three"] });
    await nextTick();
    expect(wrapper.get(".snap-motion-carousel-viewport").attributes("data-active-id")).toBe("two");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["three", { reason: "next" }]);
    expect(wrapper.get('[role="status"]').text()).not.toBe("Three");
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
  it("no-ops a public close request after controlled and native closure", async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: false },
      slots: { title: () => "Dialog title", default: () => "Dialog body" },
    });
    await nextTick();

    (wrapper.vm as unknown as { requestClose: (reason: "programmatic") => void }).requestClose(
      "programmatic",
    );
    expect(wrapper.emitted("update:open")).toBeUndefined();
    expect(wrapper.emitted("openRequest")).toBeUndefined();
    wrapper.unmount();
  });

  it("unmounts an open lifecycle without publishing a close request", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open dialog";
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(ModalDialog, {
      attachTo: document.body,
      props: { open: true },
      slots: { title: () => "Dialog title", default: () => "Dialog body" },
    });
    await nextTick();

    wrapper.unmount();
    expect(wrapper.emitted("update:open")).toBeUndefined();
    expect(wrapper.emitted("openRequest")).toBeUndefined();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("finalizes an accepted unexpected native close exactly once", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open dialog";
    document.body.append(opener);
    opener.focus();
    let wrapper: VueWrapper;
    wrapper = mount(ModalDialog, {
      attachTo: document.body,
      props: {
        open: true,
        "onUpdate:open": (open: boolean) => void wrapper.setProps({ open }),
      },
      slots: { title: () => "Dialog title", default: () => "Dialog body" },
    });
    await nextTick();

    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();

    expect(wrapper.emitted("openRequest")).toEqual([[false, { reason: "programmatic" }]]);
    expect(wrapper.emitted("closed")).toEqual([[]]);
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
    opener.remove();
  });

  it("repairs a refused unexpected native close without publishing closed", async () => {
    const wrapper = mount(ModalDialog, {
      attachTo: document.body,
      props: { open: true },
      slots: { title: () => "Dialog title", default: () => "Dialog body" },
    });
    await nextTick();

    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();

    expect(wrapper.emitted("openRequest")).toEqual([[false, { reason: "programmatic" }]]);
    expect(wrapper.emitted("closed")).toBeUndefined();
    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    wrapper.unmount();
  });

  it("lets only the latest close generation finalize a rapid reopen and reclose", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open dialog";
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(ModalDialog, {
      attachTo: document.body,
      props: { open: true },
      slots: { title: () => "Dialog title", default: () => "Dialog body" },
    });
    await nextTick();

    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    const pendingCloseEvents: Array<() => void> = [];
    vi.spyOn(dialog, "close").mockImplementation(() => {
      dialog.removeAttribute("open");
      pendingCloseEvents.push(() => dialog.dispatchEvent(new Event("close")));
    });

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await wrapper.setProps({ open: false });
    expect(pendingCloseEvents).toHaveLength(2);

    pendingCloseEvents[0]!();
    await nextTick();
    expect(wrapper.emitted("closed")).toBeUndefined();
    expect(document.activeElement).not.toBe(opener);

    pendingCloseEvents[1]!();
    await nextTick();
    expect(wrapper.emitted("closed")).toEqual([[]]);
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
    opener.remove();
  });

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
