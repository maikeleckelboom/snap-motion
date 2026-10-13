<script setup lang="ts">
import { computed, useId } from "vue";

import PhysicsGroups from "@/components/PhysicsGroups.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/SegmentedControl.vue";
import type { LabPhysicsSettings } from "@/fixtures/lab-types";
import { stackedDeckNotApplicablePhysics } from "@/fixtures/surface-applicability";

import { presetOptions, presetLabel, presetNote } from "../preset-facts";
import { usePlaygroundTuning } from "../tuning-context";
import {
  CUSTOM_ID,
  describeShape,
  type CandidateExchange,
  type CandidateFeel,
  type CandidateSurface,
} from "./candidates";
import { useStudio } from "./studio-context";

/**
 * The editor for candidate B, which sits under the two live stages so that changing a setting and
 * seeing what it did share one view: configure B, try both, read the difference, refine.
 *
 * What it edits, and what it never does:
 *
 * - It edits B. B is a reference candidate until the first change, and a reference is immutable, so
 *   the first change copies it into Custom and puts the copy in B's place (\`studio-tune.ts\`). The
 *   panel says so up front, so the copy is never a surprise.
 * - Everything it shows as an input is a declared setting. Settling time and overshoot are
 *   calculated from those settings, shown beside them, and are never an input.
 * - It never writes to the Playground's Motion Tuning. The one relationship is a button the visitor
 *   presses that copies that tuning into B, once, in that direction.
 */
const { behavior, commands, custom, model } = useStudio();
const tuning = usePlaygroundTuning();
const id = useId();

// B as the model has accepted it. An edit applies to this candidate the moment it is made, so the
// panel shows the accepted B rather than the card the Shortlist's Deck is still drawing.
const b = computed(() =>
  model.candidateId.value === undefined ? undefined : behavior(model.candidateId.value),
);
const isCustom = computed(() => b.value?.id === CUSTOM_ID);
// Custom can only be one of A and B. When it is the reference, B cannot be copied into it.
const blocked = computed(() => !isCustom.value && model.referenceId.value === CUSTOM_ID);
const edited = computed(() => custom.modifiedKeys.value.length);

const surfaceOptions: SegmentedOption<CandidateSurface>[] = [
  { label: "Item carousel", value: "carousel", testid: "tune-surface-carousel" },
  { label: "Stacked deck", value: "deck", testid: "tune-surface-deck" },
];
const exchangeOptions: SegmentedOption<CandidateExchange>[] = [
  { label: "Shuffle", value: "shuffle", testid: "tune-exchange-shuffle" },
  { label: "Direct", value: "direct", testid: "tune-exchange-direct" },
];
const feelOptions: SegmentedOption<CandidateFeel>[] = presetOptions.map(({ label, value }) => ({
  label,
  value,
  testid: `tune-preset-${value}`,
}));

const notApplicable = computed(() =>
  b.value?.surface === "deck" ? stackedDeckNotApplicablePhysics : undefined,
);
const tuningLabel = computed(() => {
  const modified = tuning.modifiedKeys.value.length;
  return `${presetLabel(tuning.preset.value)}${modified > 0 ? `, ${modified} edited` : ""}`;
});

function setSettings(settings: LabPhysicsSettings) {
  commands.tuneB({ settings });
}
</script>

