<script setup lang="ts">
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { computed, ref } from "vue";

import { mediaFixtures } from "@/fixtures/media";

type FixtureVariant = "media" | "minimal";
type ItemId = (typeof items)[number]["id"];

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
}>();

const preview = mediaFixtures.find((fixture) => fixture.id === "regular")!;
const items = [
  {
    id: "project-detail",
    title: "Projectdetail met projectinformatie, locatie en dossierstatus",
  },
  {
    id: "template-editor",
    title: "Sjablooneditor voor configureerbare processtappen",
  },
  {
    id: "review-activity",
    title: "Beoordelingsactiviteit en opvolging",
  },
] as const;
const middleId: ItemId = "template-editor";
const variant = ref<FixtureVariant>("media");
const activeId = ref<ItemId>(middleId);
const settledId = ref<ItemId>(middleId);
const settledItem = computed(() => items.find((item) => item.id === settledId.value) ?? items[0]);
const variantLabel = computed(() =>
  variant.value === "media" ? "Responsive media-like content" : "Minimal package content",
);

function selectVariant(nextVariant: FixtureVariant) {
  variant.value = nextVariant;
  activeId.value = middleId;
  settledId.value = middleId;
}

function resetMiddle() {
  activeId.value = middleId;
  settledId.value = middleId;
}

function handleSettled(itemId: ItemId) {
  settledId.value = itemId;
}
</script>

<template>
  <section class="overflow-fixture" aria-labelledby="stacked-deck-overflow-title">
    <header>
      <h3 id="stacked-deck-overflow-title">Narrow-page overflow regression</h3>
      <p>{{ variantLabel }}</p>
      <div class="fixture-actions">
        <button
          data-testid="stacked-deck-overflow-minimal"
          type="button"
          @click="selectVariant('minimal')"
        >
          Minimal content
        </button>
        <button
          data-testid="stacked-deck-overflow-media"
          type="button"
          @click="selectVariant('media')"
        >
          Media-like content
        </button>
        <button data-testid="stacked-deck-overflow-reset" type="button" @click="resetMiddle">
          Reset to middle
        </button>
      </div>
    </header>

    <StackedDeck
      :key="variant"
      v-model:active-id="activeId"
      class="overflow-deck"
      data-testid="stacked-deck-overflow-root"
      :fallback-stage-width="480"
      :items="items"
      :item-label="(item) => item.title"
      label="Narrow page Stacked Deck regression"
      :reduced-motion-override="props.reducedMotionOverride"
      @settled="handleSettled"
    >
      <template #card="{ item }">
        <div
          v-if="variant === 'minimal'"
          class="minimal-card"
          data-testid="stacked-deck-overflow-slotted-child"
        >
          {{ item.title }}
        </div>
        <figure v-else class="media-card" data-testid="stacked-deck-overflow-slotted-child">
          <img
            alt=""
            aria-hidden="true"
            :height="preview.intrinsicSize.height"
            :src="preview.src"
            :width="preview.intrinsicSize.width"
          />
          <figcaption>{{ item.title }}</figcaption>
        </figure>
      </template>
    </StackedDeck>
    <p data-testid="stacked-deck-overflow-caption">{{ settledItem.title }}</p>
  </section>
</template>

<style scoped>
.overflow-fixture {
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
}

.overflow-fixture h3,
.overflow-fixture p,
.media-card {
  margin: 0;
}

.fixture-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-block-start: 0.75rem;
}

.overflow-deck {
  inline-size: min(100%, 17.5rem);
  min-inline-size: 0;
}

.minimal-card,
.media-card {
  box-sizing: border-box;
  inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  border: 1px solid currentColor;
  background: Canvas;
  color: CanvasText;
}

.minimal-card {
  display: grid;
  padding: 1rem;
  place-items: center;
  text-align: center;
}

.media-card {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.media-card img {
  display: block;
  inline-size: 100%;
  max-inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  object-fit: cover;
}

.media-card figcaption {
  min-inline-size: 0;
  padding: 0.35rem 0.5rem;
  overflow-wrap: anywhere;
}
</style>
