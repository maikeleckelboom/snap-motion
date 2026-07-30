<script setup lang="ts">
import { MediaGalleryDialog } from "@snap-motion/vue/media-gallery";

const mediaGalleryItems = [
  {
    id: "nuxt",
    title: "Nuxt media gallery fixture",
    alt: "Nuxt fixture preview",
    previewSrc: "/fixture-preview.jpg",
    width: 1_600,
    height: 1_000,
  },
];
</script>

<template>
  <NuxtPage />
  <MediaGalleryDialog :items="mediaGalleryItems" :open="false" />
</template>
