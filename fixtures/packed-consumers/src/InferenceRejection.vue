<script setup lang="ts">
/**
 * The other half of the inference proof: what the packed surfaces must *refuse*.
 *
 * Every expectation below is an ordinary template use with one thing wrong about it. If component
 * generics widened to `string`, or slot state degraded to `any`, these would start compiling and
 * `vue-tsc` would fail this file — which is exactly the regression that "it builds with Vite" does
 * not catch.
 */
import { Coverflow } from "@snap-motion/vue/coverflow";
import { MediaGalleryDialog, type MediaGalleryItem } from "@snap-motion/vue/media-gallery";
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { ref } from "vue";

const screens = [
  { id: "overview", title: "Overview" },
  { id: "system", title: "System" },
] as const;

interface Chapter {
  id: "intro" | "outro";
  title: string;
}
const chapters: Chapter[] = [
  { id: "intro", title: "Intro" },
  { id: "outro", title: "Outro" },
];

/** A different domain's ID union, which must never satisfy this deck. */
const foreignId = ref<"chapter-one" | "chapter-two">("chapter-one");

const galleryItems = [
  {
    id: "wide",
    title: "Wide",
    alt: "Wide",
    previewSrc: "/wide.jpg",
    width: 1_600,
    height: 900,
  },
  {
    id: "detail",
    title: "Detail",
    alt: "Detail",
    previewSrc: "/detail.jpg",
    width: 1_200,
    height: 1_200,
  },
] as const satisfies readonly MediaGalleryItem[];
const foreignGalleryId = ref<"other-a" | "other-b" | undefined>("other-a");

function chapterTitle(chapter: Chapter): string {
  return chapter.title;
}
</script>

<template>
  <main>
    <!-- @vue-expect-error a semantic ID from another domain is not one of these items -->
    <StackedDeck :items="screens" active-id="nope" />

    <!-- @vue-expect-error v-model must round-trip this collection's own ID union -->
    <StackedDeck v-model:active-id="foreignId" :items="screens" />

    <!-- @vue-expect-error an item without a semantic ID is not an item -->
    <StackedDeck :items="[{ title: 'No ID' }]" />

    <!-- @vue-expect-error the label accessor receives this collection's item, not another's -->
    <Coverflow :items="chapters" :item-label="(chapter) => chapter.missingProperty" />

    <Coverflow :items="chapters">
      <template #card="card">
        <p>{{ chapterTitle(card.item) }}</p>
        <!-- @vue-expect-error slot state is typed, so an unknown property is a compile error -->
        <p :data-missing="card.item.missingProperty" />
      </template>
    </Coverflow>

    <!-- @vue-expect-error a gallery active ID must come from its item collection -->
    <MediaGalleryDialog :items="galleryItems" :open="false" active-id="missing" />

    <!-- @vue-expect-error gallery v-model must retain the collection's exact ID union -->
    <MediaGalleryDialog v-model:active-id="foreignGalleryId" :items="galleryItems" :open="false" />
  </main>
</template>
