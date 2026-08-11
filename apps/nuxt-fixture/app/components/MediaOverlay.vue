<script setup lang="ts">
import type { ActiveIdRequestDetails } from "@snap-motion/vue";
import type { MediaGalleryOpenRequestDetails } from "@snap-motion/vue/media-gallery";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";

const fixturePreview =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'%3E%3Crect width='1600' height='1000' fill='%23d9d5cd'/%3E%3C/svg%3E";
const media = [
  {
    id: "overview",
    title: "Project overview",
    alt: "Project overview fixture",
    previewSrc: fixturePreview,
    width: 1_600,
    height: 1_000,
  },
  {
    id: "system",
    title: "System detail",
    alt: "System detail fixture",
    previewSrc: fixturePreview,
    width: 1_600,
    height: 1_000,
  },
  {
    id: "outcome",
    title: "Measured outcome",
    alt: "Measured outcome fixture",
    previewSrc: fixturePreview,
    width: 1_600,
    height: 1_000,
  },
] as const;
type MediaId = (typeof media)[number]["id"];

defineProps<{ activeId: MediaId; open: boolean }>();
const emit = defineEmits<{
  activeIdRequest: [id: MediaId | undefined, details: ActiveIdRequestDetails];
  openRequest: [open: false, details: MediaGalleryOpenRequestDetails<MediaId>];
  settled: [id: MediaId];
}>();

function onActiveIdRequest(id: MediaId | undefined, details: ActiveIdRequestDetails) {
  emit("activeIdRequest", id, details);
}

function onOpenRequest(open: false, details: MediaGalleryOpenRequestDetails<MediaId>) {
  emit("openRequest", open, details);
}

function onSettled(id: MediaId) {
  emit("settled", id);
}
</script>

<template>
  <MediaGalleryDialog
    :active-id="activeId"
    :items="media"
    :open="open"
    @active-id-request="onActiveIdRequest"
    @open-request="onOpenRequest"
    @settled="onSettled"
  />
</template>
