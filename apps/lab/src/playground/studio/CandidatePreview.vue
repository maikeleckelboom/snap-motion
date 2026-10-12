<script setup lang="ts">
import {
  Coverflow,
  type CoverflowCardState,
  type CoverflowHandle,
} from "@snap-motion/vue/coverflow";
import {
  StackedDeck,
  type StackedDeckCardState,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
import { computed, ref } from "vue";

import type { ShowcaseScreen, ShowcaseScreenId } from "@/demos/showcaseScreens";

import { implementationProps, type CandidateBehavior } from "./candidates";

/**
 * One candidate, running on the real surface it describes, over the Studio's sample screens.
 *
 * Every preview is given the same screens, the same stage and the same starting screen, and is
 * driven through the same `next` and `previous`, so two previews differ only in the candidate they
 * run. The surface is uncontrolled apart from the start: the visitor can still drag, flick and use
 * the keyboard on it, because what is being judged is how it behaves under a hand.
 */
const props = defineProps<{
  behavior: CandidateBehavior;
  screens: readonly ShowcaseScreen[];
  reducedMotionOverride: boolean | undefined;
  label: string;
  /** Names the preview for tests and for the readout's relationship to its stage. */
  role: "reference" | "candidate" | "detail";
}>();

type Handle = CoverflowHandle<ShowcaseScreenId> | StackedDeckHandle<ShowcaseScreenId>;

const rail = ref<CoverflowHandle<ShowcaseScreenId>>();
const deck = ref<StackedDeckHandle<ShowcaseScreenId>>();
const surface = computed<Handle | undefined>(() => rail.value ?? deck.value);

/** The screen both previews begin on, and return to on reset: the middle of the sample. */
const startId = props.screens[Math.floor(props.screens.length / 2)]!.id;
const screenId = ref<ShowcaseScreenId>(startId);

const settings = computed(() => implementationProps(props.behavior));
const visualScreen = computed(
  () =>
    props.screens.find(({ id }) => id === surface.value?.visualId) ??
    props.screens.find(({ id }) => id === screenId.value),
);
const moving = computed(() => {
  const handle = surface.value;
  return handle !== undefined && handle.visualId !== handle.settledId;
});
const phase = computed(() => surface.value?.diagnostics.phase ?? "idle");

function onRequest(id: ShowcaseScreenId | undefined) {
  if (id !== undefined) screenId.value = id;
}

function cardImage(card: CoverflowCardState<ShowcaseScreen, ShowcaseScreenId>) {
  return card.item.preview;
}

defineExpose({
  next: () => surface.value?.next(),
  previous: () => surface.value?.previous(),
  reset: () => {
    screenId.value = startId;
  },
  root: computed(() => surface.value?.root),
  moving,
});
</script>

<template>
  <div
    class="preview"
    :data-candidate="behavior.id"
    :data-surface="behavior.surface"
    :data-testid="`studio-preview-${role}`"
  >
    <Coverflow
      v-if="behavior.surface === 'rail'"
      ref="rail"
      class="preview-surface"
      :active-id="screenId"
      :card-width="170"
      :elasticity="settings.elasticity"
      :fallback-stage-width="520"
      :item-label="(screen) => screen.title"
      :items="screens"
      :label="label"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="settings.releasePolicy"
      :spring="settings.spring"
      :data-testid="`studio-${role}-surface`"
      @active-id-request="onRequest"
    >
      <template #card="card">
        <div class="screen">
          <img
            alt=""
            aria-hidden="true"
            class="screen-image"
            decoding="async"
            draggable="false"
            :height="cardImage(card).height"
            :src="cardImage(card).src"
            :width="cardImage(card).width"
          />
        </div>
      </template>
    </Coverflow>
    <StackedDeck
      v-else
      ref="deck"
      class="preview-surface"
      :active-id="screenId"
      :elasticity="settings.elasticity"
      :exchange="behavior.exchange ?? 'shuffle'"
      :fallback-stage-width="520"
      :item-label="(screen) => screen.title"
      :items="screens"
      :label="label"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="settings.releasePolicy"
      :spring="settings.spring"
      :data-testid="`studio-${role}-surface`"
      @active-id-request="onRequest"
    >
      <template #backdrop>
        <div aria-hidden="true" class="preview-backdrop" />
      </template>
      <template #card="card: StackedDeckCardState<ShowcaseScreen, ShowcaseScreenId>">
        <div class="screen">
          <img
            alt=""
            aria-hidden="true"
            class="screen-image"
            decoding="async"
            draggable="false"
            :height="card.item.preview.height"
            :src="card.item.preview.src"
            :width="card.item.preview.width"
          />
        </div>
      </template>
    </StackedDeck>
    <p class="readout" :data-moving="moving ? 'true' : 'false'" :data-phase="phase">
      <span class="readout-screen" :data-testid="`studio-${role}-screen`">{{
        visualScreen?.title
      }}</span>
      <span class="readout-state" :data-testid="`studio-${role}-state`">{{
        moving ? "Moving" : "At rest"
      }}</span>
    </p>
  </div>
</template>

<style scoped>
.preview {
  display: grid;
  gap: 0.5rem;
  min-inline-size: 0;
}

.preview-surface {
  border-radius: 0.9rem;
  background: var(--stage);
  cursor: grab;
}

.preview-surface:active {
  cursor: grabbing;
}

.preview-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: 0.9rem;
  background: var(--stage);
  pointer-events: none;
}

.screen {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 0.5rem;
  background: var(--pg-panel);
  box-shadow: 0 10px 22px -12px rgb(21 20 15 / 0.45);
  overflow: hidden;
}

.screen-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.readout {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  font-size: 0.85rem;
}

.readout-screen {
  font-weight: 650;
}

.readout-state {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.readout[data-moving="true"] .readout-state {
  color: var(--pg-accent);
}
</style>
