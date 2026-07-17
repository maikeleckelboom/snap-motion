import { CarouselRoot } from "@snap-motion/vue";
import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";

const html = await renderToString(
  createSSRApp(() => h(CarouselRoot, { activeId: "one", ids: ["one", "two"] })),
);
if (!html.includes("data-snap-motion-carousel-root")) {
  throw new Error("Packed Vue package failed SSR rendering.");
}
process.stdout.write("Packed SSR render passed.\n");
