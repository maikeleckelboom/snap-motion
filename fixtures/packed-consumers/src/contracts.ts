import {
  CoverflowModel,
  SnapController,
  STACKED_DECK_ANCHOR_SKIP,
  StackedDeckModel,
  createFixedStageGeometry,
  resolveCoverflowTuning,
  type AnimationDriver,
} from "@snap-motion/core";
import { Sheet as RootSheet } from "@snap-motion/vue";
import {
  CarouselPaginationItem,
  CarouselRoot,
  createFixedStageCarouselGeometryStrategy,
  useCarouselWindow,
  useCarouselContext,
  useCarouselMotion,
} from "@snap-motion/vue/carousel";
import { Coverflow, useCoverflowMotion, type CoverflowHandle } from "@snap-motion/vue/coverflow";
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
import { createMotionDriver, useBoundedSpringDriver, useSnapMotion } from "@snap-motion/vue/motion";
import { Sheet, sheetSnapVisibleExtent, type SheetSnapPoint } from "@snap-motion/vue/sheet";
import {
  StackedDeck,
  useStackedDeckMotion,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
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
  {
    id: "peek",
    label: "Peek",
    resolveVisibleExtent: sheetSnapVisibleExtent.viewportFraction(0.25),
  },
  {
    id: "content",
    label: "Content",
    resolveVisibleExtent: sheetSnapVisibleExtent.intrinsicContent,
  },
] as const satisfies readonly SheetSnapPoint<"peek" | "content">[];
void sheetPoints;

const messages: SnapMotionMessages = createEnglishSnapMotionMessages({
  nextItem: "Volgende",
});
void messages;
void createFixedStageCarouselGeometryStrategy<MediaId>();
void h(CarouselRoot<MediaId>, { activeId: "overview", ids });
void h(CarouselPaginationItem<MediaId>, { id: "system" });
void h(ModalDialog, { open: false });
void h(Sheet, { open: false, side: "right" });
void h(RootSheet, { open: false, side: "bottom" });
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

// The anti-glue contract: typed domain items, inferred slot state, and no casts anywhere.
const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;
type ScreenId = (typeof screens)[number]["id"];
type Screen = (typeof screens)[number];

const deckHandle = ref<StackedDeckHandle<ScreenId>>();
const railHandle = ref<CoverflowHandle<ScreenId>>();
void h(StackedDeck<ScreenId, Screen>, {
  items: screens,
  activeId: "system",
  itemLabel: (screen) => screen.title,
  label: "Project screens",
});
void h(Coverflow<ScreenId, Screen>, {
  items: screens,
  activeId: "system",
  itemLabel: (screen) => screen.title,
});
void deckHandle.value?.requestId("outcome");
void railHandle.value?.synchronizeId("overview");
void useStackedDeckMotion<ScreenId>;
void useCoverflowMotion<ScreenId>;
void useBoundedSpringDriver;

const deckModel = new StackedDeckModel({ itemCount: screens.length, initialIndex: 1 });
void deckModel.resolveAbsoluteCommand(0, { owned: false, atRest: true });
const railModel = new CoverflowModel({ itemCount: screens.length });
void railModel.resolveRelativeCommand(1, { owned: false });
void resolveCoverflowTuning({ stageWidth: 1_120 });
void STACKED_DECK_ANCHOR_SKIP;

// @ts-expect-error A stacked deck item must carry the semantic ID it is keyed by.
void h(StackedDeck, { items: [{ title: "No ID" }] });
