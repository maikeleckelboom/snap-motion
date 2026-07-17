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
      <div>
        <dt>Target</dt>
        <dd data-testid="target-id">{{ diagnostics.targetId ?? "—" }}</dd>
      </div>
      <div>
        <dt>Active</dt>
        <dd data-testid="active-id">{{ diagnostics.activeId ?? "—" }}</dd>
      </div>
      <div>
        <dt>Bounds</dt>
        <dd>[{{ scalar(diagnostics.bounds.min) }}, {{ scalar(diagnostics.bounds.max) }}]</dd>
      </div>
      <div>
        <dt>Viewport</dt>
        <dd>{{ scalar(diagnostics.viewportSize) }} px</dd>
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
