<script setup lang="ts">
import type { FocusReturnOptions } from "@snap-motion/vue/dialog";
import { Sheet, type SheetSide } from "@snap-motion/vue/sheet";
import { computed, ref, useId } from "vue";

import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { studyById } from "./catalog";
import { studyMediaLabels } from "./studies";
import { useStudio } from "./studio-context";
import { MAX_COMPARISON, NOTE_LIMIT } from "./studio-model";
import { useStudioPhysics } from "./use-studio-physics";

const props = defineProps<{
  focusReturn: FocusReturnOptions;
  open: boolean;
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  side: SheetSide;
}>();
const emit = defineEmits<{
  /** The visitor asked to dismiss the Sheet (Escape, the close control, the scrim or a drag). */
  requestClose: [];
  /** The native dialog finished closing. */
  closed: [];
  toggleCompare: [];
  /** Open a plate in the Gallery once this Sheet has finished closing. */
  inspect: [mediaId: string];
  note: [message: string];
}>();

const { model } = useStudio();
const physics = useStudioPhysics(() => props.settings);
const noteId = `${useId()}-note`;
const noteHintId = `${useId()}-note-hint`;
const fullId = `${useId()}-full`;
const statusId = `${useId()}-status`;

const study = computed(() => studyById.get(model.activeId.value)!);
const compared = computed(() => model.isCompared(study.value.id));
const blocked = computed(() => !compared.value && model.comparisonFull.value);
const noteText = computed(() => model.noteFor(study.value.id));
const savedNote = ref(false);

const dialogStyle = computed(() => ({
  "--snap-motion-sheet-content-padding-inline": "clamp(1rem, 4vw, 1.5rem)",
  "--snap-motion-sheet-inline-size": "min(30rem, 100vw)",
}));

function onNoteInput(event: Event) {
  savedNote.value = false;
  const field = event.currentTarget as HTMLTextAreaElement;
  const stored = model.setNote(study.value.id, field.value);
  // Keep the field truthful if the model bounded or normalized what was typed.
  if (stored !== field.value) field.value = stored;
}

function onNoteBlur() {
  savedNote.value = model.hasNote(study.value.id);
  emit(
    "note",
    model.hasNote(study.value.id)
      ? `Note saved for ${study.value.name}`
      : `Note cleared for ${study.value.name}`,
  );
}
</script>

