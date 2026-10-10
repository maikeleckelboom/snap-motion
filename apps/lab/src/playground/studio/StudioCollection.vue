<script setup lang="ts">
import { createPagedGridGeometry } from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import { useMediaQuery } from "@vueuse/core";
import { computed, nextTick, ref, useId, watch } from "vue";

import SegmentedControl from "@/components/SegmentedControl.vue";
import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { studyById, type Study } from "./catalog";
import { studyCategories, type StudyId } from "./studies";
import { useStudio } from "./studio-context";
import type { StudioDensity } from "./studio-model";
import { useStudioPhysics } from "./use-studio-physics";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();
const emit = defineEmits<{ choose: [id: StudyId] }>();

const { announce, model } = useStudio();
const physics = useStudioPhysics(() => props.settings);

const instanceId = useId();
const titleId = `${instanceId}-title`;
const helpId = `${instanceId}-help`;
const GAP = 12;
const FALLBACK_VIEWPORT = 640;

const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const liveMessage = ref("");
const previousFocused = ref(false);
const nextFocused = ref(false);

// A tablet gives the collection the full width of one view; the wide layout gives it a column.
const tablet = useMediaQuery("(min-width: 40rem) and (max-width: 61.99rem)");
const compact = computed(() => model.density.value === "compact");
const layout = computed(() => {
  const columns = compact.value ? 3 : 2;
  return { columns: tablet.value ? columns + 1 : columns, rows: compact.value ? 3 : 2 };
});
const capacity = computed(() => layout.value.columns * layout.value.rows);
const visibleStudies = computed(() => model.visibleIds.value.map((id) => studyById.get(id)!));
const pages = computed(() => {
  const result: { id: string; studies: Study[] }[] = [];
  for (let index = 0; index < visibleStudies.value.length; index += capacity.value) {
    result.push({
      id: `page-${result.length + 1}`,
      studies: visibleStudies.value.slice(index, index + capacity.value),
    });
  }
  return result;
});

/** The page that holds a study in the current filter and density, if it is shown at all. */
function pageIdOf(id: StudyId): string | undefined {
  const index = model.visibleIds.value.indexOf(id);
  return index < 0 ? undefined : `page-${Math.floor(index / capacity.value) + 1}`;
}

/**
 * Pages are the surface's semantic anchors; the geometry primitive lays the cells out and spaces
 * the pages, so this component composes no second geometry over it.
 */
function geometry() {
  return createPagedGridGeometry({
    columns: layout.value.columns,
    gap: GAP,
    getPageId: ({ pageIndex }) => `page-${pageIndex + 1}`,
    itemIds: model.visibleIds.value,
    pageGap: GAP,
    rows: layout.value.rows,
    viewportSize: Math.max(1, viewport.value?.clientWidth ?? FALLBACK_VIEWPORT),
  });
}

const initialGeometry = geometry();
const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  elasticity: physics.elasticity.value,
  initialTargetId: pageIdOf(model.activeId.value) ?? initialGeometry.anchors[0]!.id,
  measure: geometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: computed(() => props.reducedMotionOverride),
  releasePolicy: physics.carouselRelease.value,
  spring: physics.spring.value,
  track,
  viewport,
});

const currentPageId = computed(() => motion.targetId.value ?? motion.nearestId.value ?? "page-1");
const currentPageIndex = computed(() =>
  Math.max(
    0,
    pages.value.findIndex((page) => page.id === currentPageId.value),
  ),
);
const gridStyle = computed(() => ({
  "--grid-columns": String(layout.value.columns),
  "--grid-gap": `${GAP}px`,
}));
const countText = computed(() =>
  visibleStudies.value.length === model.ids.length
    ? `${model.ids.length} studies`
    : `${visibleStudies.value.length} of ${model.ids.length} studies`,
);

const densityOptions: { label: string; value: StudioDensity; testid: string }[] = [
  { label: "Roomy", value: "comfortable", testid: "studio-density-comfortable" },
  { label: "Compact", value: "compact", testid: "studio-density-compact" },
];
const filterOptions = [{ id: "all", label: "All" }, ...studyCategories] as const;

