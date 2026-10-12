<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from "vue";

import type { ShowcaseScreen } from "@/demos/showcaseScreens";

import CandidatePreview from "./CandidatePreview.vue";
import { differenceRows, responseChart, summarizeDifference } from "./candidates";
import { useStudio } from "./studio-context";
import { REASON_LIMIT } from "./studio-model";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  screens: readonly ShowcaseScreen[];
}>();

const { behavior, commands, model } = useStudio();
const titleId = `${useId()}-title`;
const decisionTitleId = `${useId()}-decision`;
const reasonId = `${useId()}-reason`;
const chartTitleId = `${useId()}-chart`;
const stageA = ref<InstanceType<typeof CandidatePreview>>();
const stageB = ref<InstanceType<typeof CandidatePreview>>();

const a = computed(() =>
  model.referenceId.value === undefined ? undefined : behavior(model.referenceId.value),
);
/**
 * B as presented. The Deck reports the card in front, which trails the semantic B while it
 * exchanges, so the stage, the table and every name beside them change at the moment the visitor
 * can see the card change. The semantic B has already been accepted; nothing here delays it.
 */
const b = computed(() =>
  model.shownCandidateId.value === undefined ? undefined : behavior(model.shownCandidateId.value),
);
const both = computed(() => (a.value && b.value ? { a: a.value, b: b.value } : undefined));
const rows = computed(() => (both.value ? differenceRows(both.value.a, both.value.b) : []));
const summary = computed(() => (both.value ? summarizeDifference(both.value.a, both.value.b) : ""));
const chart = computed(() =>
  both.value ? responseChart([both.value.a, both.value.b]) : undefined,
);
const decided = computed(() =>
  model.decidedId.value === undefined ? undefined : behavior(model.decidedId.value),
);
const reasonLength = computed(() => model.reason.value.length);

// ---------------------------------------------------------------------------------- the driver

/**
 * One input, delivered to both stages. A replay is a fixed run of steps at a fixed cadence, so a
 * spring that settles slowly is interrupted by the next step exactly as it would be in use. The run
 * reverses once and stops short of the last screen, because a rail ends where a deck wraps. Each
 * replay carries a generation: any newer replay, any manual input and the end of this component
 * invalidate the steps still waiting.
 */
const REPLAY_STEPS = ["next", "next", "previous", "next"] as const;
const REPLAY_INTERVAL_MS = 420;
let replayGeneration = 0;
const replaying = ref(false);
let replayTimer: ReturnType<typeof setTimeout> | undefined;

function stopReplay() {
  replayGeneration += 1;
  clearTimeout(replayTimer);
  replaying.value = false;
}

function drive(command: "next" | "previous") {
  stageA.value?.[command]();
  stageB.value?.[command]();
}

function step(command: "next" | "previous") {
  stopReplay();
  drive(command);
}

function reset() {
  stopReplay();
  stageA.value?.reset();
  stageB.value?.reset();
}

function replay() {
  stopReplay();
  const generation = replayGeneration;
  replaying.value = true;
  let index = 0;
  const run = () => {
    if (generation !== replayGeneration) return;
    const command = REPLAY_STEPS[index];
    if (command === undefined) {
      replaying.value = false;
      return;
    }
    index += 1;
    drive(command);
    replayTimer = setTimeout(run, REPLAY_INTERVAL_MS);
  };
  run();
}

onBeforeUnmount(stopReplay);

function onReasonInput(event: Event) {
  const field = event.currentTarget as HTMLTextAreaElement;
  const stored = model.setReason(field.value);
  if (stored !== field.value) field.value = stored;
}

defineExpose({ stopReplay });
</script>

