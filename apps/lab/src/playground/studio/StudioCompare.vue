<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";

import type { ShowcaseScreen, ShowcaseScreenId } from "@/demos/showcaseScreens";

import CandidatePreview from "./CandidatePreview.vue";
import { differenceRows, responseChart, summarizeDifference } from "./candidates";
import { useStudio } from "./studio-context";
import { REASON_LIMIT } from "./studio-model";
import { whenReady } from "./studio-replay";
import { carryOverScreen, middleScreenId, stagesLevel } from "./studio-stage";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  screens: readonly ShowcaseScreen[];
}>();

const { announce, behavior, commands, model } = useStudio();
const titleId = `${useId()}-title`;
const decisionTitleId = `${useId()}-decision`;
const reasonId = `${useId()}-reason`;
const chartTitleId = `${useId()}-chart`;
const statusId = `${useId()}-status`;
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
/**
 * The one statement of whether the stages are comparable, which sits in a place that never moves.
 * "Apart" is a state of the stages, not of the last input: it follows where each stage is, so it
 * clears when the visitor brings them back by hand as surely as when Reset does.
 */
const driverState = computed<"alone" | "level" | "apart" | "returning" | "running">(() => {
  if (replayPhase.value !== "idle") return replayPhase.value;
  if (!both.value) return "alone";
  return level.value ? "level" : "apart";
});
const driverNote = computed(() => {
  switch (driverState.value) {
    case "returning":
      return `Returning both to ${screenTitle(homeId.value)}…`;
    case "running":
      return "Replaying the same run on both. Touch either to take over.";
    case "alone":
      return "Runs the reference. You can also drag it.";
    case "apart":
      return `A is on ${screenTitle(positions.value.a)}, B is on ${screenTitle(positions.value.b)}. Reset puts both on ${screenTitle(homeId.value)}.`;
    default:
      return "The same input on both, on the same screen. Drag either to explore.";
  }
});
const driverLabel = computed(
  () =>
    ({ alone: "", level: "Level", apart: "Apart", returning: "Returning", running: "Replay" })[
      driverState.value
    ],
);

// ----------------------------------------------------------------------------- the conditions

/** The screen a run begins on and a reset returns to. */
const homeId = computed(() => middleScreenId(props.screens));
/** Where a stage mounted by a role change begins: level with the stage that stayed. */
const anchorId = ref<ShowcaseScreenId>(homeId.value);
const screenTitle = (id: ShowcaseScreenId | undefined) =>
  props.screens.find((screen) => screen.id === id)?.title ?? "another screen";

const positions = computed(() => ({
  a: stageA.value?.position,
  b: stageB.value?.position,
}));
const level = computed(() => stagesLevel(positions.value));

// A replay answers to the roles the visitor chose, not to the card the Deck has drawn since. B is
// accepted the instant it is chosen while the Deck is still showing the card that was B, so waiting
// for the shown card would leave a replay driving a stage the visitor has already replaced. The
// watcher is synchronous so no step that was scheduled can land between the choice and its effect.
watch([() => model.referenceId.value, () => model.candidateId.value], () => stopReplay(), {
  flush: "sync",
});

// A run is a controlled comparison only while both stages are on the same screen, so a change of
// role must not leave one of them behind. The stage that stays keeps its screen and its motion;
// the stage that arrives is mounted level with it. The watcher runs before the stages are replaced,
// while the one that stays can still be asked where it is.
watch(
  () => [a.value?.id, b.value?.id] as const,
  ([nextA, nextB], [prevA, prevB]) => {
    anchorId.value = carryOverScreen(
      { a: prevA, b: prevB },
      { a: nextA, b: nextB },
      positions.value,
      homeId.value,
    );
  },
  { flush: "pre" },
);

// ---------------------------------------------------------------------------------- the driver

/**
 * One input, delivered to both stages. A replay is a fixed run of steps at a fixed cadence, so a
 * spring that settles slowly is interrupted by the next step exactly as it would be in use. It first
 * brings both stages to the same defined screen and waits until both are at rest there, so every
 * replay begins from the same condition whatever came before. The run reverses once and stops short
 * of the last screen, because a rail ends where a deck wraps.
 *
 * Each replay carries a generation. Any newer replay, any manual input on a stage, any change of
 * role and the end of this component invalidate whatever is still waiting: the wait for rest, and
 * the steps still to come.
 */
