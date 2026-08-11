<script setup lang="ts">
import type { ActiveIdRequestDetails } from "@snap-motion/vue";
import type { MediaGalleryOpenRequestDetails } from "@snap-motion/vue/media-gallery";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";

const media = [
  {
    id: "overview",
    title: "Project overview",
    alt: "Project overview fixture",
    previewSrc: "/fixture-preview.jpg",
    width: 1_600,
    height: 1_000,
  },
  {
    id: "system",
    title: "System detail",
    alt: "System detail fixture",
    previewSrc: "/fixture-preview.jpg",
    width: 1_600,
    height: 1_000,
  },
  {
    id: "outcome",
    title: "Measured outcome",
    alt: "Measured outcome fixture",
    previewSrc: "/fixture-preview.jpg",
    width: 1_600,
    height: 1_000,
  },
] as const;
type MediaId = (typeof media)[number]["id"];

defineProps<{ activeId: MediaId; open: boolean }>();
const emit = defineEmits<{
  activeIdRequest: [id: MediaId | undefined, details: ActiveIdRequestDetails];
  openRequest: [open: false, details: MediaGalleryOpenRequestDetails<MediaId>];
}>();

function onActiveIdRequest(id: MediaId | undefined, details: ActiveIdRequestDetails) {
  emit("activeIdRequest", id, details);
}

function onOpenRequest(open: false, details: MediaGalleryOpenRequestDetails<MediaId>) {
  emit("openRequest", open, details);
}
</script>

<template>
  <MediaGalleryDialog
    :active-id="activeId"
    :items="media"
    :open="open"
    @active-id-request="onActiveIdRequest"
    @open-request="onOpenRequest"
  />
</template>