<template>
  <section
    class="studio-region studio-compare"
    :aria-labelledby="titleId"
    data-testid="studio-compare"
    :data-compare-state="model.compareState.value"
    role="group"
  >
    <header class="region-head">
      <div>
        <p class="region-kicker"><span class="tabular">3</span> / Compare</p>
        <h4 :id="titleId" class="region-title">A against B</h4>
      </div>
    </header>

    <div v-if="a === undefined" class="compare-empty" data-testid="studio-compare-empty">
      <p class="empty-title">Nothing to compare yet</p>
      <p class="empty-copy">
        Shortlist two candidates. The first you shortlist becomes the reference A, and each other
        one can be set against it as B.
      </p>
      <button
        class="studio-button studio-button-primary"
        data-testid="studio-compare-choose"
        type="button"
        @click="commands.goToCandidates()"
      >
        Choose candidates
      </button>
    </div>

    <template v-else>
      <div class="stages">
        <figure class="stage" data-testid="studio-stage-a">
          <figcaption class="stage-head">
            <span class="stage-role">A · Reference</span>
            <strong class="stage-name" data-testid="studio-a-name">{{ a.name }}</strong>
          </figcaption>
          <CandidatePreview
            :key="a.id"
            ref="stageA"
            :behavior="a"
            :label="`A, ${a.name}, live preview`"
            :reduced-motion-override="props.reducedMotionOverride"
            role="reference"
            :screens="screens"
          />
        </figure>

        <figure v-if="b !== undefined" class="stage" data-testid="studio-stage-b">
          <figcaption class="stage-head">
            <span class="stage-role">B · Candidate</span>
            <strong class="stage-name" data-testid="studio-b-name">{{ b.name }}</strong>
          </figcaption>
          <CandidatePreview
            :key="b.id"
            ref="stageB"
            :behavior="b"
            :label="`B, ${b.name}, live preview`"
            :reduced-motion-override="props.reducedMotionOverride"
            role="candidate"
            :screens="screens"
          />
        </figure>
        <div v-else class="stage stage-vacant" data-testid="studio-stage-b-vacant">
          <p class="stage-head">
            <span class="stage-role">B · Candidate</span>
          </p>
          <p class="empty-copy">Shortlist another candidate to run it beside {{ a.name }}.</p>
        </div>
      </div>

      <div class="driver" role="group" aria-label="Run the same input on both">
        <button
          class="studio-button"
          data-testid="studio-driver-previous"
          type="button"
          @click="step('previous')"
        >
          Back
        </button>
        <button
          class="studio-button studio-button-primary"
          data-testid="studio-driver-next"
          type="button"
          @click="step('next')"
        >
          Step
        </button>
        <button
          class="studio-button"
          :aria-pressed="replaying"
          data-testid="studio-driver-replay"
          type="button"
          @click="replaying ? stopReplay() : replay()"
        >
          {{ replaying ? "Stop replay" : "Replay a run" }}
        </button>
        <button
          class="studio-button"
          data-testid="studio-driver-reset"
          type="button"
          @click="reset"
        >
          Reset
        </button>
        <p class="driver-note">
          {{
            both ? "Both stages get the same input, on the same screens." : "Runs the reference."
          }}
          You can also drag either one.
        </p>
      </div>

      <slot name="shortlist" />

      <section
        v-if="both && chart"
        class="differences"
        aria-labelledby="studio-differences-title"
        data-testid="studio-differences"
        role="group"
      >
        <h5 id="studio-differences-title" class="sub-title">What differs</h5>
        <p class="summary" data-testid="studio-summary-text">{{ summary }}</p>

        <table class="diff-table" data-testid="studio-diff-table">
          <caption class="sr-only">
            Settings of the reference A and the candidate B. Rows that differ are marked.
          </caption>
          <thead>
            <tr>
              <th scope="col">Setting</th>
              <th scope="col">A · {{ both.a.name }}</th>
              <th scope="col">B · {{ both.b.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.key"
              :data-differs="row.differs ? 'true' : 'false'"
              :data-row="row.key"
              :data-source="row.source"
            >
              <th scope="row">
                {{ row.label }}
                <span v-if="row.source === 'computed'" class="source">computed</span>
              </th>
              <td>{{ row.a }}</td>
              <td>
                {{ row.b }}
                <span v-if="row.differs" class="differs">differs</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="legend">
          Declared values are the settings each candidate is given. Computed values come from
          stepping each spring once on a one-screen move: the spring alone, not a measurement of
          this page.
        </p>

        <figure class="chart">
          <svg
            :aria-labelledby="chartTitleId"
            class="chart-svg"
            data-testid="studio-chart"
            role="img"
            :viewBox="`0 0 ${chart.width} ${chart.height}`"
          >
            <title :id="chartTitleId">
              Step response of one screen move. A settles in
              {{ both.a.settleMs === undefined ? "over 4 s" : `${both.a.settleMs} ms` }}; B settles
              in {{ both.b.settleMs === undefined ? "over 4 s" : `${both.b.settleMs} ms` }}.
            </title>
            <line
              class="chart-target"
              :x1="8"
              :x2="chart.width - 8"
              :y1="chart.targetY"
              :y2="chart.targetY"
            />
            <path class="chart-a" :d="chart.curves[0]!.path" />
            <path class="chart-b" :d="chart.curves[1]!.path" />
          </svg>
          <figcaption class="chart-legend">
            <span class="key key-a">A · {{ both.a.name }}</span>
            <span class="key key-b">B · {{ both.b.name }}</span>
            <span class="chart-axis">0 to {{ Math.round(chart.seconds * 1000) }} ms</span>
          </figcaption>
        </figure>
      </section>

      <section
        class="decision"
        :aria-labelledby="decisionTitleId"
        data-testid="studio-decision"
        role="group"
      >
        <p class="region-kicker"><span class="tabular">4</span> / Decision</p>
        <h5 :id="decisionTitleId" class="sub-title">Which one will you use?</h5>
        <template v-if="decided === undefined">
          <div class="decision-actions">
            <button
              class="studio-button studio-button-primary"
              data-testid="studio-choose-a"
              type="button"
              @click="commands.decide(a.id)"
            >
              Choose A: {{ a.name }}
            </button>
            <button
              v-if="b"
              class="studio-button studio-button-primary"
              data-testid="studio-choose-b"
              type="button"
              @click="commands.decide(b.id)"
            >
              Choose B: {{ b.name }}
            </button>
          </div>
          <p class="empty-copy">
            You can change it at any time. Nothing is saved beyond this page.
          </p>
        </template>
        <template v-else>
          <p class="decided" data-testid="studio-decided">
            <span class="decided-label">Chosen</span>
            <strong>{{ decided.name }}</strong>
          </p>
          <label class="reason-label" :for="reasonId">Why this one?</label>
          <textarea
            :id="reasonId"
            class="reason-field"
            data-testid="studio-reason"
            :maxlength="REASON_LIMIT"
            placeholder="A short note for the next person who asks."
            rows="3"
            :value="model.reason.value"
            @input="onReasonInput"
          />
          <p class="reason-count tabular">{{ reasonLength }} / {{ REASON_LIMIT }}</p>
          <div class="decision-actions">
            <button
              class="studio-button studio-button-primary"
              data-testid="studio-open-implementation"
              type="button"
              @click="commands.openImplementation(decided.id, $event.currentTarget as HTMLElement)"
            >
              View implementation
            </button>
            <button
              class="studio-button"
              data-testid="studio-revise"
              type="button"
              @click="commands.clearDecision()"
            >
              Change decision
            </button>
          </div>
        </template>
      </section>
    </template>
  </section>
</template>

<style scoped>
.stages {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.stage {
  display: grid;
  align-content: start;
  gap: 0.5rem;
  min-inline-size: 0;
  margin: 0;
}

.stage-head {
  display: grid;
  gap: 0.1rem;
}

.stage-role {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.stage-name {
  font-size: 1.1rem;
  letter-spacing: -0.01em;
}

.stage-vacant {
  padding: 0.9rem;
  border: 1px dashed var(--pg-line);
  border-radius: 0.9rem;
}

.driver {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.driver-note {
  flex: 1 1 14rem;
  color: var(--pg-muted);
  font-size: 0.82rem;
  line-height: 1.4;
}

.compare-empty {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  padding: 1.25rem;
  border-radius: 0.9rem;
  background: var(--stage);
}

.empty-title {
  font-size: 1.1rem;
  font-weight: 650;
}

.empty-copy {
  color: var(--pg-ink-soft);
  font-size: 0.92rem;
  line-height: 1.5;
}

.sub-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.differences,
.decision {
  display: grid;
  gap: 0.6rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid var(--pg-line);
}

.summary {
  color: var(--pg-ink-soft);
  font-size: 0.95rem;
  line-height: 1.5;
}

.diff-table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.diff-table th,
.diff-table td {
  padding: 0.4rem 0.5rem;
  border-block-end: 1px solid var(--pg-line);
  text-align: start;
  vertical-align: baseline;
}

.diff-table thead th {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.diff-table tbody th {
  font-weight: 500;
}

.diff-table tr[data-differs="true"] td {
  font-weight: 650;
}

.diff-table tr[data-differs="true"] th {
  box-shadow: inset 3px 0 0 var(--pg-accent);
}

.source {
  margin-inline-start: 0.35rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.differs {
  margin-inline-start: 0.35rem;
  color: var(--pg-accent);
  font-family: var(--pg-font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.legend {
  color: var(--pg-muted);
  font-size: 0.8rem;
  line-height: 1.4;
}

.chart {
  display: grid;
  gap: 0.35rem;
  margin: 0;
}

.chart-svg {
  inline-size: 100%;
  max-inline-size: 28rem;
  block-size: auto;
  border-radius: 0.5rem;
  background: var(--stage);
}

.chart-target {
  stroke: var(--pg-ink);
  stroke-dasharray: 3 5;
  stroke-opacity: 0.4;
}

.chart-a,
.chart-b {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5;
}

.chart-a {
  stroke: var(--pg-ink);
}

.chart-b {
  stroke: var(--pg-accent);
  stroke-dasharray: 7 4;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  font-size: 0.82rem;
}

.key::before {
  content: "";
  display: inline-block;
  inline-size: 1.4rem;
  margin-inline-end: 0.4rem;
  vertical-align: middle;
  border-block-start: 3px solid var(--pg-ink);
}

.key-b::before {
  border-block-start: 3px dashed var(--pg-accent);
}

.chart-axis {
  margin-inline-start: auto;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
}

.decision-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.decided {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.decided strong {
  font-size: 1.2rem;
}

.decided-label {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--pg-accent);
  color: var(--pg-white);
  font-family: var(--pg-font-mono);
  font-size: 0.64rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.reason-label {
  font-size: 0.88rem;
  font-weight: 600;
}

.reason-field {
  inline-size: 100%;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--pg-line);
  border-radius: 0.5rem;
  background: var(--pg-white);
  font: inherit;
  font-size: 0.92rem;
  line-height: 1.45;
  resize: vertical;
}

.reason-count {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
}

@media (max-width: 40rem) {
  .stages {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
