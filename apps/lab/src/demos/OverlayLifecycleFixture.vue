<script setup lang="ts">
import { ModalDialog } from "@snap-motion/vue/dialog";
import { MediaGalleryDialog, type MediaGalleryItem } from "@snap-motion/vue/media-gallery";
import { Sheet } from "@snap-motion/vue/sheet";
import { useEventListener } from "@vueuse/core";
import { nextTick, ref } from "vue";

const galleryItems: readonly MediaGalleryItem[] = [
  {
    id: "proof",
    title: "Lifecycle proof",
    alt: "A neutral lifecycle proof frame",
    previewSrc:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Crect width='800' height='500' fill='%23d9d5cd'/%3E%3C/svg%3E",
    width: 800,
    height: 500,
  },
];

const modalOpen = ref(false);
const sheetOpen = ref(false);
const galleryOpen = ref(false);
const modalOpener = ref<HTMLButtonElement>();
const sheetOpener = ref<HTMLButtonElement>();
const galleryOpener = ref<HTMLButtonElement>();
const modalOpened = ref(0);
const modalClosed = ref(0);
const sheetOpened = ref(0);
const sheetClosed = ref(0);
const galleryOpened = ref(0);
const galleryClosed = ref(0);

function overlayState(id: "gallery" | "modal" | "sheet") {
  return id === "gallery" ? galleryOpen : id === "modal" ? modalOpen : sheetOpen;
}

async function reopen(id: "gallery" | "modal" | "sheet") {
  const open = overlayState(id);
  open.value = false;
  await nextTick();
  open.value = true;
  await nextTick();
}

async function reopenAndClose(id: "gallery" | "modal" | "sheet") {
  await reopen(id);
  const open = overlayState(id);
  open.value = false;
  await nextTick();
}

useEventListener(window, "snap-motion-overlay-lifecycle", (event) => {
  const detail = (
    event as CustomEvent<{ action: "race" | "reopen"; id: "gallery" | "modal" | "sheet" }>
  ).detail;
  if (detail.action === "reopen") void reopen(detail.id);
  else void reopenAndClose(detail.id);
});
</script>

<template>
  <section class="overlay-lifecycle-fixture" data-testid="overlay-lifecycle-fixture">
    <p>
      The controls run controlled false/true and false/true/false sequences across Vue flushes so
      queued native close events can arrive after a newer lifecycle owns the overlay.
    </p>

    <article>
      <h3>Modal dialog</h3>
      <button ref="modalOpener" data-testid="modal-open" type="button" @click="modalOpen = true">
        Open modal
      </button>
      <button data-testid="modal-reopen" type="button" @click="reopen('modal')">
        Reopen modal
      </button>
      <button data-testid="modal-race" type="button" @click="reopenAndClose('modal')">
        Reopen and close modal
      </button>
      <output
        :data-closed="modalClosed"
        :data-open="modalOpen"
        :data-opened="modalOpened"
        data-testid="modal-lifecycle"
      />
    </article>

    <article>
      <h3>Sheet</h3>
      <button ref="sheetOpener" data-testid="sheet-open" type="button" @click="sheetOpen = true">
        Open sheet
      </button>
      <button data-testid="sheet-reopen" type="button" @click="reopen('sheet')">
        Reopen sheet
      </button>
      <button data-testid="sheet-race" type="button" @click="reopenAndClose('sheet')">
        Reopen and close sheet
      </button>
      <output
        :data-closed="sheetClosed"
        :data-open="sheetOpen"
        :data-opened="sheetOpened"
        data-testid="sheet-lifecycle"
      />
    </article>

    <article>
      <h3>Media gallery</h3>
      <button
        ref="galleryOpener"
        data-testid="gallery-open"
        type="button"
        @click="galleryOpen = true"
      >
        Open gallery
      </button>
      <button data-testid="gallery-reopen" type="button" @click="reopen('gallery')">
        Reopen gallery
      </button>
      <button data-testid="gallery-race" type="button" @click="reopenAndClose('gallery')">
        Reopen and close gallery
      </button>
      <output
        :data-closed="galleryClosed"
        :data-open="galleryOpen"
        :data-opened="galleryOpened"
        data-testid="gallery-lifecycle"
      />
    </article>

    <ModalDialog
      :focus-return="{ opener: modalOpener }"
      :open="modalOpen"
      @closed="modalClosed += 1"
      @opened="modalOpened += 1"
      @update:open="modalOpen = $event"
    >
      <template #title>Modal lifecycle proof</template>
      <button type="button">Modal content action</button>
    </ModalDialog>

    <Sheet
      :focus-return="{ opener: sheetOpener }"
      :open="sheetOpen"
      :reduced-motion-override="true"
      @closed="sheetClosed += 1"
      @opened="sheetOpened += 1"
      @update:open="sheetOpen = $event"
    >
      <template #title>Sheet lifecycle proof</template>
      <button type="button">Sheet content action</button>
    </Sheet>

    <MediaGalleryDialog
      :focus-return="{ opener: galleryOpener }"
      :items="galleryItems"
      :open="galleryOpen"
      :reduced-motion-override="true"
      @closed="galleryClosed += 1"
      @opened="galleryOpened += 1"
      @update:open="galleryOpen = $event"
    />
  </section>
</template>

<style scoped>
.overlay-lifecycle-fixture {
  display: grid;
  gap: 1rem;
}

.overlay-lifecycle-fixture > p {
  max-inline-size: 52rem;
  margin: 0;
}

article {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid var(--line);
}

h3 {
  flex-basis: 100%;
  margin: 0;
}
</style>
