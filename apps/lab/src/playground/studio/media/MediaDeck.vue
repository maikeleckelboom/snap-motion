<script setup lang="ts">
import {
  StackedDeck,
  type StackedDeckCardState,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
import { computed, ref } from "vue";

import { implementationProps, type CandidateBehavior } from "../candidates";
import type { MediaOpenRequest } from "./media-surface";
import type { SharedMediaItem } from "./shared-media";

/**
 * The stacked deck: the same photos, drawn as a pile with one in front, exchanged one at a time.
 *
 * It is the package's `StackedDeck` unchanged; this file only gives it the photos and the behaviour
 * under test. A tap on the front card is the package's own `activate`, which is how a deck asks to
 * open its current card.
 */
const props = defineProps<{
  behavior: CandidateBehavior;
  items: readonly SharedMediaItem[];
  label: string;
  reducedMotionOverride: boolean | undefined;
  startId: string;
}>();

const emit = defineEmits<{
  open: [request: MediaOpenRequest];
  /** The deck came to rest on a photo and its host agrees. */
  settled: [id: string];
}>();

const deck = ref<StackedDeckHandle<string>>();
const settings = computed(() => implementationProps(props.behavior));
const screenId = ref<string>(props.startId);

const root = computed(() => deck.value?.root);
const idle = computed(() => deck.value?.diagnostics.phase === "idle");

function onActivate(item: SharedMediaItem) {
  const handle = deck.value;
  emit("open", {
    id: item.id,
    source: root.value?.querySelector<HTMLElement>(`[data-media-image="${item.id}"]`) ?? undefined,
    opener: root.value,
    // A tap activates the card in front, which is the one at rest: the front card is the settled one.
    atRest:
      handle !== undefined && handle.activeId === item.id && handle.visualId === handle.settledId,
  });
}

defineExpose({
  activeId: computed(() => deck.value?.activeId),
  canNext: computed(() => deck.value?.canNext ?? false),
  canPrevious: computed(() => deck.value?.canPrevious ?? false),
  goTo: (id: string) => {
    screenId.value = id;
  },
  next: () => deck.value?.next(),
  openSelected() {
    const id = deck.value?.activeId;
    const item = props.items.find((candidate) => candidate.id === id);
    if (item) onActivate(item);
  },
  phase: computed(() => deck.value?.diagnostics.phase ?? "idle"),
  previous: () => deck.value?.previous(),
  root,
  settledId: computed(() => deck.value?.settledId),
  visualId: computed(() => deck.value?.visualId),
});
</script>

<template>
  <StackedDeck
    ref="deck"
    class="media-deck"
    :active-id="screenId"
    :elasticity="settings.elasticity"
    :exchange="behavior.exchange ?? 'shuffle'"
    :fallback-stage-width="520"
    :item-label="(item: SharedMediaItem) => `${item.title}, from ${item.sender}`"
    :items="items"
    :label="label"
    :programmatic-impulse="settings.programmaticImpulse"
    :reduced-motion-override="reducedMotionOverride"
    :release-policy="settings.releasePolicy"
    :spring="settings.spring"
    @activate="onActivate"
    @settled="(id) => emit('settled', id)"
    @active-id-request="(id) => id !== undefined && (screenId = id)"
  >
    <template #backdrop>
      <div aria-hidden="true" class="deck-backdrop" />
    </template>
    <template #card="card: StackedDeckCardState<SharedMediaItem, string>">
      <div class="deck-photo">
        <img
          alt=""
          aria-hidden="true"
          class="deck-image"
          :data-media-image="card.item.id"
          decoding="async"
          draggable="false"
          :height="card.item.height"
          :src="card.item.src"
          :width="card.item.width"
        />
      </div>
    </template>
  </StackedDeck>
</template>

<style scoped>
.media-deck {
  border-radius: 0.6rem;
  background: var(--stage);
  cursor: grab;
}

.media-deck:active {
  cursor: grabbing;
}

.deck-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: 0.6rem;
  background: var(--stage);
  pointer-events: none;
}

.deck-photo {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 0.5rem;
  background: var(--pg-panel);
  box-shadow: 0 10px 22px -12px rgb(21 20 15 / 0.45);
  overflow: hidden;
}

.deck-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}
</style>
