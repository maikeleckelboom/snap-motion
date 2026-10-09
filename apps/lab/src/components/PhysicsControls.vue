<script setup lang="ts">
import { computed, ref, watch } from "vue";

import PhysicsField from "@/components/PhysicsField.vue";
import type {
  InapplicablePhysicsSetting,
  LabPhysicsSettings,
  LabPresetName,
} from "@/fixtures/lab-types";
import { physicsGroups, physicsParameters, type PhysicsKey } from "@/fixtures/physics-parameters";

const props = defineProps<{
  modelValue: LabPhysicsSettings;
  /** Counts every shared setting, including settings fixed or ignored by the active surface. */
  modifiedCount: number;
  preset: LabPresetName;
  notApplicable?: Partial<Record<PhysicsKey, InapplicablePhysicsSetting>>;
}>();
const emit = defineEmits<{
  reset: [];
  "update:modelValue": [value: LabPhysicsSettings];
  "update:preset": [value: LabPresetName];
}>();

const presetNames: { label: string; value: LabPresetName }[] = [
  { label: "Tight", value: "tight" },
  { label: "Balanced", value: "balanced" },
  { label: "Heavy", value: "heavy" },
  { label: "Loose", value: "loose" },
];
const groups = physicsGroups.map((group) => ({
  ...group,
  parameters: physicsParameters.filter((parameter) => parameter.group === group.key),
}));
const resetVersion = ref(0);
let lastEmitted: LabPhysicsSettings | undefined;
const presetState = computed(() => {
  const label = presetNames.find(({ value }) => value === props.preset)?.label ?? props.preset;
  return `${label} · ${props.modifiedCount === 0 ? "Preset" : `Modified (${props.modifiedCount})`}`;
});

// Local field edits preserve sibling drafts. Every external replacement clears all drafts, even
// when a preset contains the same value as the setting behind an incomplete draft.
watch(
  () => props.modelValue,
  (settings) => {
    if (settings !== lastEmitted) resetVersion.value += 1;
  },
);

function commitValue(key: PhysicsKey, value: number) {
  if (value === props.modelValue[key]) return;
  lastEmitted = { ...props.modelValue, [key]: value };
  emit("update:modelValue", lastEmitted);
}

function updatePreset(event: Event) {
  const target = event.currentTarget;
  if (target instanceof HTMLSelectElement) emit("update:preset", target.value as LabPresetName);
}
</script>

<template>
  <section class="physics-controls" aria-labelledby="physics-title">
    <div class="physics-heading">
      <h2 id="physics-title">Physics</h2>
      <button type="button" class="reset-button" @click="emit('reset')">Reset to preset</button>
    </div>
    <div class="preset-block">
      <label class="preset-control">
        <span>Preset</span>
        <select aria-describedby="physics-preset-state" :value="preset" @change="updatePreset">
          <option v-for="item in presetNames" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
      <p
        id="physics-preset-state"
        class="preset-state"
        :data-modified="modifiedCount > 0 ? 'true' : 'false'"
        data-testid="physics-preset-state"
        role="status"
      >
        {{ presetState }}
      </p>
    </div>
    <div class="physics-groups">
      <details
        v-for="group in groups"
        :key="group.key"
        :open="group.defaultOpen"
        class="physics-group"
      >
        <summary>{{ group.label }}</summary>
        <fieldset>
          <legend class="sr-only">{{ group.label }}</legend>
          <PhysicsField
            v-for="parameter in group.parameters"
            :key="parameter.key"
            :parameter="parameter"
            :model-value="modelValue[parameter.key]"
            :inapplicable="notApplicable?.[parameter.key]"
            :reset-version="resetVersion"
            @update:model-value="commitValue(parameter.key, $event)"
          />
        </fieldset>
      </details>
    </div>
  </section>
</template>

<style scoped>
.physics-controls {
  display: grid;
  gap: 0.7rem;
  min-inline-size: 0;
}
.physics-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
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
.preset-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7.5rem, 0.8fr);
  align-items: center;
  gap: 0.75rem;
  font-size: 0.82rem;
}
.preset-block {
  display: grid;
  gap: 0.4rem;
}
.preset-state {
  margin: 0;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  text-align: end;
}
.preset-state[data-modified="true"] {
  color: var(--ink);
}
select {
  inline-size: 100%;
  min-block-size: 2.1rem;
  padding-inline: 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
}
.physics-groups {
  display: grid;
  min-inline-size: 0;
}
.physics-group {
  min-inline-size: 0;
  border-block-start: 1px solid var(--line);
}
.physics-group > summary {
  padding-block: 0.6rem;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
fieldset {
  display: grid;
  gap: 0.6rem;
  min-inline-size: 0;
  margin: 0;
  padding: 0 0 0.65rem;
  border: 0;
}
@media (min-width: 40rem) and (max-width: 72rem) {
  .physics-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 2rem;
    align-items: start;
  }
}
</style>