const REPLAY_STEPS = ["next", "next", "previous", "next"] as const;
const REPLAY_INTERVAL_MS = 420;
let replayGeneration = 0;
const replayPhase = ref<"idle" | "returning" | "running">("idle");
const replaying = computed(() => replayPhase.value !== "idle");
let replayTimer: ReturnType<typeof setTimeout> | undefined;
let stopWaiting: (() => void) | undefined;

function stopReplay() {
  replayGeneration += 1;
  clearTimeout(replayTimer);
  stopWaiting?.();
  stopWaiting = undefined;
  replayPhase.value = "idle";
}

function drive(command: "next" | "previous") {
  stageA.value?.[command]();
  stageB.value?.[command]();
}

function step(command: "next" | "previous") {
  stopReplay();
  drive(command);
}

/** Both stages go to the defined screen, each by its own spring. */
function realign() {
  stopReplay();
  stageA.value?.goTo(homeId.value);
  stageB.value?.goTo(homeId.value);
}

function replay() {
  stopReplay();
  const generation = replayGeneration;
  let index = 0;
  const run = () => {
    if (generation !== replayGeneration) return;
    const command = REPLAY_STEPS[index];
    if (command === undefined) {
      replayPhase.value = "idle";
      return;
    }
    index += 1;
    drive(command);
    replayTimer = setTimeout(run, REPLAY_INTERVAL_MS);
  };

  stageA.value?.goTo(homeId.value);
  stageB.value?.goTo(homeId.value);
  replayPhase.value = "returning";
  // The condition to wait for is the stages' own report of being at rest on the screen, not a time.
  stopWaiting = whenReady(
    () =>
      [stageA.value, stageB.value].every(
        (stage) => stage === undefined || stage.restsOn(homeId.value),
      ),
    () => {
      if (generation !== replayGeneration) return;
      replayPhase.value = "running";
      run();
    },
  );
}

/** A hand on either stage ends a replay: from here the visitor is driving. */
function onManual() {
  if (replaying.value) {
    stopReplay();
    announce("Replay stopped. You are driving.");
  }
}

watch(
  () => level.value || replaying.value,
  (together) => {
    if (!together) {
      announce(
        `A is on ${screenTitle(positions.value.a)} and B is on ${screenTitle(positions.value.b)}.`,
      );
    }
  },
);

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
        <p class="region-kicker">Compare</p>
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
            :start-id="anchorId"
            @manual="onManual"
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
            :start-id="anchorId"
            @manual="onManual"
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
          :aria-describedby="driverState === 'apart' ? statusId : undefined"
          class="studio-button"
          :data-attention="driverState === 'apart' ? 'true' : undefined"
          data-testid="studio-driver-reset"
          type="button"
          @click="realign"
        >
          Reset
        </button>
      </div>

      <!-- One line, in a fixed place, that always has room for two lines of text: the stages
      coming apart or back together changes what it says and never where anything else sits. -->
      <p class="driver-status" :data-state="driverState" data-testid="studio-driver-status">
        <span v-if="driverState !== 'alone'" class="driver-state" aria-hidden="true">{{
          driverLabel
        }}</span>
        <span :id="statusId" data-testid="studio-driver-note">{{ driverNote }}</span>
      </p>

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
        <p class="region-kicker">Decision</p>
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

/* The one label that changes between "Replay a run" and "Stop replay" must not move its neighbours. */
.driver [data-testid="studio-driver-replay"] {
  min-inline-size: 8.5rem;
}

/* The stages being apart asks for the realigning control without becoming a second primary action. */
.driver [data-attention="true"] {
  border-color: var(--pg-accent);
  box-shadow: inset 0 0 0 1px var(--pg-accent);
}

/*
 * The comparability status. Its height is reserved for two lines so that no state of the stages,
 * and no width, can change the height of what follows it.
 */
.driver-status {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-block-size: 2.8em;
  color: var(--pg-ink-soft);
  font-size: 0.82rem;
  line-height: 1.4;
}

.driver-state {
  flex: none;
  padding: 0 0.45rem;
  border: 1px solid var(--pg-line);
  border-radius: 999px;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.driver-status[data-state="apart"] .driver-state {
  border-color: var(--pg-accent);
  background: var(--pg-accent);
  color: var(--pg-white);
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

  /* Two by two, so the row has the same shape whichever label the replay button carries. */
  .driver {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
