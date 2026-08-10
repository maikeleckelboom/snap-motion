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
  <section class="diagnostics" data-testid="diagnostics">
    <div class="telemetry-heading">
      <div>
        <p>Live telemetry</p>
        <span>High-value motion state</span>
      </div>
      <span :data-active="diagnostics.isAnimating ? 'true' : 'false'">
        {{ diagnostics.isAnimating ? "moving" : "settled" }}
      </span>
    </div>
    <dl class="telemetry-grid tabular">
      <div>
        <dt>Phase</dt>
        <dd>{{ diagnostics.phase }}</dd>
      </div>
      <div>
        <dt>Active / visual</dt>
        <dd>
          {{ diagnostics.visualIndex ?? diagnostics.visualTopIndex ?? diagnostics.activeId ?? "—" }}
        </dd>
      </div>
      <div>
        <dt>Position</dt>
        <dd>{{ scalar(diagnostics.position) }} px</dd>
      </div>
      <div>
        <dt>Velocity</dt>
        <dd>{{ scalar(diagnostics.velocity) }} px/s</dd>
      </div>
    </dl>

    <details class="full-diagnostics" :open="open">
      <summary>Full diagnostics</summary>
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
        <div v-if="diagnostics.ownerIndex !== undefined">
          <dt>Paint owner</dt>
          <dd data-testid="owner-index">{{ diagnostics.ownerIndex }}</dd>
        </div>
        <div v-if="diagnostics.segmentPhase !== undefined">
          <dt>Deck segment</dt>
          <dd data-testid="deck-segment-phase">{{ diagnostics.segmentPhase }}</dd>
        </div>
        <div v-if="diagnostics.segmentProgress !== undefined">
          <dt>Segment progress</dt>
          <dd data-testid="deck-segment-progress">
            {{ scalar(diagnostics.segmentProgress) }}
          </dd>
        </div>
        <div v-if="diagnostics.segmentDirection !== undefined">
          <dt>Segment direction</dt>
          <dd data-testid="deck-segment-direction">{{ diagnostics.segmentDirection }}</dd>
        </div>
        <div v-if="diagnostics.segmentOriginIndex !== undefined">
          <dt>Local segment</dt>
          <dd data-testid="deck-segment-indices">
            {{ diagnostics.segmentOriginIndex }} → {{ diagnostics.segmentTargetIndex ?? "—" }}
          </dd>
        </div>
        <div v-if="diagnostics.signedLocalDistance !== undefined">
          <dt>Local distance</dt>
          <dd data-testid="deck-local-distance">
            {{ scalar(diagnostics.signedLocalDistance) }}
          </dd>
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
        <div v-if="diagnostics.visualTopIndex !== undefined">
          <dt>Visual top</dt>
          <dd data-testid="visual-top-index">{{ diagnostics.visualTopIndex }}</dd>
        </div>
        <div v-if="diagnostics.authoritativeIndex !== undefined">
          <dt>Authoritative card</dt>
          <dd data-testid="authoritative-index">
            {{ diagnostics.authoritativeIndex
            }}{{ diagnostics.authorityStable === false ? " (in handoff)" : "" }}
          </dd>
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
          <dd data-testid="max-anchor-skip">
            {{ diagnostics.maxAnchorSkip
            }}{{ diagnostics.maxAnchorSkipFixed ? " (fixed by this surface)" : "" }}
          </dd>
        </div>
        <div>
          <dt>Bounds</dt>
          <dd>[{{ scalar(diagnostics.bounds.min) }}, {{ scalar(diagnostics.bounds.max) }}]</dd>
        </div>
        <div>
          <dt>Viewport</dt>
          <dd>{{ scalar(diagnostics.viewportSize) }} px</dd>
        </div>
        <div v-if="diagnostics.visualViewportPrimaryExtent !== undefined">
          <dt>Visual primary extent</dt>
          <dd data-testid="visual-viewport-primary-extent">
            {{ scalar(diagnostics.visualViewportPrimaryExtent) }} px
          </dd>
        </div>
        <div v-if="diagnostics.canonicalPosition !== undefined">
          <dt>Canonical position</dt>
          <dd data-testid="sheet-canonical-position">
            {{ scalar(diagnostics.canonicalPosition) }} px
          </dd>
        </div>
        <div v-if="diagnostics.physicalTransform !== undefined">
          <dt>Physical transform</dt>
          <dd data-testid="sheet-physical-transform">
            {{ scalar(diagnostics.physicalTransform) }} px
          </dd>
        </div>
        <div v-if="diagnostics.visiblePrimaryExtent !== undefined">
          <dt>Visible primary extent</dt>
          <dd data-testid="sheet-visible-primary-extent">
            {{ scalar(diagnostics.visiblePrimaryExtent) }} px
          </dd>
        </div>
        <div v-if="diagnostics.measuredChromeBlockExtent !== undefined">
          <dt>Chrome block extent</dt>
          <dd data-testid="sheet-chrome-block-extent">
            {{ scalar(diagnostics.measuredChromeBlockExtent) }} px
          </dd>
        </div>
        <div v-if="diagnostics.bodyClientBlockExtent !== undefined">
          <dt>Body client block</dt>
          <dd data-testid="sheet-body-client-block-extent">
            {{ scalar(diagnostics.bodyClientBlockExtent) }} px
          </dd>
        </div>
        <div v-if="diagnostics.bodyScrollBlockExtent !== undefined">
          <dt>Body scroll block</dt>
          <dd data-testid="sheet-body-scroll-block-extent">
            {{ scalar(diagnostics.bodyScrollBlockExtent) }} px
          </dd>
        </div>
        <div v-if="diagnostics.bodyScrollOffset !== undefined">
          <dt>Body scroll offset</dt>
          <dd data-testid="sheet-body-scroll-offset">
            {{ scalar(diagnostics.bodyScrollOffset) }} px
          </dd>
        </div>
        <div v-if="diagnostics.maximumBodyScrollOffset !== undefined">
          <dt>Maximum body scroll</dt>
          <dd data-testid="sheet-maximum-body-scroll-offset">
            {{ scalar(diagnostics.maximumBodyScrollOffset) }} px
          </dd>
        </div>
        <div v-if="diagnostics.intrinsicContentPrimaryExtent !== undefined">
          <dt>Intrinsic primary extent</dt>
          <dd data-testid="sheet-intrinsic-primary-extent">
            {{ scalar(diagnostics.intrinsicContentPrimaryExtent) }} px
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
      <details class="anchor-table">
        <summary>Measured anchors · {{ diagnostics.anchors.length }}</summary>
        <ol>
          <li v-for="anchor in diagnostics.anchors" :key="anchor.id">
            <code>{{ anchor.id }}</code>
            <span>{{ scalar(anchor.position) }}</span>
            <span>#{{ anchor.order }}</span>
          </li>
        </ol>
      </details>
    </details>
  </section>
</template>

<style scoped>
.diagnostics {
  display: grid;
  gap: 0.75rem;
  padding-block: 0.85rem;
  border-block: 1px solid var(--strong);
  background: var(--paper);
}

.telemetry-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.telemetry-heading p,
.telemetry-heading span {
  margin: 0;
}

.telemetry-heading p {
  font-size: 0.82rem;
  font-weight: 800;
}

.telemetry-heading div > span,
.telemetry-heading > span {
  color: var(--muted);
  font-size: 0.68rem;
}

.telemetry-heading > span {
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--line);
  text-transform: uppercase;
}

.telemetry-heading > span[data-active="true"] {
  border-color: var(--strong);
  color: var(--ink);
}

.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.telemetry-grid > div {
  min-inline-size: 0;
  padding: 0.6rem;
  background: var(--paper);
}

.full-diagnostics > summary,
.anchor-table > summary {
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

dt {
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
  border-block-start: 1px solid var(--line);
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

@media (max-width: 38rem) {
  .telemetry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
