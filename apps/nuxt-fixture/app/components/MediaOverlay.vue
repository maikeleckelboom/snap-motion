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

const props = defineProps<{ activeId: string; open: boolean }>();
const emit = defineEmits<{
  requestActiveId: [id: string, reason: NavigationReason];
  requestClose: [reason: CloseReason];
}>();
const media = [
  { id: "overview", title: "Project overview" },
  { id: "system", title: "System detail" },
  { id: "outcome", title: "Measured outcome" },
];

function updateActiveId(id: string) {
  emit("requestActiveId", id, "route");
}
</script>

<template>
  <ModalDialog :open="open" @request-close="emit('requestClose', $event)">
    <template #title>{{ media.find((item) => item.id === props.activeId)?.title }}</template>
    <CarouselRoot
      :active-id="props.activeId"
      :ids="media.map((item) => item.id)"
      label="Case study media"
      @update:active-id="updateActiveId"
    >
      <CarouselPrevious />
      <CarouselViewport>
        <CarouselTrack>
          <CarouselSlide
            v-for="(item, index) in media"
            :id="item.id"
            :key="item.id"
            :label="`${item.title}, ${index + 1} of ${media.length}`"
            ><p>{{ item.title }}</p></CarouselSlide
          >
        </CarouselTrack>
      </CarouselViewport>
      <CarouselNext />
      <CarouselStatus />
    </CarouselRoot>
  </ModalDialog>
</template>

<style>
.snap-motion-carousel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
}
.snap-motion-carousel-viewport {
  overflow: hidden;
}
.snap-motion-carousel-track {
  display: flex;
}
.snap-motion-carousel-slide {
  flex: 0 0 100%;
  min-block-size: 20rem;
}
</style>
