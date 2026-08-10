<script setup lang="ts">
import {
  MediaGalleryDialog,
  type FocusReturnOptions,
  type MediaGalleryCloseReason,
  type MediaGalleryItem,
  type MediaGalleryMessages,
  type MediaGalleryNavigationReason,
} from "@snap-motion/vue/media-gallery";
import { computed, nextTick, ref } from "vue";

import { mediaFixtures } from "@/fixtures/media";

type ScenarioId =
  | "baseline"
  | "delayed-full"
  | "final-item"
  | "first-item"
  | "full-failure"
  | "long-localized"
  | "preview-failure"
  | "preview-only"
  | "retry-success"
  | "single-item";

interface CertificationScenario {
  readonly id: ScenarioId;
  readonly label: string;
  readonly purpose: string;
  readonly initialIndex: number;
  readonly items: readonly MediaGalleryItem[];
  readonly messages?: Partial<MediaGalleryMessages>;
  readonly expectedCurrentItem: string;
  readonly fullMedia: "No" | "Yes";
  readonly loadingExpected: "No" | "Yes";
  readonly failureExpected: "Full image" | "No" | "Preview image";
  readonly retryExpectation: "Fails" | "Not offered" | "Succeeds";
}

interface TraceEntry {
  readonly detail: string;
  readonly event: string;
  readonly sequence: number;
}

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
}>();

const regular = mediaFixtures.find((fixture) => fixture.id === "regular")!;
const wide = mediaFixtures.find((fixture) => fixture.id === "extremely-wide")!;
const tall = mediaFixtures.find((fixture) => fixture.id === "extremely-tall")!;
const invalidImageUrl = new URL("__at-media__/invalid.png", document.baseURI).href;
const delayedImageUrl = new URL("__at-media__/delayed.svg", document.baseURI).href;
const retryImageUrl = new URL("__at-media__/retry.svg", document.baseURI).href;

const baselineItems: readonly MediaGalleryItem[] = [
  {
    id: "landscape-overview",
    title: "Landscape overview",
    alt: "Blue landscape test card labelled regular landscape, with a 1600 by 1000 size marker.",
    previewSrc: regular.src,
    fullSrc: `${regular.src}?at-full`,
    width: regular.intrinsicSize.width,
    height: regular.intrinsicSize.height,
  },
  {
    id: "wide-timeline",
    title: "Wide timeline",
    alt: "Wide blue timeline test card with a 12000 by 1600 size marker.",
    previewSrc: wide.src,
    fullSrc: `${wide.src}?at-full`,
    width: wide.intrinsicSize.width,
    height: wide.intrinsicSize.height,
  },
  {
    id: "tall-document",
    title: "Tall document",
    alt: "Tall green document test card with a 1600 by 12000 size marker.",
    previewSrc: tall.src,
    fullSrc: `${tall.src}?at-full`,
    width: tall.intrinsicSize.width,
    height: tall.intrinsicSize.height,
  },
];

