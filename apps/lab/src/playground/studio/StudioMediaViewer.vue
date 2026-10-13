<script setup lang="ts">
import { ModalDialog, type FocusReturnOptions } from "@snap-motion/vue/dialog";
import { computed } from "vue";

import { useStudio } from "./studio-context";

/**
 * The photo a tap opens: a native modal dialog from the package's `ModalDialog`, which owns showing
 * the dialog, the focus move into it, scroll and inert handling of the page behind, and handing focus
 * back to the surface that was used. The Studio only supplies the content and decides when it opens.
 *
 * It is deliberately one photo. The point of the Studio is how the browsing surface behaves, and what
 * a tap opens only has to be a believable, correct modal: it does not browse, and it has no motion of
 * its own to compare.
 */
const props = defineProps<{
  focusReturn: FocusReturnOptions;
  open: boolean;
}>();
const emit = defineEmits<{
  /** The visitor asked to close it: Escape, the close control or the backdrop. */
  requestClose: [];
  /** The native dialog finished closing. */
  closed: [];
}>();

const { media, model } = useStudio();
const item = computed(() => media.find(({ id }) => id === model.mediaId.value));
const position = computed(() => {
  const index = media.findIndex(({ id }) => id === model.mediaId.value);
  return index < 0 ? "" : `${index + 1} of ${media.length}`;
});

function onBackdropClick(event: MouseEvent) {
  // A click on the dialog element itself, outside its content, is a click on the backdrop.
  if (event.target === event.currentTarget) emit("requestClose");
}
</script>

<template>
  <ModalDialog
    class="studio-viewer"
    close-label="Close photo"
    data-testid="studio-media-viewer"
    :focus-return="props.focusReturn"
    initial-focus="close"
    :open="props.open"
    @click="onBackdropClick"
    @closed="emit('closed')"
    @open-request="emit('requestClose')"
  >
    <template #title>
      <span class="viewer-title" data-testid="studio-media-title">{{ item?.title }}</span>
    </template>
    <template #close>
      <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
        <path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </template>

    <figure v-if="item" class="viewer-figure">
      <img
        :alt="item.alt"
        class="viewer-photo"
        data-testid="studio-media-photo"
        :height="item.height"
        :src="item.src"
        :width="item.width"
      />
      <figcaption class="viewer-caption">
        <span class="viewer-sender">{{ item.sender }} · {{ item.sentAt }}</span>
        <span class="viewer-message">“{{ item.message }}”</span>
        <span class="viewer-position tabular">{{ position }}</span>
      </figcaption>
    </figure>
  </ModalDialog>
</template>

<style>
/* Unscoped: the dialog renders in the top layer, and the class sits on the package's own element. */
.studio-viewer {
  inline-size: min(46rem, calc(100vw - 1.5rem));
  padding: 0;
  border: 0;
  border-radius: 1rem;
  background: var(--pg-ink, #15140f);
  color: #f4f2ec;
  overflow: hidden;
}

/* The page behind a modal does not scroll. The gutter is already reserved, so nothing shifts. */
html:has(.studio-viewer[open]),
html:has(.studio-viewer[open]) body {
  overflow: hidden;
}

.studio-viewer::backdrop {
  background: rgb(21 20 15 / 0.72);
}

.studio-viewer .snap-motion-dialog-content {
  display: grid;
  gap: 0;
}

.studio-viewer .snap-motion-dialog-title {
  position: absolute;
  z-index: 1;
  inset-block-start: 0;
  inset-inline: 0;
  padding: 0.85rem 4rem 0.85rem 1rem;
  background: linear-gradient(to bottom, rgb(21 20 15 / 0.7), transparent);
  font-size: 0.95rem;
  font-weight: 650;
  pointer-events: none;
}

.studio-viewer .snap-motion-dialog-title:focus {
  outline: none;
}

.studio-viewer .snap-motion-dialog-close {
  position: absolute;
  z-index: 2;
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
  display: grid;
  place-items: center;
  border: 1px solid rgb(244 242 236 / 0.5);
  border-radius: 50%;
  background: rgb(21 20 15 / 0.55);
  color: #f4f2ec;
}

.studio-viewer .snap-motion-dialog-close:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.viewer-figure {
  display: grid;
  margin: 0;
}

.viewer-photo {
  display: block;
  inline-size: 100%;
  block-size: auto;
  max-block-size: min(70vh, 40rem);
  object-fit: contain;
  background: #0b0a07;
}

.viewer-caption {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.15rem 1rem;
  padding: 0.8rem 1rem 1rem;
  font-size: 0.85rem;
}

.viewer-sender {
  color: #cfcabc;
}

.viewer-message {
  grid-column: 1;
  font-size: 0.95rem;
}

.viewer-position {
  grid-column: 2;
  grid-row: 1;
  color: #cfcabc;
  font-size: 0.78rem;
}
</style>
