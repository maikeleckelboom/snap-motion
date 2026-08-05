<script setup lang="ts">
import type { LabDiagnostics } from "@/fixtures/lab-types";

defineProps<{
  diagnostics: LabDiagnostics;
  open?: boolean;
}>();

function scalar(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}
</script>

<template>
  <details class="diagnostics" :open="open" data-testid="diagnostics">
    <summary>Live diagnostics</summary>
    <dl class="diagnostics-grid tabular">
      <div>
        <dt>Phase</dt>
        <dd data-testid="phase">{{ diagnostics.phase }}</dd>
      </div>
      <div>
        <dt>Position</dt>
        <dd data-testid="position">{{ scalar(diagnostics.position) }} px</dd>
      </div>
      <div>
        <dt>Velocity</dt>
        <dd>{{ scalar(diagnostics.velocity) }} px/s</dd>
      </div>
      <div v-if="diagnostics.speedInCards !== undefined">
        <dt>Card velocity</dt>
        <dd data-testid="speed-in-cards">{{ scalar(diagnostics.speedInCards) }} cards/s</dd>
      </div>
      <div v-if="diagnostics.physicalIndex !== undefined">
        <dt>Physical index</dt>
        <dd data-testid="physical-index">{{ scalar(diagnostics.physicalIndex) }}</dd>
      </div>
      <div v-if="diagnostics.motionPitch !== undefined">
        <dt>Motion pitch</dt>
        <dd data-testid="motion-pitch">{{ scalar(diagnostics.motionPitch) }} px</dd>
      </div>
      <div v-if="diagnostics.pairFraction !== undefined">
        <dt>Pair fraction</dt>
        <dd data-testid="pair-fraction">{{ scalar(diagnostics.pairFraction) }}</dd>
      </div>
      <div v-if="diagnostics.passingLane !== undefined">
        <dt>Passing lane</dt>
        <dd data-testid="passing-lane">{{ scalar(diagnostics.passingLane) }}</dd>
      </div>
      <div v-if="diagnostics.ownerIndex !== undefined">
        <dt>Paint owner</dt>
        <dd data-testid="owner-index">{{ diagnostics.ownerIndex }}</dd>
      </div>
      <div v-if="diagnostics.tuningProfile !== undefined">
        <dt>Tuning profile</dt>
        <dd data-testid="tuning-profile">{{ diagnostics.tuningProfile }}</dd>
      </div>
      <div v-if="diagnostics.visualIndex !== undefined">
        <dt>Visual index</dt>
        <dd data-testid="visual-index">{{ diagnostics.visualIndex }}</dd>
      </div>
      <div v-if="diagnostics.settledIndex !== undefined">
        <dt>Settled index</dt>
        <dd data-testid="settled-index">{{ diagnostics.settledIndex }}</dd>
      </div>
      <div>
        <dt>Target</dt>
        <dd data-testid="target-id">{{ diagnostics.targetId ?? "—" }}</dd>
      </div>
      <div v-if="diagnostics.targetIndex !== undefined">
        <dt>Target index</dt>
        <dd data-testid="target-index">{{ diagnostics.targetIndex }}</dd>
      </div>
      <div>
        <dt>Active</dt>
        <dd data-testid="active-id">{{ diagnostics.activeId ?? "—" }}</dd>
      </div>
      <div v-if="diagnostics.focusedPaginationIndex !== undefined">
        <dt>Focused pagination</dt>
        <dd data-testid="focused-pagination-index">{{ diagnostics.focusedPaginationIndex }}</dd>
      </div>
      <div v-if="diagnostics.keyboardTargetIndex !== undefined">
        <dt>Keyboard target</dt>
        <dd data-testid="keyboard-target-index">{{ diagnostics.keyboardTargetIndex }}</dd>
      </div>
      <div v-if="diagnostics.indicatorX !== undefined">
        <dt>Indicator x</dt>
        <dd data-testid="indicator-x">{{ scalar(diagnostics.indicatorX) }} px</dd>
      </div>
      <div v-if="diagnostics.indicatorScale !== undefined">
        <dt>Indicator scale</dt>
        <dd data-testid="indicator-scale">{{ scalar(diagnostics.indicatorScale) }}</dd>
      </div>
      <div v-if="diagnostics.centerInfluence !== undefined">
        <dt>Center influence</dt>
        <dd>{{ scalar(diagnostics.centerInfluence) }}</dd>
      </div>
      <div v-if="diagnostics.kineticFocus !== undefined">
        <dt>Kinetic focus</dt>
        <dd data-testid="kinetic-focus">{{ scalar(diagnostics.kineticFocus) }}</dd>
      </div>
      <div v-if="diagnostics.settledness !== undefined">
        <dt>Settledness</dt>
        <dd>{{ scalar(diagnostics.settledness) }}</dd>
      </div>
      <div v-if="diagnostics.releaseVelocityCapActive !== undefined">
        <dt>Free velocity cap</dt>
        <dd data-testid="release-cap">
          {{ diagnostics.releaseVelocityCapActive ? "active" : "clear" }}
        </dd>
      </div>
      <div v-if="diagnostics.maxAnchorSkip !== undefined">
        <dt>Maximum skip</dt>
        <dd>{{ diagnostics.maxAnchorSkip }}</dd>
      </div>
      <div>
        <dt>Bounds</dt>
        <dd>[{{ scalar(diagnostics.bounds.min) }}, {{ scalar(diagnostics.bounds.max) }}]</dd>
      </div>
      <div>
        <dt>Viewport</dt>
        <dd>{{ scalar(diagnostics.viewportSize) }} px</dd>
      </div>
      <div v-if="diagnostics.visualViewportHeight !== undefined">
        <dt>Visual viewport</dt>
        <dd data-testid="visual-viewport-height">
          {{ scalar(diagnostics.visualViewportHeight) }} px
        </dd>
      </div>
      <div v-if="diagnostics.physicalSheetY !== undefined">
        <dt>Physical sheet Y</dt>
        <dd data-testid="physical-sheet-y">{{ scalar(diagnostics.physicalSheetY) }} px</dd>
      </div>
      <div v-if="diagnostics.visibleSheetHeight !== undefined">
        <dt>Visible sheet</dt>
        <dd data-testid="visible-sheet-height">{{ scalar(diagnostics.visibleSheetHeight) }} px</dd>
      </div>
      <div v-if="diagnostics.chromeHeight !== undefined">
        <dt>Chrome</dt>
        <dd data-testid="sheet-chrome-height">{{ scalar(diagnostics.chromeHeight) }} px</dd>
      </div>
      <div v-if="diagnostics.bodyClientHeight !== undefined">
        <dt>Body client</dt>
        <dd data-testid="sheet-body-client-height">
          {{ scalar(diagnostics.bodyClientHeight) }} px
        </dd>
      </div>
      <div v-if="diagnostics.bodyScrollHeight !== undefined">
        <dt>Body scroll height</dt>
        <dd data-testid="sheet-body-scroll-height">
          {{ scalar(diagnostics.bodyScrollHeight) }} px
        </dd>
      </div>
      <div v-if="diagnostics.bodyScrollTop !== undefined">
        <dt>Body scroll top</dt>
        <dd data-testid="sheet-body-scroll-top">{{ scalar(diagnostics.bodyScrollTop) }} px</dd>
      </div>
      <div v-if="diagnostics.maximumScrollTop !== undefined">
        <dt>Maximum scroll</dt>
        <dd data-testid="sheet-maximum-scroll-top">
          {{ scalar(diagnostics.maximumScrollTop) }} px
        </dd>
      </div>
      <div v-if="diagnostics.intrinsicSheetHeight !== undefined">
        <dt>Intrinsic sheet</dt>
        <dd data-testid="intrinsic-sheet-height">
          {{ scalar(diagnostics.intrinsicSheetHeight) }} px
        </dd>
      </div>
      <div>
        <dt>Track extent</dt>
        <dd>{{ scalar(diagnostics.trackExtent) }} px</dd>
      </div>
      <div>
        <dt>Reduced motion</dt>
        <dd>{{ diagnostics.reducedMotion ? "reduce" : "full" }}</dd>
      </div>
      <div>
        <dt>Pointer</dt>
        <dd>{{ diagnostics.pointerOwned ? "owned" : "free" }}</dd>
      </div>
      <div>
        <dt>Animation</dt>
        <dd>{{ diagnostics.isAnimating ? "running" : "stopped" }}</dd>
      </div>
    </dl>
    <div class="anchor-table">
      <span>Measured anchors</span>
      <ol>
        <li v-for="anchor in diagnostics.anchors" :key="anchor.id">
          <code>{{ anchor.id }}</code>
          <span>{{ scalar(anchor.position) }}</span>
          <span>#{{ anchor.order }}</span>
        </li>
      </ol>
    </div>
  </details>
</template>

<style scoped>
.diagnostics {
  border-block: 1px solid var(--line);
  background: var(--paper);
}

summary {
  padding: 0.8rem 0;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  list-style-position: inside;
}

.diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.diagnostics-grid > div {
  min-inline-size: 0;
  padding: 0.65rem;
  background: var(--paper);
}

dt,
.anchor-table > span {
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

dd {
  margin: 0.25rem 0 0;
  overflow-wrap: anywhere;
  font-size: 0.82rem;
}

.anchor-table {
  display: grid;
  gap: 0.55rem;
  padding-block: 0.9rem;
}

.anchor-table ol {
  display: grid;
  gap: 0.3rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.anchor-table li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6rem 3rem;
  gap: 0.75rem;
  font-size: 0.75rem;
}

.anchor-table li > :not(:first-child) {
  text-align: end;
}
</style>