const scenarios: readonly CertificationScenario[] = [
  {
    id: "baseline",
    label: "Baseline, three items",
    purpose:
      "Starts on item 2 so previous and next are available. Use it for dialog entry, reading order, navigation, zoom, status timing, and focus return.",
    initialIndex: 1,
    items: baselineItems,
    expectedCurrentItem: "Wide timeline (item 2)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
  {
    id: "first-item",
    label: "First-item boundary",
    purpose:
      "Starts on item 1 of 3 with Previous unavailable. Reload and select this scenario to begin at the exact first boundary.",
    initialIndex: 0,
    items: baselineItems,
    expectedCurrentItem: "Landscape overview (item 1)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
  {
    id: "final-item",
    label: "Final-item boundary",
    purpose:
      "Starts on item 3 of 3 with Next unavailable. Reload and select this scenario to begin at the exact final boundary.",
    initialIndex: 2,
    items: baselineItems,
    expectedCurrentItem: "Tall document (item 3)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
  {
    id: "single-item",
    label: "Single-item boundary",
    purpose:
      "Exposes one named image with both navigation directions unavailable. Use it to verify boundary controls and the stable dialog order.",
    initialIndex: 0,
    items: [baselineItems[0]!],
    expectedCurrentItem: "Landscape overview (item 1)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
  {
    id: "preview-only",
    label: "Preview-only media",
    purpose:
      "Uses one valid preview with no full source. Use it to verify a stable named image without a loading state or Retry.",
    initialIndex: 0,
    items: [
      {
        id: "preview-only-image",
        title: "Preview-only landscape",
        alt: baselineItems[0]!.alt,
        previewSrc: baselineItems[0]!.previewSrc,
        width: baselineItems[0]!.width,
        height: baselineItems[0]!.height,
      },
    ],
    expectedCurrentItem: "Preview-only landscape (item 1)",
    fullMedia: "No",
    loadingExpected: "No",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
  {
    id: "delayed-full",
    label: "Delayed full image",
    purpose:
      "The lab server holds the full image for 1.5 seconds. Use it to observe a deterministic pending state followed by a successful reveal.",
    initialIndex: 0,
    items: [
      {
        ...baselineItems[0]!,
        id: "delayed-full-image",
        title: "Delayed full image",
        fullSrc: delayedImageUrl,
      },
    ],
    expectedCurrentItem: "Delayed full image (item 1)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
  {
    id: "retry-success",
    label: "Retry failure then success",
    purpose:
      "The first full-image response is intentionally invalid. Retry requests a valid image so the same run deterministically changes from failure to success.",
    initialIndex: 0,
    items: [
      {
        ...baselineItems[0]!,
        id: "retry-success-image",
        title: "Retry succeeds",
        fullSrc: retryImageUrl,
      },
    ],
    expectedCurrentItem: "Retry succeeds (item 1)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "Full image",
    retryExpectation: "Succeeds",
  },
  {
    id: "full-failure",
    label: "Full-image failure",
    purpose:
      "Uses a valid named preview and a deliberately invalid lab-served full image. Use it to verify the failure message, preview fallback, Retry, navigation safety, and close.",
    initialIndex: 0,
    items: [
      {
        ...baselineItems[0]!,
        id: "failed-full-image",
        title: "Full image unavailable",
        fullSrc: invalidImageUrl,
      },
    ],
    expectedCurrentItem: "Full image unavailable (item 1)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "Full image",
    retryExpectation: "Fails",
  },
  {
    id: "preview-failure",
    label: "Preview failure",
    purpose:
      "Uses a deliberately invalid lab-served preview with no full image. Use it to verify that the preview failure is exposed without inventing a full-image retry.",
    initialIndex: 0,
    items: [
      {
        id: "failed-preview-image",
        title: "Preview unavailable",
        alt: "Intentionally unavailable preview used for assistive-technology failure testing.",
        previewSrc: invalidImageUrl,
        width: 1_600,
        height: 1_000,
      },
    ],
    expectedCurrentItem: "Preview unavailable (item 1)",
    fullMedia: "No",
    loadingExpected: "No",
    failureExpected: "Preview image",
    retryExpectation: "Not offered",
  },
  {
    id: "long-localized",
    label: "Long localized content",
    purpose:
      "Uses deliberately long Dutch labels, status text, title, description, and alternative text to expose wrapping and reflow defects.",
    initialIndex: 0,
    items: [
      {
        ...baselineItems[2]!,
        id: "long-localized-document",
        title: "Uitgebreide documentweergave voor toegankelijkheidscertificering",
        alt: "Een uitzonderlijk lang, smal groen testdocument met markeringen voor afmetingen en een beschrijvende titel die bewust over meerdere regels kan lopen.",
        description:
          "Deze beschrijving is opzettelijk lang om tekstterugloop, vergroting en kleine schermen zonder afkapping te kunnen controleren.",
        fullSrc: `${tall.src}?at-long-localized`,
      },
    ],
    messages: {
      closeGallery: "Mediagalerij sluiten en terugkeren naar de scenario-opener",
      fit: "Afbeelding passend binnen het beschikbare venster weergeven",
      gestureInstructions:
        "Veeg wanneer passend; sleep wanneer ingezoomd; knijp of tik tweemaal om in te zoomen",
      loadingFullImage:
        "De volledige afbeelding voor toegankelijkheidscertificering wordt geladen…",
      retry: "Volledige afbeelding opnieuw proberen te laden",
      zoomControls: "Bediening voor vergroting van de geselecteerde afbeelding",
      zoomIn: "Verder inzoomen op de geselecteerde afbeelding",
      zoomLabel: "Huidige vergroting van de afbeelding",
      zoomOut: "Verder uitzoomen op de geselecteerde afbeelding",
    },
    expectedCurrentItem:
      "Uitgebreide documentweergave voor toegankelijkheidscertificering (item 1)",
    fullMedia: "Yes",
    loadingExpected: "Yes",
    failureExpected: "No",
    retryExpectation: "Not offered",
  },
];

const selectedScenarioId = ref<ScenarioId>("baseline");
const open = ref(false);
const opener = ref<HTMLButtonElement>();
const harness = ref<HTMLElement>();
const trace = ref<TraceEntry[]>([]);
let traceSequence = 0;

const selectedScenario = computed(
  () => scenarios.find((scenario) => scenario.id === selectedScenarioId.value) ?? scenarios[0]!,
);
const selectedMessages = computed(() => selectedScenario.value.messages ?? {});
const focusReturn = computed<FocusReturnOptions>(() => ({
  opener: opener.value,
  fallback: () => harness.value,
}));

function appendTrace(event: string, detail: string) {
  traceSequence += 1;
  trace.value = [...trace.value, { detail, event, sequence: traceSequence }];
}

function clearTrace() {
  traceSequence = 0;
  trace.value = [];
}

function selectScenario(id: ScenarioId) {
  selectedScenarioId.value = id;
  clearTrace();
  appendTrace("scenario-selected", `${id}; initial index ${selectedScenario.value.initialIndex}`);
}

function openGallery() {
  clearTrace();
  appendTrace(
    "open-requested",
    `${selectedScenario.value.id}; initial index ${selectedScenario.value.initialIndex}`,
  );
  open.value = true;
}

function onOpenUpdate(nextOpen: boolean) {
  appendTrace("update:open", String(nextOpen));
  open.value = nextOpen;
}

function onOpened(index: number) {
  appendTrace(
    "opened",
    `index ${index}; ${selectedScenario.value.items[index]?.title ?? "unknown"}`,
  );
}

function onIndexChanged(index: number, reason: MediaGalleryNavigationReason) {
  appendTrace(
    "indexChanged",
    `index ${index}; reason ${reason}; ${selectedScenario.value.items[index]?.title ?? "unknown"}`,
  );
}

function onRequestClose(finalIndex: number, reason: MediaGalleryCloseReason) {
  appendTrace("requestClose", `final index ${finalIndex}; reason ${reason}`);
}

async function onClosed(finalIndex: number) {
  appendTrace("closed", `final index ${finalIndex}`);
  await nextTick();
  const activeElement = opener.value?.ownerDocument.activeElement;
  const focusTarget =
    activeElement instanceof HTMLElement
      ? (activeElement.dataset.testid ?? activeElement.id ?? activeElement.tagName.toLowerCase())
      : "none";
  appendTrace("focus-restored", focusTarget);
}
</script>

<template>
  <section
    ref="harness"
    class="at-certification"
    data-testid="media-gallery-at-harness"
    tabindex="-1"
  >
    <header class="at-certification-header">
      <div>
        <p class="at-certification-status">
          Prepared for manual assistive-technology certification
        </p>
        <h3>Media gallery AT certification harness</h3>
      </div>
      <p>
        This surface makes the hardened public primitive repeatable for a human operator. Automated
        checks validate the harness and DOM contracts; they do not certify spoken output or real
        assistive-technology interaction.
      </p>
    </header>

    <div class="at-certification-layout">
      <section class="at-certification-run" aria-labelledby="at-scenarios-title">
        <fieldset>
          <legend id="at-scenarios-title">Deterministic scenario</legend>
          <label v-for="scenario in scenarios" :key="scenario.id" class="at-scenario">
            <input
              v-model="selectedScenarioId"
              :data-testid="`at-scenario-${scenario.id}`"
              name="at-scenario"
              type="radio"
              :value="scenario.id"
              @change="selectScenario(scenario.id)"
            />
            <span>
              <strong>{{ scenario.label }}</strong>
              <small>{{ scenario.purpose }}</small>
            </span>
          </label>
        </fieldset>

        <div class="at-certification-actions">
          <button ref="opener" data-testid="at-open-gallery" type="button" @click="openGallery">
            Open {{ selectedScenario.label }}
          </button>
          <button data-testid="at-clear-trace" type="button" @click="clearTrace">
            Clear event trace
          </button>
        </div>

        <dl class="at-scenario-contract" data-testid="at-scenario-contract">
          <div>
            <dt>Scenario ID</dt>
            <dd>{{ selectedScenario.id }}</dd>
          </div>
          <div>
            <dt>Expected current item</dt>
            <dd>{{ selectedScenario.expectedCurrentItem }}</dd>
          </div>
          <div>
            <dt>Expected item count</dt>
            <dd>{{ selectedScenario.items.length }}</dd>
          </div>
          <div>
            <dt>Full media exists</dt>
            <dd>{{ selectedScenario.fullMedia }}</dd>
          </div>
          <div>
            <dt>Loading expected</dt>
            <dd>{{ selectedScenario.loadingExpected }}</dd>
          </div>
          <div>
            <dt>Failure expected</dt>
            <dd>{{ selectedScenario.failureExpected }}</dd>
          </div>
          <div>
            <dt>Retry expectation</dt>
            <dd>{{ selectedScenario.retryExpectation }}</dd>
          </div>
          <div>
            <dt>Motion mode</dt>
            <dd>
              {{
                props.reducedMotionOverride === undefined
                  ? "System preference"
                  : props.reducedMotionOverride
                    ? "Reduced"
                    : "Full"
              }}
            </dd>
          </div>
          <div>
            <dt>Trace mode</dt>
            <dd>Non-live</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="at-event-trace-title"
        aria-live="off"
        class="at-event-trace"
        data-testid="at-event-trace"
      >
        <h4 id="at-event-trace-title">Non-live event trace</h4>
        <p>
          Updates are intentionally not announced. Read this list after a run to compare component
          events with the operator’s notes.
        </p>
        <p v-if="trace.length === 0" class="at-event-trace-empty">No events recorded.</p>
        <ol v-else>
          <li v-for="entry in trace" :key="entry.sequence">
            <span>{{ entry.sequence }}</span>
            <code>{{ entry.event }}</code>
            <p>{{ entry.detail }}</p>
          </li>
        </ol>
      </section>
    </div>

    <MediaGalleryDialog
      :focus-return="focusReturn"
      :initial-index="selectedScenario.initialIndex"
      :items="selectedScenario.items"
      :messages="selectedMessages"
      :open="open"
      :reduced-motion-override="props.reducedMotionOverride"
      eyebrow="AT certification"
      title="Media gallery certification"
      @closed="onClosed"
      @index-changed="onIndexChanged"
      @opened="onOpened"
      @request-close="onRequestClose"
      @update:open="onOpenUpdate"
    />
  </section>
</template>

<style scoped>
.at-certification {
  display: grid;
  gap: 1.5rem;
  max-inline-size: 76rem;
  margin-inline: auto;
}

.at-certification-header {
  display: grid;
  grid-template-columns: minmax(18rem, 0.8fr) minmax(20rem, 1.2fr);
  gap: 1.5rem;
  align-items: end;
  padding-block-end: 1rem;
  border-block-end: 2px solid var(--strong);
}

.at-certification-header h3,
.at-certification-header p {
  margin: 0;
}

.at-certification-header h3 {
  margin-block-start: 0.35rem;
  font-size: clamp(1.35rem, 2.5vw, 2rem);
}

.at-certification-status {
  color: #075f37;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.at-certification-header > p {
  color: var(--muted);
  line-height: 1.55;
}

.at-certification-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
  gap: 1.5rem;
  align-items: start;
}

.at-certification-run,
.at-event-trace {
  border: 1px solid var(--strong);
  background: var(--paper);
}

.at-certification-run {
  padding: clamp(1rem, 2vw, 1.5rem);
}

.at-certification-run fieldset {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.at-certification-run legend,
.at-event-trace h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}

.at-certification-run legend {
  margin-block-end: 0.75rem;
}

.at-scenario {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  padding: 0.9rem 0;
  border-block-start: 1px solid var(--line);
}

.at-scenario input {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin: 0.15rem 0 0;
}

.at-scenario strong,
.at-scenario small {
  display: block;
}

.at-scenario small {
  margin-block-start: 0.25rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.at-certification-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-block-start: 1rem;
}

.at-certification-actions button {
  min-block-size: 2.75rem;
  padding: 0.65rem 0.9rem;
}

.at-certification-actions button:first-child {
  background: var(--ink);
  color: var(--paper);
}

.at-scenario-contract {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 1.25rem 0 0;
  background: var(--line);
  border: 1px solid var(--line);
}

.at-scenario-contract div {
  min-inline-size: 0;
  padding: 0.75rem;
  background: var(--surface);
}

.at-scenario-contract dt {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.at-scenario-contract dd {
  margin: 0.2rem 0 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}

.at-event-trace {
  max-block-size: 36rem;
  overflow: auto;
  padding: 1rem;
}

.at-event-trace > p {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.at-event-trace ol {
  display: grid;
  gap: 0;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.at-event-trace li {
  display: grid;
  grid-template-columns: 1.75rem minmax(7rem, auto) minmax(0, 1fr);
  gap: 0.5rem;
  align-items: baseline;
  padding-block: 0.6rem;
  border-block-start: 1px solid var(--line);
}

.at-event-trace li > span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.at-event-trace code {
  font-size: 0.78rem;
  font-weight: 700;
}

.at-event-trace li p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  line-height: 1.4;
}

.at-event-trace-empty {
  padding-block: 1rem;
}

@media (max-width: 60rem) {
  .at-certification-header,
  .at-certification-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .at-event-trace {
    max-block-size: none;
  }
}

@media (max-width: 36rem) {
  .at-scenario-contract {
    grid-template-columns: minmax(0, 1fr);
  }

  .at-event-trace li {
    grid-template-columns: 1.5rem minmax(0, 1fr);
  }

  .at-event-trace li p {
    grid-column: 2;
  }
}

@media (forced-colors: active) {
  .at-certification-status {
    color: CanvasText;
  }

  .at-certification-actions button:first-child {
    border-color: ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
}
</style>
