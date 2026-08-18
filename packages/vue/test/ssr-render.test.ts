// @vitest-environment node

import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";

import CarouselNext from "../src/carousel/components/CarouselNext.vue";
import CarouselPrevious from "../src/carousel/components/CarouselPrevious.vue";
import CarouselRoot from "../src/carousel/components/CarouselRoot.vue";
import CarouselSlide from "../src/carousel/components/CarouselSlide.vue";
import CarouselStatus from "../src/carousel/components/CarouselStatus.vue";
import CarouselTrack from "../src/carousel/components/CarouselTrack.vue";
import CarouselViewport from "../src/carousel/components/CarouselViewport.vue";
import Coverflow from "../src/coverflow/components/Coverflow.vue";
import ModalDialog from "../src/dialog/components/ModalDialog.vue";
import MediaGalleryDialog from "../src/media-gallery/components/MediaGalleryDialog.vue";
import Sheet from "../src/sheet/components/Sheet.vue";
import StackedDeck from "../src/stacked-deck/components/StackedDeck.vue";

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

interface SpatialItem {
  readonly id: "one" | "two" | "three";
}

const spatialItems: readonly SpatialItem[] = [{ id: "one" }, { id: "two" }, { id: "three" }];

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
          Sheet,
          { activeId: "comfortable", open: true },
          { title: () => "Sheet title", default: () => h("p", "Sheet content") },
        ),
        h(
          MediaGalleryDialog,
          {
            open: true,
            items: [
              {
                id: "one",
                title: "Media title",
                description: "Settled media item description",
                alt: "Media alternative text",
                preview: {
                  src: "/preview.jpg",
                  srcset: "/preview-400.jpg 400w, /preview-800.jpg 800w",
                  sizes: "50vw",
                  width: 800,
                  height: 500,
                },
                full: {
                  src: "/full.jpg",
                  srcset: "/full-1600.jpg 1600w, /full-2400.jpg 2400w",
                  sizes: "100vw",
                  width: 2_400,
                  height: 1_500,
                },
              },
            ],
            activeId: "one",
          },
          { actions: () => h("a", { href: "/nl/case?media=one" }, "Switch locale") },
        ),
        h(
          Coverflow,
          { items: spatialItems, label: "Coverflow rail" },
          { card: ({ item }: { item: SpatialItem }) => h("p", item.id) },
        ),
        h(
          StackedDeck,
          { items: spatialItems, label: "Stacked deck" },
          { card: ({ item }: { item: SpatialItem }) => h("p", item.id) },
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
    expect(html).toContain("snap-motion-media-gallery");
    expect(html).toContain("Media title");
    expect(html).toContain("Settled media item description");
    expect(html).toContain("Switch locale");
    expect(html).toContain('src="/preview.jpg"');
    expect(html).toContain('srcset="/preview-400.jpg 400w, /preview-800.jpg 800w"');
    expect(html).toContain('sizes="50vw"');
    expect(html).toContain('src="/full.jpg"');
    expect(html).toContain('srcset="/full-1600.jpg 1600w, /full-2400.jpg 2400w"');
    expect(html).toContain('sizes="100vw"');
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

  it("fails deterministically when normalized media-gallery IDs collide", async () => {
    const app = createSSRApp(() =>
      h(MediaGalleryDialog, {
        open: false,
        items: [
          {
            id: "item",
            title: "First",
            alt: "First",
            preview: { src: "/first.jpg", width: 800, height: 500 },
            full: { src: "/first-full.jpg", width: 1_600, height: 1_000 },
          },
          {
            id: "item",
            title: "Second",
            alt: "Second",
            preview: { src: "/second.jpg", width: 800, height: 500 },
            full: { src: "/second-full.jpg", width: 1_600, height: 1_000 },
          },
        ],
      }),
    );

    await expect(renderToString(app)).rejects.toThrowError(
      /Media gallery item IDs must be unique non-empty strings/,
    );
  });
});
