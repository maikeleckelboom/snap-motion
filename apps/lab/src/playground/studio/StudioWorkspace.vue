<script setup lang="ts">
import type { StackedDeckExchange } from "@snap-motion/core";
import type { FocusReturnOptions } from "@snap-motion/vue/dialog";
import {
  MediaGalleryDialog,
  type MediaGalleryOpenRequestDetails,
} from "@snap-motion/vue/media-gallery";
import { useMediaQuery } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, provide, ref, shallowRef, useId } from "vue";

import SegmentedControl from "@/components/SegmentedControl.vue";
import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { presetLabel } from "../preset-facts";
import { usePlaygroundTuning } from "../tuning-context";
import { coverMediaId, galleryMedia, studies, studyById, studyIdOfMedia } from "./catalog";
import {
  initialActiveStudyId,
  initialComparisonIds,
  type StudyCategoryId,
  type StudyId,
} from "./studies";
import { studioKey } from "./studio-context";
import {
  MAX_COMPARISON,
  createStudioModel,
  type ComparisonOutcome,
  type StudioView,
} from "./studio-model";
import StudioCollection from "./StudioCollection.vue";
import StudioCompare from "./StudioCompare.vue";
import StudioExplore from "./StudioExplore.vue";
import StudioInspector from "./StudioInspector.vue";
import StudioSheet from "./StudioSheet.vue";

