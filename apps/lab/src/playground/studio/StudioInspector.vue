<script setup lang="ts">
import { computed, ref, useId } from "vue";

import { studyById } from "./catalog";
import { studyMediaLabels } from "./studies";
import { useStudio } from "./studio-context";
import { MAX_COMPARISON } from "./studio-model";

const emit = defineEmits<{
  toggleCompare: [];
  /** Open the Gallery, on a particular plate when one was chosen. */
  inspect: [mediaId: string | undefined, opener: HTMLElement | undefined];
  details: [];
}>();

const { model } = useStudio();
const titleId = `${useId()}-title`;
const fullId = `${useId()}-full`;
const root = ref<HTMLElement>();
const inspectButton = ref<HTMLButtonElement>();
const detailsButton = ref<HTMLButtonElement>();

const study = computed(() => studyById.get(model.activeId.value)!);
const compared = computed(() => model.isCompared(study.value.id));
const position = computed(() => model.comparisonIds.value.indexOf(study.value.id) + 1);
const blocked = computed(() => !compared.value && model.comparisonFull.value);
const note = computed(() => model.noteFor(study.value.id).trim());
const overlayOwned = computed(() => model.overlay.value !== "none");

defineExpose({ detailsButton, inspectButton, root });
</script>

<template>
  <section
    ref="root"
    class="studio-region studio-inspector"
    :aria-labelledby="titleId"
    data-testid="studio-inspector"
    tabindex="-1"
  >
    <p class="region-kicker">Active study</p>
    <div class="inspector-body">
      <figure class="inspector-plate" :style="{ '--tone': study.tone }">
        <img
          :alt="`${study.name} study plate`"
          class="inspector-image"
          decoding="async"
          :height="study.cover.preview.height"
          :src="study.cover.preview.src"
          :width="study.cover.preview.width"
        />
      </figure>
      <div class="inspector-copy">
        <h4 :id="titleId" class="inspector-name" data-testid="studio-active-name">
          {{ study.name }}
        </h4>
        <p class="inspector-meta">
          <span>{{ study.kind }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ study.categoryLabel }}</span>
        </p>
        <p class="inspector-summary">{{ study.summary }}</p>
        <p v-if="note" class="inspector-note" data-testid="studio-active-note">
          <span class="note-label">Note</span> {{ note }}
        </p>
        <p
          class="inspector-membership"
          :data-compared="compared ? 'true' : 'false'"
          data-testid="studio-membership"
        >
          <span aria-hidden="true" class="membership-dot" />
          {{
            compared
              ? `In comparison, ${position} of ${model.comparisonIds.value.length}`
              : "Not in comparison"
          }}
        </p>
      </div>
    </div>

    <div class="inspector-actions">
      <button
        :aria-describedby="blocked ? fullId : undefined"
        class="studio-button"
        :class="compared ? '' : 'studio-button-primary'"
        data-testid="studio-toggle-compare"
        :disabled="blocked || overlayOwned"
        type="button"
        @click="emit('toggleCompare')"
      >
        {{ compared ? "Remove from comparison" : "Add to comparison" }}
      </button>
      <button
        ref="inspectButton"
        class="studio-button"
        data-testid="studio-inspect"
        :disabled="overlayOwned"
        type="button"
        @click="emit('inspect', undefined, inspectButton)"
      >
        Inspect plates
      </button>
      <button
        ref="detailsButton"
        class="studio-button"
        data-testid="studio-details"
        :disabled="overlayOwned"
        type="button"
        @click="emit('details')"
      >
        Details
      </button>
    </div>
    <p v-if="blocked" :id="fullId" class="inspector-full" data-testid="studio-comparison-full">
      The comparison holds {{ MAX_COMPARISON }} studies. Remove one to add {{ study.name }}.
    </p>

    <div class="inspector-detail">
      <dl class="inspector-attributes" data-testid="studio-attributes">
        <div v-for="attribute in study.attributes" :key="attribute.label">
          <dt>{{ attribute.label }}</dt>
          <dd>{{ attribute.value }}</dd>
        </div>
      </dl>
      <ul class="inspector-plates" aria-label="Plates">
        <li v-for="media in study.media" :key="media.kind">
          <button
            class="plate-chip"
            :data-testid="`studio-plate-${media.kind}`"
            :disabled="overlayOwned"
            type="button"
            @click="emit('inspect', media.id, $event.currentTarget as HTMLElement)"
          >
            <img
              alt=""
              aria-hidden="true"
              class="plate-chip-image"
              :height="media.preview.height"
              :src="media.preview.src"
              :width="media.preview.width"
            />
            <span>{{ studyMediaLabels[media.kind] }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.studio-inspector {
  align-content: start;
}

.studio-inspector:focus {
  outline: none;
}

.studio-inspector:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 4px;
}

.inspector-body {
  display: grid;
  grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  align-items: start;
  gap: 1rem 1.25rem;
}

.inspector-plate {
  margin: 0;
  aspect-ratio: 10 / 7;
  border-radius: 0.6rem;
  background: var(--tone);
  overflow: hidden;
}

.inspector-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.inspector-copy {
  display: grid;
  gap: 0.35rem;
  min-inline-size: 0;
}

.inspector-name {
  font-size: 1.5rem;
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.inspector-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  color: var(--pg-muted);
  font-size: 0.85rem;
}

.inspector-summary {
  color: var(--pg-ink-soft);
  font-size: 0.92rem;
  line-height: 1.45;
}

.inspector-note {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  padding-inline-start: 0.65rem;
  border-inline-start: 2px solid var(--pg-accent);
  color: var(--pg-ink);
  font-size: 0.88rem;
  line-height: 1.4;
}

.note-label {
  margin-inline-end: 0.25rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.inspector-membership {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--pg-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.inspector-membership[data-compared="true"] {
  color: var(--pg-accent);
}

.membership-dot {
  inline-size: 0.55rem;
  block-size: 0.55rem;
  border: 2px solid currentColor;
  border-radius: 50%;
}

.inspector-membership[data-compared="true"] .membership-dot {
  background: currentColor;
}

.inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.inspector-full {
  color: var(--pg-muted);
  font-size: 0.85rem;
}

.inspector-detail {
  display: grid;
  gap: 1rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid var(--pg-line);
}

.inspector-attributes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem 1.25rem;
}

.inspector-attributes dt {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.inspector-attributes dd {
  font-size: 0.9rem;
  font-weight: 600;
}

.inspector-plates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.plate-chip {
  display: grid;
  gap: 0.35rem;
  inline-size: 100%;
  padding: 0.3rem 0.3rem 0.4rem;
  border-color: var(--pg-line);
  border-radius: 0.5rem;
  background: var(--pg-panel);
  font-size: 0.78rem;
  font-weight: 600;
  text-align: start;
}

.plate-chip:hover:not(:disabled) {
  border-color: var(--pg-ink);
}

.plate-chip-image {
  display: block;
  inline-size: 100%;
  block-size: auto;
  aspect-ratio: 16 / 10;
  border-radius: 0.3rem;
  object-fit: cover;
}

@media (max-width: 40rem) {
  .inspector-body {
    grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr);
    gap: 0.75rem 1rem;
  }

  .inspector-name {
    font-size: 1.3rem;
  }

  .inspector-summary {
    font-size: 0.88rem;
  }
}
</style>
