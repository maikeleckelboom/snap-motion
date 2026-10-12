<script setup lang="ts">
import { computed, ref, useId } from "vue";

import type { ShowcaseScreen } from "@/demos/showcaseScreens";

import CandidateGlyph from "./CandidateGlyph.vue";
import CandidatePreview from "./CandidatePreview.vue";
import { candidateDefinitions, type CandidateId } from "./candidates";
import { useStudio } from "./studio-context";
import { MAX_SHORTLIST } from "./studio-model";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  screens: readonly ShowcaseScreen[];
}>();

const { behavior, commands, model } = useStudio();
const titleId = `${useId()}-title`;
const fullId = `${useId()}-full`;
const root = ref<HTMLElement>();
const heading = ref<HTMLElement>();
const preview = ref<InstanceType<typeof CandidatePreview>>();

const detailId = computed(() => model.inspectedId.value);
const detail = computed(() =>
  detailId.value === undefined ? undefined : behavior(detailId.value),
);
const rows = computed(() => candidateDefinitions.map(({ id }) => behavior(id)));
const countText = computed(
  () => `${rows.value.length} candidates · ${model.shortlist.value.length} shortlisted`,
);
const full = computed(() => model.shortlistFull.value);

function roleOf(id: CandidateId) {
  if (id === model.referenceId.value) return "Reference A";
  if (id === model.candidateId.value) return "B";
  return undefined;
}

function openFrom(id: CandidateId, event: Event) {
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-candidate-row]");
  commands.openDetail(id, row?.querySelector<HTMLElement>("[data-shared-glyph]") ?? undefined);
}

function chips(id: CandidateId) {
  const item = behavior(id);
  return [item.surfaceLabel, ...(item.exchange ? [item.exchangeLabel] : []), item.feelLabel];
}

defineExpose({
  heading: () => heading.value,
  root: () => root.value,
  focusRowOpener(id: CandidateId) {
    root.value
      ?.querySelector<HTMLElement>(`[data-candidate-row="${id}"] [data-open-detail]`)
      ?.focus({ preventScroll: true });
  },
  stepPreview: () => preview.value?.next(),
});
</script>

