import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import Sheet from "../src/sheet/components/Sheet.vue";
import type { SheetOpenSnapId } from "../src/sheet/sheet-policy";
import type { UseSheetMotionReturn } from "../src/sheet/use-sheet-motion";

interface SheetInstance {
  closeForPresentationChange: () => boolean;
  motion: UseSheetMotionReturn<SheetOpenSnapId>;
}

describe("production Sheet component", () => {
  it.each([
    ["top", "y"],
    ["right", "x"],
    ["bottom", "y"],
    ["left", "x"],
  ] as const)("renders stable structural hooks for %s", async (side, axis) => {
    const wrapper = mount(Sheet, {
      props: { open: false, reducedMotionOverride: true, side },
      slots: { title: () => "Sheet title", default: () => h("p", "Body content") },
    });
    await nextTick();

    const dialog = wrapper.get("dialog");
    const panel = wrapper.get(".snap-motion-sheet-panel");
    expect(dialog.attributes("data-sheet-side")).toBe(side);
    expect(dialog.attributes("data-sheet-axis")).toBe(axis);
    expect(dialog.attributes("data-sheet-state")).toBe("closed");
    expect(panel.attributes("data-sheet-side")).toBe(side);
    expect(wrapper.get(".snap-motion-sheet-drag-region").element.parentElement).toBe(panel.element);
    wrapper.unmount();
  });

  it("separates movable surface, constrained regions, measured chrome, and native body scroll", async () => {
    const wrapper = mount(Sheet, {
      props: { activeId: "comfortable", open: false, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => h("p", "Body content") },
    });
    await nextTick();

    const panel = wrapper.get(".snap-motion-sheet-panel");
    const viewport = wrapper.get(".snap-motion-sheet-viewport");
    const chrome = wrapper.get(".snap-motion-sheet-chrome");
    const body = wrapper.get(".snap-motion-sheet-body");
    expect(panel.element.parentElement).toBe(wrapper.element);
    expect(viewport.element.parentElement).toBe(panel.element);
    expect(chrome.element.parentElement).toBe(viewport.element);
    expect(body.element.parentElement).toBe(viewport.element);
    expect(wrapper.findAll(".snap-motion-sheet-content-shell")).toHaveLength(3);
    expect(body.attributes("tabindex")).toBe("0");
    expect(panel.attributes("style")).toContain("--snap-motion-sheet-canonical-position");
    expect(panel.attributes("style")).toContain("--snap-motion-sheet-visible-primary-extent");
    wrapper.unmount();
  });

  it("does not render a meaningless default one-option horizontal picker", async () => {
    const wrapper = mount(Sheet, {
      props: { open: false, reducedMotionOverride: true, side: "right" },
      slots: { title: () => "Inspector", default: () => "Body" },
    });
    await nextTick();
    expect(wrapper.find(".snap-motion-sheet-picker").exists()).toBe(false);
    wrapper.unmount();
  });

  it("never leaks the internal hidden anchor while closed configuration changes", async () => {
    const wrapper = mount(Sheet, {
      props: { activeId: "comfortable", open: false, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
    });
    await wrapper.setProps({ side: "right" });
    await nextTick();
    await nextTick();
    expect(wrapper.emitted("update:activeId") ?? []).not.toContainEqual(["__snap_motion_hidden__"]);
    wrapper.unmount();
  });

  it("closes a presentation swap immediately without broadening public close reasons", async () => {
    const wrapper = mount(Sheet, {
      props: { open: true, reducedMotionOverride: false },
      slots: { title: () => "Sheet title", default: () => h("button", "Inside") },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    expect((wrapper.vm as unknown as SheetInstance).closeForPresentationChange()).toBe(true);
    expect(wrapper.get("dialog").attributes()).not.toHaveProperty("open");
    expect(wrapper.emitted("update:open")).toContainEqual([false]);
    expect(wrapper.emitted("requestClose")).toBeUndefined();
    wrapper.unmount();
  });

  it("preserves the same body subtree across snap and side changes", async () => {
    const wrapper = mount(Sheet, {
      props: {
        activeId: "comfortable",
        open: true,
        reducedMotionOverride: true,
        side: "bottom",
      },
      slots: { title: () => "Sheet title", default: () => h("textarea") },
      attachTo: document.body,
    });
    await nextTick();

    const body = wrapper.get(".snap-motion-sheet-body").element;
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.value = "preserve me";
    await wrapper.setProps({ activeId: "compact" });
    await nextTick();
    expect((wrapper.vm as unknown as SheetInstance).motion.activeSnapId.value).toBe("compact");

    await wrapper.setProps({ side: "right" });
    await nextTick();
    await nextTick();
    expect(wrapper.get(".snap-motion-sheet-body").element).toBe(body);
    expect(wrapper.get("textarea").element).toBe(textarea);
    expect(textarea.value).toBe("preserve me");
    expect((wrapper.vm as unknown as SheetInstance).motion.activeSnapId.value).toBe("open");
    wrapper.unmount();
  });
});
