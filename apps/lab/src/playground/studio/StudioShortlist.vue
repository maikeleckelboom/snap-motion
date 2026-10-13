<script setup lang="ts">
import {
  StackedDeck,
  type StackedDeckCardState,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";

import SegmentedControl, { type SegmentedOption } from "@/components/SegmentedControl.vue";

import CandidateGlyph from "./CandidateGlyph.vue";
import { describeShape, type CandidateBehavior, type CandidateId } from "./candidates";
import { useStudio } from "./studio-context";
import { MAX_SHORTLIST, type ShortlistExchange } from "./studio-model";

const props = defineProps<{ reducedMotionOverride: boolean | undefined }>();

const { behavior, commands, model } = useStudio();
const titleId = `${useId()}-title`;
const region = ref<HTMLElement>();
const deck = ref<StackedDeckHandle<CandidateId>>();

// How this list's own cards turn. It belongs to the list, and nothing here reads it to configure A or B.
const turnOptions: SegmentedOption<ShortlistExchange>[] = [
  { label: "Shuffle", value: "shuffle", testid: "studio-shortlist-turn-shuffle" },
  { label: "Direct", value: "direct", testid: "studio-shortlist-turn-direct" },
];

const members = computed(() => model.shortlist.value.map((id) => behavior(id)));
const deckItems = computed(() => model.deckIds.value.map((id) => behavior(id)));
const reference = computed(() =>
  model.referenceId.value === undefined ? undefined : behavior(model.referenceId.value),
);
// The Deck is only mounted with at least one card, and B always names one of them.
const cursor = computed(() => model.candidateId.value ?? model.deckIds.value[0]!);
const countText = computed(() => `${model.shortlist.value.length} of ${MAX_SHORTLIST}`);
// A native modal makes the page inert, and the model refuses a second overlay, so no control here is
// disabled for it. Disabling an opener is worse than redundant: WebKit then restores focus to the
// opener's nearest focusable ancestor instead, which the Sheet treats as the application's own
// hand-off. Only the Deck refuses input, because it is a surface and not an opener.
const overlayOwned = computed(() => model.overlay.value !== "none");
// With nothing to exchange the Deck still holds its one card, inert, so that card is the same
// physical object either side of the two-candidate boundary.
const deckInert = computed(() => model.deckState.value === "single");

/**
 * The card the Deck is showing on top, which trails the semantic B while an exchange is under way.
 * Everything that names "the card in front" reads this, so a caption never gets ahead of the card.
 */
const visualId = computed(() => deck.value?.visualId);
const shownName = computed(() =>
  model.shownCandidateId.value === undefined
    ? undefined
    : behavior(model.shownCandidateId.value).name,
);
watch(
  visualId,
  (id) =>
    model.reportPresented(id !== undefined && model.deckIds.value.includes(id) ? id : undefined),
  { flush: "sync" },
);
watch(
  () => model.deckState.value,
  (state) => {
    if (state === "empty") model.reportPresented(undefined);
  },
);
onBeforeUnmount(() => model.reportPresented(undefined));

function roleLabel(id: CandidateId) {
  if (id === model.referenceId.value) return "Reference A";
  if (id === model.candidateId.value) return "Compared as B";
  return "On the shortlist";
}

/**
 * After a removal the control that had focus is gone. Focus moves to the member that took its
 * place (the next, else the new last), or to the way forward when nothing is left.
 */
function focusAfterRemoval(index: number) {
  const items = region.value?.querySelectorAll<HTMLElement>("[data-member] [data-focus-target]");
  const survivor = items?.[Math.min(index, (items?.length ?? 0) - 1)];
  if (survivor) survivor.focus();
  else region.value?.querySelector<HTMLElement>("[data-testid='studio-shortlist-choose']")?.focus();
}

defineExpose({ focusAfterRemoval, focusTarget: () => deck.value?.root, root: () => region.value });
</script>

<template>
  <section
    ref="region"
    class="studio-region studio-shortlist"
    :aria-labelledby="titleId"
    data-testid="studio-shortlist"
    role="group"
  >
    <header class="region-head">
      <div>
        <p class="region-kicker">Shortlist</p>
        <h4 :id="titleId" class="region-title">Compare against A</h4>
      </div>
      <p class="region-count tabular" data-testid="studio-shortlist-count">{{ countText }}</p>
    </header>

    <!-- The Deck holds every shortlisted candidate except A; the card in front is B. One Deck serves
    one candidate and several: its cards are the same physical objects either side of the two-card
    boundary, so the package reconciles that boundary like any other change of membership. -->
    <template v-if="model.deckState.value !== 'empty'">
      <StackedDeck
        ref="deck"
        class="shortlist-deck"
        data-testid="studio-deck"
        :active-id="cursor"
        :data-deck-state="model.deckState.value"
        :disabled="overlayOwned || deckInert"
        :inert="deckInert ? true : undefined"
        :exchange="model.shortlistExchange.value"
        :fallback-stage-width="520"
        :item-label="(item: CandidateBehavior) => item.name"
        :items="deckItems"
        label="Shortlist, stacked deck. The card in front is compared as B."
        :reduced-motion-override="props.reducedMotionOverride"
        @activate="(item) => commands.openDetail(item.id)"
        @active-id-request="(id) => id !== undefined && commands.setCandidate(id)"
      >
        <template #backdrop>
          <div aria-hidden="true" class="deck-backdrop" />
        </template>
        <template #card="card: StackedDeckCardState<CandidateBehavior, CandidateId>">
          <div class="deck-card">
            <CandidateGlyph :behavior="card.item" />
            <p class="deck-card-name">
              {{ card.item.name }}
              <span class="deck-card-shape">{{ describeShape(card.item) }}</span>
            </p>
          </div>
        </template>
      </StackedDeck>

      <!-- What is in front and the way to change it share a row, so the choice and its control are read together. -->
      <div class="deck-bar">
        <p class="deck-caption" data-testid="studio-deck-caption-line">
          <span class="deck-caption-label">In front</span>
          <strong data-testid="studio-deck-caption">{{ shownName }}</strong>
          <span v-if="model.deckState.value === 'single'" class="deck-note">
            One candidate beside A. Shortlist another to flip between them.
          </span>
        </p>
        <div v-if="model.deckState.value === 'deck'" class="step-controls">
          <button
            aria-label="Previous candidate"
            data-testid="studio-deck-previous"
            :disabled="!deck?.canPrevious"
            type="button"
            @click="deck?.previous()"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
              <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <button
            aria-label="Next candidate"
            data-testid="studio-deck-next"
            :disabled="!deck?.canNext"
            type="button"
            @click="deck?.next()"
          >
            <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
              <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
        </div>
      </div>
    </template>

    <div
      v-if="model.deckState.value !== 'empty'"
      class="shortlist-turn"
      data-testid="studio-shortlist-turn"
    >
      <SegmentedControl
        label="How these cards turn"
        :model-value="model.shortlistExchange.value"
        :options="turnOptions"
        @update:model-value="commands.setShortlistExchange"
      />
      <p class="turn-hint">
        This is how the list you are swiping turns. It does not change how A or B behaves.
      </p>
    </div>

    <div v-else class="shortlist-empty" data-testid="studio-shortlist-empty">
      <p class="empty-title">
        {{
          model.compareState.value === "empty"
            ? "Nothing shortlisted yet"
            : `${reference?.name} is your reference`
        }}
      </p>
      <p class="empty-copy">
        {{
          model.compareState.value === "empty"
            ? "Shortlist two or more candidates. The first becomes the reference A; the others are compared against it."
            : "Shortlist one more candidate to compare it against A."
        }}
      </p>
      <button
        class="studio-button studio-button-primary"
        data-testid="studio-shortlist-choose"
        type="button"
        @click="commands.goToCandidates()"
      >
        Choose candidates
      </button>
    </div>

    <ol v-if="members.length > 0" class="members" aria-label="Shortlist">
      <li
        v-for="item in members"
        :key="item.id"
        class="member"
        data-member
        :data-role="
          item.id === model.referenceId.value
            ? 'a'
            : item.id === model.candidateId.value
              ? 'b'
              : 'other'
        "
        :data-testid="`studio-member-${item.id}`"
      >
        <div class="member-identity">
          <span class="member-name">{{ item.name }}</span>
          <span class="member-role" data-testid="studio-role-label">{{ roleLabel(item.id) }}</span>
        </div>
        <div class="member-actions">
          <button
            v-if="item.id !== model.referenceId.value && item.id !== model.candidateId.value"
            class="member-button"
            data-focus-target
            :data-testid="`studio-compare-${item.id}`"
            type="button"
            @click="commands.setCandidate(item.id)"
          >
            Compare as B<span class="sr-only">: {{ item.name }}</span>
          </button>
          <button
            v-if="item.id !== model.referenceId.value"
            class="member-button"
            :data-focus-target="item.id === model.candidateId.value ? '' : undefined"
            :data-testid="`studio-pin-${item.id}`"
            type="button"
            @click="commands.pinReference(item.id)"
          >
            Pin as A<span class="sr-only">: {{ item.name }}</span>
          </button>
          <button
            class="member-button member-remove"
            :data-focus-target="item.id === model.referenceId.value ? '' : undefined"
            :data-testid="`studio-remove-${item.id}`"
            type="button"
            @click="commands.removeFromShortlist(item.id)"
          >
            Remove<span class="sr-only"> {{ item.name }} from the shortlist</span>
          </button>
        </div>
      </li>
    </ol>
    <div v-if="members.length > 0" class="shortlist-actions">
      <button
        v-if="model.compareState.value === 'ready'"
        class="studio-button"
        data-testid="studio-swap"
        type="button"
        @click="commands.swapRoles()"
      >
        Swap A and B
      </button>
      <button
        v-if="!model.shortlistFull.value"
        class="studio-button"
        data-testid="studio-add-more"
        type="button"
        @click="commands.goToCandidates()"
      >
        Add another candidate
      </button>
    </div>
  </section>
</template>

<style scoped>
.shortlist-deck {
  margin-block-start: 0.25rem;
  cursor: grab;
}

.shortlist-deck:active {
  cursor: grabbing;
}

.deck-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: 0.9rem;
  background: var(--stage);
  pointer-events: none;
}