function tileLabel(study: Study) {
  const parts = [study.name, study.kind.toLowerCase()];
  if (model.isCompared(study.id)) parts.push("in comparison");
  if (model.hasNote(study.id)) parts.push("has a note");
  return parts.join(", ");
}

function choose(id: StudyId) {
  emit("choose", id);
}

/**
 * A tap on a tile.
 *
 * The surface claims a mouse press at once and captures the pointer, so the browser then reports
 * the release and its click on the surface rather than on the tile, and a tile `click` handler
 * would never run. A tap is therefore resolved here from what the press began on and how far it
 * travelled. A real drag moves well past the slop and is left to the surface; a click with no
 * pointer behind it (an assistive technology activating the tile) arrives on the tile itself.
 */
const TAP_SLOP = 6;
let press: { id: StudyId; pointerId: number; x: number; y: number } | undefined;

function tileIdOf(target: EventTarget | null): StudyId | undefined {
  const tile = target instanceof Element ? target.closest<HTMLElement>("[data-study-id]") : null;
  return tile?.dataset.studyId as StudyId | undefined;
}

function onViewportPointerDown(event: PointerEvent) {
  const id = tileIdOf(event.target);
  press =
    id !== undefined && event.isPrimary
      ? { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      : undefined;
  motion.onPointerDown(event);
}

function onViewportPointerUp(event: PointerEvent) {
  const origin = press;
  press = undefined;
  if (!origin || event.pointerId !== origin.pointerId) return;
  if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TAP_SLOP) return;
  choose(origin.id);
  // Capture hid the tile from the browser's own focus handling; hand it focus so the visitor can
  // carry on from the tile they chose.
  viewport.value
    ?.querySelector<HTMLElement>(`[data-study-id="${origin.id}"]`)
    ?.focus({ preventScroll: true });
}

function onViewportPointerCancel() {
  press = undefined;
}

function onViewportClick(event: MouseEvent) {
  if (event.detail !== 0) return;
  const id = tileIdOf(event.target);
  if (id !== undefined) choose(id);
}

defineExpose({ focusGrid: () => viewport.value?.focus({ preventScroll: false }) });

function onTileKeyDown(event: KeyboardEvent, id: StudyId) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  choose(id);
}

function onViewportKeyDown(event: KeyboardEvent) {
  // Only the surface itself pages; a key pressed on a tile or control belongs to that control.
  if (event.target !== event.currentTarget) return;
  motion.onKeyDown(event);
}

function setFilter(next: (typeof filterOptions)[number]["id"]) {
  if (model.filter.value === next) return;
  model.setFilter(next);
  const count = model.visibleIds.value.length;
  announce(`${count} ${count === 1 ? "study" : "studies"} shown`);
}

function setDensity(next: StudioDensity) {
  if (model.density.value === next) return;
  model.setDensity(next);
  announce(next === "compact" ? "Compact layout" : "Roomy layout");
}

/**
 * A change of filter or layout changes the pages themselves, so it is a measurement, not a
 * navigation: the surface adopts the page that holds the active study without travelling to it.
 */
watch(
  [() => model.visibleIds.value, capacity],
  async () => {
    await nextTick();
    const pageId = pageIdOf(model.activeId.value) ?? "page-1";
    motion.controller.remeasure({ ...geometry(), activeId: pageId });
  },
  { flush: "post" },
);

/**
 * Another surface selected a study. That is ordinary navigation for this one, so it travels to the
 * study's page, unless the visitor's own gesture currently owns the grid.
 */
watch(
  () => model.activeId.value,
  (id) => {
    const pageId = pageIdOf(id);
    if (pageId === undefined) return;
    if (motion.pointerInteractionActive.value || motion.isDragging.value) return;
    if ((motion.targetId.value ?? motion.nearestId.value) === pageId) return;
    motion.moveTo(pageId);
  },
);

watch(
  () => props.settings,
  (settings) => {
    motion.configure({
      elasticity: physics.elasticity.value,
      programmaticImpulse: settings.programmaticImpulse,
      releasePolicy: physics.carouselRelease.value,
      spring: physics.spring.value,
    });
  },
  { deep: true },
);

