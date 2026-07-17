<script setup lang="ts">
import {
  CarouselNext,
  CarouselPrevious,
  CarouselRoot,
  CarouselSlide,
  CarouselStatus,
  CarouselTrack,
  CarouselViewport,
  ModalDialog,
  type CloseReason,
  type NavigationReason,
} from "@snap-motion/vue";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const media = [
  { id: "overview", title: "Project overview" },
  { id: "system", title: "System detail" },
  { id: "outcome", title: "Measured outcome" },
] as const;
type MediaId = (typeof media)[number]["id"];

const route = useRoute();
const router = useRouter();
const opener = ref<HTMLButtonElement>();
const basePath = computed(() => `/work/${String(route.params.slug ?? "factif")}`);
const routeMediaId = computed(() => {
  const candidate = String(route.params.mediaId ?? "");
  return media.some((item) => item.id === candidate) ? (candidate as MediaId) : undefined;
});
const open = computed(() => routeMediaId.value !== undefined);
const activeId = computed(() => routeMediaId.value ?? media[0].id);

function openMedia() {
  void router.push(`${basePath.value}/media/${media[0].id}`);
}

function requestActiveId(id: MediaId, _reason: NavigationReason) {
  void router.replace(`${basePath.value}/media/${id}`);
}

function requestClose(_reason: CloseReason) {
  const historyBack = window.history.state.back as string | null | undefined;
  if (historyBack === basePath.value) router.back();
  else void router.replace(basePath.value);
}
</script>

<template>
  <main>
    <article>
      <p>Vue Router controlled fixture</p>
      <h1>Factif case study</h1>
      <button ref="opener" type="button" @click="openMedia">Open media</button>
    </article>

    <ModalDialog :focus-return="{ opener }" :open="open" @request-close="requestClose">
      <template #title>{{ media.find((item) => item.id === activeId)?.title }}</template>
      <CarouselRoot
        :active-id="activeId"
        :ids="media.map((item) => item.id)"
        label="Case study media"
        @request-active-id="requestActiveId"
      >
        <CarouselPrevious />
        <CarouselViewport>
          <CarouselTrack>
            <CarouselSlide
              v-for="(item, index) in media"
              :id="item.id"
              :key="item.id"
              :label="`${item.title}, ${index + 1} of ${media.length}`"
            >
              <figure>
                <div class="media-block" />
                <figcaption>{{ item.title }}</figcaption>
              </figure>
            </CarouselSlide>
          </CarouselTrack>
        </CarouselViewport>
        <CarouselNext />
        <CarouselStatus />
      </CarouselRoot>
    </ModalDialog>
  </main>
</template>

<style>
body {
  margin: 0;
  font: 1rem/1.5 system-ui;
}
main {
  max-inline-size: 60rem;
  padding: 2rem;
  margin: auto;
}
.snap-motion-dialog {
  inline-size: min(90vw, 60rem);
}
.snap-motion-carousel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}
.snap-motion-carousel-viewport {
  overflow: hidden;
}
.snap-motion-carousel-track {
  display: flex;
}
.snap-motion-carousel-slide {
  flex: 0 0 100%;
}
.media-block {
  block-size: 20rem;
  background: #ddd;
}
button {
  min-block-size: 44px;
}
</style>
