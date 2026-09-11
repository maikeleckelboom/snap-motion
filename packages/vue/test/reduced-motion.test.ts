import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, effectScope, h, nextTick, ref } from "vue";

import { useReducedMotionPreference } from "../src/motion/reduced-motion";

describe("reduced-motion preference", () => {
  it.each([
    [false, undefined],
    [true, undefined],
    [false, true],
    [true, true],
    [false, false],
    [true, false],
  ] as const)(
    "keeps first render deterministic with system=%s override=%s",
    async (system, override) => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      Object.defineProperty(media, "matches", { value: system });
      vi.spyOn(window, "matchMedia").mockReturnValue(media);
      const renders: boolean[] = [];
      const wrapper = mount(
        defineComponent({
          setup() {
            const reduced = useReducedMotionPreference({ override: ref(override) });
            return () => {
              renders.push(reduced.value);
              return h("output", String(reduced.value));
            };
          },
        }),
      );
      try {
        expect(renders[0]).toBe(override ?? false);
        await nextTick();
        expect(wrapper.text()).toBe(String(override ?? system));
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("adopts the system immediately in a standalone scope without a component lifecycle", () => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    Object.defineProperty(media, "matches", { value: true });
    vi.spyOn(window, "matchMedia").mockReturnValue(media);
    const scope = effectScope();
    try {
      expect(scope.run(() => useReducedMotionPreference().value)).toBe(true);
    } finally {
      scope.stop();
    }
  });

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
