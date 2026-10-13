<script setup lang="ts">
import type { FocusReturnOptions } from "@snap-motion/vue/dialog";
import { Sheet, type SheetSide } from "@snap-motion/vue/sheet";
import { computed, ref } from "vue";

import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { implementationSnippet } from "./candidates";
import { useStudio } from "./studio-context";
import { useStudioPhysics } from "./use-studio-physics";

const props = defineProps<{
  focusReturn: FocusReturnOptions;
  open: boolean;
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  side: SheetSide;
}>();
const emit = defineEmits<{
  /** The visitor asked to dismiss the Sheet (Escape, the close control, the scrim or a drag). */
  requestClose: [];
  /** The native dialog finished closing. */
  closed: [];
}>();

const { behavior, model } = useStudio();
const physics = useStudioPhysics(() => props.settings);

const candidate = computed(() =>
  model.sheetId.value === undefined ? undefined : behavior(model.sheetId.value),
);
const snippet = computed(() => (candidate.value ? implementationSnippet(candidate.value) : ""));
const decided = computed(() => candidate.value?.id === model.decidedId.value);
const copyState = ref<"idle" | "copied" | "failed">("idle");

const dialogStyle = computed(() => ({
  "--snap-motion-sheet-content-padding-inline": "clamp(1rem, 4vw, 1.5rem)",
  "--snap-motion-sheet-inline-size": "min(34rem, 100vw)",
}));

async function copy() {
  try {
    await navigator.clipboard.writeText(snippet.value);
    copyState.value = "copied";
  } catch {
    copyState.value = "failed";
  }
}
</script>

<template>
  <Sheet
    class="studio-sheet"
    close-label="Close implementation"
    data-testid="studio-sheet"
    :elasticity="physics.sheetElasticity.value"
    :focus-return="focusReturn"
    initial-focus="close"
    :open="open"
    :programmatic-impulse="physics.programmaticImpulse.value"
    :reduced-motion-override="reducedMotionOverride"
    :release-policy="physics.sheetRelease.value"
    :side="side"
    :spring="physics.spring.value"
    :style="dialogStyle"
    @closed="emit('closed')"
    @open-request="emit('requestClose')"
  >
    <template #title>
      <div class="sheet-title">
        <p>Implementation</p>
        <h2 data-testid="studio-sheet-title">{{ candidate?.name }}</h2>
      </div>
    </template>
    <template #close>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
        <path d="M5 5l14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </template>

    <div v-if="candidate" class="details" data-testid="studio-sheet-content">
      <p class="details-line">{{ candidate.pitch }}</p>
      <p v-if="decided" class="details-line" data-testid="studio-sheet-reason">
        <strong>Chosen.</strong>
        {{ model.reason.value === "" ? "No reason recorded." : model.reason.value }}
      </p>

      <section class="details-section" role="group" aria-labelledby="studio-sheet-facts">
        <h3 id="studio-sheet-facts" class="details-heading">What it gives you</h3>
        <dl class="attributes">
          <div>
            <dt>Surface</dt>
            <dd>{{ candidate.surfaceLabel }}</dd>
          </div>
          <div>
            <dt>Exchange</dt>
            <dd>{{ candidate.exchangeLabel }}</dd>
          </div>
          <div>
            <dt>Settles in</dt>
            <dd>
              {{ candidate.settleMs === undefined ? "Over 4 s" : `${candidate.settleMs} ms` }}
              <span class="source">calculated</span>
            </dd>
          </div>
          <div>
            <dt>Overshoot</dt>
            <dd>{{ candidate.overshootPercent }}% <span class="source">calculated</span></dd>
          </div>
        </dl>
      </section>

      <section class="details-section" role="group" aria-labelledby="studio-sheet-code">
        <h3 id="studio-sheet-code" class="details-heading">Use it</h3>
        <pre class="code" data-testid="studio-snippet" tabindex="0"><code>{{ snippet }}</code></pre>
        <div class="copy-row">
          <button class="studio-button" data-testid="studio-copy" type="button" @click="copy">
            Copy code
          </button>
          <p class="details-line" role="status">
            {{
              copyState === "copied"
                ? "Copied."
                : copyState === "failed"
                  ? "Copying is not available here. Select the code instead."
                  : ""
            }}
          </p>
        </div>
        <p class="details-line">
          These are the values the live previews were given. Calculated figures describe the spring
          alone; they are not measurements of your interface.
        </p>
      </section>
    </div>
  </Sheet>
</template>

<style scoped>
.sheet-title p {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sheet-title h2 {
  font-size: 1.3rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.details {
  display: grid;
  gap: 1.25rem;
  padding-block-end: 1.5rem;
}

.details-section {
  display: grid;
  gap: 0.6rem;
}

.details-heading {
  font-size: 0.95rem;
  font-weight: 650;
}

.details-line {
  color: var(--pg-ink-soft);
  font-size: 0.9rem;
  line-height: 1.5;
}

.attributes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem 1.25rem;
}

.attributes dt {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.attributes dd {
  font-size: 0.92rem;
  font-weight: 600;
}

.source {
  margin-inline-start: 0.3rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.6rem;
  font-weight: 400;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.code {
  margin: 0;
  padding: 0.8rem 0.9rem;
  border-radius: 0.6rem;
  background: #15140f;
  color: #f4f2ec;
  font-family: var(--pg-font-mono);
  font-size: 0.76rem;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre;
}

.code:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 2px;
}

.copy-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
</style>
