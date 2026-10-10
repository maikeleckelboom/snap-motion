<script setup lang="ts">
import type { StackedDeckExchange } from "@snap-motion/core";
import {
  StackedDeck,
  type StackedDeckCardState,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
import { computed, ref, useId } from "vue";

import SegmentedControl from "@/components/SegmentedControl.vue";
import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { studyById, type Study } from "./catalog";
import type { StudyId } from "./studies";
import { useStudio } from "./studio-context";
import { MAX_COMPARISON } from "./studio-model";
import { useStudioPhysics } from "./use-studio-physics";

const props = defineProps<{
  exchange: StackedDeckExchange;
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();
const emit = defineEmits<{
  /** The Deck asked to change its card: a drag, a key, a step, or a tray jump. */
  request: [id: StudyId];
  /** The settled top card was tapped: the visitor asked to inspect it. */
  activate: [id: StudyId];
  /** A study was removed from the comparison. */
  remove: [id: StudyId];
  /** Add the active study to the comparison. */
  add: [];
  /** Make the Deck's current card the active study everywhere. */
  makeActive: [id: StudyId];
  browse: [];
  exchangeChange: [exchange: StackedDeckExchange];
}>();

const { model } = useStudio();
const physics = useStudioPhysics(() => props.settings);
const titleId = `${useId()}-title`;
const trayId = `${useId()}-tray`;
const region = ref<HTMLElement>();
const deck = ref<StackedDeckHandle<StudyId>>();

const compared = computed(() => model.comparisonIds.value.map((id) => studyById.get(id)!));
const activeStudy = computed(() => studyById.get(model.activeId.value)!);
const deckStudy = computed(() =>
  model.deckId.value === undefined ? undefined : studyById.get(model.deckId.value),
);
const activeInComparison = computed(() => model.isCompared(model.activeId.value));
const deckIsActive = computed(() => model.deckId.value === model.activeId.value);
// The Deck is only mounted with at least two members, so the cursor always names one of them.
const deckCursor = computed(() => model.deckId.value ?? compared.value[0]!.id);
const countText = computed(() => `${compared.value.length} of ${MAX_COMPARISON}`);
const overlayOwned = computed(() => model.overlay.value !== "none");

const exchangeOptions = [
  { label: "Shuffle", value: "shuffle", testid: "studio-exchange-shuffle" },
  { label: "Direct", value: "direct", testid: "studio-exchange-direct" },
] as const;

function cardStyle(card: StackedDeckCardState<Study, StudyId>) {
  return { "--tone": card.item.tone };
}

function jumpTo(id: StudyId) {
  if (deck.value?.navigateTo(id)) return;
  // Already the current card, or the Deck is not mounted: nothing to travel.
  if (model.deckId.value !== id) emit("makeActive", id);
}

/**
 * After a removal the control that had focus is gone. Focus moves to the card that took its place in
 * the tray (the next one, else the new last), or to the empty state's own action.
 */
function focusAfterRemoval(index: number) {
  const names = region.value?.querySelectorAll<HTMLElement>(".tray-name:not(:disabled)");
  const survivor = names?.[Math.min(index, (names?.length ?? 0) - 1)];
  if (survivor) survivor.focus();
  else region.value?.querySelector<HTMLElement>("[data-testid='studio-compare-add']")?.focus();
}

defineExpose({
  focusAfterRemoval,
  focusTarget: () => deck.value?.root,
  jumpTo,
});
</script>

<template>
  <section
    ref="region"
    class="studio-region studio-compare"
    :aria-labelledby="titleId"
    data-testid="studio-compare"
    role="group"
    @keydown="deck?.onKeyDown($event)"
  >
    <header class="region-head">
      <div>
        <p class="region-kicker"><span class="tabular">03</span> / Compare</p>
        <h4 :id="titleId" class="region-title">Comparison</h4>
      </div>
      <p class="region-count tabular" data-testid="studio-comparison-count">{{ countText }}</p>
    </header>

    <template v-if="model.deckState.value === 'deck'">
      <StackedDeck
        ref="deck"
        class="studio-deck"
        data-testid="studio-deck"
        :active-id="deckCursor"
        :disabled="overlayOwned"
        :elasticity="physics.elasticity.value"
        :exchange="exchange"
        :fallback-stage-width="1280"
        :focus-scope="region"
        :item-label="(study) => study.name"
        :items="compared"
        label="Compared studies, stacked deck"
        :programmatic-impulse="physics.programmaticImpulse.value"
        :reduced-motion-override="reducedMotionOverride"
        :release-policy="physics.deckRelease.value"
        :spring="physics.spring.value"
        @activate="(study) => emit('activate', study.id)"
        @active-id-request="(id) => id !== undefined && emit('request', id)"
      >
        <template #backdrop>
          <div aria-hidden="true" class="deck-backdrop" />
        </template>
        <template #card="card">
          <div class="deck-plate" :style="cardStyle(card)">
            <img
              alt=""
              aria-hidden="true"
              class="deck-image"
              decoding="async"
              draggable="false"
              :height="card.item.cover.preview.height"
              :src="card.item.cover.preview.src"
              :width="card.item.cover.preview.width"
            />
          </div>
        </template>
      </StackedDeck>

      <div class="deck-controls">
        <div class="step-controls">
          <button
            aria-label="Previous card"
            data-testid="studio-deck-previous"
            :disabled="overlayOwned || !deck?.canPrevious"
            type="button"
            @click="deck?.previous()"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
              <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <button
            aria-label="Next card"
            data-testid="studio-deck-next"
            :disabled="overlayOwned || !deck?.canNext"
            type="button"
            @click="deck?.next()"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
              <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
        </div>
        <p class="deck-caption">
          <strong data-testid="studio-deck-caption">{{ deckStudy?.name }}</strong>
          <span v-if="deckIsActive" class="deck-state">Active study</span>
        </p>
        <SegmentedControl
          class="exchange"
          label="Exchange"
          :model-value="exchange"
          :options="exchangeOptions"
          @update:model-value="emit('exchangeChange', $event)"
        />
      </div>
      <p v-if="!deckIsActive && deckStudy" class="deck-note" data-testid="studio-deck-note">
        {{ deckStudy.name }} is on top. {{ activeStudy.name }} is the active study{{
          activeInComparison ? "" : ", and is not in the comparison"
        }}.
        <button class="text-button" type="button" @click="emit('makeActive', deckStudy.id)">
          Make {{ deckStudy.name }} active
        </button>
      </p>
    </template>

    <div
      v-else-if="model.deckState.value === 'single'"
      class="compare-state"
      data-testid="studio-compare-single"
    >
      <figure v-if="deckStudy" class="single-card" :style="{ '--tone': deckStudy.tone }">
        <img
          :alt="`${deckStudy.name} study plate`"
          class="single-image"
          :height="deckStudy.cover.preview.height"
          :src="deckStudy.cover.preview.src"
          :width="deckStudy.cover.preview.width"
        />
      </figure>
      <div class="state-copy">
        <p class="state-title">One study so far</p>
        <p>The Deck exchanges cards, so it needs two. Add another study to compare.</p>
        <div class="state-actions">
          <button
            v-if="!activeInComparison"
            class="studio-button studio-button-primary"
            data-testid="studio-compare-add"
            type="button"
            @click="emit('add')"
          >
            Add {{ activeStudy.name }}
          </button>
          <button class="studio-button" type="button" @click="emit('browse')">
            Choose another study
          </button>
        </div>
      </div>
    </div>

    <div v-else class="compare-state" data-testid="studio-compare-empty">
      <div aria-hidden="true" class="empty-pile">
        <span />
        <span />
        <span />
      </div>
      <div class="state-copy">
        <p class="state-title">Nothing to compare yet</p>
        <p>Add studies from the collection or the spatial view, then exchange them here.</p>
        <div class="state-actions">
          <button
            class="studio-button studio-button-primary"
            data-testid="studio-compare-add"
            type="button"
            @click="emit('add')"
          >
            Add {{ activeStudy.name }}
          </button>
          <button class="studio-button" type="button" @click="emit('browse')">
            Browse the collection
          </button>
        </div>
      </div>
    </div>

    <ul v-if="compared.length > 0" :id="trayId" class="tray" aria-label="Studies in comparison">
      <li
        v-for="study in compared"
        :key="study.id"
        class="tray-item"
        :data-current="model.deckId.value === study.id ? 'true' : 'false'"
        :data-testid="`studio-tray-${study.id}`"
      >
        <button
          :aria-current="model.deckId.value === study.id ? 'true' : undefined"
          class="tray-name"
          :disabled="overlayOwned"
          type="button"
          @click="jumpTo(study.id)"
        >
          <img
            alt=""
            aria-hidden="true"
            class="tray-thumb"
            height="44"
            :src="study.cover.preview.src"
            width="63"
          />
          <span>{{ study.name }}</span>
        </button>
        <button
          class="tray-remove"
          :data-testid="`studio-remove-${study.id}`"
          :disabled="overlayOwned"
          type="button"
          @click="emit('remove', study.id)"
        >
          <span class="sr-only">Remove {{ study.name }} from comparison</span>
          <svg aria-hidden="true" height="14" viewBox="0 0 24 24" width="14">
            <path
              d="M5 5l14 14M19 5 5 19"
              fill="none"
              stroke="currentColor"
              stroke-linecap="square"
              stroke-width="2.5"
            />
          </svg>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.studio-deck {
  margin-block-start: 0.25rem;
}

.deck-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: 0.9rem;
  background: var(--stage);
  pointer-events: none;
}

.studio-compare :deep(.snap-motion-stacked-deck-card-motion) {
  border-radius: 0.75rem;
  box-shadow:
    0 18px 34px -18px rgb(21 20 15 / calc(0.38 * var(--snap-motion-deck-shadow-strength))),
    0 4px 10px -6px rgb(21 20 15 / calc(0.32 * var(--snap-motion-deck-shadow-strength)));
  cursor: pointer;
}

.studio-deck {
  cursor: grab;
}

.studio-deck:active {
  cursor: grabbing;
}

.deck-plate {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 0.75rem;
  background: var(--tone);
  overflow: hidden;
}

.deck-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.deck-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
}

