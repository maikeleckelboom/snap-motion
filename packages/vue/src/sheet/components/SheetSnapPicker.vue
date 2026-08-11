<script setup lang="ts">
import { inject } from "vue";

import { sheetContextKey } from "../sheet-context";

defineProps<{ legend?: string }>();
const context = inject(sheetContextKey);
if (!context) throw new Error("SheetSnapPicker must be used inside Sheet.");
</script>

<template>
  <fieldset class="snap-motion-sheet-picker" data-snap-motion-keyboard-owner>
    <legend class="snap-motion-visually-hidden">
      {{ legend ?? context.messages.value.sheetSnapLegend }}
    </legend>
    <label
      v-for="point in context.points.value"
      :key="point.id"
      class="snap-motion-sheet-picker-option"
    >
      <input
        :checked="context.activeId.value === point.id"
        :disabled="point.disabled"
        :name="context.name"
        type="radio"
        :value="point.id"
        @change="context.navigateTo(point.id, 'picker')"
      />
      <span>{{ point.label }}</span>
    </label>
  </fieldset>
</template>
