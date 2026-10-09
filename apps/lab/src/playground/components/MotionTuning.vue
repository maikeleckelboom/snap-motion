<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";

import SegmentedControl from "@/components/SegmentedControl.vue";

import { presetLabel, presetNote, presetOptions, springSummary } from "../preset-facts";
import type { PlaygroundSectionId } from "../sections";
import { usePlaygroundTuning } from "../tuning-context";
import TuningPanel from "./TuningPanel.vue";

const props = defineProps<{ sectionId: PlaygroundSectionId }>();

const presetControlOptions = presetOptions.map(({ label, value }) => ({
  label,
  value,
  testid: `preset-${value}`,
}));

const tuning = usePlaygroundTuning();
const id = useId();
const panelId = `${id}-editor`;
const customizeButton = ref<HTMLButtonElement>();
const expanded = computed(() => tuning.expandedSection.value === props.sectionId);
const modifiedCount = computed(() => tuning.modifiedKeys.value.length);
const stateText = computed(
  () =>
    `${presetLabel(tuning.preset.value)} · ${modifiedCount.value === 0 ? "Preset" : `Modified (${modifiedCount.value})`}`,
);

function toggle() {
  void tuning.toggleEditor(props.sectionId, customizeButton.value);
}

async function closeEditor() {
  await tuning.toggleEditor(props.sectionId, customizeButton.value);
  await nextTick();
  customizeButton.value?.focus();
}
</script>

<template>
  <!-- A group, not a landmark: five identically named regions would be indistinguishable. -->
  <div class="tuning" role="group" :aria-labelledby="`${id}-title`" :data-section="sectionId">
    <div class="tuning-bar">
      <div class="tuning-head">
        <h3 :id="`${id}-title`" class="tuning-title">Motion tuning</h3>
        <p :id="`${id}-scope`" class="tuning-scope">Shared by all five surfaces</p>
      </div>

      <SegmentedControl
        class="tuning-presets"
        :described-by="`${id}-scope`"
        label="Base preset"
        label-hidden
        :model-value="tuning.preset.value"
        :options="presetControlOptions"
        @update:model-value="tuning.applyPreset"
      />

      <div class="tuning-state-row">
        <p
          class="tuning-state tabular"
          :data-modified="modifiedCount > 0 ? 'true' : 'false'"
          data-testid="tuning-state"
        >
          <span aria-hidden="true" class="tuning-dot" />
          {{ stateText }}
        </p>
        <button
          class="tuning-reset"
          :disabled="modifiedCount === 0"
          data-testid="tuning-reset"
          type="button"
          @click="tuning.resetToPreset()"
        >
          Reset
        </button>
      </div>

      <button
        ref="customizeButton"
        class="tuning-customize"
        :aria-controls="expanded ? panelId : undefined"
        :aria-expanded="expanded"
        data-testid="tuning-customize"
        type="button"
        @click="toggle"
      >
        Customize
        <svg aria-hidden="true" class="tuning-chevron" viewBox="0 0 16 16" width="14" height="14">
          <path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.75" />
        </svg>
      </button>
    </div>

    <p class="tuning-note">
      <span>{{ presetNote(tuning.preset.value) }}</span>
      <span class="tabular">{{ springSummary(tuning.settings.value) }}</span>
    </p>

    <p v-if="tuning.effectiveReducedMotion.value" class="tuning-reduced" role="note">
      Reduced motion is on, so surfaces settle without the spring. Spring and settling changes will
      not be visible.
      <button
        v-if="tuning.motionMode.value !== 'no-preference'"
        class="link-button"
        type="button"
        @click="tuning.motionMode.value = 'no-preference'"
      >
        Play full motion
      </button>
    </p>

    <TuningPanel v-if="expanded" :id="panelId" :section-id="sectionId" @close="closeEditor" />
  </div>
</template>

<style scoped>
.tuning {
  display: grid;
  gap: 0.75rem;
  min-inline-size: 0;
  padding-block-start: 1.25rem;
  border-block-start: 1px solid var(--pg-line);
}

.tuning-bar {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  grid-template-areas: "head presets state customize";
  align-items: center;
  gap: 0.75rem 1.5rem;
}

.tuning-head {
  grid-area: head;
  display: grid;
  gap: 0.1rem;
}

.tuning-title,
.tuning-scope {
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tuning-scope {
  color: var(--pg-muted);
  font-weight: 500;
}

.tuning-presets {
  grid-area: presets;
}

.tuning-state-row {
  grid-area: state;
  display: flex;
  align-items: center;
  gap: 1rem;
  min-inline-size: 0;
}

.tuning-state {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 600;
  white-space: nowrap;
}

.tuning-dot {
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border-radius: 50%;
  background: var(--pg-line);
}

.tuning-state[data-modified="true"] {
  color: var(--pg-accent);
}

.tuning-state[data-modified="true"] .tuning-dot {
  background: var(--pg-accent);
}

.tuning-reset {
  min-block-size: 2.25rem;
  padding: 0.25rem 0.75rem;
  border-color: var(--pg-line);
  font-size: 0.85rem;
  font-weight: 600;
}

.tuning-reset:not(:disabled) {
  border-color: var(--pg-accent);
  color: var(--pg-accent);
}

.tuning-customize {
  grid-area: customize;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-block-size: 2.75rem;
  padding: 0.4rem 1.1rem;
  border-color: var(--pg-ink);
  border-radius: 0.6rem;
  background: var(--pg-ink);
  color: var(--pg-white);
  font-size: 0.9rem;
  font-weight: 600;
}

.tuning-customize:hover {
  background: var(--pg-ink-soft);
}

.tuning-customize:focus-visible {
  outline-color: var(--pg-focus);
  outline-offset: 3px;
}

.tuning-chevron {
  transition: transform 160ms ease;
}

/* Forced colours drop the dot's fill; the "Modified (n)" text already carries the state. */
@media (forced-colors: active) {
  .tuning-state[data-modified="true"] .tuning-dot {
    border: 2px solid CanvasText;
  }
}

.tuning-customize[aria-expanded="true"] .tuning-chevron {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .tuning-chevron {
    transition: none;
  }
}

.tuning-note {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 1.25rem;
  color: var(--pg-muted);
  font-size: 0.8rem;
}

.tuning-note span:last-child {
  font-family: var(--pg-font-mono);
  font-size: 0.74rem;
}

.tuning-reduced {
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--pg-line);
  border-inline-start: 3px solid var(--pg-accent);
  background: var(--pg-panel);
  font-size: 0.85rem;
}

.link-button {
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

/* A finger needs 44px; the global coarse-pointer rule loses to these controls' own sizes. */
@media (pointer: coarse) {
  .tuning-reset {
    min-block-size: 2.75rem;
    padding-inline: 1rem;
  }

  .link-button {
    display: inline-flex;
    align-items: center;
    min-block-size: 2.75rem;
  }
}

@media (max-width: 62rem) {
  .tuning-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "head head"
      "presets presets"
      "state customize";
  }

  .tuning-head {
    grid-auto-flow: column;
    justify-content: space-between;
    align-items: baseline;
  }

  .tuning-presets {
    justify-self: stretch;
  }
}

@media (max-width: 30rem) {
  .tuning-head {
    grid-auto-flow: row;
    justify-content: start;
  }

  .tuning-bar {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "head"
      "presets"
      "state"
      "customize";
  }

  .tuning-state-row {
    justify-content: space-between;
  }
}
</style>
