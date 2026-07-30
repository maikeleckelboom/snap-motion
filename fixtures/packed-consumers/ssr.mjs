import { CarouselRoot } from "@snap-motion/vue";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";
import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";

const html = await renderToString(
  createSSRApp(() =>
    h("main", [
      h(CarouselRoot, { activeId: "one", ids: ["one", "two"] }),
      h(MediaGalleryDialog, {
        open: true,
        items: [
          {
            id: "one",
            title: "Packed media",
            alt: "Packed media",
            previewSrc: "/preview.jpg",
            width: 1_600,
            height: 1_000,
          },
        ],
      }),
    ]),
  ),
);
if (
  !html.includes("data-snap-motion-carousel-root") ||
  !html.includes("snap-motion-media-gallery") ||
  /<dialog[^>]*\sopen(?:=|\s|>)/.test(html)
) {
  throw new Error("Packed Vue package failed SSR rendering.");
}
process.stdout.write("Packed SSR render passed.\n");