<template>
  <section
    ref="root"
    class="studio-region studio-candidates"
    :aria-labelledby="titleId"
    data-testid="studio-candidates"
    role="group"
  >
    <header class="region-head">
      <div>
        <p class="region-kicker"><span class="tabular">1</span> / Candidates</p>
        <h4 :id="titleId" class="region-title">Behaviours to consider</h4>
      </div>
      <p class="region-count tabular" data-testid="studio-candidate-count">{{ countText }}</p>
    </header>

    <!-- The collection. -->
    <template v-if="detail === undefined">
      <p class="region-note">
        Each candidate is a real surface with its own feel. Shortlist the ones worth comparing, or
        open one to run it.
      </p>
      <p v-if="full" :id="fullId" class="region-note" data-testid="studio-shortlist-full">
        The shortlist holds {{ MAX_SHORTLIST }}. Remove one to add another.
      </p>
      <ul class="rows" aria-label="Candidates" data-testid="studio-candidate-list">
        <li
          v-for="item in rows"
          :key="item.id"
          class="row"
          :data-candidate-row="item.id"
          :data-decided="model.decidedId.value === item.id ? 'true' : 'false'"
          :data-role="roleOf(item.id) ? roleOf(item.id) : undefined"
          :data-shortlisted="model.inShortlist(item.id) ? 'true' : 'false'"
          :data-testid="`studio-row-${item.id}`"
        >
          <button
            :aria-label="`${item.name}: open details`"
            class="row-open"
            data-open-detail
            :data-testid="`studio-open-${item.id}`"
            type="button"
            @click="openFrom(item.id, $event)"
          >
            <span class="row-glyph" data-shared-glyph><CandidateGlyph :behavior="item" /></span>
            <span class="row-copy">
              <span class="row-name">{{ item.name }}</span>
              <span class="row-chips">
                <span v-for="chip in chips(item.id)" :key="chip" class="chip">{{ chip }}</span>
              </span>
              <span class="row-pitch">{{ item.pitch }}</span>
            </span>
          </button>
          <div class="row-side">
            <span v-if="roleOf(item.id)" class="badge" data-testid="studio-row-role">{{
              roleOf(item.id)
            }}</span>
            <span v-if="model.decidedId.value === item.id" class="badge badge-chosen">Chosen</span>
            <button
              :aria-describedby="full && !model.inShortlist(item.id) ? fullId : undefined"
              :aria-pressed="model.inShortlist(item.id)"
              class="shortlist-toggle"
              :data-testid="`studio-shortlist-${item.id}`"
              :disabled="full && !model.inShortlist(item.id)"
              type="button"
              @click="commands.toggleShortlist(item.id)"
            >
              <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
                <path
                  v-if="model.inShortlist(item.id)"
                  d="m3.5 8.5 3 3 6-7"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path
                  v-else
                  d="M8 3v10M3 8h10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                />
              </svg>
              <span>{{ model.inShortlist(item.id) ? "Shortlisted" : "Shortlist" }}</span>
              <span class="sr-only">: {{ item.name }}</span>
            </button>
          </div>
        </li>
      </ul>
    </template>

    <!-- One candidate, opened. -->
    <article v-else class="detail" :data-candidate="detail.id" data-testid="studio-detail">
      <div class="detail-top">
        <button
          class="back"
          data-testid="studio-detail-back"
          type="button"
          @click="commands.closeDetail()"
        >
          <svg aria-hidden="true" height="16" viewBox="0 0 24 24" width="16">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
          All candidates
        </button>
        <span v-if="roleOf(detail.id)" class="badge">{{ roleOf(detail.id) }}</span>
        <span v-if="model.decidedId.value === detail.id" class="badge badge-chosen">Chosen</span>
      </div>

      <div class="detail-head">
        <div class="detail-glyph" data-shared-glyph><CandidateGlyph :behavior="detail" /></div>
        <div class="detail-copy">
          <h5 ref="heading" class="detail-name" data-testid="studio-detail-name" tabindex="-1">
            {{ detail.name }}
          </h5>
          <p class="row-chips">
            <span v-for="chip in chips(detail.id)" :key="chip" class="chip">{{ chip }}</span>
          </p>
          <p class="detail-pitch">{{ detail.pitch }}</p>
        </div>
      </div>

      <CandidatePreview
        :key="detail.id"
        ref="preview"
        :behavior="detail"
        :label="`${detail.name}, live preview`"
        :reduced-motion-override="props.reducedMotionOverride"
        role="detail"
        :screens="screens"
      />
      <div class="step-controls">
        <button
          aria-label="Previous screen"
          data-testid="studio-detail-previous"
          type="button"
          @click="preview?.previous()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next screen"
          data-testid="studio-detail-next"
          type="button"
          @click="preview?.next()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <p class="step-hint">Drag it, flick it, or use the arrow keys.</p>
      </div>

      <dl class="facts" data-testid="studio-detail-facts">
        <div>
          <dt>Spring</dt>
          <dd>
            {{ detail.settings.stiffness }} / {{ detail.settings.damping }} /
            {{ detail.settings.mass }}
          </dd>
          <dd class="fact-note">Stiffness / damping / mass</dd>
        </div>
        <div>
          <dt>Settles in</dt>
          <dd>{{ detail.settleMs === undefined ? "Over 4 s" : `${detail.settleMs} ms` }}</dd>
          <dd class="fact-note">Computed from the spring</dd>
        </div>
        <div>
          <dt>Overshoot</dt>
          <dd>{{ detail.overshootPercent }}%</dd>
          <dd class="fact-note">Computed from the spring</dd>
        </div>
        <div>
          <dt>Largest step</dt>
          <dd>{{ detail.maxStep }} {{ detail.maxStep === 1 ? "screen" : "screens" }}</dd>
          <dd class="fact-note">Per release</dd>
        </div>
      </dl>
      <p class="guidance">
        <span class="guidance-label">Suggested use</span> {{ detail.suitedFor }}
        <span class="guidance-note">Authored guidance, not a measurement.</span>
      </p>

      <div class="detail-actions">
        <button
          :aria-pressed="model.inShortlist(detail.id)"
          class="studio-button"
          :class="model.inShortlist(detail.id) ? '' : 'studio-button-primary'"
          data-testid="studio-detail-shortlist"
          :disabled="full && !model.inShortlist(detail.id)"
          type="button"
          @click="commands.toggleShortlist(detail.id)"
        >
          {{ model.inShortlist(detail.id) ? "Remove from shortlist" : "Add to shortlist" }}
        </button>
        <button
          class="studio-button"
          data-testid="studio-detail-pin"
          :disabled="
            detail.id === model.referenceId.value || (full && !model.inShortlist(detail.id))
          "
          type="button"
          @click="commands.pinReference(detail.id)"
        >
          Pin as reference A
        </button>
        <button
          class="studio-button"
          data-testid="studio-detail-compare"
          :disabled="
            model.referenceId.value === undefined ||
            detail.id === model.referenceId.value ||
            model.candidateId.value === detail.id
          "
          type="button"
          @click="commands.setCandidate(detail.id)"
        >
          Compare as B
        </button>
        <button
          class="studio-button"
          data-testid="studio-detail-implementation"
          type="button"
          @click="commands.openImplementation(detail.id, $event.currentTarget as HTMLElement)"
        >
          Implementation
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.region-note {
  color: var(--pg-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.rows {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.35rem;
  border: 1px solid var(--pg-line);
  border-radius: 0.7rem;
  background: var(--pg-panel);
}

.row[data-shortlisted="true"] {
  border-color: var(--pg-ink);
}

.row-open {
  display: grid;
  grid-template-columns: 5.6rem minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  min-block-size: 3.5rem;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: inherit;
  text-align: start;
}

.row-open:focus-visible {
  outline-offset: 2px;
}

.row-glyph {
  display: block;
  border-radius: 0.4rem;
  overflow: hidden;
}

.row-copy {
  display: grid;
  gap: 0.2rem;
  min-inline-size: 0;
}

.row-name {
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.row-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.chip {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--pg-line);
  border-radius: 999px;
  color: var(--pg-ink-soft);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.row-pitch {
  color: var(--pg-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}

.row-side {
  display: grid;
  justify-items: end;
  gap: 0.35rem;
}

.badge {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--pg-ink);
  color: var(--pg-bg);
  font-family: var(--pg-font-mono);
  font-size: 0.64rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.badge-chosen {
  background: var(--pg-accent);
  color: var(--pg-white);
}

.shortlist-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-block-size: 2.75rem;
  padding: 0.2rem 0.8rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.shortlist-toggle[aria-pressed="true"] {
  border-color: var(--pg-ink);
  background: var(--pg-ink);
  color: var(--pg-bg);
}

.detail {
  display: grid;
  gap: 0.9rem;
  min-inline-size: 0;
}

.detail-top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-block-size: 2.75rem;
  padding: 0.2rem 0.8rem 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.88rem;
  font-weight: 600;
}

.detail-head {
  display: grid;
  grid-template-columns: minmax(0, 8.5rem) minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem 1rem;
}

.detail-glyph {
  border-radius: 0.5rem;
  overflow: hidden;
}

.detail-copy {
  display: grid;
  gap: 0.4rem;
  min-inline-size: 0;
}

.detail-name {
  font-size: 1.4rem;
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -0.025em;
}

.detail-name:focus {
  outline: none;
}

.detail-name:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 4px;
}

.detail-pitch {
  color: var(--pg-ink-soft);
  font-size: 0.92rem;
  line-height: 1.45;
}

.step-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step-controls button {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
  border-radius: 999px;
}

.step-hint {
  margin-inline-start: 0.25rem;
  color: var(--pg-muted);
  font-size: 0.82rem;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem 1.25rem;
  padding-block-start: 0.75rem;
  border-block-start: 1px solid var(--pg-line);
}

.facts dt {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.facts dd {
  font-size: 0.95rem;
  font-weight: 600;
}

.facts .fact-note {
  color: var(--pg-muted);
  font-size: 0.74rem;
  font-weight: 400;
}

.guidance {
  color: var(--pg-ink-soft);
  font-size: 0.9rem;
  line-height: 1.45;
}

.guidance-label {
  margin-inline-end: 0.3rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.guidance-note {
  display: block;
  color: var(--pg-muted);
  font-size: 0.78rem;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
