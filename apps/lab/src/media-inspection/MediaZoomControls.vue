<script setup lang="ts">
defineProps<{
  canZoomIn: boolean;
  canZoomOut: boolean;
  isPanning: boolean;
  scalePercentage: number;
}>();

defineEmits<{
  reset: [];
  zoomIn: [];
  zoomOut: [];
}>();
</script>

<template>
  <div
    aria-label="Media zoom controls"
    class="media-zoom-controls"
    data-testid="media-zoom-controls"
    role="group"
  >
    <button
      aria-label="Zoom out"
      :disabled="!canZoomOut"
      data-testid="media-zoom-out"
      type="button"
      @click="$emit('zoomOut')"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>
    <output aria-live="polite" class="media-zoom-value tabular" data-testid="media-zoom-value">
      {{ scalePercentage }}%
    </output>
    <button
      aria-label="Zoom in"
      :disabled="!canZoomIn"
      data-testid="media-zoom-in"
      type="button"
      @click="$emit('zoomIn')"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>
    <button
      class="media-zoom-reset"
      :disabled="!canZoomOut"
      data-testid="media-zoom-reset"
      type="button"
      @click="$emit('reset')"
    >
      Fit
    </button>
    <span class="sr-only" role="status">{{ isPanning ? "Panning media" : "" }}</span>
  </div>
</template>

<style scoped>
.media-zoom-controls {
  display: grid;
  grid-template-columns: 2.5rem minmax(4.1rem, auto) 2.5rem auto;
  align-items: center;
  border: 1px solid var(--lightbox-control-border);
  background: var(--lightbox-canvas);
}

.media-zoom-controls button {
  display: grid;
  place-items: center;
  min-inline-size: 2.5rem;
  block-size: 2.5rem;
  min-block-size: 2.5rem;
  padding: 0;
  border: 0;
  border-inline-end: 1px solid var(--lightbox-control-border);
  border-radius: 0;
  background: var(--lightbox-surface-raised);
  color: var(--lightbox-text);
}

.media-zoom-controls button:not(:disabled):hover {
  background: var(--lightbox-control-hover);
}

.media-zoom-controls button:disabled {
  background: var(--lightbox-canvas);
  color: var(--lightbox-disabled);
  opacity: 1;
}

.media-zoom-controls button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 3px solid var(--lightbox-focus);
  outline-offset: 3px;
  box-shadow: 0 0 0 8px var(--lightbox-canvas);
}

.media-zoom-controls .media-zoom-reset {
  min-inline-size: 3.5rem;
  padding-inline: 0.65rem;
  border-inline-end: 0;
  border-inline-start: 1px solid var(--lightbox-control-border);
  font-size: 0.75rem;
  font-weight: 750;
}

.media-zoom-value {
  min-inline-size: 0;
  color: var(--lightbox-text);
  font-size: 0.75rem;
  font-weight: 750;
  text-align: center;
}

@media (max-width: 30rem), (max-height: 30rem) {
  .media-zoom-controls {
    grid-template-columns: 2.5rem 3.7rem 2.5rem;
  }

  .media-zoom-reset {
    display: none !important;
  }
}
</style>