.studio-shortlist :deep(.snap-motion-stacked-deck-card-motion) {
  border-radius: 0.75rem;
  box-shadow:
    0 18px 34px -18px rgb(21 20 15 / calc(0.38 * var(--snap-motion-deck-shadow-strength))),
    0 4px 10px -6px rgb(21 20 15 / calc(0.32 * var(--snap-motion-deck-shadow-strength)));
  cursor: pointer;
}

.deck-card {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 0.75rem;
  background: var(--pg-panel);
  overflow: hidden;
}

.deck-card :deep(.glyph) {
  block-size: 100%;
  aspect-ratio: auto;
}

.deck-card-name {
  display: grid;
  padding: 0.35rem 0.75rem 0.5rem;
  font-size: 0.95rem;
  font-weight: 650;
}

.deck-card-shape {
  color: var(--pg-muted);
  font-size: 0.74rem;
  font-weight: 400;
}

.shortlist-turn {
  display: grid;
  gap: 0.35rem;
}

.turn-hint {
  color: var(--pg-muted);
  font-size: 0.82rem;
  line-height: 1.4;
}

.deck-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
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
  flex: 1 1 10rem;
  flex-wrap: wrap;
  align-items: baseline;
  min-inline-size: 0;
  gap: 0.25rem 0.6rem;
}

.deck-caption-label {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.deck-caption strong {
  font-size: 1.05rem;
}

.deck-note {
  flex-basis: 100%;
  color: var(--pg-muted);
  font-size: 0.85rem;
}

.shortlist-empty {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  padding: 1.25rem;
  border-radius: 0.9rem;
  background: var(--stage);
}

.empty-title {
  color: var(--pg-ink);
  font-size: 1.1rem;
  font-weight: 650;
}

.empty-copy {
  color: var(--pg-ink-soft);
  font-size: 0.92rem;
  line-height: 1.5;
}

.members {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.member {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  padding: 0.3rem 0.3rem 0.3rem 0.75rem;
  border: 1px solid var(--pg-line);
  border-radius: 0.6rem;
  background: var(--pg-panel);
}

.member[data-role="a"],
.member[data-role="b"] {
  border-color: var(--pg-ink);
}

.member-identity {
  display: grid;
  min-inline-size: 0;
}

.member-name {
  font-weight: 650;
}

.member-role {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.member-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.member-button {
  min-block-size: 2.75rem;
  padding: 0.2rem 0.7rem;
  border-radius: 0.45rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.member-remove {
  color: var(--pg-muted);
}

.shortlist-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