<template>
  <Sheet
    class="studio-sheet"
    close-label="Close details"
    data-testid="studio-sheet"
    :elasticity="physics.sheetElasticity.value"
    :focus-return="focusReturn"
    initial-focus="close"
    :open="open"
    :programmatic-impulse="physics.programmaticImpulse.value"
    :reduced-motion-override="reducedMotionOverride"
    :release-policy="physics.sheetRelease.value"
    :side="side"
    :spring="physics.spring.value"
    :style="dialogStyle"
    @closed="emit('closed')"
    @open-request="emit('requestClose')"
  >
    <template #title>
      <div class="sheet-title">
        <p>Study details</p>
        <h2 data-testid="studio-sheet-title">{{ study.name }}</h2>
      </div>
    </template>
    <template #close>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
        <path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </template>

    <div class="details" data-testid="studio-sheet-content">
      <div class="details-intro">
        <div class="details-hero" :style="{ '--tone': study.tone }">
          <img
            :alt="`${study.name} study plate`"
            class="details-image"
            :height="study.cover.preview.height"
            :src="study.cover.preview.src"
            :width="study.cover.preview.width"
          />
        </div>
        <div class="details-copy">
          <p class="details-kind">
            {{ study.kind }} <span aria-hidden="true">·</span> {{ study.categoryLabel }}
          </p>
          <p class="details-summary">{{ study.summary }}</p>
        </div>
      </div>

      <section class="details-section" role="group" aria-labelledby="studio-sheet-comparison">
        <h3 id="studio-sheet-comparison" class="details-heading">Compare</h3>
        <p class="details-line" data-testid="studio-sheet-membership">
          {{
            compared
              ? `In the comparison, ${model.comparisonIds.value.length} of ${MAX_COMPARISON} places used.`
              : `Not in the comparison. ${model.comparisonIds.value.length} of ${MAX_COMPARISON} places used.`
          }}
        </p>
        <button
          :aria-describedby="blocked ? fullId : undefined"
          class="studio-button"
          :class="compared ? '' : 'studio-button-primary'"
          data-testid="studio-sheet-toggle-compare"
          :disabled="blocked"
          type="button"
          @click="emit('toggleCompare')"
        >
          {{ compared ? "Remove from comparison" : "Add to comparison" }}
        </button>
        <p v-if="blocked" :id="fullId" class="details-line">
          The comparison is full. Remove a study to add {{ study.name }}.
        </p>
      </section>

      <section class="details-section" role="group" aria-labelledby="studio-sheet-note-heading">
        <h3 id="studio-sheet-note-heading" class="details-heading">Note</h3>
        <label class="sr-only" :for="noteId">Note for {{ study.name }}</label>
        <textarea
          :id="noteId"
          :aria-describedby="`${noteHintId} ${statusId}`"
          class="note-field"
          data-testid="studio-note"
          :maxlength="NOTE_LIMIT"
          placeholder="What did you notice? Add a short note."
          rows="3"
          :value="noteText"
          @blur="onNoteBlur"
          @input="onNoteInput"
        />
        <p :id="noteHintId" class="details-line note-hint">
          <span class="tabular">{{ noteText.length }} / {{ NOTE_LIMIT }}</span>
          <span>Kept while this page is open.</span>
        </p>
        <p :id="statusId" class="sr-only" role="status">
          {{ savedNote ? "Note saved" : "" }}
        </p>
      </section>

      <section class="details-section" role="group" aria-labelledby="studio-sheet-attributes">
        <h3 id="studio-sheet-attributes" class="details-heading">Attributes</h3>
        <dl class="attributes">
          <div v-for="attribute in study.attributes" :key="attribute.label">
            <dt>{{ attribute.label }}</dt>
            <dd>{{ attribute.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="details-section" role="group" aria-labelledby="studio-sheet-plates">
        <h3 id="studio-sheet-plates" class="details-heading">Plates</h3>
        <ul class="plates">
          <li v-for="media in study.media" :key="media.id">
            <button
              class="plate-button"
              :data-testid="`studio-sheet-plate-${media.kind}`"
              type="button"
              @click="emit('inspect', media.id)"
            >
              <img
                alt=""
                aria-hidden="true"
                class="plate-thumb"
                :height="media.preview.height"
                :src="media.preview.src"
                :width="media.preview.width"
              />
              <span>Inspect {{ studyMediaLabels[media.kind].toLowerCase() }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </Sheet>
</template>

<style scoped>
:deep(.snap-motion-sheet-scrim) {
  background: #000;
  touch-action: none;
}

:deep(.snap-motion-sheet-panel) {
  min-inline-size: 0;
  border: 0;
  background: var(--pg-panel);
  box-shadow: 0 0 0 1px rgb(21 20 15 / 0.12);
  color: var(--pg-ink);
  outline: none;
}

:deep(.snap-motion-sheet-panel::after),
:deep(.snap-motion-sheet-viewport) {
  background: var(--pg-panel);
}

:deep(.snap-motion-sheet-viewport) {
  border-radius: inherit;
}

:deep(.snap-motion-sheet-panel[data-sheet-side="bottom"]) {
  border-radius: 1.1rem 1.1rem 0 0;
}

:deep(.snap-motion-sheet-panel[data-sheet-side="right"]) {
  border-radius: 1.1rem 0 0 1.1rem;
}

:deep(.snap-motion-sheet-header) {
  border-block-end: 1px solid var(--pg-line);
}

:deep(.snap-motion-sheet-handle) {
  border-radius: 999px;
  background: var(--pg-ink);
}

:deep(.snap-motion-sheet-close) {
  display: grid;
  place-items: center;
  padding: 0;
}

.sheet-title :is(p, h2) {
  margin: 0;
}

.sheet-title p {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sheet-title h2 {
  font-size: 1.15rem;
  font-weight: 650;
}

.details {
  display: grid;
  gap: 1rem;
  padding-block: 1.25rem 2rem;
}

.details-intro {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
}

.details-copy {
  display: grid;
  gap: 0.35rem;
  min-inline-size: 0;
}

.details-hero {
  aspect-ratio: 10 / 7;
  border-radius: 0.6rem;
  background: var(--tone);
  overflow: hidden;
}

.details-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.details-kind {
  color: var(--pg-muted);
  font-size: 0.88rem;
}

.details-summary {
  color: var(--pg-ink-soft);
  font-size: 0.98rem;
  line-height: 1.45;
}

.details-section {
  display: grid;
  gap: 0.6rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid var(--pg-line);
  justify-items: start;
}

.details-heading {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.details-line {
  color: var(--pg-ink-soft);
  font-size: 0.9rem;
  line-height: 1.45;
}

.attributes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  inline-size: 100%;
}

.attributes dt {
  color: var(--pg-muted);
  font-size: 0.78rem;
}

.attributes dd {
  font-size: 0.95rem;
  font-weight: 600;
}

.note-field {
  inline-size: 100%;
  min-block-size: 5.5rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--pg-line-strong);
  border-radius: 0.5rem;
  background: var(--pg-white);
  color: var(--pg-ink);
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.45;
  resize: vertical;
}

.note-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  color: var(--pg-muted);
  font-size: 0.8rem;
}

.plates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  inline-size: 100%;
}

.plate-button {
  display: grid;
  gap: 0.4rem;
  inline-size: 100%;
  padding: 0.35rem 0.35rem 0.5rem;
  border-color: var(--pg-line);
  border-radius: 0.5rem;
  background: var(--pg-white);
  font-size: 0.78rem;
  font-weight: 600;
  text-align: start;
}

.plate-thumb {
  display: block;
  inline-size: 100%;
  block-size: auto;
  border-radius: 0.3rem;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: var(--pg-bg);
}

@media (max-width: 24rem) {
  .plates {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
