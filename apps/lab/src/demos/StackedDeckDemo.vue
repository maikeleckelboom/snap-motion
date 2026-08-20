<script setup lang="ts">
import {
  BOUNDED_SPRING_TUNING,
  STACKED_DECK_ANCHOR_SKIP,
  type StackedDeckExchange,
} from "@snap-motion/core";
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
  exchange: StackedDeckExchange;
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();
const emit = defineEmits<{
  (event: "exchangeChange", exchange: StackedDeckExchange): void;
}>();

const twoItemMode = ref(false);
const screens = computed<readonly ShowcaseScreen[]>(() =>
  twoItemMode.value ? [showcaseScreens[3]!, showcaseScreens[4]!] : showcaseScreens,
);
const deck = ref<StackedDeckHandle<ShowcaseScreenId>>();
const demoRoot = ref<HTMLElement>();
const inspectControl = ref<HTMLButtonElement>();
const galleryOpen = ref(false);
const initialId = showcaseScreens[Math.floor(showcaseScreens.length / 2)]!.id;
const galleryActiveId = ref<ShowcaseScreenId>(initialId);
const activeId = ref<ShowcaseScreenId>(initialId);

const spring = computed(() => springFromSettings(props.settings));
const elasticity = computed(() => symmetricElasticityFromSettings(props.settings));
const releasePolicy = computed(() => deckReleaseFromSettings(props.settings));

const galleryFocusReturn = computed<FocusReturnOptions>(() => ({
  opener: inspectControl.value,
  fallback: () => deck.value?.root,
}));

const state = computed(() => deck.value?.state);
const currentIndex = computed(() => state.value?.currentIndex ?? 0);
const currentScreen = computed(() => screens.value[currentIndex.value] ?? screens.value[0]!);
const settledIndex = computed(() => state.value?.settledIndex ?? 0);
const inspectEligible = computed(() => deck.value?.isInspectEligible(currentIndex.value) ?? false);

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
  const id = screens.value[index]?.id;
  if (galleryOpen.value || id === undefined || !deck.value?.synchronizeTo(id)) return;
  galleryActiveId.value = id;
  galleryOpen.value = true;
}

async function setTwoItemMode(enabled: boolean) {
  if (twoItemMode.value === enabled) return;
  galleryOpen.value = false;
  twoItemMode.value = enabled;
  const nextScreens = screens.value;
  const nextId = nextScreens.some((screen) => screen.id === activeId.value)
    ? activeId.value
    : nextScreens[0]!.id;
  activeId.value = nextId;
  galleryActiveId.value = nextId;
  await nextTick();
  deck.value?.synchronizeTo(nextId);
}

async function onGalleryOpenRequest(_open: false, details: MediaGalleryOpenRequestDetails) {
  const id = details.activeId as ShowcaseScreenId | undefined;
  if (id !== undefined) {
    activeId.value = id;
    await nextTick();
    deck.value?.synchronizeTo(id);
  }
}

function onDestinationChange(event: Event) {
  const id = (event.currentTarget as HTMLSelectElement).value as ShowcaseScreenId;
  deck.value?.navigateTo(id);
}

const diagnostics = computed<LabDiagnostics>(() => {
  const surface = deck.value;
  const traversal = state.value?.traversal;
  // Read-only telemetry published by the component. The lab is a consumer, so it observes the deck
  // through the same public surface an application has rather than through its controller.
  const motion = surface?.diagnostics;
  const viewportSize = Math.max(1, surface?.root?.clientWidth ?? props.stageWidth);
  const targetId = motion?.targetId;
  const targetIndex =
    targetId === undefined ? -1 : screens.value.findIndex((screen) => screen.id === targetId);
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
        <h3 id="stacked-deck-title">One adjacent screen per cyclic exchange</h3>
        <p class="lede">
          Drag the top screen to reveal one adjacent screen. Every gesture, flick, or wheel burst
          resolves one physical card, no matter how far it travels. Forward and backward continue
          around the ring without a first or last card.
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
      :exchange="exchange"
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

    <div aria-label="Stacked Deck exchange" class="stacked-deck-exchange" role="group">
      <button
        :aria-pressed="exchange === 'shuffle'"
        data-testid="stacked-deck-exchange-shuffle"
        type="button"
        @click="emit('exchangeChange', 'shuffle')"
      >
        Shuffle
      </button>
      <button
        :aria-pressed="exchange === 'direct'"
        data-testid="stacked-deck-exchange-direct"
        type="button"
        @click="emit('exchangeChange', 'direct')"
      >
        Direct
      </button>
    </div>

    <div aria-label="Stacked Deck item count" class="stacked-deck-exchange" role="group">
      <button
        :aria-pressed="!twoItemMode"
        data-testid="stacked-deck-five-items"
        type="button"
        @click="setTwoItemMode(false)"
      >
        Five cards
      </button>
      <button
        :aria-pressed="twoItemMode"
        data-testid="stacked-deck-two-items"
        type="button"
        @click="setTwoItemMode(true)"
      >
        Two cards
      </button>
    </div>

    <div class="stacked-deck-meta">
      <p>
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
      <label class="stacked-deck-destination">
        <span>Current screen</span>
        <select
          data-testid="stacked-deck-destination"
          :disabled="galleryOpen"
          :value="currentScreen.id"
          @change="onDestinationChange"
        >
          <option v-for="screen in screens" :key="screen.id" :value="screen.id">
            {{ screen.title }}
          </option>
        </select>
      </label>
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

.stacked-deck-exchange {
  display: inline-flex;
  justify-self: start;
  gap: 0.35rem;
}

.stacked-deck-exchange button {
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
}

.stacked-deck-exchange button[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--ink) 48%, transparent);
  background: color-mix(in srgb, var(--ink) 9%, transparent);
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

.stacked-deck-meta {
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

.stacked-deck-destination {
  display: grid;
  align-items: center;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.75rem;
}

.stacked-deck-destination select {
  min-block-size: 2.75rem;
  padding-inline: 0.75rem 2rem;
  border: 1px solid color-mix(in srgb, var(--ink) 24%, transparent);
  border-radius: 0.65rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
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
    flex-basis: 100%;
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
