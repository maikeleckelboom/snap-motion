<script setup lang="ts">
import type { ActiveIdRequestDetails, OpenRequestDetails } from "@snap-motion/vue";
import { useEventListener } from "@vueuse/core";

const route = useRoute();
const router = useRouter();
const mediaIds = ["overview", "system", "outcome"] as const;
type MediaId = (typeof mediaIds)[number];
type RequestPolicy = "accept" | "delay" | "refuse";
type PendingRequest =
  | { readonly kind: "active"; readonly id: MediaId }
  | { readonly kind: "close" };
const requestPolicy = ref<RequestPolicy>("accept");
const pendingRequest = ref<PendingRequest>();

declare global {
  interface WindowEventMap {
    "snap-motion:resolve-pending": Event;
  }
}
const activeId = computed<MediaId>(() => {
  const candidate = String(route.query.media ?? "");
  return mediaIds.includes(candidate as MediaId) ? (candidate as MediaId) : mediaIds[0];
});
const open = computed(() => typeof route.query.media === "string");

function openMedia() {
  void router.push({ query: { ...route.query, media: mediaIds[0] } });
}
function acceptActiveId(id: MediaId) {
  void router.replace({ query: { ...route.query, media: id } });
}
function acceptClose() {
  const { media: _media, ...query } = route.query;
  void router.replace({ query });
}
function changeActiveId(id: MediaId | undefined, _details: ActiveIdRequestDetails) {
  if (id === undefined) return;
  if (requestPolicy.value === "refuse") return;
  if (requestPolicy.value === "delay") {
    pendingRequest.value = { kind: "active", id };
    return;
  }
  acceptActiveId(id);
}
function changeOpen(_open: false, _details: OpenRequestDetails) {
  if (requestPolicy.value === "refuse") return;
  if (requestPolicy.value === "delay") {
    pendingRequest.value = { kind: "close" };
    return;
  }
  acceptClose();
}
function resolvePendingRequest() {
  const pending = pendingRequest.value;
  pendingRequest.value = undefined;
  if (pending?.kind === "active") acceptActiveId(pending.id);
  else if (pending?.kind === "close") acceptClose();
}

useEventListener("snap-motion:resolve-pending", resolvePendingRequest);
</script>

<template>
  <main>
    <h1>{{ route.params.slug }} case study</h1>
    <button type="button" @click="openMedia">Open media overlay</button>
    <fieldset>
      <legend>Route request policy</legend>
      <button type="button" @click="requestPolicy = 'accept'">Accept requests</button>
      <button type="button" @click="requestPolicy = 'delay'">Delay requests</button>
      <button type="button" @click="requestPolicy = 'refuse'">Refuse requests</button>
      <button :disabled="pendingRequest === undefined" type="button" @click="resolvePendingRequest">
        Resolve pending request
      </button>
    </fieldset>
    <output data-testid="nuxt-authority" :data-active-id="activeId" :data-policy="requestPolicy">
      {{ activeId }}
    </output>
    <MediaOverlay
      :active-id="activeId"
      :open="open"
      @active-id-request="changeActiveId"
      @open-request="changeOpen"
    />
  </main>
</template>
