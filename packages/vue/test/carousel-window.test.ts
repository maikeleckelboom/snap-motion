import { describe, expect, it } from "vitest";
import { ref } from "vue";

import { useCarouselWindow } from "../src/carousel/carousel-window";

describe("useCarouselWindow", () => {
  it("keeps route-provided active IDs mounted with deterministic semantic windows", () => {
    const ids = ref(["a", "b", "c", "d", "e"] as const);
    const activeId = ref<(typeof ids.value)[number]>("c");
    const window = useCarouselWindow(ids, activeId, {
      mountBefore: 1,
      mountAfter: 1,
      preloadBefore: 2,
      preloadAfter: 2,
    });

    expect([...window.mountedIds.value]).toEqual(["b", "c", "d"]);
    expect([...window.preloadIds.value]).toEqual(["a", "b", "c", "d", "e"]);
    expect(window.previousIds.value).toEqual(["a", "b"]);
    expect(window.nextIds.value).toEqual(["d", "e"]);

    activeId.value = "e";
    expect([...window.mountedIds.value]).toEqual(["d", "e"]);
  });

  it("falls back deterministically for removed, empty, and wrapped item sets", () => {
    const ids = ref<readonly string[]>(["a", "b", "c"]);
    const activeId = ref<string | undefined>("missing");
    const window = useCarouselWindow(ids, activeId, {
      mountBefore: 1,
      mountAfter: 1,
      preloadBefore: 1,
      preloadAfter: 1,
      wrap: true,
    });
    expect(window.activeId.value).toBe("a");
    expect([...window.mountedIds.value]).toEqual(["c", "a", "b"]);

    ids.value = [];
    expect(window.activeId.value).toBeUndefined();
    expect(window.mountedIds.value.size).toBe(0);
  });
});
