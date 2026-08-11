<script setup lang="ts">
/**
 * Ordinary template usage of the packed high-level surfaces, checked by `vue-tsc`.
 *
 * Nothing here supplies a component generic argument and nothing here casts. Every type the
 * consumer relies on has to come from `items` alone: the domain item type, the semantic ID union,
 * the `itemLabel` callback parameter, the `#card` slot state, and the `v-model` payload. Each is
 * consumed by a function that accepts only the exact domain type, so a widened inference — the
 * failure this file exists to catch — is a compile error rather than a silent `any`.
 */
import {
  Coverflow,
  type CoverflowCardPresentation,
  type CoverflowHandle,
} from "@snap-motion/vue/coverflow";
import { ModalDialog, type CloseReason } from "@snap-motion/vue/dialog";
import {
  MediaGalleryDialog,
  type MediaGalleryHandle,
  type MediaGalleryItem,
} from "@snap-motion/vue/media-gallery";
import { Sheet } from "@snap-motion/vue/sheet";
import {
  StackedDeck,
  type StackedDeckHandle,
  type StackedDeckPose,
} from "@snap-motion/vue/stacked-deck";
import { ref } from "vue";

// A readonly `as const` collection: the shape a consumer writes when the items are static.
const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
  { id: "outcome", title: "Outcome" },
] as const;
type Screen = (typeof screens)[number];
type ScreenId = Screen["id"];

// A normal interface and a mutable array: the shape a consumer writes when the items are data.
interface Chapter {
  id: "intro" | "body" | "outro";
  title: string;
  words: number;
}
type ChapterId = Chapter["id"];
const chapters: Chapter[] = [
  { id: "intro", title: "Intro", words: 120 },
  { id: "body", title: "Body", words: 900 },
  { id: "outro", title: "Outro", words: 80 },
];

const activeScreen = ref<ScreenId>("system");
const activeChapter = ref<ChapterId>("body");

const galleryItems = [
  {
    id: "wide",
    title: "Wide view",
    alt: "Wide project view",
    previewSrc: "/wide.jpg",
    width: 1_600,
    height: 900,
  },
  {
    id: "detail",
    title: "Detail view",
    alt: "Project detail",
    previewSrc: "/detail.jpg",
    width: 1_200,
    height: 1_200,
  },
] as const satisfies readonly MediaGalleryItem[];
type GalleryId = (typeof galleryItems)[number]["id"];

interface MutableMedia extends MediaGalleryItem {
  id: "draft" | "final";
  credit: string;
}
const mutableGalleryItems: MutableMedia[] = [
  {
    id: "draft",
    title: "Draft",
    alt: "Draft render",
    previewSrc: "/draft.jpg",
    width: 1_200,
    height: 800,
    credit: "Studio",
  },
  {
    id: "final",
    title: "Final",
    alt: "Final render",
    previewSrc: "/final.jpg",
    width: 1_200,
    height: 800,
    credit: "Studio",
  },
];
type MutableMediaId = MutableMedia["id"];

const galleryOpen = ref(false);
const activeGalleryItem = ref<GalleryId>("wide");
const activeMutableMedia = ref<MutableMediaId>("draft");

const deck = ref<StackedDeckHandle<ScreenId>>();
const rail = ref<CoverflowHandle<ChapterId>>();
const gallery = ref<MediaGalleryHandle<GalleryId>>();
interface OverlayCloseHandle {
  requestClose(reason?: CloseReason): void;
}
const modal = ref<OverlayCloseHandle>();
const sheet = ref<OverlayCloseHandle>();

/** Accepts the exact domain item, so a widened `TItem` fails to compile here. */
function screenTitle(screen: Screen): string {
  return screen.title;
}
function chapterSummary(chapter: Chapter): string {
  return `${chapter.title} (${chapter.words})`;
}
/** Accepts the exact ID union, so a widened `TId` fails to compile here. */
function onScreenSelected(id: ScreenId): void {
  activeScreen.value = id;
}
function onChapterSelected(id: ChapterId | undefined): void {
  if (id !== undefined) activeChapter.value = id;
}
function onGalleryRequested(id: GalleryId | undefined): void {
  if (id !== undefined) activeGalleryItem.value = id;
}
function onGallerySettled(id: GalleryId): void {
  activeGalleryItem.value = id;
}
function poseOpacity(pose: StackedDeckPose): number {
  return pose.opacity;
}
function presentationDepth(presentation: CoverflowCardPresentation): number {
  return presentation.depth;
}

function driveHandles(): void {
  // Handle methods are keyed by the same inferred ID union.
  deck.value?.navigateTo("outcome");
  deck.value?.synchronizeTo("overview");
  rail.value?.navigateTo("outro");
  const phase: string = deck.value?.diagnostics.phase ?? "idle";
  const settled: ChapterId | undefined = rail.value?.settledId;
  gallery.value?.navigateTo("detail");
  const galleryNextAccepted: boolean | undefined = gallery.value?.next();
  const galleryPreviousAccepted: boolean | undefined = gallery.value?.previous();
  gallery.value?.requestClose();
  modal.value?.requestClose();
  sheet.value?.requestClose();
  const gallerySemanticId: GalleryId | undefined = gallery.value?.activeId;
  const gallerySettledId: GalleryId | undefined = gallery.value?.settledId;
  void phase;
  void settled;
  void gallerySemanticId;
  void gallerySettledId;
  void galleryNextAccepted;
  void galleryPreviousAccepted;
}
void driveHandles;
</script>

<template>
  <main>
    <!-- Controlled: `v-model:active-id` round-trips the inferred ID union. -->
    <StackedDeck
      ref="deck"
      v-model:active-id="activeScreen"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Project screens"
      reduced-motion-override
      @settled="onScreenSelected"
    >
      <template #card="card">
        <p>{{ screenTitle(card.item) }} · {{ poseOpacity(card.pose) }} · {{ card.role }}</p>
      </template>
    </StackedDeck>

    <!-- Uncontrolled: with no `activeId` at all, inference is still driven by `items`. -->
    <StackedDeck :items="screens" :item-label="(screen, index) => `${index}: ${screen.title}`">
      <template #card="card">
        <p>{{ screenTitle(card.item) }}</p>
      </template>
    </StackedDeck>

    <Coverflow
      ref="rail"
      v-model:active-id="activeChapter"
      :items="chapters"
      :item-label="(chapter) => chapter.title"
      label="Chapters"
      reduced-motion-override
      @active-id-request="onChapterSelected"
    >
      <template #card="card">
        <p>{{ chapterSummary(card.item) }} · {{ presentationDepth(card.presentation) }}</p>
      </template>
    </Coverflow>

    <Coverflow :items="chapters">
      <template #card="card">
        <p>{{ chapterSummary(card.item) }}</p>
      </template>
    </Coverflow>

    <MediaGalleryDialog
      ref="gallery"
      v-model:open="galleryOpen"
      v-model:active-id="activeGalleryItem"
      :items="galleryItems"
      @active-id-request="onGalleryRequested"
      @settled="onGallerySettled"
    />

    <ModalDialog ref="modal" :open="false">
      <template #title>Modal inference</template>
    </ModalDialog>

    <Sheet ref="sheet" :open="false">
      <template #title>Sheet inference</template>
    </Sheet>

    <MediaGalleryDialog
      :open="false"
      v-model:active-id="activeMutableMedia"
      :items="mutableGalleryItems"
    />
  </main>
</template>
