<script setup lang="ts">
import { MediaGalleryDialog, type MediaGalleryItem } from "@snap-motion/vue/media-gallery";
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";

const previewSource =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Crect width='800' height='500' fill='%23d9d5cd'/%3E%3C/svg%3E";
const fullSource =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000'%3E%3Crect width='1600' height='1000' fill='%2389a7c2'/%3E%3C/svg%3E";
const items: readonly MediaGalleryItem[] = [
  {
    id: "realm-proof",
    title: "Realm proof",
    alt: "A neutral cross-realm image proof",
    preview: { src: previewSource, width: 800, height: 500 },
    full: { src: fullSource, width: 1_600, height: 1_000 },
  },
];

const iframe = ref<HTMLIFrameElement>();
const foreignOpener = shallowRef<HTMLButtonElement>();
const adoptedOpener = shallowRef<HTMLButtonElement>();
const teleportTarget = shallowRef<HTMLElement>();
const parentGalleryOpen = ref(false);
const adoptedGalleryOpen = ref(false);

function openParentGallery() {
  parentGalleryOpen.value = true;
}

function openAdoptedGallery() {
  adoptedGalleryOpen.value = true;
}

function clearRealm() {
  foreignOpener.value?.removeEventListener("click", openParentGallery);
  adoptedOpener.value?.removeEventListener("click", openAdoptedGallery);
  foreignOpener.value = undefined;
  adoptedOpener.value = undefined;
  teleportTarget.value = undefined;
}

function initializeRealm() {
  clearRealm();
  const foreignDocument = iframe.value?.contentDocument;
  if (!foreignDocument) return;
  foreignDocument.body.replaceChildren();

  const heading = foreignDocument.createElement("h2");
  heading.textContent = "Cross-realm overlay host";
  const parentOpener = foreignDocument.createElement("button");
  parentOpener.type = "button";
  parentOpener.dataset.testid = "realm-parent-opener";
  parentOpener.textContent = "Open parent Gallery";
  parentOpener.addEventListener("click", openParentGallery);
  const portalOpener = foreignDocument.createElement("button");
  portalOpener.type = "button";
  portalOpener.dataset.testid = "realm-adopted-opener";
  portalOpener.textContent = "Open adopted Gallery";
  portalOpener.addEventListener("click", openAdoptedGallery);
  const portal = foreignDocument.createElement("div");
  portal.dataset.testid = "realm-teleport-target";
  foreignDocument.body.append(heading, parentOpener, portalOpener, portal);

  foreignOpener.value = parentOpener;
  adoptedOpener.value = portalOpener;
  teleportTarget.value = portal;
}

onBeforeUnmount(clearRealm);
onMounted(() => void nextTick(initializeRealm));
</script>

<template>
  <section data-testid="realm-overlay-fixture">
    <p>
      The first Gallery returns focus to an iframe-realm opener. The second is created by the parent
      renderer and adopted into the iframe document so its focus and image events cross realms.
    </p>
    <iframe
      ref="iframe"
      data-testid="realm-frame"
      title="Cross-realm overlay fixture"
      @load="initializeRealm"
    />

    <MediaGalleryDialog
      :focus-return="{ opener: foreignOpener }"
      :items="items"
      :open="parentGalleryOpen"
      :reduced-motion-override="true"
      @update:open="parentGalleryOpen = $event"
    />

    <Teleport v-if="teleportTarget" :to="teleportTarget">
      <MediaGalleryDialog
        :focus-return="{ opener: adoptedOpener }"
        :items="items"
        :open="adoptedGalleryOpen"
        :reduced-motion-override="true"
        @update:open="adoptedGalleryOpen = $event"
      />
    </Teleport>
  </section>
</template>

<style scoped>
iframe {
  display: block;
  inline-size: min(100%, 48rem);
  min-block-size: 12rem;
  border: 1px solid var(--line);
}
</style>
