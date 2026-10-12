<script setup lang="ts">
import { computed } from "vue";

import { responseChart, type CandidateBehavior } from "./candidates";

/**
 * A candidate drawn from its own data: the mark of its surface above the step response its spring
 * computes. It is the candidate's picture in the list, in the detail and on a Deck card, and the
 * shared element when the list opens a detail, so it must look the same wherever it appears.
 *
 * The curve is the engine's own spring stepped on one card-width move. It is a computed response,
 * not a recording of motion on this page.
 */
const props = defineProps<{ behavior: CandidateBehavior }>();

const chart = computed(() => responseChart([props.behavior]));
const curve = computed(() => chart.value.curves[0]!.path);
const tone = computed(() => (props.behavior.surface === "rail" ? "#cfd6dc" : "#ead2bf"));
</script>

<template>
  <svg
    aria-hidden="true"
    class="glyph"
    focusable="false"
    preserveAspectRatio="xMidYMid meet"
    viewBox="0 0 320 224"
    :style="{ '--glyph-tone': tone }"
  >
    <rect class="glyph-plate" height="224" rx="14" width="320" />
    <g v-if="behavior.surface === 'rail'" class="glyph-mark">
      <path class="mark-side" d="M64 34l46-12v64l-46-12z" />
      <path class="mark-side" d="M256 34l-46-12v64l46-12z" />
      <path class="mark-side" d="M28 40l26-7v50l-26-7z" />
      <path class="mark-side" d="M292 40l-26-7v50l26-7z" />
      <rect class="mark-front" height="76" rx="6" width="92" x="114" y="16" />
    </g>
    <g v-else class="glyph-mark">
      <rect
        class="mark-side"
        height="72"
        rx="6"
        transform="rotate(-7 160 52)"
        width="92"
        x="124"
        y="22"
      />
      <rect
        class="mark-side"
        height="72"
        rx="6"
        transform="rotate(5 160 52)"
        width="92"
        x="118"
        y="18"
      />
      <rect class="mark-front" height="72" rx="6" width="92" x="114" y="14" />
    </g>
    <g transform="translate(0 100)">
      <line class="glyph-target" :x1="8" :x2="312" :y1="chart.targetY" :y2="chart.targetY" />
      <path class="glyph-curve" :d="curve" />
    </g>
  </svg>
</template>

<style scoped>
.glyph {
  display: block;
  inline-size: 100%;
  block-size: auto;
  aspect-ratio: 10 / 7;
}

.glyph-plate {
  fill: var(--glyph-tone);
}

.mark-front {
  fill: var(--pg-ink);
}

.mark-side {
  fill: var(--pg-ink);
  opacity: 0.32;
}

.glyph-target {
  stroke: var(--pg-ink);
  stroke-dasharray: 3 5;
  stroke-opacity: 0.4;
  stroke-width: 1.5;
}

.glyph-curve {
  fill: none;
  stroke: var(--pg-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 4;
}
</style>
