<script setup lang="ts">
import type { ActiveIdChangeDetails } from "@snap-motion/vue";
import type { MediaGalleryOpenChangeDetails } from "@snap-motion/vue/media-gallery";
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";

defineProps<{ activeId: string; open: boolean }>();
const emit = defineEmits<{
  activeIdChange: [id: string | undefined, details: ActiveIdChangeDetails];
  openChange: [open: false, details: MediaGalleryOpenChangeDetails];
}>();
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
];

function onActiveIdChange(id: string | undefined, details: ActiveIdChangeDetails) {
  emit("activeIdChange", id, details);
}

function onOpenChange(open: false, details: MediaGalleryOpenChangeDetails) {
  emit("openChange", open, details);
}
</script>

<template>
  <MediaGalleryDialog
    :active-id="activeId"
    :items="media"
    :open="open"
    @active-id-change="onActiveIdChange"
    @open-change="onOpenChange"
  />
</template>
