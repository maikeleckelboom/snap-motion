import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, watch } from "vue";

import Coverflow from "../src/coverflow/components/Coverflow.vue";
import * as boundedSpring from "../src/motion/bounded-spring-driver";
import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";
import { ManualAnimationDriver } from "./manual-driver";

const items = [{ id: "first" }, { id: "second" }, { id: "third" }, { id: "fourth" }];
type Item = (typeof items)[number];

interface Surface {
  diagnostics: { phase: string };
  next: () => boolean;
  settledId: string | undefined;
  visualId: string | undefined;
}

const surfaces = [
  ["Coverflow", Coverflow<Item>],
  ["StackedDeck", StackedDeck<Item>],
] as const;

afterEach(() => vi.restoreAllMocks());

/**
 * A host that owns `activeId` and, the moment the surface arrives at rest, asks for the next
 * destination from a Vue post-flush watcher — the shape of an auto-advancing demo or a tour.
 */
function mountChainingHost(Surface: (typeof surfaces)[number][1], chain: number) {
  const driver = new ManualAnimationDriver();
  vi.spyOn(boundedSpring, "useBoundedSpringDriver").mockReturnValue(driver);
  const activeId = ref("first");
  const requests: string[] = [];
  const settled: string[] = [];
  let remaining = chain;
  const Host = defineComponent({
    setup() {
      const surface = ref<Surface>();
      watch(
        () => surface.value?.diagnostics.phase,
        (phase, previous) => {
          // Only a real arrival at rest counts, not the template ref first appearing.
          if (phase !== "idle" || previous === undefined || remaining <= 0) return;
          remaining -= 1;
          surface.value!.next();
        },
        { flush: "post" },
      );
      return () =>
        h(
          Surface as never,
          {
            ref: surface,
            items,
            label: "Cases",
            reducedMotionOverride: false,
            activeId: activeId.value,
            onActiveIdRequest: (id: string) => {
              requests.push(id);
              activeId.value = id;
            },
            onSettled: (id: string) => settled.push(id),
          },
          { card: ({ item }: { item: Item }) => h("p", item.id) },
        );
    },
  });
  const wrapper = mount(Host);
  const surface = () => (wrapper.findComponent(Surface as never) as unknown as { vm: Surface }).vm;
  return { activeId, driver, requests, settled, surface, wrapper };
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe.each(surfaces)("controlled %s chained from a rest watcher", (_name, Surface) => {
  it("animates a next() requested by a post-flush watcher on phase idle", async () => {
    const { activeId, driver, requests, settled, surface, wrapper } = mountChainingHost(Surface, 1);
    try {
      await nextTick();
      // Start the first leg by hand; the watcher fires the second when the surface reaches rest.
      expect(surface().next()).toBe(true);
      await flush();
      expect(activeId.value).toBe("second");
      expect(driver.animations).toHaveLength(1);

      driver.latest!.complete();
      await flush();

      // The chained request is a real, animated move rather than a jump to its destination.
      expect(requests).toEqual(["second", "third"]);
      expect(activeId.value).toBe("third");
      expect(driver.animations).toHaveLength(2);
      expect(driver.animations[1]!.stopped).toBe(false);
      expect(surface().diagnostics.phase).not.toBe("idle");
      expect(surface().settledId).toBe("second");
      expect(surface().visualId).not.toBe("third");

      driver.latest!.complete();
      await flush();
      expect(surface().diagnostics.phase).toBe("idle");
      expect(surface().settledId).toBe("third");
      expect(settled.at(-1)).toBe("third");
    } finally {
      wrapper.unmount();
    }
  });
});
