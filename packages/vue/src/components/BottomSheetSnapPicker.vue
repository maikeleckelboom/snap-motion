<script setup lang="ts">
import { inject } from "vue";

import { bottomSheetContextKey } from "./bottom-sheet-context";

withDefaults(defineProps<{ legend?: string }>(), { legend: "Sheet height" });
const context = inject(bottomSheetContextKey);
if (!context) throw new Error("BottomSheetSnapPicker must be used inside BottomSheet.");
const ids = ["full", "comfortable", "compact"] as const;
</script>

<template>
  <fieldset class="snap-motion-sheet-picker">
    <legend class="snap-motion-visually-hidden">{{ legend }}</legend>
    <label v-for="id in ids" :key="id" class="snap-motion-sheet-picker-option">
      <input
        :checked="context.activeId() === id"
        :name="context.name"
        type="radio"
        :value="id"
        @change="context.requestSnap(id, 'picker')"
      />
      <span>{{ context.labels[id] }}</span>
    </label>
  </fieldset>
</template>
