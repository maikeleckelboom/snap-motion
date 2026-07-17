<script setup lang="ts">
import type { CloseReason, NavigationReason } from "@snap-motion/vue";

const route = useRoute();
const router = useRouter();
const mediaIds = ["overview", "system", "outcome"] as const;
const activeId = computed(() => {
  const candidate = String(route.query.media ?? "");
  return mediaIds.includes(candidate as (typeof mediaIds)[number]) ? candidate : mediaIds[0];
});
const open = computed(() => typeof route.query.media === "string");

function openMedia() {
  void router.push({ query: { ...route.query, media: mediaIds[0] } });
}
function requestActiveId(id: string, _reason: NavigationReason) {
  void router.replace({ query: { ...route.query, media: id } });
}
function requestClose(_reason: CloseReason) {
  const { media: _media, ...query } = route.query;
  void router.replace({ query });
}
</script>

<template>
  <main>
    <h1>{{ route.params.slug }} case study</h1>
    <button type="button" @click="openMedia">Open media overlay</button>
    <MediaOverlay
      :active-id="activeId"
      :open="open"
      @request-active-id="requestActiveId"
      @request-close="requestClose"
    />
  </main>
</template>
