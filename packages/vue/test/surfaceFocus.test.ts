import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useSurfaceFocus } from "../src/internal/accessibility/surfaceFocus";

describe("surface pointer focus", () => {
  it("retains pointer modality across internal focus transfer and clears for keyboard or departure", async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          const root = ref<HTMLElement>();
          useSurfaceFocus(root);
          return () => h("div", { ref: root, tabindex: 0 }, [h("button", "Inspect")]);
        },
      }),
      { attachTo: document.body },
    );
    try {
      await nextTick();
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(false);
      await wrapper.trigger("pointerdown", { pointerType: "mouse" });
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(true);
      await wrapper.get("button").trigger("focusout", { relatedTarget: wrapper.element });
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(true);
      await wrapper.trigger("keydown", { key: "ArrowRight" });
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(false);
      await wrapper.trigger("pointerdown", { pointerType: "touch" });
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(true);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(false);
      await wrapper.trigger("pointerdown", { pointerType: "mouse" });
      await wrapper.trigger("focusout", { relatedTarget: null });
      expect(wrapper.element.hasAttribute("data-snap-motion-pointer-focus")).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});
