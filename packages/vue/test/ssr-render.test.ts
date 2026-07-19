import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";

import BottomSheet from "../src/bottom-sheet/components/BottomSheet.vue";
import CarouselNext from "../src/carousel/components/CarouselNext.vue";
import CarouselPrevious from "../src/carousel/components/CarouselPrevious.vue";
import CarouselRoot from "../src/carousel/components/CarouselRoot.vue";
import CarouselSlide from "../src/carousel/components/CarouselSlide.vue";
import CarouselStatus from "../src/carousel/components/CarouselStatus.vue";
import CarouselTrack from "../src/carousel/components/CarouselTrack.vue";
import CarouselViewport from "../src/carousel/components/CarouselViewport.vue";
import ModalDialog from "../src/dialog/components/ModalDialog.vue";

function carousel(activeId: string, label: string) {
  return h(
    CarouselRoot,
    { activeId, ids: ["one", "two"], label },
    {
      default: () => [
        h(CarouselPrevious),
        h(CarouselViewport, null, {
          default: () =>
            h(CarouselTrack, null, {
              default: () => [
                h(CarouselSlide, { id: "one", label: "One, 1 of 2" }, () => "One"),
                h(CarouselSlide, { id: "two", label: "Two, 2 of 2" }, () => "Two"),
              ],
            }),
        }),
        h(CarouselNext),
        h(CarouselStatus),
      ],
    },
  );
}

function createCertificationApp() {
  return createSSRApp({
    render() {
      return h("main", [
        carousel("one", "First gallery"),
        carousel("two", "Second gallery"),
        h(
          ModalDialog,
          { open: true },
          { title: () => "Modal title", default: () => h("p", "Modal content") },
        ),
        h(
          BottomSheet,
          { activeId: "comfortable", open: true },
          { title: () => "Sheet title", default: () => h("p", "Sheet content") },
        ),
      ]);
    },
  });
}

describe("production component SSR contract", () => {
  it("renders every primitive without browser globals, Teleport, or an open attribute", async () => {
    expect(globalThis.window).toBeUndefined();
    const html = await renderToString(createCertificationApp());

    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-roledescription="slide"');
    expect(html).toContain('role="group"');
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]*\sopen(?:=|\s|>)/);
    expect(html).not.toContain("teleport");
  });

  it("generates unique instance IDs and deterministic cross-request markup", async () => {
    const first = await renderToString(createCertificationApp());
    const second = await renderToString(createCertificationApp());
    const titleIds = [...first.matchAll(/snap-motion-(?:dialog|sheet)-title-[^"\s]+/g)].map(
      ([id]) => id,
    );

    expect(new Set(titleIds).size).toBe(2);
    expect(first).toBe(second);
  });
});
