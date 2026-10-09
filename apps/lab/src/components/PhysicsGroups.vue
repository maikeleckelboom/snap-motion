<script setup lang="ts">
import { ref, watch } from "vue";

import PhysicsField from "@/components/PhysicsField.vue";
import type { InapplicablePhysicsSetting, LabPhysicsSettings } from "@/fixtures/lab-types";
import { physicsGroups, physicsParameters, type PhysicsKey } from "@/fixtures/physics-parameters";

const props = withDefaults(
  defineProps<{
    modelValue: LabPhysicsSettings;
    notApplicable?: Partial<Record<PhysicsKey, InapplicablePhysicsSetting>> | undefined;
    /** `all` opens every group; `default` opens only the groups the registry marks open. */
    open?: "all" | "default";
  }>(),
  { open: "default" },
);
const emit = defineEmits<{ "update:modelValue": [value: LabPhysicsSettings] }>();

const groups = physicsGroups.map((group) => ({
  ...group,
  parameters: physicsParameters.filter((parameter) => parameter.group === group.key),
}));
const resetVersion = ref(0);
let lastEmitted: LabPhysicsSettings | undefined;

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
</script>

<template>
  <div class="physics-groups">
    <details
      v-for="group in groups"
      :key="group.key"
      :open="open === 'all' || group.defaultOpen"
      class="physics-group"
      :data-group="group.key"
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
</template>

<style scoped>
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