watch([motion.nearestId, motion.phase], ([nearestId, phase], [previousId]) => {
  if (phase === "idle" && nearestId !== undefined && nearestId !== previousId) {
    liveMessage.value = `Page ${currentPageIndex.value + 1} of ${pages.value.length}`;
  }
});
</script>

<template>
  <section
    class="studio-region studio-browse"
    :aria-labelledby="titleId"
    data-testid="studio-browse"
  >
    <header class="region-head">
      <div>
        <p class="region-kicker"><span class="tabular">01</span> / Browse</p>
        <h4 :id="titleId" class="region-title">Collection</h4>
      </div>
      <p class="region-count tabular" data-testid="studio-collection-count">{{ countText }}</p>
    </header>

    <div class="browse-tools">
      <div class="filter" role="group" aria-label="Motion type">
        <button
          v-for="option in filterOptions"
          :key="option.id"
          :aria-pressed="model.filter.value === option.id"
          :data-testid="`studio-filter-${option.id}`"
          type="button"
          @click="setFilter(option.id)"
        >
          {{ option.label }}
        </button>
      </div>
      <SegmentedControl
        class="density"
        label="Layout"
        :model-value="model.density.value"
        :options="densityOptions"
        @update:model-value="setDensity"
      />
    </div>

    <div class="grid-stage" role="group" aria-roledescription="carousel" aria-label="Studies">
      <section
        ref="viewport"
        :aria-describedby="helpId"
        class="grid-viewport"
        data-testid="studio-grid"
        :data-active-page="currentPageId"
        :data-columns="layout.columns"
        :data-rows="layout.rows"
        :data-page-count="pages.length"
        :data-phase="motion.phase.value"
        :style="motion.surfaceStyle"
        tabindex="0"
        @click="onViewportClick"
        @keydown="onViewportKeyDown"
        @pointercancel="onViewportPointerCancel"
        @pointerdown="onViewportPointerDown"
        @pointerup="onViewportPointerUp"
        @wheel="motion.onWheel"
      >
        <div ref="track" class="grid-track" :style="[motion.trackStyle.value, gridStyle]">
          <div
            v-for="(page, pageIndex) in pages"
            :key="page.id"
            :aria-label="`Page ${pageIndex + 1} of ${pages.length}`"
            aria-roledescription="slide"
            class="grid-page"
            :data-page-id="page.id"
            :inert="currentPageId !== page.id"
            role="group"
          >
            <div class="grid-cells">
              <!--
                Tiles are not <button>s: the surface does not start a drag on a native control, and
                the whole tile is the thing a visitor grabs. A named button role keeps them operable.
              -->
              <div
                v-for="study in page.studies"
                :key="study.id"
                :aria-current="model.activeId.value === study.id ? 'true' : undefined"
                :aria-label="tileLabel(study)"
                class="tile"
                :data-compared="model.isCompared(study.id) ? 'true' : 'false'"
                :data-study-id="study.id"
                :data-testid="`studio-tile-${study.id}`"
                role="button"
                tabindex="0"
                :style="{ '--tone': study.tone }"
                @keydown="onTileKeyDown($event, study.id)"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  class="tile-image"
                  decoding="async"
                  draggable="false"
                  :height="study.cover.preview.height"
                  :src="study.cover.preview.src"
                  :width="study.cover.preview.width"
                />
                <span aria-hidden="true" class="tile-badges">
                  <span v-if="model.hasNote(study.id)" class="badge badge-note">
                    <svg viewBox="0 0 16 16" width="12" height="12">
                      <path d="M3 3h10v7H8l-3 3v-3H3z" fill="currentColor" />
                    </svg>
                  </span>
                  <span v-if="model.isCompared(study.id)" class="badge badge-compare">
                    <svg viewBox="0 0 16 16" width="12" height="12">
                      <path
                        d="m3.5 8.5 3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      />
                    </svg>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <p :id="helpId" class="sr-only">
        Use Left and Right Arrow to move between pages. Choose a study to make it active.
      </p>
    </div>

    <div class="pager">
      <button
        aria-label="Previous page"
        :aria-disabled="!motion.canPrevious.value"
        class="pager-button"
        data-testid="studio-grid-previous"
        :disabled="!motion.canPrevious.value && !previousFocused"
        type="button"
        @blur="previousFocused = false"
        @click="motion.canPrevious.value && motion.previous()"
        @focus="previousFocused = true"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      <p class="pager-status tabular" aria-hidden="true" data-testid="studio-grid-page">
        Page {{ currentPageIndex + 1 }} / {{ pages.length }}
      </p>
      <button
        aria-label="Next page"
        :aria-disabled="!motion.canNext.value"
        class="pager-button"
        data-testid="studio-grid-next"
        :disabled="!motion.canNext.value && !nextFocused"
        type="button"
        @blur="nextFocused = false"
        @click="motion.canNext.value && motion.next()"
        @focus="nextFocused = true"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
    </div>
    <p class="sr-only" role="status" aria-atomic="true">{{ liveMessage }}</p>
  </section>