const props = defineProps<{
  exchange: StackedDeckExchange;
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();
const emit = defineEmits<{ exchangeChange: [exchange: StackedDeckExchange] }>();

const model = createStudioModel<StudyId, StudyCategoryId>({
  ids: studies.map(({ id }) => id),
  initialActiveId: initialActiveStudyId,
  initialComparisonIds,
  categoryOf: (id) => studyById.get(id)!.category,
  mediaIdOf: coverMediaId,
  ownerOfMedia: studyIdOfMedia,
});

const tuning = usePlaygroundTuning();
const titleId = `${useId()}-title`;
const root = ref<HTMLElement>();
const collection = ref<InstanceType<typeof StudioCollection>>();
const explore = ref<InstanceType<typeof StudioExplore>>();
const compare = ref<InstanceType<typeof StudioCompare>>();
const inspector = ref<InstanceType<typeof StudioInspector>>();
const statusText = ref("");
const galleryOpener = shallowRef<HTMLElement>();
const wide = useMediaQuery("(min-width: 62rem)");

// A change of the one status string is the only thing a screen reader hears from the workspace, so
// repeating a message must still change it.
function announce(message: string) {
  statusText.value = statusText.value === message ? `${message} ` : message;
}

provide(studioKey, { announce, model });

const summaryText = computed(() => {
  const count = model.comparisonIds.value.length;
  return `${studies.length} studies · ${count} in comparison`;
});
const motionLabel = computed(() => {
  const modified = tuning.modifiedKeys.value.length > 0;
  return `${presetLabel(tuning.preset.value)}${modified ? " · modified" : ""}`;
});

const viewOptions: { label: string; value: StudioView; testid: string }[] = [
  { label: "Browse", value: "browse", testid: "studio-view-browse" },
  { label: "Explore", value: "explore", testid: "studio-view-explore" },
  { label: "Compare", value: "compare", testid: "studio-view-compare" },
];

const sheetOpen = computed(() => model.overlay.value === "sheet" && model.overlayOpen.value);
const galleryOpen = computed(() => model.overlay.value === "gallery" && model.overlayOpen.value);
const galleryActiveId = computed(
  () => model.inspectionMediaId.value ?? coverMediaId(model.activeId.value),
);
// Read through a function: after an `await`, TypeScript must not assume an earlier narrowing holds.
const overlayIsFree = () => model.overlay.value === "none";
const sheetSide = computed(() => (wide.value ? "right" : "bottom"));
const sheetFocusReturn = computed<FocusReturnOptions>(() => ({
  ...(inspector.value?.detailsButton ? { opener: inspector.value.detailsButton } : {}),
  fallback: () => inspector.value?.root,
}));
const galleryFocusReturn = computed<FocusReturnOptions>(() => ({
  ...(galleryOpener.value ? { opener: galleryOpener.value } : {}),
  fallback: () => inspector.value?.root,
}));

// ---------------------------------------------------------------------------------- selection

/**
 * A visitor's command to work on a study, from a surface that is not the Coverflow's own gesture.
 *
 * While the Coverflow is mounted it owns the spatial presentation of the selection, so the command
 * is routed through it: the rail travels on its own spring, and its request (not this function) is
 * what updates the model. That keeps its physical continuity, and a request that races a gesture
 * cannot tear the rail. Without a rail (a narrow layout showing another view) the model adopts the
 * selection directly, and the rail simply mounts on it later.
 */
function chooseStudy(id: StudyId) {
  if (model.overlay.value !== "none" || model.activeId.value === id) return;
  if (explore.value?.travelTo(id)) return;
  model.select(id);
  announce(`${studyById.get(id)!.name} selected`);
}

/** The rail's own request. It is accepted as it arrives: there is no guard to refuse it. */
function onCoverflowRequest(id: StudyId) {
  model.select(id);
}

/**
 * A card chosen on the Deck. The comparison cursor and the active study both take it, and the rail
 * is asked to travel to it so the other surface follows by motion rather than by jumping.
 */
function onDeckRequest(id: StudyId) {
  explore.value?.travelTo(id);
  model.selectFromDeck(id);
}

function makeActive(id: StudyId) {
  if (model.overlay.value !== "none") return;
  if (model.isCompared(id)) {
    model.selectFromDeck(id);
    explore.value?.travelTo(id);
  } else chooseStudy(id);
}

// ---------------------------------------------------------------------------------- comparison

function comparisonMessage(outcome: ComparisonOutcome, id: StudyId) {
  const name = studyById.get(id)!.name;
  const count = model.comparisonIds.value.length;
  switch (outcome) {
    case "added":
      return `${name} added to comparison, ${count} of ${MAX_COMPARISON}`;
    case "removed":
      return count === 0
        ? `${name} removed. The comparison is empty`
        : `${name} removed from comparison, ${count} of ${MAX_COMPARISON} left`;
    case "full":
      return `The comparison is full. Remove a study to add ${name}`;
    case "duplicate":
      return `${name} is already in the comparison`;
    default:
      return "";
  }
}

function toggleCompare(id: StudyId = model.activeId.value) {
  const outcome = model.toggleComparison(id);
  announce(comparisonMessage(outcome, id));
}

function addActive() {
  const id = model.activeId.value;
  announce(comparisonMessage(model.addToComparison(id), id));
}

/** Removing from the tray removes the control that had focus, so focus moves to a surviving one. */
async function removeFromTray(id: StudyId) {
  const index = model.comparisonIds.value.indexOf(id);
  const outcome = model.removeFromComparison(id);
  announce(comparisonMessage(outcome, id));
  if (outcome !== "removed") return;
  await nextTick();
  compare.value?.focusAfterRemoval(index);
}

async function browse() {
  if (!wide.value) {
    setView("browse");
    await nextTick();
  }
  collection.value?.focusGrid();
}

function setView(view: StudioView) {
  if (model.view.value === view) return;
  model.setView(view);
  announce(`${view[0]!.toUpperCase()}${view.slice(1)} view`);
}

// ---------------------------------------------------------------------------------- overlays

// Every open, and every unmount, invalidates a handoff still waiting for focus to settle.
let handoffGeneration = 0;

function openGallery(opener: HTMLElement | undefined, mediaId?: string) {
  handoffGeneration += 1;
  galleryOpener.value = opener;
  return model.openGallery(mediaId);
}

function onInspect(mediaId: string | undefined, opener: HTMLElement | undefined) {
  openGallery(opener ?? inspector.value?.inspectButton, mediaId);
}

function onExploreActivate(id: StudyId) {
  openGallery(explore.value?.focusTarget(), coverMediaId(id));
}

function onCompareActivate(id: StudyId) {
  openGallery(compare.value?.focusTarget(), coverMediaId(id));
}

function onGalleryActiveRequest(mediaId: string | undefined) {
  if (mediaId !== undefined) model.setInspectionMedia(mediaId);
}

function onGalleryOpenRequest(_open: false, details: MediaGalleryOpenRequestDetails) {
  const id = model.requestClose(details.activeId);
  if (id !== undefined) announce(`Back to ${studyById.get(id)!.name}`);
}

function onDetails() {
  handoffGeneration += 1;
  model.openSheet();
}

function onSheetRequestClose() {
  model.requestClose();
}

function onSheetInspect(mediaId: string) {
  model.handOffToGallery(mediaId);
}

/** Resolves once focus has a stable owner after a native close, within the library's own window. */
function focusSettled(target: HTMLElement | undefined): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      if (!target?.isConnected || target.ownerDocument.activeElement === target || ++frames >= 6) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function onOverlayClosed(kind: "gallery" | "sheet") {
  if (model.overlay.value !== kind) return;
  const handoff = model.completeClose();
  if (handoff === undefined) return;
  // The Sheet is a native modal: the Gallery may not open over it. It opens only after the Sheet has
  // closed and handed focus back, so there is never more than one modal owner.
  const generation = ++handoffGeneration;
  const opener = inspector.value?.detailsButton;
  await focusSettled(opener);
  if (generation !== handoffGeneration || !overlayIsFree()) return;
  openGallery(opener, handoff);
}

onBeforeUnmount(() => {
  handoffGeneration += 1;
});

defineExpose({ focus: () => root.value?.focus({ preventScroll: true }) });
</script>

<template>
  <section
    ref="root"
    class="studio"
    :aria-labelledby="titleId"
    data-testid="studio-workspace"
    :data-layout="wide ? 'wide' : 'narrow'"
    tabindex="-1"
  >
    <header class="studio-bar">
      <div class="studio-identity">
        <h3 :id="titleId" class="studio-name">Motion Studio</h3>
        <p class="studio-summary tabular" data-testid="studio-summary">{{ summaryText }}</p>
      </div>
      <a class="studio-motion" data-testid="studio-motion" href="#studio-tuning">
        <span class="studio-motion-label">Motion</span>
        <strong>{{ motionLabel }}</strong>
        <span class="sr-only">. Go to motion tuning</span>
      </a>
    </header>

    <div v-if="!wide" class="studio-modes">
      <SegmentedControl
        label="Workspace view"
        label-hidden
        :model-value="model.view.value"
        :options="viewOptions"
        @update:model-value="setView"
      />
    </div>

    <div class="studio-layout">
      <StudioCollection
        v-if="wide || model.view.value === 'browse'"
        ref="collection"
        class="area-browse"
        :reduced-motion-override="reducedMotionOverride"
        :settings="settings"
        @choose="chooseStudy"
      />
      <StudioExplore
        v-if="wide || model.view.value === 'explore'"
        ref="explore"
        class="area-explore"
        :reduced-motion-override="reducedMotionOverride"
        :settings="settings"
        @activate="onExploreActivate"
        @request="onCoverflowRequest"
      />
      <StudioInspector
        ref="inspector"
        class="area-inspector"
        @details="onDetails"
        @inspect="onInspect"
        @toggle-compare="toggleCompare()"
      />
      <StudioCompare
        v-if="wide || model.view.value === 'compare'"
        ref="compare"
        class="area-compare"
        :exchange="exchange"
        :reduced-motion-override="reducedMotionOverride"
        :settings="settings"
        @activate="onCompareActivate"
        @add="addActive"
        @browse="browse"
        @exchange-change="emit('exchangeChange', $event)"
        @make-active="makeActive"
        @remove="removeFromTray"
        @request="onDeckRequest"
      />
    </div>

    <StudioSheet
      :focus-return="sheetFocusReturn"
      :open="sheetOpen"
      :reduced-motion-override="reducedMotionOverride"
      :settings="settings"
      :side="sheetSide"
      @closed="onOverlayClosed('sheet')"
      @inspect="onSheetInspect"
      @note="announce"
      @request-close="onSheetRequestClose"
      @toggle-compare="toggleCompare()"
    />

    <MediaGalleryDialog
      class="studio-gallery"
      data-testid="studio-gallery"
      eyebrow="Motion Studio"
      :active-id="galleryActiveId"
      :focus-return="galleryFocusReturn"
      :items="galleryMedia"
      :open="galleryOpen"
      :reduced-motion-override="reducedMotionOverride"
      title="Study plates"
      @active-id-request="onGalleryActiveRequest"
      @closed="onOverlayClosed('gallery')"
      @open-request="onGalleryOpenRequest"
    />

    <p class="sr-only" role="status" aria-atomic="true" data-testid="studio-status">
      {{ statusText }}
    </p>
  </section>
</template>

<style>
/*
 * The workspace's shared presentation. It is unscoped on purpose: the regions are separate
 * components that compose one layout, so they share these classes rather than each restating them.
 * Everything is prefixed or lives under `.studio`, and nothing here styles another section.
 */
.studio {
  --stage: #e9e5d9;

  display: grid;
  gap: 0;
  min-inline-size: 0;
  border-block: 1px solid var(--pg-ink);
}

.studio:focus {
  outline: none;
}

.studio:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 4px;
}

