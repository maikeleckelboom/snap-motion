<script setup lang="ts">
import { computed, useId } from "vue";

import PhysicsGroups from "@/components/PhysicsGroups.vue";
import type {
  InapplicablePhysicsSetting,
  LabPhysicsSettings,
  LabPresetName,
} from "@/fixtures/lab-types";
import type { PhysicsKey } from "@/fixtures/physics-parameters";

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

const id = useId();
const presetNames: { label: string; value: LabPresetName }[] = [
  { label: "Tight", value: "tight" },
  { label: "Balanced", value: "balanced" },
  { label: "Heavy", value: "heavy" },
  { label: "Loose", value: "loose" },
];
const presetState = computed(() => {
  const label = presetNames.find(({ value }) => value === props.preset)?.label ?? props.preset;
  return `${label} · ${props.modifiedCount === 0 ? "Preset" : `Modified (${props.modifiedCount})`}`;
});

function updatePreset(event: Event) {
  const target = event.currentTarget;
  if (target instanceof HTMLSelectElement) emit("update:preset", target.value as LabPresetName);
}
</script>

<template>
  <section class="physics-controls" :aria-labelledby="`${id}-title`">
    <div class="physics-heading">
      <h2 :id="`${id}-title`">Physics</h2>
      <button type="button" class="reset-button" @click="emit('reset')">Reset to preset</button>
    </div>
    <div class="preset-block">
      <label class="preset-control">
        <span>Preset</span>
        <select :aria-describedby="`${id}-preset-state`" :value="preset" @change="updatePreset">
          <option v-for="item in presetNames" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
      <p
        :id="`${id}-preset-state`"
        class="preset-state"
        :data-modified="modifiedCount > 0 ? 'true' : 'false'"
        data-testid="physics-preset-state"
        role="status"
      >
        {{ presetState }}
      </p>
    </div>
    <PhysicsGroups
      :model-value="modelValue"
      :not-applicable="notApplicable"
      @update:model-value="emit('update:modelValue', $event)"
    />
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
</style>
