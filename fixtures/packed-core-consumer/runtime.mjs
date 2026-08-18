import { createFixedStageGeometry } from "@snap-motion/core";

const geometry = createFixedStageGeometry({ itemIds: ["one", "two"], viewportSize: 640 });
if (geometry.anchors.length !== 2 || geometry.anchors[1]?.id !== "two") {
  throw new Error("Packed core runtime produced the wrong geometry.");
}
process.stdout.write("Packed core runtime passed.\n");
