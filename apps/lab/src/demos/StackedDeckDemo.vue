<script setup lang="ts">
import { BOUNDED_SPRING_TUNING, STACKED_DECK_ANCHOR_SKIP } from "@snap-motion/core";
import {
  MediaGalleryDialog,
  type FocusReturnOptions,
  type MediaGalleryOpenRequestDetails,
} from "@snap-motion/vue/media-gallery";
import {
  StackedDeck,
  type StackedDeckCardState,
  type StackedDeckHandle,
} from "@snap-motion/vue/stacked-deck";
import { computed, nextTick, ref } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  deckReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

import { showcaseScreens, type ShowcaseScreen, type ShowcaseScreenId } from "./showcaseScreens";

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const screens = showcaseScreens;
const deck = ref<StackedDeckHandle<ShowcaseScreenId>>();
const demoRoot = ref<HTMLElement>();
const inspectControl = ref<HTMLButtonElement>();
const galleryOpen = ref(false);
const galleryActiveId = ref<ShowcaseScreenId>(screens[Math.floor(screens.length / 2)]!.id);
const activeId = ref<ShowcaseScreenId>(screens[Math.floor(screens.length / 2)]!.id);

const spring = computed(() => springFromSettings(props.settings));
const elasticity = computed(() => symmetricElasticityFromSettings(props.settings));
const releasePolicy = computed(() => deckReleaseFromSettings(props.settings));

const galleryFocusReturn = computed<FocusReturnOptions>(() => ({
  opener: inspectControl.value,
  fallback: () => deck.value?.root,
}));

const state = computed(() => deck.value?.state);
const currentIndex = computed(() => state.value?.currentIndex ?? 0);
const currentScreen = computed(() => screens[currentIndex.value] ?? screens[0]!);
const settledIndex = computed(() => state.value?.settledIndex ?? 0);
const inspectEligible = computed(() => deck.value?.isInspectEligible(currentIndex.value) ?? false);

const paginationDots = computed(() =>
  screens.map((screen, index) => ({
    id: screen.id,
    title: screen.title,
    current: index === currentIndex.value,
  })),
);

const indicatorTrace = computed(() => {
  const indicator = deck.value?.paginationIndicator;
  return {
    position: (indicator?.position ?? 0).toFixed(5),
    scaleX: (indicator?.scaleX ?? 1).toFixed(5),
    softDirection: (indicator?.softDirection ?? 0).toFixed(5),
    stretchRatio: (indicator?.stretchRatio ?? 0).toFixed(5),
  };
});

const paginationStyle = computed(() => {
  const indicator = deck.value?.paginationIndicator;
  return {
    "--_pagination-indicator-x": `${(indicator?.x ?? 0).toFixed(4)}px`,
    "--_pagination-indicator-scale-x": (indicator?.scaleX ?? 1).toFixed(5),
  };
});

function screenPoseAttributes(card: StackedDeckCardState<ShowcaseScreen, ShowcaseScreenId>) {
  return {
    "data-opacity": card.pose.opacity,
    "data-rotate": card.pose.rotate,
    "data-scale": card.pose.scale,
    "data-shadow-strength": card.pose.shadowStrength,
    "data-translate-x": card.pose.translateX,
    "data-translate-y": card.pose.translateY,
  };
}

function openGallery(index: number) {
  const id = screens[index]?.id;
  if (galleryOpen.value || id === undefined || !deck.value?.synchronizeTo(id)) return;
  galleryActiveId.value = id;
  galleryOpen.value = true;
}

async function onGalleryOpenRequest(_open: false, details: MediaGalleryOpenRequestDetails) {
  const id = details.activeId as ShowcaseScreenId | undefined;
  if (id !== undefined) {
    activeId.value = id;
    await nextTick();
    deck.value?.synchronizeTo(id);
  }
}

