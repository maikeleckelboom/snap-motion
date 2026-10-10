<script setup lang="ts">
import {
  Coverflow,
  type CoverflowCardState,
  type CoverflowHandle,
} from "@snap-motion/vue/coverflow";
import { computed, ref, useId } from "vue";

import type { LabPhysicsSettings } from "@/fixtures/lab-types";

import { studies, studyById, type Study } from "./catalog";
import type { StudyId } from "./studies";
import { useStudio } from "./studio-context";
import { useStudioPhysics } from "./use-studio-physics";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
}>();
const emit = defineEmits<{
  /** The rail asked to change the active study: a drag, a key, a step, or a travel request. */
  request: [id: StudyId];
  /** The settled front card was tapped: the visitor asked to inspect it. */
  activate: [id: StudyId];
}>();

const { model } = useStudio();
const physics = useStudioPhysics(() => props.settings);
const titleId = `${useId()}-title`;
const region = ref<HTMLElement>();
const rail = ref<CoverflowHandle<StudyId>>();

const visualStudy = computed(
  () =>
    studyById.get(rail.value?.visualId ?? model.activeId.value) ??
    studyById.get(model.activeId.value)!,
);
const visualPosition = computed(
  () => studies.findIndex(({ id }) => id === visualStudy.value.id) + 1,
);

/** The occluded-edge colour is the plate's own tone, darkened: the card is one physical slab. */
function plateStyle(card: CoverflowCardState<Study, StudyId>) {
  const { edgeSide, edgeStrength, progress } = card.presentation;
  return {
    "--tone": card.item.tone,
    "--occlusion-angle": progress > 0 ? "90deg" : "270deg",
    "--edge-face": `color-mix(in srgb, ${card.item.tone} ${edgeStrength > 0.5 ? 58 : 72}%, #15140f)`,
    "--edge-side": String(edgeSide),
  };
}

/**
 * Asks the rail to travel to a study, as a visitor's command on another surface. It returns false
 * when the rail has nothing to do, so the caller can adopt the selection directly.
 */
function travelTo(id: StudyId): boolean {
  return rail.value?.navigateTo(id) ?? false;
}

defineExpose({
  focusTarget: () => rail.value?.root,
  travelTo,
});
</script>

<template>
  <section
    ref="region"
    class="studio-region studio-explore"
    :aria-labelledby="titleId"
    data-testid="studio-explore"
    @keydown="rail?.onKeyDown($event)"
  >
    <header class="region-head">
      <div>
        <p class="region-kicker"><span class="tabular">02</span> / Explore</p>
        <h4 :id="titleId" class="region-title">Spatial view</h4>
      </div>
      <div class="step-controls">
        <button
          aria-label="Previous study"
          data-testid="studio-coverflow-previous"
          :disabled="model.overlay.value !== 'none' || !rail?.canPrevious"
          type="button"
          @click="rail?.previous()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next study"
          data-testid="studio-coverflow-next"
          :disabled="model.overlay.value !== 'none' || !rail?.canNext"
          type="button"
          @click="rail?.next()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </header>

    <Coverflow
      ref="rail"
      class="studio-coverflow"
      data-testid="studio-coverflow"
      :active-id="model.activeId.value"
      :card-width="480"
      :disabled="model.overlay.value !== 'none'"
      :elasticity="physics.elasticity.value"
      :fallback-stage-width="1280"
      :focus-scope="region"
      :item-label="(study) => study.name"
      :items="studies"
      label="Motion studies, spatial view"
      :programmatic-impulse="physics.programmaticImpulse.value"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="physics.carouselRelease.value"
      :spring="physics.spring.value"
      @activate="(study) => emit('activate', study.id)"
      @active-id-request="(id) => id !== undefined && emit('request', id)"
    >
      <template #card="card">
        <div class="plate" :style="plateStyle(card)">
          <img
            alt=""
            aria-hidden="true"
            class="plate-image"
            decoding="async"
            draggable="false"
            :height="card.item.cover.preview.height"
            :src="card.item.cover.preview.src"
            :width="card.item.cover.preview.width"
          />
          <span
            v-if="model.isCompared(card.id)"
            aria-hidden="true"
            class="plate-mark"
            title="In comparison"
          >
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </span>
        </div>
      </template>
    </Coverflow>

    <p class="explore-caption">
      <span class="tabular" data-testid="studio-coverflow-counter">{{ visualPosition }}</span>
      <span aria-hidden="true">/</span>
      <span class="tabular">{{ studies.length }}</span>
      <strong data-testid="studio-coverflow-caption">{{ visualStudy.name }}</strong>
      <span class="explore-kind">{{ visualStudy.kind }}</span>
    </p>
  </section>
</template>

<style scoped>
.step-controls {
  display: inline-flex;
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

.studio-coverflow {
  border-radius: 0.9rem;
  background: var(--stage);
  cursor: grab;
}

.studio-coverflow:active {
  cursor: grabbing;
}

.studio-explore :deep(.snap-motion-coverflow-card) {
  cursor: pointer;
}

.plate {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 0.75rem;
  background: var(--tone);
  overflow: hidden;
  /*
   * A rounded side face from the package's edge signal, a fixed contact shadow earned by centre
   * proximity, and a narrow occlusion where the foreground card overlaps the rail behind it.
   */
  box-shadow:
    var(--snap-motion-coverflow-edge-offset) 0 0 0 var(--edge-face),
    0 9px 20px -9px rgb(21 20 15 / calc(0.32 * var(--snap-motion-coverflow-contact-shadow))),
    calc(var(--snap-motion-coverflow-yaw) * -8px) 1px 10px -5px
      rgb(21 20 15 / calc(0.22 * var(--snap-motion-coverflow-occlusion)));
}

.plate::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-image: linear-gradient(
    var(--occlusion-angle),
    rgb(21 20 15 / calc(0.16 * var(--snap-motion-coverflow-occlusion))),
    rgb(21 20 15 / 0) 10px
  );
  pointer-events: none;
}

.plate-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.plate-mark {
  position: absolute;
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
  display: grid;
  place-items: center;
  inline-size: 1.4rem;
  block-size: 1.4rem;
  border-radius: 999px;
  background: var(--pg-accent);
  color: var(--pg-white);
}

.explore-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
  color: var(--pg-muted);
  font-size: 0.9rem;
}

.explore-caption strong {
  margin-inline-start: 0.35rem;
  color: var(--pg-ink);
  font-size: 1.05rem;
}

.explore-kind {
  margin-inline-start: 0.25rem;
}
</style>
