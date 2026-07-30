import { SnapController, createFixedStageGeometry, type AnimationDriver } from "@snap-motion/core";
import { bottomSheetSnapPosition, type BottomSheetSnapPoint } from "@snap-motion/vue/bottom-sheet";
import {
  CarouselPaginationItem,
  CarouselRoot,
  createFixedStageCarouselGeometryStrategy,
  useCarouselWindow,
  useCarouselContext,
  useCarouselMotion,
} from "@snap-motion/vue/carousel";
import { ModalDialog, type CloseReason } from "@snap-motion/vue/dialog";
import {
  createEnglishSnapMotionMessages,
  type SnapMotionMessages,
} from "@snap-motion/vue/localization";
import {
  createEnglishMediaGalleryMessages,
  MediaGalleryDialog,
  type MediaGalleryCloseReason,
  type MediaGalleryItem,
  type MediaGalleryNavigationReason,
} from "@snap-motion/vue/media-gallery";
import { createMotionDriver, useSnapMotion } from "@snap-motion/vue/motion";
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
void h(ModalDialog, { open: false });
void useCarouselWindow(ids, ref<MediaId>("overview"), {
  mountBefore: 1,
  mountAfter: 1,
  preloadBefore: 2,
  preloadAfter: 2,
});
void useCarouselContext<MediaId>;
void useCarouselMotion<MediaId>;
void useSnapMotion<MediaId>;
void createMotionDriver;
const closeReason: CloseReason = "programmatic";
void closeReason;
const galleryItems = [
  {
    id: "preview",
    title: "Preview",
    alt: "Preview media",
    previewSrc: "/preview.jpg",
    width: 1_600,
    height: 1_000,
  },
] as const satisfies readonly MediaGalleryItem[];
void h(MediaGalleryDialog, { items: galleryItems, open: false });
void createEnglishMediaGalleryMessages({ closeGallery: "Sluit galerij" });
const mediaCloseReason: MediaGalleryCloseReason = "backdrop";
const mediaNavigationReason: MediaGalleryNavigationReason = "swipe";
void mediaCloseReason;
void mediaNavigationReason;

// @ts-expect-error Semantic IDs are strings.
createFixedStageGeometry({ itemIds: [1, 2], viewportSize: 800 });
createFixedStageGeometry({ itemIds: [] as const, viewportSize: 800 });