const diagnostics = computed<LabDiagnostics>(() => {
  const surface = deck.value;
  const traversal = state.value?.traversal;
  // Read-only telemetry published by the component. The lab is a consumer, so it observes the deck
  // through the same public surface an application has rather than through its controller.
  const motion = surface?.diagnostics;
  const viewportSize = Math.max(1, surface?.root?.clientWidth ?? props.stageWidth);
  const targetId = motion?.targetId;
  const targetIndex = targetId === undefined ? -1 : screens.findIndex((s) => s.id === targetId);
  return {
    ...(motion?.nearestId ? { nearestId: motion.nearestId } : {}),
    anchors: motion?.anchors ?? [],
    bounds: motion?.bounds ?? { min: 0, max: 0 },
    isAnimating: motion?.isAnimating ?? false,
    phase: motion?.phase ?? "idle",
    pointerOwned: motion?.pointerOwned ?? false,
    position: motion?.position ?? 0,
    physicalIndex: surface?.physicalIndex ?? 0,
    motionPitch: surface?.pitch ?? 0,
    segmentDirection: traversal?.direction ?? 0,
    segmentOriginIndex: traversal?.segmentOriginIndex ?? 0,
    segmentPhase: traversal?.phase ?? "idle",
    segmentProgress: traversal?.localProgress ?? 0,
    ...(traversal?.segmentTargetIndex == null
      ? {}
      : { segmentTargetIndex: traversal.segmentTargetIndex }),
    signedLocalDistance: traversal?.signedLocalDistance ?? 0,
    tuningProfile: surface?.tuningProfile ?? "wide",
    settledIndex: settledIndex.value,
    visualTopIndex: state.value?.visualTopIndex ?? 0,
    authoritativeIndex: currentIndex.value,
    authorityStable: state.value?.authorityStable ?? true,
    indicatorX: surface?.paginationIndicator.x ?? 0,
    indicatorScale: surface?.paginationIndicator.scaleX ?? 1,
    keyboardTargetIndex: state.value?.commandOriginIndex ?? 0,
    maxAnchorSkip: STACKED_DECK_ANCHOR_SKIP,
    maxAnchorSkipFixed: true,
    releaseVelocityCapActive:
      motion?.phase === "settling" &&
      (surface?.speedInCards ?? 0) >= BOUNDED_SPRING_TUNING.maximumFreeVelocity - 0.05,
    reducedMotion: motion?.reducedMotion ?? false,
    speedInCards: surface?.speedInCards ?? 0,
    ...(targetId ? { targetId } : {}),
    ...(targetIndex < 0 ? {} : { targetIndex }),
    trackExtent: viewportSize - (motion?.bounds.min ?? 0),
    velocity: motion?.velocity ?? 0,
    viewportSize,
  };
});
</script>

