<script setup lang="ts">
import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import CoverflowDemo from "./CoverflowDemo.vue";

defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();
</script>

<template>
  <CoverflowDemo
    presentation="stacked-deck"
    :reduced-motion-override="reducedMotionOverride"
    :settings="settings"
    :stage-width="stageWidth"
  />
</template>
