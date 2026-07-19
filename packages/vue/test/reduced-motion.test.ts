import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useReducedMotionPreference } from "../src/motion/reduced-motion";

describe("reduced-motion preference", () => {
  it("reacts to media-query changes and supports a deterministic override", async () => {
    let matches = false;
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const remove = vi.fn<MediaQueryList["removeEventListener"]>();
    vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          get matches() {
            return matches;
          },
          media: "(prefers-reduced-motion: reduce)",
          onchange: null,
          addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
            changeListener = listener as (event: MediaQueryListEvent) => void;
          },
          removeEventListener: remove,
          addListener: vi.fn<MediaQueryList["addListener"]>(),
          removeListener: vi.fn<MediaQueryList["removeListener"]>(),
          dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(),
        }) as MediaQueryList,
    );

    const override = ref<boolean>();
    let reduced: ReturnType<typeof useReducedMotionPreference> | undefined;
    const wrapper = mount(
      defineComponent({
        setup() {
          reduced = useReducedMotionPreference({ override });
          return () => h("div");
        },
      }),
    );
    await nextTick();

    expect(reduced?.value).toBe(false);
    matches = true;
    changeListener?.({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
    } as MediaQueryListEvent);
    await nextTick();
    expect(reduced?.value).toBe(true);

    override.value = false;
    await nextTick();
    expect(reduced?.value).toBe(false);

    wrapper.unmount();
    expect(remove).toHaveBeenCalledOnce();
  });
});
