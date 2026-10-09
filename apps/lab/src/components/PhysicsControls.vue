<script setup lang="ts">
import { computed, reactive, watch } from "vue";

import type {
  InapplicablePhysicsSetting,
  LabPhysicsSettings,
  LabPresetName,
} from "@/fixtures/lab-types";
import {
  normalizePhysicsDraft,
  parsePhysicsDraft,
  physicsParameters,
  type PhysicsKey,
  type PhysicsParameter,
} from "@/fixtures/physics-parameters";

const props = defineProps<{
  modelValue: LabPhysicsSettings;
  /** Shared settings that differ from the selected preset, counted across every surface. */
  modifiedCount: number;
  preset: LabPresetName;
  /**
   * Controls the active surface does not consume, keyed by setting and explained in place. The
   * stored value stays untouched so every other surface keeps using it.
   */
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

/**
 * Text typed into a field and not yet settled by Enter, blur or Escape. A draft is emitted only while
 * it parses to a supported value, so an empty, malformed or out-of-range entry never leaves this
 * component. A field without a draft shows the committed value.
 */
const drafts = reactive<Partial<Record<PhysicsKey, string>>>({});
let lastEmitted: LabPhysicsSettings | undefined;

const presetState = computed(() => {
  const label = presetNames.find(({ value }) => value === props.preset)?.label ?? props.preset;
  return `${label} · ${props.modifiedCount === 0 ? "Preset" : `Modified (${props.modifiedCount})`}`;
});

const fields = computed(() =>
  physicsParameters.map((parameter) => {
    const draft = drafts[parameter.key];
    const inapplicable = props.notApplicable?.[parameter.key];
    return {
      inapplicable,
      invalid: draft !== undefined && parsePhysicsDraft(parameter, draft) === undefined,
      parameter,
      // A surface that fixes a setting shows the value it uses; the stored one is in the note.
      value: draft ?? inapplicable?.effectiveValue ?? props.modelValue[parameter.key],
    };
  }),
);

// A preset, a reset or any other writer replaces the settings object; open drafts yield to it.
watch(
  () => props.modelValue,
  (settings) => {
    if (settings === lastEmitted) return;
    for (const { key } of physicsParameters) delete drafts[key];
  },
);

function invalidDraftText(parameter: PhysicsParameter) {
  const unit = parameter.unit ? ` ${parameter.unit}` : "";
  const kind = parameter.integer ? "a whole number" : "a number";
  return `Enter ${kind} from ${parameter.min} to ${parameter.max}${unit}. Still using ${props.modelValue[parameter.key]}${unit}.`;
}

function describedBy(key: PhysicsKey, invalid: boolean, inapplicable: boolean) {
  const ids = [
    ...(invalid ? [`physics-error-${key}`] : []),
    ...(inapplicable ? [`physics-note-${key}`] : []),
  ];
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function commitValue(key: PhysicsKey, value: number) {
  if (value === props.modelValue[key]) return;
  lastEmitted = { ...props.modelValue, [key]: value };
  emit("update:modelValue", lastEmitted);
}

function editDraft(parameter: PhysicsParameter, event: Event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  // A number input reports malformed text as an empty value, which stays an incomplete draft.
  drafts[parameter.key] = target.value;
  const value = parsePhysicsDraft(parameter, target.value);
  if (value !== undefined) commitValue(parameter.key, value);
}

/** Enter and blur: keep a supported value, bound a finite one, and otherwise keep the committed one. */
function settleDraft(parameter: PhysicsParameter) {
  const draft = drafts[parameter.key];
  if (draft === undefined) return;
  delete drafts[parameter.key];
  const value = normalizePhysicsDraft(parameter, draft);
  if (value !== undefined) commitValue(parameter.key, value);
}

function onFieldKeydown(parameter: PhysicsParameter, event: KeyboardEvent) {
  if (event.key === "Enter") {
    settleDraft(parameter);
  } else if (event.key === "Escape" && drafts[parameter.key] !== undefined) {
    // Valid keystrokes were already applied live, so the committed value is the shared one.
    event.preventDefault();
    delete drafts[parameter.key];
  }
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

    <div class="physics-fields">
      <label
        v-for="field in fields"
        :key="field.parameter.key"
        class="physics-field"
        :class="{ inapplicable: field.inapplicable !== undefined }"
      >
        <span>{{ field.parameter.label }}</span>
        <span class="physics-value tabular">
          <input
            :aria-describedby="
              describedBy(field.parameter.key, field.invalid, field.inapplicable !== undefined)
            "
            :aria-invalid="field.invalid ? 'true' : undefined"
            :aria-label="field.parameter.label"
            :disabled="field.inapplicable !== undefined"
            :max="field.parameter.max"
            :min="field.parameter.min"
            :step="field.parameter.step"
            :value="field.value"
            type="number"
            @blur="settleDraft(field.parameter)"
            @input="editDraft(field.parameter, $event)"
            @keydown="onFieldKeydown(field.parameter, $event)"
          />
          <small v-if="field.parameter.unit">{{ field.parameter.unit }}</small>
        </span>
        <small
          v-if="field.invalid"
          :id="`physics-error-${field.parameter.key}`"
          class="physics-error"
          :data-testid="`physics-error-${field.parameter.key}`"
        >
          {{ invalidDraftText(field.parameter) }}
        </small>
        <small
          v-if="field.inapplicable"
          :id="`physics-note-${field.parameter.key}`"
          class="physics-note"
          :data-testid="`physics-note-${field.parameter.key}`"
        >
          {{ field.inapplicable.reason }}
          <template v-if="field.inapplicable.effectiveValue !== undefined">
            Stored value: {{ modelValue[field.parameter.key] }}.
          </template>
        </small>
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

.preset-block {
  display: grid;
  gap: 0.4rem;
  padding-block-end: 0.85rem;
  border-block-end: 1px solid var(--line);
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

input[aria-invalid="true"] {
  border-color: var(--danger);
  box-shadow: inset 0 0 0 1px var(--danger);
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

.physics-note,
.physics-error {
  grid-column: 1 / -1;
  font-size: 0.68rem;
  line-height: 1.35;
}

.physics-note {
  color: var(--muted);
}

.physics-error {
  color: var(--danger);
  font-weight: 700;
}

input:disabled {
  color: var(--muted);
  cursor: not-allowed;
}

@media (max-width: 46rem) {
  .physics-controls {
    padding-block-start: 1.5rem;
  }
}
</style>
