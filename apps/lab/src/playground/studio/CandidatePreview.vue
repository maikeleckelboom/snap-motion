<script setup lang="ts">
import {
  Coverflow,
  type CoverflowCardState,
  type CoverflowHandle,
} from "@snap-motion/vue/coverflow";
import {
  StackedDeck,
  type StackedDeckCardState,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
import { computed, ref } from "vue";

import type { ShowcaseScreen, ShowcaseScreenId } from "@/demos/showcaseScreens";

import { implementationProps, type CandidateBehavior } from "./candidates";
import { middleScreenId } from "./studio-stage";

/**
 * One candidate, running on the real surface it describes, over the Studio's sample screens.
 *
 * Every preview is given the same screens, the same stage and the same starting screen, and is
 * driven through the same `next` and `previous`, so two previews differ only in the candidate they
 * run. The surface is uncontrolled apart from the start: the visitor can still drag, flick and use
 * the keyboard on it, because what is being judged is how it behaves under a hand.
 */
const props = defineProps<{
  behavior: CandidateBehavior;
  screens: readonly ShowcaseScreen[];
  reducedMotionOverride: boolean | undefined;
  label: string;
  /** Names the preview for tests and for the readout's relationship to its stage. */
  role: "reference" | "candidate" | "detail";
  /**
   * The screen this preview mounts on. A comparison passes the screen the other stage is on, so a
   * stage mounted by a role change begins level with the one that stayed; alone, it is the middle.
   */
  startId?: ShowcaseScreenId;
}>();

const emit = defineEmits<{
  /** The visitor took hold of the surface with a pointer, a wheel or a navigation key. */
  manual: [];
}>();

type Handle = CoverflowHandle<ShowcaseScreenId> | StackedDeckHandle<ShowcaseScreenId>;

const rail = ref<CoverflowHandle<ShowcaseScreenId>>();
const deck = ref<StackedDeckHandle<ShowcaseScreenId>>();
const surface = computed<Handle | undefined>(() => rail.value ?? deck.value);

/** The screen a reset returns to: the middle of the sample, which has a neighbour each way. */
const homeId = middleScreenId(props.screens);
const screenId = ref<ShowcaseScreenId>(props.startId ?? homeId);

const settings = computed(() => implementationProps(props.behavior));
const visualScreen = computed(
  () =>
    props.screens.find(({ id }) => id === surface.value?.visualId) ??
    props.screens.find(({ id }) => id === screenId.value),
);
const moving = computed(() => {
  const handle = surface.value;
  return handle !== undefined && handle.visualId !== handle.settledId;
});
const phase = computed(() => surface.value?.diagnostics.phase ?? "idle");

function onRequest(id: ShowcaseScreenId | undefined) {
  if (id !== undefined) screenId.value = id;
}

function cardImage(card: CoverflowCardState<ShowcaseScreen, ShowcaseScreenId>) {
  return card.item.preview;
}

const NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function onKeyDown(event: KeyboardEvent) {
  if (NAVIGATION_KEYS.has(event.key)) emit("manual");
}

/** The surface's own semantic selection: where this stage is going, or is. */
const position = computed(() => surface.value?.activeId);

/**
 * The screen the surface last announced as settled. A surface publishes its rest in two steps: its
 * state says it has stopped, and a moment later it confirms the host agrees with where it stopped.
 * A rail used to mistake a destination the host issued between the two steps for a disagreement and
 * jump there instead of travelling (fixed in the package, see `settlement-authority.test.ts`). A
 * replay still starts only on the confirmed rest, because that is the surface's own statement that
 * it is at rest on the screen, not merely that its state momentarily says so.
 */
const confirmedId = ref<ShowcaseScreenId>(screenId.value);

function onSettled(id: ShowcaseScreenId) {
  confirmedId.value = id;
}

/**
 * Whether the surface is at rest on `id` and has said so. Being on the card is not enough: a spring
 * that has only just been sent elsewhere still shows the old card, and one that is returning shows
 * the right card while it is still travelling, so the surface's own phase and its settled
 * announcement have to agree as well.
 */
function restsOn(id: ShowcaseScreenId): boolean {
  const handle = surface.value;
  return (
    handle !== undefined &&
    handle.activeId === id &&
    handle.visualId === id &&
    handle.settledId === id &&
    handle.diagnostics.phase === "idle" &&
    confirmedId.value === id
  );
}

defineExpose({
  next: () => surface.value?.next(),
  previous: () => surface.value?.previous(),
  /** Moves to a screen the way any request does: with the surface's own spring. */
  goTo: (id: ShowcaseScreenId) => {
    screenId.value = id;
  },
  reset: () => {
    screenId.value = homeId;
  },
  restsOn,
  position,
  root: computed(() => surface.value?.root),
  moving,
});
</script>

<template>
  <div
    class="preview"
    :data-candidate="behavior.id"
    :data-surface="behavior.surface"
    :data-testid="`studio-preview-${role}`"
    @keydown.capture="onKeyDown"
    @pointerdown.capture="emit('manual')"
    @wheel.capture.passive="emit('manual')"
  >
    <Coverflow
      v-if="behavior.surface === 'rail'"
      ref="rail"
      class="preview-surface"
      :active-id="screenId"
      :card-width="170"
      :elasticity="settings.elasticity"
      :fallback-stage-width="520"
      :item-label="(screen) => screen.title"
      :items="screens"
      :label="label"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="settings.releasePolicy"
      :spring="settings.spring"
      :data-testid="`studio-${role}-surface`"
      @active-id-request="onRequest"
      @settled="onSettled"
    >
      <template #card="card">
        <div class="screen">
          <img
            alt=""
            aria-hidden="true"
            class="screen-image"
            decoding="async"
            draggable="false"
            :height="cardImage(card).height"
            :src="cardImage(card).src"
            :width="cardImage(card).width"
          />
        </div>
      </template>
    </Coverflow>
    <StackedDeck
      v-else
      ref="deck"
      class="preview-surface"
      :active-id="screenId"
      :elasticity="settings.elasticity"
      :exchange="behavior.exchange ?? 'shuffle'"
      :fallback-stage-width="520"
      :item-label="(screen) => screen.title"
      :items="screens"
      :label="label"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="settings.releasePolicy"
      :spring="settings.spring"
      :data-testid="`studio-${role}-surface`"
      @active-id-request="onRequest"
      @settled="onSettled"
    >
      <template #backdrop>
        <div aria-hidden="true" class="preview-backdrop" />
      </template>
      <template #card="card: StackedDeckCardState<ShowcaseScreen, ShowcaseScreenId>">
        <div class="screen">
          <img
            alt=""
            aria-hidden="true"
            class="screen-image"
            decoding="async"
            draggable="false"
            :height="card.item.preview.height"
            :src="card.item.preview.src"
            :width="card.item.preview.width"
          />
        </div>
      </template>
    </StackedDeck>
    <p class="readout" :data-moving="moving ? 'true' : 'false'" :data-phase="phase">
      <span class="readout-screen" :data-testid="`studio-${role}-screen`">{{
        visualScreen?.title
      }}</span>
      <span class="readout-state" :data-testid="`studio-${role}-state`">{{
        moving ? "Moving" : "At rest"
      }}</span>
    </p>
  </div>
</template>

<style scoped>
.preview {
  display: grid;
  gap: 0.5rem;
  min-inline-size: 0;
}

.preview-surface {
  border-radius: 0.9rem;
  background: var(--stage);
  cursor: grab;
}

.preview-surface:active {
  cursor: grabbing;
}

.preview-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: 0.9rem;
  background: var(--stage);
  pointer-events: none;
}

.screen {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border-radius: 0.5rem;
  background: var(--pg-panel);
  box-shadow: 0 10px 22px -12px rgb(21 20 15 / 0.45);
  overflow: hidden;
}

.screen-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.readout {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  font-size: 0.85rem;
}

.readout-screen {
  font-weight: 650;
}

.readout-state {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.readout[data-moving="true"] .readout-state {
  color: var(--pg-accent);
}
</style>