<template>
  <section
    ref="demoRoot"
    aria-labelledby="stacked-deck-title"
    class="stacked-deck-demo"
    @keydown="deck?.onKeyDown($event)"
  >
    <header class="stacked-deck-header">
      <div>
        <h3 id="stacked-deck-title">One adjacent screen per exchange</h3>
        <p class="lede">
          Drag the top screen to reveal one adjacent screen. Every gesture, flick, or wheel burst
          resolves at most one screen away from where it began, no matter how far it travels — and
          the next one starts on the card you can already see, without waiting for the spring.
        </p>
      </div>
      <div class="stacked-deck-controls">
        <button
          aria-label="Previous screen"
          data-testid="stacked-deck-previous"
          :disabled="galleryOpen || !deck?.canPrevious"
          type="button"
          @click="deck?.previous()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next screen"
          data-testid="stacked-deck-next"
          :disabled="galleryOpen || !deck?.canNext"
          type="button"
          @click="deck?.next()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </header>

    <StackedDeck
      ref="deck"
      v-model:active-id="activeId"
      class="stacked-deck-viewport"
      :disabled="galleryOpen"
      :focus-scope="demoRoot"
      :elasticity="elasticity"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Product screen stacked deck"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="releasePolicy"
      :spring="spring"
      :fallback-stage-width="stageWidth"
      data-testid="stacked-deck-viewport"
      :data-gallery-open="galleryOpen ? 'true' : 'false'"
      :data-interaction-origin-index="state?.interactionOriginIndex ?? -1"
      :data-interaction-owned="deck?.owned ? 'true' : 'false'"
      :data-authoritative-index="currentIndex"
      :data-card-width="deck?.tuning.cardWidth"
      :data-keyboard-target-index="state?.commandOriginIndex"
      :data-max-anchor-skip="STACKED_DECK_ANCHOR_SKIP"
      :data-motion-pitch="deck?.pitch"
      :data-pending-index="state?.pendingTargetIndex"
      :data-physical-index="deck?.physicalIndex"
      :data-position="deck?.diagnostics.position"
      :data-segment-direction="state?.traversal.direction"
      :data-segment-origin-index="state?.traversal.segmentOriginIndex"
      :data-segment-phase="state?.traversal.phase"
      :data-segment-progress="state?.traversal.localProgress"
      :data-segment-target-index="state?.traversal.segmentTargetIndex"
      :data-settled-index="settledIndex"
      :data-signed-local-distance="state?.traversal.signedLocalDistance"
      :data-speed-in-cards="deck?.speedInCards"
      :data-target-id="deck?.diagnostics.targetId"
      :data-visual-top-index="state?.visualTopIndex"
      @activate="(_screen, index) => openGallery(index)"
    >
      <template #backdrop>
        <div aria-hidden="true" class="stacked-deck-backdrop" />
      </template>
      <template #card="card">
        <div
          class="screen-chrome"
          :class="`tone-${card.item.tone}`"
          v-bind="screenPoseAttributes(card)"
          :style="{ '--screen-accent': card.item.accent }"
        >
          <img
            alt=""
            aria-hidden="true"
            class="stacked-screen-image"
            draggable="false"
            :height="card.item.preview.height"
            :src="card.item.preview.src"
            :srcset="card.item.preview.srcset"
            :sizes="card.item.preview.sizes"
            :width="card.item.preview.width"
          />
        </div>
      </template>
    </StackedDeck>

    <div class="stacked-deck-meta">
      <p>
        <span class="tabular" data-testid="stacked-deck-counter">{{ currentIndex + 1 }}</span>
        /
        <span class="tabular">{{ screens.length }}</span>
        <strong data-testid="stacked-deck-caption">{{ currentScreen.title }}</strong>
      </p>
      <button
        ref="inspectControl"
        :aria-label="`Inspect ${currentScreen.title} in screen gallery, ${currentIndex + 1} of ${screens.length}`"
        class="stacked-deck-inspect"
        data-testid="stacked-deck-inspect"
        :disabled="!inspectEligible"
        type="button"
        @click="openGallery(currentIndex)"
      >
        <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
          <path
            d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"
            fill="none"
            stroke="currentColor"
            stroke-linecap="square"
            stroke-width="2"
          />
        </svg>
        <span>Inspect screen</span>
      </button>
      <div aria-label="Stacked deck screens" class="dots" role="group" :style="paginationStyle">
        <span
          aria-hidden="true"
          class="stacked-deck-pagination-indicator"
          :data-position="indicatorTrace.position"
          :data-scale-x="indicatorTrace.scaleX"
          :data-soft-direction="indicatorTrace.softDirection"
          :data-stretch-ratio="indicatorTrace.stretchRatio"
          data-testid="stacked-deck-pagination-indicator"
        />
        <button
          v-for="(dot, index) in paginationDots"
          :key="dot.id"
          :aria-current="dot.current ? 'true' : undefined"
          :aria-label="`${dot.title}, ${index + 1} of ${screens.length}`"
          class="dot"
          :disabled="galleryOpen"
          type="button"
          @click="deck?.navigateTo(dot.id)"
        >
          <span aria-hidden="true" class="dot-indicator" />
        </button>
      </div>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />
    <MediaGalleryDialog
      v-model:open="galleryOpen"
      v-model:active-id="galleryActiveId"
      eyebrow="Screen inspection"
      :focus-return="galleryFocusReturn"
      :items="screens"
      :reduced-motion-override="deck?.diagnostics.reducedMotion"
      title="Screen gallery"
      @open-request="onGalleryOpenRequest"
    />
  </section>
</template>

<style scoped>
.stacked-deck-demo {
  position: relative;
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
}

:global(html:has(.stacked-deck-demo)),
:global(body:has(.stacked-deck-demo)) {
  overflow-x: clip;
}

.stacked-deck-demo :deep(.snap-motion-media-gallery) {
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

.stacked-deck-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.stacked-deck-meta p {
  margin: 0;
}

.stacked-deck-header h3 {
  margin: 0.2rem 0 0.35rem;
  font-size: 1.35rem;
}

.lede {
  margin: 0;
  color: var(--muted);
  max-inline-size: 40rem;
  line-height: 1.45;
}

.stacked-deck-controls {
  display: inline-flex;
  gap: 0.5rem;
}

.stacked-deck-controls button,
.dot {
  display: inline-grid;
  place-items: center;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  border-radius: 999px;
}

.stacked-deck-viewport {
  cursor: grab;
}

.stacked-deck-viewport:active {
  cursor: grabbing;
}

.stacked-deck-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at 50% 28%, rgb(255 255 255 / 0.92), transparent 56%),
    linear-gradient(180deg, #f1f4f8 0%, #e7ecf2 100%);
  pointer-events: none;
}

