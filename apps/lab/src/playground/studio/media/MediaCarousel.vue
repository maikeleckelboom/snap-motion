<script setup lang="ts">
import { createFixedStageGeometry } from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import { computed, ref, useId, watch } from "vue";

import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "../../../fixtures/lab-settings";
import type { CandidateBehavior } from "../candidates";
import { itemWidthCss, readStripBoxes, stripMeasurement } from "./media-strip";
import type { MediaOpenRequest } from "./media-surface";
import type { SharedMediaItem } from "./shared-media";
import { aspectRatio } from "./shared-media-data";
import { useItemTap } from "./use-item-tap";

/**
 * The item carousel: a strip of photos of different shapes, several in view at once, with the
 * selected one centred and its neighbours showing on either side.
 *
 * It is built on the package's `useCarouselMotion`, which owns everything physical: drag, flick, the
 * spring, the elastic edge, wheel and keyboard stepping, interruption and remeasurement. This file
 * owns what that composable deliberately leaves to the application: the items, how wide they are, the
 * accessibility semantics, and what a tap means.
 *
 * Why not `CarouselRoot`. It takes no spring, release policy or elasticity, so it cannot run a
 * behaviour under test, and its `CarouselSlide` makes every slide but the active one `inert`, which
 * is right for a gallery whose neighbours are decoration and wrong here, where a neighbour is a thing
 * you tap. Nothing fights that: this strip does not use `CarouselSlide`, and nothing removes an
 * `inert` the package set.
 *
 * Ownership of the items:
 * - Every item is visible to a pointer and to assistive technology. None is focusable, so focus can
 *   never move to an off-screen item and make the browser scroll the clipped viewport out from under
 *   the transform. The strip is the one tab stop: arrows move the selection, Enter opens it.
 * - A tap opens the item it began on and selects it. A drag opens nothing. A press that catches a
 *   strip still moving stops it and opens nothing (`use-item-tap.ts`).
 */
const props = defineProps<{
  behavior: CandidateBehavior;
  items: readonly SharedMediaItem[];
  label: string;
  reducedMotionOverride: boolean | undefined;
  startId: string;
}>();

const emit = defineEmits<{
  open: [request: MediaOpenRequest];
  /** The strip came to rest on a photo. */
  settled: [id: string];
}>();

const root = ref<HTMLElement>();
const track = ref<HTMLElement>();
const instructionsId = `${useId()}-instructions`;
const statusText = ref("");
const ids = computed(() => props.items.map((item) => item.id));
const reducedMotionOverride = computed(() => props.reducedMotionOverride);

function measure() {
  const viewport = root.value;
  const strip = track.value;
  if (!viewport || !strip) return createFixedStageGeometry({ itemIds: ids.value, viewportSize: 0 });
  return stripMeasurement<string>({
    boxes: readStripBoxes(strip, ids.value),
    trackExtent: strip.scrollWidth,
    viewportSize: viewport.clientWidth,
  });
}

function physics(behavior: CandidateBehavior) {
  return {
    elasticity: symmetricElasticityFromSettings(behavior.settings),
    programmaticImpulse: behavior.settings.programmaticImpulse,
    releasePolicy: carouselReleaseFromSettings(behavior.settings),
    spring: springFromSettings(behavior.settings),
  };
}

const initialGeometry = createFixedStageGeometry({ itemIds: ids.value, viewportSize: 0 });
const settledId = ref<string | undefined>(props.startId);
let announceNext = false;

const motion = useCarouselMotion<string>({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  initialTargetId: props.startId,
  measure,
  onComplete(anchor) {
    settledId.value = anchor.id;
    emit("settled", anchor.id);
    if (!announceNext) return;
    announceNext = false;
    statusText.value = describe(anchor.id);
  },
  reducedMotionOverride,
  track,
  viewport: root,
  ...physics(props.behavior),
});

// A change of the behaviour's numbers reaches the live controller: the strip keeps its place and its
// motion, and only the physics under it change.
watch(
  () => props.behavior.settings,
  () => motion.configure(physics(props.behavior)),
  { deep: true },
);

/** The strip's own selection: where it is going, or where it is. */
const selectedId = computed(() => motion.targetId.value ?? motion.nearestId.value);
const idle = computed(() => motion.phase.value === "idle");

function positionOf(id: string | undefined) {
  return id === undefined ? 0 : ids.value.indexOf(id) + 1;
}

function describe(id: string) {
  const item = props.items.find((candidate) => candidate.id === id);
  return item
    ? `${item.title}, from ${item.sender}, ${item.sentAt}. ${positionOf(id)} of ${props.items.length}`
    : "";
}

// ----------------------------------------------------------------------------------- opening

function itemElement(id: string): HTMLElement | undefined {
  return track.value?.querySelector<HTMLElement>(`[data-media-id="${id}"]`) ?? undefined;
}

function request(id: string, wasSelected: boolean, wasIdle: boolean) {
  emit("open", {
    id,
    source: itemElement(id)?.querySelector<HTMLElement>("img") ?? undefined,
    opener: root.value,
    atRest: wasSelected && wasIdle,
  });
}

/**
 * A tap resolves only for a press that began on a strip at rest (see `use-item-tap.ts`). By the time
 * it resolves, though, the strip's own recogniser has taken hold of the pointer and reports
 * "dragging", so a tap says it was at rest and every other way of opening is asked.
 */