</template>

<style scoped>
.browse-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 0.6rem 1rem;
}

.filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.filter button {
  min-block-size: 2.25rem;
  padding: 0.2rem 0.8rem;
  border-color: var(--pg-line);
  border-radius: 999px;
  background: transparent;
  color: var(--pg-ink-soft);
  font-size: 0.85rem;
  font-weight: 600;
}

.filter button[aria-pressed="true"] {
  border-color: var(--pg-ink);
  background: var(--pg-ink);
  color: var(--pg-bg);
}

.density :deep(.segmented-options button) {
  min-block-size: 2.25rem;
  padding-inline: 0.8rem;
  font-size: 0.85rem;
}

.grid-stage {
  min-inline-size: 0;
}

.grid-viewport {
  min-inline-size: 0;
  border-radius: 0.6rem;
  overflow: hidden;
  cursor: grab;
}

.grid-viewport[data-phase="dragging"] {
  cursor: grabbing;
}

.grid-viewport:focus-visible {
  outline-offset: 2px;
}

.grid-track {
  display: flex;
  align-items: stretch;
  gap: var(--grid-gap);
  transform: translate3d(0, 0, 0);
}

.grid-page {
  flex: 0 0 100%;
  inline-size: 100%;
  min-inline-size: 0;
}

/* The padding gives a selected tile's ring room inside the viewport's clip. */
.grid-cells {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
  align-content: start;
  gap: var(--grid-gap);
  padding: 6px;
}

.tile {
  position: relative;
  aspect-ratio: 10 / 7;
  min-inline-size: 0;
  border-radius: 0.55rem;
  background: var(--tone);
  overflow: hidden;
  cursor: pointer;
  /* Selection is a ring plus a gap, so it reads without relying on colour. */
  box-shadow: 0 0 0 0 transparent;
  transition: none;
}

.tile-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
}

.tile[aria-current="true"] {
  overflow: visible;
  box-shadow:
    0 0 0 3px var(--pg-bg),
    0 0 0 5px var(--pg-ink);
}

.tile[aria-current="true"] .tile-image {
  border-radius: inherit;
}

.tile:focus-visible {
  outline: 3px solid var(--pg-focus);
  outline-offset: 3px;
}

.tile[aria-current="true"]:focus-visible {
  outline-offset: 6px;
}

.tile-badges {
  position: absolute;
  inset-block-start: 0.35rem;
  inset-inline-end: 0.35rem;
  display: flex;
  gap: 0.25rem;
  pointer-events: none;
}

.badge {
  display: grid;
  place-items: center;
  inline-size: 1.4rem;
  block-size: 1.4rem;
  border-radius: 999px;
  background: var(--pg-ink);
  color: var(--pg-bg);
}

.badge-compare {
  background: var(--pg-accent);
  color: var(--pg-white);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.pager-button {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  padding: 0;
  border-radius: 999px;
}

.pager-status {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.8rem;
}

@media (forced-colors: active) {
  .tile[aria-current="true"] {
    outline: 3px solid Highlight;
    outline-offset: 3px;
  }
}
</style>