.stacked-deck-backdrop::before {
  content: "";
  position: absolute;
  inset-inline-start: 50%;
  inset-block-end: 1.1rem;
  inline-size: min(72%, 46rem);
  block-size: 4.5rem;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgb(15 23 42 / 0.16) 0%,
    rgb(15 23 42 / 0.06) 46%,
    rgb(15 23 42 / 0) 74%
  );
  pointer-events: none;
}

.stacked-deck-demo :deep(.snap-motion-stacked-deck-card-motion) {
  border-radius: 0.8rem;
  box-shadow:
    0 18px 38px -18px rgb(15 23 42 / calc(0.38 * var(--snap-motion-deck-shadow-strength))),
    0 4px 10px -6px rgb(15 23 42 / calc(0.32 * var(--snap-motion-deck-shadow-strength)));
  cursor: pointer;
}

.screen-chrome {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border: 1px solid rgb(15 23 42 / 0.16);
  border-radius: 0.8rem;
  overflow: hidden;
  background: #fff;
  color: #0f172a;
  filter: none;
}

.screen-chrome::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(135deg, rgb(255 255 255 / 0.11), transparent 34%);
}

.tone-mist {
  background: #f8fafc;
}

.tone-ink {
  background: #0f172a;
  color: #e2e8f0;
  border-color: rgb(255 255 255 / 0.08);
}

.stacked-screen-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  pointer-events: none;
}

.stacked-deck-meta,
.dots {
  display: flex;
}

.stacked-deck-meta {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.stacked-deck-meta p {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 0.35rem;
  min-inline-size: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.stacked-deck-inspect {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--ink) 24%, transparent);
  border-radius: 0.65rem;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 650;
}

.stacked-deck-inspect:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ink) 42%, transparent);
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.stacked-deck-inspect:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.stacked-deck-inspect:disabled {
  cursor: default;
  opacity: 0.42;
}

.stacked-deck-meta strong {
  color: var(--ink);
  font-size: 1rem;
}

.dots {
  --_pagination-slot-size: 44px;
  --_pagination-slot-gap: 2px;
  --_pagination-indicator-width: 22.4px;
  --_pagination-indicator-height: 8.8px;
  --_pagination-indicator-x: 0px;
  --_pagination-indicator-scale-x: 1;

  position: relative;
  display: flex;
  align-items: center;
  gap: var(--_pagination-slot-gap);
  isolation: isolate;
}

.dot {
  position: relative;
  display: grid;
  inline-size: var(--_pagination-slot-size);
  block-size: var(--_pagination-slot-size);
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
}

.dot:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.stacked-deck-pagination-indicator {
  position: absolute;
  z-index: 1;
  inset-block-start: 50%;
  inset-inline-start: calc((var(--_pagination-slot-size) - var(--_pagination-indicator-width)) / 2);
  inline-size: var(--_pagination-indicator-width);
  block-size: var(--_pagination-indicator-height);
  border-radius: 999px;
  background: var(--ink);
  pointer-events: none;
  transform: translate3d(var(--_pagination-indicator-x), -50%, 0)
    scaleX(var(--_pagination-indicator-scale-x));
  transform-origin: center;
  transition: none;
  will-change: transform;
}

.dot-indicator {
  inline-size: var(--_pagination-indicator-height);
  min-inline-size: var(--_pagination-indicator-height);
  block-size: var(--_pagination-indicator-height);
  min-block-size: var(--_pagination-indicator-height);
  border-radius: 999px;
  background: #c9d2de;
  pointer-events: none;
  transition: none;
}

@media (max-width: 48rem) {
  .stacked-deck-header {
    align-items: start;
    flex-direction: column;
  }

  .stacked-deck-meta {
    flex-wrap: wrap;
  }

  .stacked-deck-meta p {
    flex-basis: calc(100% - 4.5rem);
  }

  .stacked-deck-inspect span {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
