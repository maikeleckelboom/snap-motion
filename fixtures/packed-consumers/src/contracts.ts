import { Sheet as RootSheet } from "@snap-motion/vue";
import {
  CarouselPaginationItem,
  CarouselRoot,
  createFixedStageCarouselGeometryStrategy,
  useCarouselWindow,
  useCarouselContext,
  useCarouselMotion,
  type PublicCarouselContext,
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
declare const publicCarousel: PublicCarouselContext<MediaId>;
publicCarousel.navigate("overview");
publicCarousel.next();
// @ts-expect-error public navigation owns its programmatic provenance.
publicCarousel.navigate("overview", "drag");
// @ts-expect-error next is semantically fixed and cannot be relabelled.
publicCarousel.next("picker");
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

// The anti-glue contract: typed domain items, inferred slot state, and no casts anywhere.
const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;
type ScreenId = (typeof screens)[number]["id"];
const deckHandle = ref<StackedDeckHandle<ScreenId>>();
const railHandle = ref<CoverflowHandle<ScreenId>>();
// `h()` erases a generic component's type parameters down to their constraints, so these calls
// only certify that the render-function path accepts the props at all. Whether `items` alone still
// infers the consumer's own item type and semantic ID union is a *template* question, and it is
// answered by Inference.vue and InferenceRejection.vue under `vue-tsc`.
void h(StackedDeck, { items: screens, activeId: "system", label: "Project screens" });
void h(Coverflow, { items: screens, activeId: "system" });
void h(StackedDeck, { items: screens });
void deckHandle.value?.requestId("outcome");
void railHandle.value?.synchronizeId("overview");
// A product handle publishes read-only telemetry, never a controller to navigate around it with.
const deckPhase: string | undefined = deckHandle.value?.diagnostics.phase;
void deckPhase;
// @ts-expect-error the high-level handle deliberately exposes no raw motion surface.
void deckHandle.value?.motion;
// @ts-expect-error a semantic ID this collection does not contain is not a destination.
void deckHandle.value?.requestId("chapter-one");
void useStackedDeckMotion<ScreenId>;
void useCoverflowMotion<ScreenId>;
void useBoundedSpringDriver;

// The deck states its one-card invariant in the type system: the anchor skip it fixes is simply
// not a thing a consumer can pass, rather than a value it accepts and silently overwrites.
// @ts-expect-error the deck fixes its own anchor skip, so this is not part of its release policy.
void h(StackedDeck, { items: screens, releasePolicy: { maxAnchorSkip: 3 } });
// @ts-expect-error a product method names its own operation; a caller cannot relabel it.
void deckHandle.value?.next("drag");
// @ts-expect-error the same holds for an imperative request, which is always `programmatic`.
void railHandle.value?.requestId("system", "picker");

// @ts-expect-error A stacked deck item must carry the semantic ID it is keyed by.
void h(StackedDeck, { items: [{ title: "No ID" }] });
