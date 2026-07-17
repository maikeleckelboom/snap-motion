import { SnapController, createFixedStageGeometry, type AnimationDriver } from "@snap-motion/core";
import {
  CarouselRoot,
  bottomSheetSnapPosition,
  createEnglishSnapMotionMessages,
  createFixedStageCarouselGeometryStrategy,
  useCarouselWindow,
  type BottomSheetSnapPoint,
  type SnapMotionMessages,
} from "@snap-motion/vue";
import { CarouselPaginationItem } from "@snap-motion/vue/components";
import { useCarouselContext, useCarouselMotion } from "@snap-motion/vue/composables";
import { h, ref } from "vue";

type MediaId = "overview" | "system" | "outcome";
const ids = ["overview", "system", "outcome"] as const satisfies readonly MediaId[];
const driver: AnimationDriver = {
  animate: ({ onComplete }) => {
    onComplete();
    return { stop() {} };
  },
};
const geometry = createFixedStageGeometry({ itemIds: ids, viewportSize: 800 });
const controller = new SnapController({
  anchors: geometry.anchors,
  bounds: geometry.bounds,
  driver,
  initialTargetId: "system",
});
void controller;

const sheetPoints = [
  { id: "peek", label: "Peek", resolve: bottomSheetSnapPosition.viewportFraction(0.25) },
  { id: "content", label: "Content", resolve: bottomSheetSnapPosition.intrinsicContent },
] as const satisfies readonly BottomSheetSnapPoint<"peek" | "content">[];
void sheetPoints;

const messages: SnapMotionMessages = createEnglishSnapMotionMessages({
  nextItem: "Volgende",
});
void messages;
void createFixedStageCarouselGeometryStrategy<MediaId>();
void h(CarouselRoot<MediaId>, { activeId: "overview", ids });
void h(CarouselPaginationItem<MediaId>, { id: "system" });
void useCarouselWindow(ids, ref<MediaId>("overview"), {
  mountBefore: 1,
  mountAfter: 1,
  preloadBefore: 2,
  preloadAfter: 2,
});
void useCarouselContext<MediaId>;
void useCarouselMotion<MediaId>;

// @ts-expect-error Semantic IDs are strings.
createFixedStageGeometry({ itemIds: [1, 2], viewportSize: 800 });
createFixedStageGeometry({ itemIds: [] as const, viewportSize: 800 });
