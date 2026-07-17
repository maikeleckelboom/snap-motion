<script setup lang="ts">
import type { LabPhysicsSettings, LabPresetName } from "@/fixtures/lab-types";

const props = defineProps<{
  modelValue: LabPhysicsSettings;
  preset: LabPresetName;
}>();

const emit = defineEmits<{
  reset: [];
  "update:modelValue": [value: LabPhysicsSettings];
  "update:preset": [value: LabPresetName];
}>();

interface NumericControl {
  key: keyof LabPhysicsSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const controls: NumericControl[] = [
  { key: "stiffness", label: "Stiffness", min: 50, max: 900, step: 5 },
  { key: "damping", label: "Damping", min: 1, max: 100, step: 1 },
  { key: "mass", label: "Mass", min: 0.1, max: 4, step: 0.05 },
  { key: "restSpeed", label: "Rest speed", min: 0.1, max: 20, step: 0.1, unit: "px/s" },
  { key: "restDistance", label: "Rest distance", min: 0.01, max: 5, step: 0.01, unit: "px" },
  {
    key: "projectionSeconds",
    label: "Projection",
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: "s",
  },
  {
    key: "flingVelocity",
    label: "Fling threshold",
    min: 100,
    max: 3_000,
    step: 25,
    unit: "px/s",
  },
  { key: "maxAnchorSkip", label: "Maximum skip", min: 1, max: 5, step: 1 },
  {
    key: "elasticResistance",
    label: "Elastic resistance",
    min: 1,
    max: 8,
    step: 0.05,
  },
  {
    key: "maxElasticDistance",
    label: "Elastic limit",
    min: 0,
    max: 160,
    step: 2,
    unit: "px",
  },
  {
    key: "programmaticImpulse",
    label: "Control impulse",
    min: 0,
    max: 2_500,
    step: 25,
    unit: "px/s",
  },
];

const presetNames: { label: string; value: LabPresetName }[] = [
  { label: "Tight", value: "tight" },
  { label: "Balanced", value: "balanced" },
  { label: "Heavy", value: "heavy" },
  { label: "Loose", value: "loose" },
];

function updateNumber(key: keyof LabPhysicsSettings, event: Event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  emit("update:modelValue", {
    ...props.modelValue,
    [key]: target.valueAsNumber,
  });
}

function updatePreset(event: Event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  emit("update:preset", target.value as LabPresetName);
}
</script>

<template>
  <section class="physics-controls" aria-labelledby="physics-title">
    <div class="physics-heading">
      <div>
        <p class="eyebrow">Temporal response</p>
        <h2 id="physics-title">Physics</h2>
      </div>
      <button type="button" class="reset-button" @click="emit('reset')">Reset to preset</button>
    </div>

    <label class="preset-control">
      <span>Preset</span>
      <select :value="preset" @change="updatePreset">
        <option v-for="item in presetNames" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </label>

    <div class="physics-fields">
      <label v-for="control in controls" :key="control.key" class="physics-field">
        <span>{{ control.label }}</span>
        <span class="physics-value tabular">
          <input
            :aria-label="control.label"
            :max="control.max"
            :min="control.min"
            :step="control.step"
            :value="modelValue[control.key]"
            type="number"
            @input="updateNumber(control.key, $event)"
          />
          <small v-if="control.unit">{{ control.unit }}</small>
        </span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.physics-controls {
  display: grid;
  gap: 1rem;
}

.physics-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.eyebrow {
  margin: 0 0 0.25rem;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: 1.15rem;
}

.reset-button {
  min-block-size: 2rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
}

.preset-control,
.physics-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7.5rem, 0.8fr);
  align-items: center;
  gap: 0.75rem;
  font-size: 0.82rem;
}

.preset-control {
  padding-block-end: 0.85rem;
  border-block-end: 1px solid var(--line);
}

select,
input {
  inline-size: 100%;
  min-block-size: 2.1rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
}

select {
  padding-inline: 0.5rem;
}

input {
  padding: 0.35rem 0.45rem;
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.physics-fields {
  display: grid;
  gap: 0.55rem;
}

.physics-value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.8rem;
  align-items: center;
  gap: 0.35rem;
}

.physics-value small {
  color: var(--muted);
  font-size: 0.68rem;
}

@media (max-width: 46rem) {
  .physics-controls {
    padding-block-start: 1.5rem;
  }
}
</style>
