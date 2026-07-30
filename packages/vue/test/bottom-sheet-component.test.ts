import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h, nextTick } from "vue";

import type { BottomSheetOpenSnapId } from "../src/bottom-sheet/bottom-sheet-policy";
import BottomSheet from "../src/bottom-sheet/components/BottomSheet.vue";
import type { UseBottomSheetMotionReturn } from "../src/bottom-sheet/use-bottom-sheet-motion";

interface BottomSheetInstance {
  motion: UseBottomSheetMotionReturn<BottomSheetOpenSnapId>;
}

describe("production bottom-sheet component", () => {
  it("separates the transform shell, visible viewport, measured chrome, and scrolling body", async () => {
    const wrapper = mount(BottomSheet, {
      props: {
        activeId: "comfortable",
        open: false,
        reducedMotionOverride: true,
      },
      slots: {
        title: () => "Sheet title",
        default: () => h("p", "Body content"),
      },
    });
    await nextTick();

    const panel = wrapper.get(".snap-motion-sheet-panel");
    const viewport = wrapper.get(".snap-motion-sheet-viewport");
    const chrome = wrapper.get(".snap-motion-sheet-chrome");
    const body = wrapper.get(".snap-motion-sheet-body");
    const intrinsicBodyContent = wrapper.get(".snap-motion-sheet-body-content");

    expect(panel.element.parentElement).toBe(wrapper.element);
    expect(viewport.element.parentElement).toBe(panel.element);
    expect(chrome.element.parentElement).toBe(viewport.element);
    expect(body.element.parentElement).toBe(viewport.element);
    expect(intrinsicBodyContent.element.parentElement).toBe(body.element);
    expect(chrome.find(".snap-motion-sheet-header").exists()).toBe(true);
    expect(chrome.find(".snap-motion-sheet-picker").exists()).toBe(true);
    expect(body.find(".snap-motion-sheet-header").exists()).toBe(false);
    expect(body.attributes("tabindex")).toBe("0");
    expect(panel.attributes("style")).toContain("--snap-motion-sheet-physical-y");
    expect(panel.attributes("style")).toContain("--snap-motion-sheet-visible-height");
    wrapper.unmount();
  });

  it("measures a custom picker as chrome and removes it without remounting body content", async () => {
    const wrapper = mount(BottomSheet, {
      props: {
        activeId: "comfortable",
        open: false,
        reducedMotionOverride: true,
        showSnapPicker: true,
      },
      slots: {
        title: () => "Sheet title",
        picker: () => h("div", { class: "custom-picker" }, "Tall custom picker"),
        default: () => h("label", [h("input", { value: "preserved" })]),
      },
    });
    await nextTick();

    const body = wrapper.get(".snap-motion-sheet-body").element;
    const input = wrapper.get("input").element;
    expect(wrapper.get(".snap-motion-sheet-chrome").find(".custom-picker").exists()).toBe(true);

    await wrapper.setProps({ showSnapPicker: false });
    await nextTick();

    expect(wrapper.find(".custom-picker").exists()).toBe(false);
    expect(wrapper.get(".snap-motion-sheet-body").element).toBe(body);
    expect(wrapper.get("input").element).toBe(input);
    wrapper.unmount();
  });

  it("keeps the same body subtree across semantic snap changes", async () => {
    const wrapper = mount(BottomSheet, {
      props: {
        activeId: "comfortable",
        open: true,
        reducedMotionOverride: true,
      },
      slots: {
        title: () => "Sheet title",
        default: () => h("textarea"),
      },
      attachTo: document.body,
    });
    await nextTick();

    const body = wrapper.get(".snap-motion-sheet-body").element;
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.value = "preserve me";
    await wrapper.setProps({ activeId: "compact" });
    await nextTick();

    expect(wrapper.get(".snap-motion-sheet-body").element).toBe(body);
    expect(wrapper.get("textarea").element).toBe(textarea);
    expect(textarea.value).toBe("preserve me");
    expect((wrapper.vm as unknown as BottomSheetInstance).motion.activeSnapId.value).toBe(
      "compact",
    );
    wrapper.unmount();
  });
});
