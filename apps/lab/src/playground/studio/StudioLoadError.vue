<script setup lang="ts">
import { inject } from "vue";

import { studioRetryKey } from "./studio-activation";

const retry = inject(studioRetryKey, undefined);
</script>

<template>
  <div class="studio-error" data-testid="studio-load-error" role="alert">
    <p>Motion Studio could not be loaded. Check your connection and try again.</p>
    <button type="button" @click="retry?.()">Try again</button>
  </div>
</template>

<style scoped>
.studio-error {
  display: grid;
  justify-items: start;
  align-content: center;
  gap: 0.75rem;
  min-block-size: inherit;
  padding-inline: 1rem;
  color: var(--pg-ink-soft);
}

.studio-error button {
  min-block-size: 2.75rem;
  padding-inline: 1rem;
  font-weight: 600;
}
</style>