<template>
  <section
    v-if="b !== undefined"
    class="tune"
    :aria-labelledby="`${id}-title`"
    data-testid="studio-tune"
    :data-custom="isCustom ? 'true' : 'false'"
    role="group"
  >
    <header class="tune-head">
      <div>
        <p class="region-kicker">Tune B</p>
        <h5 :id="`${id}-title`" class="tune-title" data-testid="studio-tune-title">
          {{ describeShape(b) }}
        </h5>
      </div>
      <p v-if="isCustom" class="tune-badge" data-testid="studio-tune-badge">
        Custom{{ edited > 0 ? `, ${edited} edited` : "" }}
      </p>
    </header>

    <p v-if="blocked" class="tune-note" data-testid="studio-tune-blocked">
      Custom is the reference A, so B cannot be copied into it.
      <button class="link-button" type="button" @click="commands.swapRoles()">Swap A and B</button>
      to change it as B.
    </p>
    <p v-else-if="!isCustom" class="tune-note" data-testid="studio-tune-note">
      {{ b.name }} is a fixed reference. Change anything below and B becomes a Custom copy;
      {{ b.name }}
      stays exactly as it was.
    </p>
    <p v-else class="tune-note" data-testid="studio-tune-note">
      Changes apply to B's stage as you make them. A is not affected.
    </p>

    <div class="tune-grid">
      <SegmentedControl
        :disabled="blocked"
        label="Layout"
        :model-value="b.surface"
        :options="surfaceOptions"
        @update:model-value="(surface) => commands.tuneB({ surface })"
      />
      <div class="tune-exchange">
        <SegmentedControl
          :disabled="blocked || b.surface !== 'deck'"
          label="Exchange"
          :model-value="b.exchange ?? 'shuffle'"
          :options="exchangeOptions"
          @update:model-value="(exchange) => commands.tuneB({ exchange })"
        />
        <p class="tune-hint">
          {{
            b.surface === "deck"
              ? b.exchange === "direct"
                ? "The photo stays attached to the point you grab."
                : "The top photo passes behind the pile."
              : "Stacked deck only."
          }}
        </p>
      </div>
      <div class="tune-motion">
        <SegmentedControl
          :disabled="blocked"
          label="Motion preset"
          :model-value="b.feel"
          :options="feelOptions"
          @update:model-value="(base) => commands.tuneB({ base })"
        />
        <p class="tune-hint">
          {{ presetNote(b.feel) }}
          <template v-if="isCustom && edited > 0">
            {{ edited }} {{ edited === 1 ? "setting" : "settings" }} changed from
            {{ presetLabel(b.feel) }}.
            <button
              class="link-button"
              data-testid="tune-reset"
              type="button"
              @click="commands.tuneB({ resetToBase: true })"
            >
              Reset to {{ presetLabel(b.feel) }}
            </button>
          </template>
        </p>
      </div>
    </div>

    <details class="tune-fine" data-testid="studio-tune-fine">
      <summary>Fine-tune the physics</summary>
      <p class="tune-hint">
        These are the settings B is given. Drag a slider or type an exact value; B follows.
      </p>
      <PhysicsGroups
        :model-value="b.settings"
        :not-applicable="notApplicable"
        open="default"
        @update:model-value="setSettings"
      />
    </details>

    <div class="tune-source">
      <button
        class="studio-button"
        :disabled="blocked"
        data-testid="tune-copy-tuning"
        type="button"
        @click="commands.copyTuningToB()"
      >
        Start from the Playground's tuning
      </button>
      <p class="tune-hint">
        Copies the tuning set under this section ({{ tuningLabel }}) into B, once. Editing B never
        changes that tuning.
      </p>
    </div>

    <p class="tune-calculated" data-testid="studio-tune-calculated">
      <span class="source">calculated, not editable</span>
      From this spring alone: settles in
      <strong>{{ b.settleMs === undefined ? "over 4 s" : `${b.settleMs} ms` }}</strong
      >, overshoots by <strong>{{ b.overshootPercent }}%</strong>. It is not a measurement of this
      page.
    </p>
  </section>
</template>

<style scoped>
.tune {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid var(--pg-line);
  border-radius: 0.9rem;
  background: var(--pg-panel);
}

.tune[data-custom="true"] {
  border-color: var(--pg-ink);
}

.tune-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.region-kicker {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tune-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.tune-badge {
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--pg-accent);
  border-radius: 999px;
  color: var(--pg-accent);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.tune-note,
.tune-hint {
  color: var(--pg-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.tune-grid {
  display: grid;
  gap: 0.9rem 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  align-items: start;
}

.tune-exchange,
.tune-motion {
  display: grid;
  gap: 0.35rem;
  min-inline-size: 0;
}

.tune-motion {
  grid-column: 1 / -1;
}

.link-button {
  display: inline;
  min-block-size: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--pg-ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

@media (pointer: coarse) {
  .link-button {
    display: inline-flex;
    align-items: center;
    min-block-size: 2.75rem;
  }
}

.tune-fine {
  border-block: 1px solid var(--pg-line);
}

.tune-fine > summary {
  display: flex;
  align-items: center;
  min-block-size: 2.75rem;
  font-size: 0.9rem;
  font-weight: 650;
  cursor: pointer;
}

.tune-fine > summary::after {
  content: "▾";
  margin-inline-start: 0.5rem;
  font-size: 0.8rem;
}

.tune-fine[open] > summary::after {
  transform: rotate(180deg);
}

.tune-fine[open] > summary {
  margin-block-end: 0.4rem;
}

.tune-source {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
}

.tune-calculated {
  color: var(--pg-ink-soft);
  font-size: 0.85rem;
  line-height: 1.5;
}

.source {
  display: inline-block;
  margin-inline-end: 0.4rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