function openItem(id: string, fromTap = false) {
  const wasSelected = selectedId.value === id;
  const wasIdle = fromTap || idle.value;
  announceNext = false;
  request(id, wasSelected, wasIdle);
  // The opened photo becomes the selected one. A snapshot is only ever taken of a picture that is
  // already still, so a photo that has to travel is never also being transitioned.
  if (!wasSelected) motion.moveTo(id);
}

useItemTap({
  viewport: root,
  itemAt(target) {
    const element =
      target instanceof Element ? target.closest<HTMLElement>("[data-media-id]") : null;
    const id = element?.dataset.mediaId;
    return element && id !== undefined ? { id, element } : undefined;
  },
  isMoving: () => !idle.value,
  onTap: (id) => openItem(id, true),
});

function onKeyDown(event: KeyboardEvent) {
  if (event.target !== root.value) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (selectedId.value !== undefined) openItem(selectedId.value);
    return;
  }
  announceNext = true;
  motion.onKeyDown(event);
}

// ------------------------------------------------------------------------------------ handle

function stepWith(direction: "next" | "previous") {
  announceNext = true;
  motion[direction]();
}

defineExpose({
  activeId: selectedId,
  canNext: motion.canNext,
  canPrevious: motion.canPrevious,
  goTo(id: string) {
    announceNext = false;
    motion.moveTo(id);
  },
  next: () => stepWith("next"),
  openSelected() {
    if (selectedId.value !== undefined) openItem(selectedId.value);
  },
  phase: motion.phase,
  previous: () => stepWith("previous"),
  root,
  settledId,
  visualId: motion.nearestId,
});

const firstAspect = computed(() => aspectRatio(props.items[0]!));
const lastAspect = computed(() => aspectRatio(props.items.at(-1)!));
const trackStyle = computed(() => [
  {
    "--first-width": itemWidthCss(String(firstAspect.value)),
    "--last-width": itemWidthCss(String(lastAspect.value)),
  },
  motion.trackStyle.value,
]);
</script>

<template>
  <div
    ref="root"
    :aria-describedby="instructionsId"
    :aria-label="label"
    aria-roledescription="carousel"
    class="media-carousel"
    :data-active-id="selectedId"
    :data-dragging="motion.isDragging.value ? 'true' : 'false'"
    :data-phase="motion.phase.value"
    :data-reduced-motion="motion.reducedMotion.value ? 'true' : 'false'"
    :data-settled-id="settledId"
    :data-visual-id="motion.nearestId.value"
    role="group"
    :style="motion.surfaceStyle"
    tabindex="0"
    @dragstart="motion.onNativeDragStart"
    @keydown="onKeyDown"
    @pointerdown="motion.onPointerDown"
    @wheel="motion.onWheel"
  >
    <div ref="track" class="media-track" dir="ltr" :style="trackStyle">
      <figure
        v-for="(item, index) in items"
        :key="item.id"
        :aria-current="item.id === selectedId ? 'true' : undefined"
        :aria-label="`${item.title}, from ${item.sender}, ${index + 1} of ${items.length}`"
        aria-roledescription="slide"
        class="media-item"
        :data-current="item.id === selectedId ? 'true' : 'false'"
        :data-media-id="item.id"
        role="group"
        :style="{ inlineSize: itemWidthCss(String(aspectRatio(item))) }"
      >
        <img
          :alt="item.alt"
          class="media-image"
          decoding="async"
          draggable="false"
          :height="item.height"
          :src="item.src"
          :width="item.width"
        />
      </figure>
    </div>
    <p :id="instructionsId" class="sr-only">
      Use the left and right arrow keys to browse. Press Enter to open the selected photo.
    </p>
    <p aria-atomic="true" class="sr-only" data-testid="media-carousel-status" role="status">
      {{ statusText }}
    </p>
  </div>
</template>

<style scoped>
.media-carousel {
  /* The one responsive quantity is the items' height. Width follows from each aspect ratio and is
     capped so the next item always shows beyond the selected one. */
  --strip-gap: 0.6rem;
  --strip-item-height: clamp(6.5rem, 40cqi, 12rem);
  --strip-max-item: 58cqi;
  --strip-min-item: 4rem;

  position: relative;
  container-type: inline-size;
  inline-size: 100%;
  overflow: hidden;
  border-radius: 0.6rem;
  background: var(--stage);
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.media-carousel:active {
  cursor: grabbing;
}

.media-carousel:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 2px;
}

.media-track {
  display: flex;
  align-items: center;
  gap: var(--strip-gap);
  inline-size: max-content;
  /* Half the viewport less half the first or last item puts that item's centre on the viewport's, so
     every item, the first and last included, has a centre the strip can reach. */
  padding-block: 0.9rem;
  padding-inline-start: calc(50cqi - var(--first-width) / 2);
  padding-inline-end: calc(50cqi - var(--last-width) / 2);
}

.media-item {
  position: relative;
  flex: 0 0 auto;
  block-size: var(--strip-item-height);
  margin: 0;
  border-radius: 0.5rem;
  background: var(--pg-panel);
  box-shadow: 0 8px 18px -12px rgb(21 20 15 / 0.5);
  overflow: hidden;
  cursor: pointer;
}

/* The selected item is marked by an outline on its own box, so it never changes a layout box. */
.media-item[data-current="true"] {
  outline: 2px solid var(--pg-ink);
  outline-offset: 2px;
}

.media-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}
</style>