.studio-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding-block: 0.9rem;
  border-block-end: 1px solid var(--pg-line);
}

.studio-identity {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
}

.studio-name {
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.studio-summary {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.03em;
}

.studio-motion {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  min-block-size: 2.25rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--pg-line);
  border-radius: 999px;
  color: var(--pg-ink);
  font-size: 0.85rem;
  text-decoration: none;
  align-items: center;
}

.studio-motion:hover {
  border-color: var(--pg-ink);
}

.studio-motion-label {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.studio-modes {
  padding-block: 0.75rem;
  border-block-end: 1px solid var(--pg-line);
}

.studio-modes .segmented-options {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  inline-size: 100%;
}

.studio-modes .segmented,
.studio-modes .segmented-options {
  inline-size: 100%;
}

.studio-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-inline-size: 0;
}

.studio-region {
  display: grid;
  align-content: start;
  gap: 0.9rem;
  min-inline-size: 0;
  padding-block: 1.25rem;
}

.region-head {
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

.region-title {
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.region-count {
  padding-block-start: 0.25rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.75rem;
}

.studio-button {
  min-block-size: 2.75rem;
  padding: 0.35rem 0.95rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.studio-button-primary {
  border-color: var(--pg-ink);
  background: var(--pg-ink);
  color: var(--pg-white);
}

.studio-button-primary:hover:not(:disabled) {
  background: var(--pg-ink-soft);
}

.studio-button:disabled {
  background: transparent;
}

/* Wide: the collection and its active study on one side, the two spatial surfaces on the other. */
@media (min-width: 62rem) {
  .studio-layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    grid-template-areas:
      "browse explore"
      "inspector compare";
  }

  .area-browse {
    grid-area: browse;
    padding-inline-end: clamp(1.25rem, 2.5vw, 2rem);
  }

  .area-explore {
    grid-area: explore;
    padding-inline-start: clamp(1.25rem, 2.5vw, 2rem);
    border-inline-start: 1px solid var(--pg-line);
  }

  .area-inspector {
    grid-area: inspector;
    padding-inline-end: clamp(1.25rem, 2.5vw, 2rem);
    border-block-start: 1px solid var(--pg-line);
  }

  .area-compare {
    grid-area: compare;
    padding-inline-start: clamp(1.25rem, 2.5vw, 2rem);
    border-block-start: 1px solid var(--pg-line);
    border-inline-start: 1px solid var(--pg-line);
  }
}

/* Narrow: one view at a time, with the active study always beneath it, whichever view is showing. */
@media (max-width: 61.99rem) {
  .area-browse,
  .area-explore,
  .area-compare {
    order: 1;
    /* The three views are close in height, so switching between them barely moves the page. */
    min-block-size: 35rem;
  }

  .area-inspector {
    order: 2;
    border-block-start: 1px solid var(--pg-line);
  }
}

/* The Gallery is a dark viewer on this page, as in the other demonstrations. */
.studio-gallery {
  --snap-motion-gallery-surface: #11161f;
  --snap-motion-gallery-canvas: #090d13;
  --snap-motion-gallery-text: #eef2f7;
  --snap-motion-gallery-muted: #aab4c2;
  --snap-motion-gallery-line: rgb(255 255 255 / 0.14);
  --snap-motion-gallery-control-surface: #202936;
  --snap-motion-gallery-control-border: rgb(255 255 255 / 0.24);
  --snap-motion-gallery-control-hover-surface: #2a3545;
  --snap-motion-gallery-disabled-surface: #171e29;
  --snap-motion-gallery-disabled-text: #667286;
  --snap-motion-gallery-focus: #73b3ff;
  --snap-motion-gallery-scrim: rgb(3 7 18 / 0.92);
  --snap-motion-gallery-chrome-surface: #151b25;
  --snap-motion-gallery-radius: 1rem;
}
</style>
