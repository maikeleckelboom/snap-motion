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
  type ActiveIdRequestDetails,
  type OpenRequestDetails,
} from "@snap-motion/vue";
import { useEventListener } from "@vueuse/core";
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

function acceptActiveId(id: MediaId) {
  void router.replace(`${basePath.value}/media/${id}`);
}

function acceptClose() {
  const historyBack = window.history.state.back as string | null | undefined;
  if (historyBack === basePath.value) router.back();
  else void router.replace(basePath.value);
}

function changeActiveId(id: MediaId, _details: ActiveIdRequestDetails) {
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
    <article>
      <p>Vue Router controlled fixture</p>
      <h1>Factif case study</h1>
      <button ref="opener" type="button" @click="openMedia">Open media</button>
      <fieldset>
        <legend>Route request policy</legend>
        <button type="button" @click="requestPolicy = 'accept'">Accept requests</button>
        <button type="button" @click="requestPolicy = 'delay'">Delay requests</button>
        <button type="button" @click="requestPolicy = 'refuse'">Refuse requests</button>
        <button
          :disabled="pendingRequest === undefined"
          type="button"
          @click="resolvePendingRequest"
        >
          Resolve pending request
        </button>
      </fieldset>
      <output
        data-testid="router-authority"
        :data-active-id="activeId"
        :data-policy="requestPolicy"
      >
        {{ activeId }}
      </output>
    </article>

    <ModalDialog :focus-return="{ opener }" :open="open" @open-request="changeOpen">
      <template #title>{{ media.find((item) => item.id === activeId)?.title }}</template>
      <CarouselRoot
        :active-id="activeId"
        :ids="media.map((item) => item.id)"
        label="Case study media"
        @active-id-request="changeActiveId"
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