.step-controls {
  display: inline-flex;
  gap: 0.5rem;
}

.step-controls button {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
  border-radius: 999px;
}

.deck-caption {
  display: flex;
  flex: 1 1 8rem;
  align-items: baseline;
  gap: 0.6rem;
  min-inline-size: 0;
}

.deck-caption strong {
  font-size: 1.05rem;
}

.deck-state {
  color: var(--pg-accent);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.deck-note {
  color: var(--pg-muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.text-button {
  display: inline;
  min-block-size: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--pg-ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.compare-state {
  display: grid;
  grid-template-columns: minmax(0, 14rem) minmax(0, 1fr);
  align-items: center;
  gap: 1.25rem 1.75rem;
  padding: 1.25rem;
  border-radius: 0.9rem;
  background: var(--stage);
}

.single-card,
.empty-pile {
  margin: 0;
  aspect-ratio: 10 / 7;
}

.single-card {
  border-radius: 0.75rem;
  background: var(--tone);
  overflow: hidden;
  box-shadow: 0 14px 26px -16px rgb(21 20 15 / 0.4);
}

.single-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.empty-pile {
  position: relative;
}

.empty-pile span {
  position: absolute;
  inset: 0;
  border: 2px dashed var(--pg-line);
  border-radius: 0.75rem;
  background: var(--pg-panel);
}

.empty-pile span:nth-child(1) {
  transform: translate(-0.5rem, 0.5rem) rotate(-4deg);
}

.empty-pile span:nth-child(2) {
  transform: translate(0.5rem, 0.25rem) rotate(3deg);
}

.empty-pile span:nth-child(3) {
  border-style: solid;
  border-color: var(--pg-ink);
}

.state-copy {
  display: grid;
  gap: 0.5rem;
  color: var(--pg-ink-soft);
  font-size: 0.95rem;
  line-height: 1.5;
}

.state-title {
  color: var(--pg-ink);
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-block-start: 0.35rem;
}

.tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tray-item {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--pg-line);
  border-radius: 0.6rem;
  background: var(--pg-panel);
  overflow: hidden;
}

.tray-item[data-current="true"] {
  border-color: var(--pg-ink);
}

.tray-name,
.tray-remove {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.tray-name {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-block-size: 2.75rem;
  padding: 0.25rem 0.6rem 0.25rem 0.3rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.tray-thumb {
  inline-size: 2.2rem;
  block-size: auto;
  border-radius: 0.25rem;
}

.tray-remove {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  border-inline-start: 1px solid var(--pg-line);
  color: var(--pg-muted);
}

.tray-remove:hover:not(:disabled) {
  background: var(--pg-accent-soft);
  color: var(--pg-accent);
}

.tray-name:focus-visible,
.tray-remove:focus-visible {
  outline-offset: -3px;
}

@media (max-width: 40rem) {
  .compare-state {
    grid-template-columns: minmax(0, 1fr);
  }

  .single-card,
  .empty-pile {
    inline-size: min(100%, 14rem);
    justify-self: center;
  }
}
</style>
