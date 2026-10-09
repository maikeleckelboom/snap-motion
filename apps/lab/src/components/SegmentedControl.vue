<script setup lang="ts" generic="T extends string">
import { useId } from "vue";

export interface SegmentedOption<Value extends string> {
  label: string;
  value: Value;
  testid?: string;
}

defineProps<{
  /** Name of the group: its accessible name, and visible unless `labelHidden`. */
  label: string;
  labelHidden?: boolean;
  /** Extra description, for example a note that applies to the whole group. */
  describedBy?: string;
  modelValue: T;
  options: readonly SegmentedOption<T>[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const id = useId();
</script>

<template>
  <div
    class="segmented"
    role="group"
    :aria-describedby="describedBy"
    :aria-labelledby="`${id}-label`"
  >
    <span :id="`${id}-label`" class="segmented-label" :class="{ 'sr-only': labelHidden }">{{
      label
    }}</span>
    <div class="segmented-options">
      <button
        v-for="option in options"
        :key="option.value"
        :aria-pressed="modelValue === option.value"
        :data-testid="option.testid"
        type="button"
        @click="emit('update:modelValue', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.segmented {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
  min-inline-size: 0;
}
.segmented-label {
  color: var(--muted);
  font-family: var(--pg-font-mono, ui-monospace, monospace);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.segmented-options {
  display: inline-flex;
  max-inline-size: 100%;
  border: 1px solid var(--strong);
  border-radius: 0.6rem;
  background: var(--paper);
  overflow: hidden;
}
.segmented-options button {
  min-block-size: 2.75rem;
  padding: 0.4rem 1rem;
  border: 0;
  border-inline-end: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  font-size: 0.9rem;
  font-weight: 600;
}
.segmented-options button:last-child {
  border-inline-end: 0;
}
.segmented-options button:hover:not([aria-pressed="true"]) {
  background: var(--surface);
}
.segmented-options button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
}
.segmented-options button:focus-visible {
  position: relative;
  z-index: 1;
  outline-offset: -3px;
}
.segmented-options button[aria-pressed="true"]:focus-visible {
  outline-color: var(--paper);
  box-shadow: 0 0 0 2px var(--focus);
}
@media (max-width: 30rem) {
  .segmented-options {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    inline-size: 100%;
  }
  .segmented-options button {
    padding-inline: 0.4rem;
  }
}
</style>
