<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { computed, useId } from "vue";

import PhysicsGroups from "@/components/PhysicsGroups.vue";
import SegmentedControl from "@/components/SegmentedControl.vue";
import type { ReducedMotionMode } from "@/fixtures/lab-types";
import { stackedDeckNotApplicablePhysics } from "@/fixtures/surface-applicability";

import { presetLabel, presetNote, springSummary } from "../preset-facts";
import type { PlaygroundSectionId } from "../sections";
import { usePlaygroundTuning } from "../tuning-context";
import SpringPreview from "./SpringPreview.vue";

const props = defineProps<{ sectionId: PlaygroundSectionId }>();
const emit = defineEmits<{ close: [] }>();

const tuning = usePlaygroundTuning();
const id = useId();
const wide = useMediaQuery("(min-width: 64rem)");
const notApplicable = computed(() =>
  props.sectionId === "stacked-deck" ? stackedDeckNotApplicablePhysics : undefined,
);
const motionOptions: { label: string; value: ReducedMotionMode; testid: string }[] = [
  { label: "System", value: "system", testid: "motion-system" },
  { label: "Full", value: "no-preference", testid: "motion-full" },
  { label: "Reduced", value: "reduce", testid: "motion-reduced" },
];
</script>

<template>
  <div
    class="tuning-panel"
    :aria-labelledby="`${id}-title`"
    role="group"
    data-testid="tuning-panel"
  >
    <div class="panel-head">
      <div class="panel-head-copy">
        <h4 :id="`${id}-title`">Customize motion</h4>
        <p>
          Adjust all five surfaces from here. Drag a slider or enter an exact value; valid changes
          apply immediately. Choosing a preset replaces your edits.
        </p>
        <p class="panel-preset">
          <strong>{{ presetLabel(tuning.preset.value) }}</strong> ·
          {{ presetNote(tuning.preset.value) }}<br />{{ springSummary(tuning.settings.value) }}
        </p>
        <div class="motion-preference">
          <SegmentedControl
            v-model="tuning.motionMode.value"
            label="Motion preference"
            :options="motionOptions"
          />
          <p class="panel-foot-note">
            System follows your device preference. Reduced skips spring settling; dragging and
            release still use your settings.
          </p>
        </div>
      </div>
      <SpringPreview
        :settings="tuning.settings.value"
        :skipped="tuning.effectiveReducedMotion.value"
      />
    </div>

    <PhysicsGroups
      :model-value="tuning.settings.value"
      :not-applicable="notApplicable"
      :open="wide ? 'all' : 'default'"
      @update:model-value="tuning.updateSettings"
    />

    <div class="panel-foot">
      <button class="panel-close" type="button" @click="emit('close')">Close editor</button>
    </div>
  </div>
</template>

<style scoped>
.tuning-panel {
  display: grid;
  gap: 1.25rem;
  min-inline-size: 0;
  padding: 1.25rem clamp(1rem, 2.5vw, 1.75rem) 1.5rem;
  border: 1px solid var(--pg-line);
  border-radius: 0.9rem;
  background: var(--pg-panel);
}

.panel-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 22rem);
  align-items: start;
  gap: 1rem clamp(1.5rem, 4vw, 3rem);
}

.panel-head-copy {
  display: grid;
  gap: 0.35rem;
}

.motion-preference {
  display: grid;
  gap: 0.5rem;
  padding-block-start: 0.9rem;
}

@media (max-width: 52rem) {
  .panel-head {
    grid-template-columns: minmax(0, 1fr);
  }
}

.panel-head h4 {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.panel-head p,
.panel-foot-note {
  max-inline-size: 46rem;
  color: var(--pg-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.tuning-panel :deep(.physics-groups) {
  gap: 0 2.5rem;
}

@media (min-width: 64rem) {
  .tuning-panel :deep(.physics-groups) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }
}

.tuning-panel :deep(.physics-group > summary) {
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@media (pointer: coarse) {
  .tuning-panel :deep(.physics-group > summary) {
    display: flex;
    align-items: center;
    min-block-size: 2.75rem;
    padding-block: 0;
  }

  .tuning-panel :deep(input[type="number"]) {
    min-block-size: 2.75rem;
  }

  .tuning-panel :deep(.physics-slider) {
    block-size: 2.75rem;
  }
}

.panel-foot {
  display: grid;
  gap: 0.75rem;
  padding-block-start: 1.1rem;
  border-block-start: 1px solid var(--pg-line);
}

.panel-close {
  justify-self: start;
  min-block-size: 2.75rem;
  padding: 0.4rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.panel-close:hover {
  background: var(--pg-bg);
}
</style>
