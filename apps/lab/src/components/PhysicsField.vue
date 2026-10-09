<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";

import type { InapplicablePhysicsSetting } from "../fixtures/lab-types";
import {
  normalizePhysicsDraft,
  parsePhysicsDraft,
  type PhysicsParameter,
} from "../fixtures/physics-parameters";

const props = defineProps<{
  modelValue: number;
  parameter: PhysicsParameter;
  inapplicable?: InapplicablePhysicsSetting | undefined;
  /** An external replacement discards drafts even when the numeric value did not change. */
  resetVersion: number;
}>();

const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const id = useId();
const draft = ref<string>();
let lastEmitted: number | undefined;
const effectiveValue = computed(() => props.inapplicable?.effectiveValue ?? props.modelValue);
const invalid = computed(
  () => draft.value !== undefined && parsePhysicsDraft(props.parameter, draft.value) === undefined,
);
const describedBy = computed(() =>
  [
    ...(invalid.value ? [`${id}-error`] : []),
    ...(props.inapplicable ? [`${id}-note`] : []),
    `${id}-description`,
  ].join(" "),
);
const invalidText = computed(() => {
  const { integer, min, max, unit } = props.parameter;
  const suffix = unit ? ` ${unit}` : "";
  return `Enter ${integer ? "a whole number" : "a number"} from ${min} to ${max}${suffix}. Still using ${props.modelValue}${suffix}.`;
});

watch(
  () => [props.modelValue, props.resetVersion, props.inapplicable] as const,
  ([value, version, applicability], [, previousVersion, previousApplicability]) => {
    if (
      value !== lastEmitted ||
      version !== previousVersion ||
      applicability !== previousApplicability
    )
      draft.value = undefined;
  },
);

function commitValue(value: number) {
  if (props.inapplicable || value === props.modelValue) return;
  lastEmitted = value;
  emit("update:modelValue", value);
}

function editDraft(event: Event) {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement) || props.inapplicable) return;
  // Native number inputs expose malformed text as an empty, incomplete draft.
  draft.value = input.value;
  const value = parsePhysicsDraft(props.parameter, input.value);
  if (value !== undefined) commitValue(value);
}

function settleDraft() {
  if (draft.value === undefined) return;
  const value = normalizePhysicsDraft(props.parameter, draft.value);
  draft.value = undefined;
  if (value !== undefined) commitValue(value);
}

function onNumberKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") settleDraft();
  else if (event.key === "Escape" && draft.value !== undefined) {
    event.preventDefault();
    draft.value = undefined;
  }
}

function applySliderValue(value: number): number | undefined {
  // Clear even an incomplete draft when the slider writes the already-committed value.
  draft.value = undefined;
  // Avoid decimal arithmetic noise without restricting precise numeric edits.
  const supported = normalizePhysicsDraft(props.parameter, String(Number(value.toPrecision(12))));
  if (supported !== undefined) commitValue(supported);
  return supported;
}

function onSliderInput(event: Event) {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement) || props.inapplicable) return;
  const { min, step } = props.parameter;
  const value = applySliderValue(min + Math.round((input.valueAsNumber - min) / step) * step);
  // step="any" keeps the thumb at exact numeric values between increments. Pointer edits snap to
  // the registry increment; update the DOM too when snapping leaves the shared value unchanged.
  if (value !== undefined) input.value = String(value);
}

function onSliderKeydown(event: KeyboardEvent) {
  const { min, max, step } = props.parameter;
  const adjustments: Record<string, number> = {
    ArrowRight: step,
    ArrowUp: step,
    ArrowLeft: -step,
    ArrowDown: -step,
    PageUp: step * 10,
    PageDown: -step * 10,
  };
  const adjustment = adjustments[event.key];
  if (event.key === "Home") applySliderValue(min);
  else if (event.key === "End") applySliderValue(max);
  else if (adjustment !== undefined) applySliderValue(effectiveValue.value + adjustment);
  else return;
  event.preventDefault();
}
</script>

<template>
  <div class="physics-field" :class="{ inapplicable }">
    <div class="field-heading">
      <label :for="`${id}-number`">{{ parameter.label }}</label>
      <span class="physics-value tabular">
        <input
          :id="`${id}-number`"
          :aria-describedby="describedBy"
          :aria-invalid="invalid ? 'true' : undefined"
          :aria-label="parameter.label"
          :disabled="inapplicable !== undefined"
          :max="parameter.max"
          :min="parameter.min"
          :step="parameter.integer ? 1 : 'any'"
          :value="draft ?? effectiveValue"
          type="number"
          @blur="settleDraft"
          @input="editDraft"
          @keydown="onNumberKeydown"
        />
        <small>{{ parameter.unit }}</small>
      </span>
      <input
        v-if="parameter.slider && !inapplicable"
        :aria-describedby="describedBy"
        :aria-label="`${parameter.label} slider`"
        :max="parameter.max"
        :min="parameter.min"
        :value="modelValue"
        class="physics-slider"
        step="any"
        type="range"
        @input="onSliderInput"
        @keydown="onSliderKeydown"
      />
    </div>
    <p :id="`${id}-description`" class="physics-description">{{ parameter.description }}</p>
    <p
      v-if="invalid"
      :id="`${id}-error`"
      class="physics-error"
      :data-testid="`physics-error-${parameter.key}`"
    >
      {{ invalidText }}
    </p>
    <p
      v-if="inapplicable"
      :id="`${id}-note`"
      class="physics-note"
      :data-testid="`physics-note-${parameter.key}`"
    >
      {{ inapplicable.reason }}
      <template v-if="inapplicable.effectiveValue !== undefined">
        Stored value: {{ modelValue }}.
      </template>
    </p>
  </div>
</template>

<style scoped>
.physics-field {
  display: grid;
  gap: 0.2rem;
  min-inline-size: 0;
}
.field-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 8rem;
  align-items: center;
  column-gap: 0.5rem;
  row-gap: 0.2rem;
  font-size: 0.82rem;
}

.field-heading:has(.physics-slider) .physics-value {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.physics-value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2rem;
  align-items: center;
  gap: 0.35rem;
}
.physics-value small {
  color: var(--muted);
  font-size: 0.68rem;
}
input[type="number"] {
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 2.1rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
  text-align: end;
  font-variant-numeric: tabular-nums;
}
input[aria-invalid="true"] {
  border-color: var(--danger);
  box-shadow: inset 0 0 0 1px var(--danger);
}
input:disabled {
  color: var(--muted);
  cursor: not-allowed;
}
.physics-slider {
  inline-size: 100%;
  min-inline-size: 0;
  block-size: 1.5rem;
  margin: 0;
  accent-color: var(--ink);
  cursor: pointer;
}
.physics-description,
.physics-note,
.physics-error {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.4;
}
.physics-description,
.physics-note {
  color: var(--muted);
}
.physics-error {
  color: var(--danger);
  font-weight: 700;
}
</style>
