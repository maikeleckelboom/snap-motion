<script setup lang="ts">
import { computed } from "vue";

import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { PREVIEW_TRAVEL_PX, sampleSpringResponse } from "../spring-response";

const props = defineProps<{
  settings: LabPhysicsSettings;
  /** Reduced motion skips the spring settle, so the plot describes something the page is not doing. */
  skipped: boolean;
}>();

const WIDTH = 320;
const HEIGHT = 96;
const PAD = 6;
const response = computed(() => sampleSpringResponse(props.settings));
const duration = computed(() =>
  Math.min(4, Math.max(0.5, (response.value.settleSeconds ?? 4) * 1.15)),
);
const ceiling = computed(() => Math.max(1.12, 1 + response.value.overshoot + 0.06));

function x(time: number): number {
  return PAD + (time / duration.value) * (WIDTH - PAD * 2);
}

function y(progress: number): number {
  return HEIGHT - PAD - (progress / ceiling.value) * (HEIGHT - PAD * 2);
}

const curve = computed(() =>
  response.value.samples
    .filter(({ time }) => time <= duration.value)
    .map(
      ({ time, progress }, index) =>
        `${index === 0 ? "M" : "L"}${x(time).toFixed(1)},${y(progress).toFixed(1)}`,
    )
    .join(" "),
);
const summary = computed(() => {
  const { overshoot, settleSeconds } = response.value;
  const settle =
    settleSeconds === undefined
      ? "does not settle within 4 seconds"
      : `settles in ${settleSeconds.toFixed(2)} seconds`;
  const over =
    overshoot < 0.005 ? "no overshoot" : `overshoots by ${Math.round(overshoot * 100)} percent`;
  return `Spring response for a ${PREVIEW_TRAVEL_PX} pixel move from rest: ${settle}, ${over}.`;
});
</script>

<template>
  <figure
    class="spring-preview"
    :data-skipped="skipped ? 'true' : 'false'"
    data-testid="spring-preview"
  >
    <figcaption class="preview-title">Spring response</figcaption>
    <svg
      class="preview-plot"
      role="img"
      :aria-label="summary"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
    >
      <line class="preview-rest" :x1="PAD" :x2="WIDTH - PAD" :y1="y(0)" :y2="y(0)" />
      <line class="preview-target" :x1="PAD" :x2="WIDTH - PAD" :y1="y(1)" :y2="y(1)" />
      <line
        v-if="response.settleSeconds !== undefined"
        class="preview-settle"
        :x1="x(response.settleSeconds)"
        :x2="x(response.settleSeconds)"
        :y1="y(0)"
        :y2="y(1)"
      />
      <path class="preview-curve" :d="curve" />
    </svg>
    <p class="preview-readout tabular" data-testid="spring-readout">
      <span>
        {{
          response.settleSeconds === undefined
            ? "No settle in 4 s"
            : `Settles in ${response.settleSeconds.toFixed(2)} s`
        }}
      </span>
      <span>
        {{
          response.overshoot < 0.005
            ? "No overshoot"
            : `Overshoot ${Math.round(response.overshoot * 100)}%`
        }}
      </span>
    </p>
    <p class="preview-note">
      One card-width move from rest, stepped by the engine's own spring. Release velocity, elastic
      edges and reduced motion are not shown.
      <template v-if="skipped"> Reduced motion is on, so surfaces skip this settle.</template>
    </p>
  </figure>
</template>

<style scoped>
.spring-preview {
  display: grid;
  gap: 0.4rem;
  min-inline-size: 0;
  margin: 0;
}

.preview-title {
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.preview-plot {
  inline-size: 100%;
  block-size: 6rem;
  border: 1px solid var(--pg-line);
  border-radius: 0.5rem;
  background: var(--pg-white);
}

.preview-rest,
.preview-target {
  stroke: var(--pg-line);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.preview-target {
  stroke: var(--pg-muted);
  stroke-dasharray: 3 3;
}

.preview-settle {
  stroke: var(--pg-accent);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.preview-curve {
  fill: none;
  stroke: var(--pg-ink);
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.preview-readout {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 1.25rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.preview-note {
  color: var(--pg-muted);
  font-size: 0.75rem;
  line-height: 1.45;
}

.spring-preview[data-skipped="true"] .preview-plot {
  opacity: 0.45;
}
</style>
