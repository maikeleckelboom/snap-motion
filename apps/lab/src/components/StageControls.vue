<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    max?: number;
    min?: number;
    modelValue: number;
  }>(),
  { max: 1_280, min: 280 },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const presets = [
  { label: "Phone", value: 360 },
  { label: "Tablet", value: 768 },
  { label: "Desktop", value: 1_120 },
];

function update(event: Event) {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) {
    emit("update:modelValue", target.valueAsNumber);
  }
}
</script>

<template>
  <div class="stage-controls" aria-label="Lab stage width">
    <div class="stage-presets">
      <button
        v-for="preset in presets"
        :key="preset.value"
        :aria-pressed="modelValue === preset.value"
        type="button"
        @click="emit('update:modelValue', preset.value)"
      >
        {{ preset.label }}
      </button>
    </div>
    <label>
      <span>Stage width</span>
      <input
        :max="props.max"
        :min="props.min"
        :value="modelValue"
        step="8"
        type="range"
        @input="update"
      />
      <output class="tabular">{{ modelValue }} px</output>
    </label>
  </div>
</template>

<style scoped>
.stage-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.stage-presets {
  display: flex;
}

button {
  min-block-size: 2rem;
  padding: 0.35rem 0.65rem;
  margin-inline-end: -1px;
  font-size: 0.75rem;
}

button[aria-pressed="true"] {
  position: relative;
  z-index: 1;
  background: var(--ink);
  color: var(--paper);
}

label {
  display: grid;
  grid-template-columns: auto minmax(8rem, 14rem) 4.5rem;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.75rem;
}

output {
  text-align: end;
}

@media (max-width: 38rem) {
  label {
    inline-size: 100%;
    grid-template-columns: auto minmax(0, 1fr) 4.5rem;
  }
}
</style>
