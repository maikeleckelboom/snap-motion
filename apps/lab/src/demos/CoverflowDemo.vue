<script setup lang="ts">
import { BOUNDED_SPRING_TUNING } from "@snap-motion/core";
import {
  Coverflow,
  type CoverflowCardState,
  type CoverflowHandle,
} from "@snap-motion/vue/coverflow";
import { MediaGalleryDialog, type FocusReturnOptions } from "@snap-motion/vue/media-gallery";
import { computed, ref } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  carouselReleaseFromSettings,
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
const rail = ref<CoverflowHandle<ShowcaseScreenId>>();
const demoRoot = ref<HTMLElement>();
const inspectControl = ref<HTMLButtonElement>();
const galleryOpen = ref(false);
const galleryInitialIndex = ref(Math.floor(screens.length / 2));
const activeId = ref<ShowcaseScreenId>(screens[Math.floor(screens.length / 2)]!.id);
const focusedPaginationIndex = ref<number | null>(null);

const spring = computed(() => springFromSettings(props.settings));
const elasticity = computed(() => symmetricElasticityFromSettings(props.settings));
const releasePolicy = computed(() => carouselReleaseFromSettings(props.settings));

const galleryFocusReturn = computed<FocusReturnOptions>(() => ({
  opener: inspectControl.value,
  fallback: () => rail.value?.root,
}));

const visualIndex = computed(() => rail.value?.visualIndex ?? 0);
const settledIndex = computed(() => rail.value?.settledIndex ?? 0);
const visualScreen = computed(() => screens[visualIndex.value] ?? screens[0]!);
const settledScreen = computed(() => screens[settledIndex.value] ?? screens[0]!);
const inspectEligible = computed(() => rail.value?.isInspectEligible(settledIndex.value) ?? false);

const paginationDots = computed(() =>
  screens.map((screen, index) => ({
    id: screen.id,
    title: screen.title,
    current: index === visualIndex.value,
  })),
);

const indicatorTrace = computed(() => {
  const indicator = rail.value?.paginationIndicator;
  return {
    position: (indicator?.position ?? 0).toFixed(5),
    scaleX: (indicator?.scaleX ?? 1).toFixed(5),
    softDirection: (indicator?.softDirection ?? 0).toFixed(5),
    stretchRatio: (indicator?.stretchRatio ?? 0).toFixed(5),
  };
});

const paginationStyle = computed(() => {
  const indicator = rail.value?.paginationIndicator;
  return {
    "--_pagination-indicator-x": `${(indicator?.x ?? 0).toFixed(4)}px`,
    "--_pagination-indicator-scale-x": (indicator?.scaleX ?? 1).toFixed(5),
  };
});

/**
 * Product theme resolved from the panel's own orientation. Snap Motion publishes the physical
 * signals; which incident light, which occluded edge, and which side-surface colour they buy is a
 * showcase decision.
 */
function screenTheme(card: CoverflowCardState<ShowcaseScreen, ShowcaseScreenId>) {
  const { deepRail, edgeSide, edgeStrength, progress, sheen } = card.presentation;
  return {
    "--screen-accent": card.item.accent,
    "--surface-shade": Math.min(1, sheen * 0.72 + deepRail * 0.28).toFixed(4),
    // The gradient reverses with yaw so it reads as incident light, not gloss.
    "--sheen-angle": edgeSide < 0 ? "100deg" : "260deg",
    "--occlusion-angle": progress > 0 ? "90deg" : "270deg",
    // A side surface catches less light the more obliquely it is seen.
    "--edge-face": edgeStrength > 0.5 ? "var(--edge-deep)" : "var(--edge-near)",
  };
}

function openGallery(index: number) {
  const id = screens[index]?.id;
  if (galleryOpen.value || id === undefined || !rail.value?.synchronizeId(id)) return;
  galleryInitialIndex.value = index;
  galleryOpen.value = true;
}

function onGalleryRequestClose(finalIndex: number) {
  const id = screens[finalIndex]?.id;
  if (id !== undefined && finalIndex !== galleryInitialIndex.value) {
    rail.value?.synchronizeId(id);
  }
  galleryOpen.value = false;
}

function onPaginationFocus(index: number) {
  focusedPaginationIndex.value = index;
}

function onPaginationBlur(index: number) {
  if (focusedPaginationIndex.value === index) focusedPaginationIndex.value = null;
}

const diagnostics = computed<LabDiagnostics>(() => {
  const surface = rail.value;
  // Read-only telemetry published by the component. The lab is a consumer, so it observes the rail
  // through the same public surface an application has rather than through its controller.
  const motion = surface?.diagnostics;
  const viewportSize = Math.max(1, surface?.root?.clientWidth ?? props.stageWidth);
  const targetId = motion?.targetId;
  const targetIndex = targetId === undefined ? -1 : screens.findIndex((s) => s.id === targetId);
  const focused = surface?.presentations[visualIndex.value];
  return {
    ...(focused === undefined
      ? {}
      : {
          centerInfluence: focused.centerInfluence,
          kineticFocus: focused.kineticFocus,
          settledness: focused.settledness,
        }),
    ...(motion?.activeId ? { activeId: motion.activeId } : {}),
    anchors: motion?.anchors ?? [],
    bounds: motion?.bounds ?? { min: 0, max: 0 },
    isAnimating: motion?.isAnimating ?? false,
    phase: motion?.phase ?? "idle",
    pointerOwned: motion?.pointerOwned ?? false,
    position: motion?.position ?? 0,
    physicalIndex: surface?.physicalIndex ?? 0,
    visualIndex: visualIndex.value,
    settledIndex: settledIndex.value,
    ...(focusedPaginationIndex.value === null
      ? {}
      : { focusedPaginationIndex: focusedPaginationIndex.value }),
    indicatorX: surface?.paginationIndicator.x ?? 0,
    indicatorScale: surface?.paginationIndicator.scaleX ?? 1,
    keyboardTargetIndex: surface?.commandIndex ?? 0,
    maxAnchorSkip: props.settings.maxAnchorSkip,
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
    class="coverflow-demo"
    aria-labelledby="coverflow-title"
    @keydown="rail?.onKeyDown($event)"
  >
    <header class="coverflow-header">
      <div>
        <p class="eyebrow">Spatial carousel</p>
        <h3 id="coverflow-title">Coverflow stack</h3>
        <p class="lede">
          Center face stays solid. Neighbors park in left/right rails with real perspective. Drag
          and spring still own one scalar position.
        </p>
      </div>
      <div class="coverflow-controls">
        <button
          aria-label="Previous screen"
          data-testid="coverflow-previous"
          :disabled="galleryOpen || !rail?.canPrevious"
          type="button"
          @click="rail?.previous()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next screen"
          data-testid="coverflow-next"
          :disabled="galleryOpen || !rail?.canNext"
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
      v-model:active-id="activeId"
      class="coverflow-viewport"
      :disabled="galleryOpen"
      :focus-scope="demoRoot"
      :elasticity="elasticity"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Product screen coverflow"
      :programmatic-impulse="settings.programmaticImpulse"
      :reduced-motion-override="reducedMotionOverride"
      :release-policy="releasePolicy"
      :spring="spring"
      :stage-width="stageWidth"
      data-testid="coverflow-viewport"
      :data-gallery-open="galleryOpen ? 'true' : 'false'"
      :data-keyboard-target-index="rail?.commandIndex"
      :data-motion-pitch="rail?.pitch"
      :data-pending-index="rail?.pendingTargetIndex"
      :data-physical-index="rail?.physicalIndex"
      :data-position="rail?.diagnostics.position"
      :data-settled-index="settledIndex"
      :data-speed-in-cards="rail?.speedInCards"
      :data-target-id="rail?.diagnostics.targetId"
      :data-visual-index="visualIndex"
      @activate="(_screen, index) => openGallery(index)"
    >
      <template #card="card">
        <div
          class="screen-chrome"
          :class="[`tone-${card.item.tone}`, `layout-${card.item.layout}`]"
          :style="screenTheme(card)"
        >
          <header class="screen-top">
            <div class="brand-row">
              <span class="brand-mark">Y</span>
              <div>
                <p>{{ card.item.eyebrow }}</p>
                <strong>{{ card.item.title }}</strong>
              </div>
            </div>
            <div class="chrome-actions" aria-hidden="true">
              <span />
              <span />
              <span class="avatar">MV</span>
            </div>
          </header>

          <div class="screen-body">
            <aside class="screen-nav" aria-hidden="true">
              <span class="nav-pill" />
              <span />
              <span />
              <span class="active-nav" />
              <span />
              <span />
            </aside>

            <div class="screen-main">
              <div class="toolbar" aria-hidden="true">
                <span class="search" />
                <span class="chip" />
                <span class="chip" />
                <span class="cta" />
              </div>

              <div class="feature-card" aria-hidden="true">
                <span class="feature-icon" />
                <div>
                  <strong>Yoot Project Structuur V2.1</strong>
                  <p>Standaard projectstructuur met complete documentatie.</p>
                </div>
                <span class="ghost-btn">Bekijken</span>
              </div>

              <div class="card-grid" aria-hidden="true">
                <span v-for="slot in 6" :key="slot" class="mini-card">
                  <i />
                  <b />
                  <em />
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Coverflow>

    <div class="coverflow-meta">
      <p>
        <span class="tabular" data-testid="coverflow-counter">{{ visualIndex + 1 }}</span>
        /
        <span class="tabular">{{ screens.length }}</span>
        <strong data-testid="coverflow-caption">{{ visualScreen.title }}</strong>
      </p>
      <button
        ref="inspectControl"
        :aria-label="`Inspect ${settledScreen.title} in screen gallery, ${settledIndex + 1} of ${screens.length}`"
        class="coverflow-inspect"
        data-testid="coverflow-inspect"
        :disabled="!inspectEligible"
        type="button"
        @click="openGallery(settledIndex)"
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
      <div
        aria-label="Coverflow screens"
        class="dots"
        :data-focused-index="focusedPaginationIndex"
        :style="paginationStyle"
        role="group"
      >
        <span
          aria-hidden="true"
          class="coverflow-pagination-indicator"
          :data-position="indicatorTrace.position"
          :data-scale-x="indicatorTrace.scaleX"
          :data-soft-direction="indicatorTrace.softDirection"
          :data-stretch-ratio="indicatorTrace.stretchRatio"
          data-testid="coverflow-pagination-indicator"
        />
        <button
          v-for="(dot, index) in paginationDots"
          :key="dot.id"
          :aria-current="dot.current ? 'true' : undefined"
          :aria-label="`${dot.title}, ${index + 1} of ${screens.length}`"
          class="dot"
          :disabled="galleryOpen"
          type="button"
          @blur="onPaginationBlur(index)"
          @click="rail?.requestId(dot.id)"
          @focus="onPaginationFocus(index)"
        >
          <span aria-hidden="true" class="dot-indicator" />
        </button>
      </div>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />
    <MediaGalleryDialog
      v-model:open="galleryOpen"
      eyebrow="Screen inspection"
      :focus-return="galleryFocusReturn"
      :initial-index="galleryOpen ? galleryInitialIndex : settledIndex"
      :items="screens"
      :reduced-motion-override="rail?.diagnostics.reducedMotion"
      title="Screen gallery"
      @request-close="onGalleryRequestClose"
    />
  </section>
</template>

<style scoped>
.coverflow-demo {
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
}

.coverflow-demo :deep(.snap-motion-media-gallery) {
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
  --snap-motion-gallery-backdrop: rgb(3 7 18 / 0.92);
  --snap-motion-gallery-chrome-surface: #151b25;
  --snap-motion-gallery-radius: 1rem;
}

.coverflow-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.coverflow-header .eyebrow,
.coverflow-meta p {
  margin: 0;
}

.coverflow-header .eyebrow {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.coverflow-header h3 {
  margin: 0.2rem 0 0.35rem;
  font-size: 1.35rem;
}

.lede {
  margin: 0;
  color: var(--muted);
  max-inline-size: 40rem;
  line-height: 1.45;
}

.coverflow-controls {
  display: inline-flex;
  gap: 0.5rem;
}

.coverflow-controls button,
.dot {
  display: inline-grid;
  place-items: center;
  min-inline-size: 2.75rem;
  min-block-size: 2.75rem;
  border-radius: 999px;
}

.coverflow-viewport {
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #eef2f7 0%, #e5ebf3 100%);
  cursor: grab;
}

.coverflow-viewport:active {
  cursor: grabbing;
}

.coverflow-viewport::before {
  content: "";
  position: absolute;
  inset-inline-start: 50%;
  inset-block-end: 2.15rem;
  inline-size: min(64%, 38rem);
  block-size: 5.25rem;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgb(15 23 42 / 0.13) 0%,
    rgb(15 23 42 / 0.055) 42%,
    rgb(15 23 42 / 0) 74%
  );
  pointer-events: none;
}

.coverflow-demo :deep(.snap-motion-coverflow-card) {
  cursor: pointer;
}

.screen-chrome {
  --edge-near: #d4dbe4;
  --edge-deep: #b9c2ce;
  --edge-face: var(--edge-near);
  --surface-darken: 0.06;
  --surface-highlight: 0.03;
  --surface-shade: 0;
  --sheen-angle: 100deg;
  --occlusion-angle: 90deg;

  position: relative;
  inline-size: 100%;
  block-size: 100%;
  border: 1px solid rgb(15 23 42 / 0.14);
  border-radius: 1.15rem;
  overflow: hidden;
  background: #fff;
  /*
   * The first layer is the rounded side surface. The second is a fixed-geometry contact shadow
   * whose opacity is earned by center proximity and settledness. The final narrow, yaw-directed
   * layer supplies local occlusion where the foreground panel overlaps the rail behind it.
   */
  box-shadow:
    var(--snap-motion-coverflow-edge-offset) 0 0 0 var(--edge-face),
    0 9px 20px -9px rgb(15 23 42 / calc(0.32 * var(--snap-motion-coverflow-contact-shadow))),
    calc(var(--snap-motion-coverflow-yaw) * -8px) 1px 10px -5px
      rgb(15 23 42 / calc(0.22 * var(--snap-motion-coverflow-occlusion)));
  color: #0f172a;
}

/* Matte incident light, a ten-pixel overlap edge, and a weak neutral deep-rail tint. */
.screen-chrome::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
      var(--occlusion-angle),
      rgb(2 6 23 / calc(0.16 * var(--snap-motion-coverflow-occlusion))),
      rgb(2 6 23 / 0) 10px
    ),
    linear-gradient(
      var(--sheen-angle),
      rgb(255 255 255 / calc(var(--surface-highlight) * var(--snap-motion-coverflow-sheen))),
      rgb(255 255 255 / 0) 28%,
      rgb(2 6 23 / calc(var(--surface-darken) * var(--surface-shade)))
    ),
    linear-gradient(
      rgb(100 116 139 / calc(0.025 * var(--snap-motion-coverflow-deep-rail))),
      rgb(100 116 139 / calc(0.025 * var(--snap-motion-coverflow-deep-rail)))
    );
}

.screen-chrome.tone-mist {
  background: #f8fafc;
}

.screen-chrome.tone-ink {
  --edge-near: #536174;
  --edge-deep: #414d5e;
  --surface-darken: 0.035;
  --surface-highlight: 0.025;

  background: #0f172a;
  color: #e2e8f0;
  border-color: rgb(255 255 255 / 0.08);
}

.screen-top,
.brand-row,
.chrome-actions,
.screen-body,
.toolbar,
.feature-card,
.card-grid,
.coverflow-meta,
.dots {
  display: flex;
}

.screen-top {
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-block-size: 18%;
  padding: 0.75rem 0.9rem;
  border-block-end: 1px solid rgb(15 23 42 / 0.07);
  background: inherit;
}

.tone-ink .screen-top {
  border-block-end-color: rgb(255 255 255 / 0.08);
}

.brand-row {
  align-items: center;
  gap: 0.55rem;
  min-inline-size: 0;
}

.brand-mark {
  display: grid;
  place-items: center;
  inline-size: 1.55rem;
  block-size: 1.55rem;
  flex: 0 0 auto;
  border-radius: 0.45rem;
  background: var(--screen-accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
}

.brand-row p,
.brand-row strong,
.feature-card p {
  margin: 0;
}

.brand-row p {
  color: #64748b;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tone-ink .brand-row p {
  color: #94a3b8;
}

.brand-row strong {
  display: block;
  font-size: clamp(0.72rem, 1.4vw, 0.92rem);
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-inline-size: 16rem;
}

.chrome-actions {
  align-items: center;
  gap: 0.35rem;
}

.chrome-actions span {
  inline-size: 0.9rem;
  block-size: 0.9rem;
  border-radius: 999px;
  background: #e2e8f0;
}

.chrome-actions .avatar {
  display: grid;
  place-items: center;
  inline-size: 1.35rem;
  block-size: 1.35rem;
  background: #0f172a;
  color: #fff;
  font-size: 0.48rem;
  font-weight: 700;
}

.tone-ink .chrome-actions span {
  background: #334155;
}

.tone-ink .chrome-actions .avatar {
  background: #e2e8f0;
  color: #0f172a;
}

.screen-body {
  align-items: stretch;
  block-size: 82%;
  min-block-size: 0;
  background: inherit;
}

.screen-nav {
  display: grid;
  align-content: start;
  gap: 0.35rem;
  inline-size: 18%;
  padding: 0.65rem 0.45rem;
  border-inline-end: 1px solid rgb(15 23 42 / 0.07);
  background: #f8fafc;
}

.tone-ink .screen-nav {
  background: #111827;
  border-inline-end-color: rgb(255 255 255 / 0.08);
}

.screen-nav span {
  display: block;
  block-size: 0.55rem;
  border-radius: 999px;
  background: #dbe3ee;
}

.screen-nav .nav-pill {
  block-size: 1.1rem;
  margin-block-end: 0.35rem;
  background: #cfd8e6;
}

.screen-nav .active-nav {
  background: var(--screen-accent);
}

.tone-ink .screen-nav span {
  background: #334155;
}

.tone-ink .screen-nav .nav-pill {
  background: #475569;
}

.screen-main {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.55rem;
  min-inline-size: 0;
  flex: 1;
  padding: 0.7rem;
  background: inherit;
}

.toolbar {
  align-items: center;
  gap: 0.35rem;
}

.toolbar .search {
  flex: 1;
  block-size: 0.85rem;
  border-radius: 999px;
  background: #e8eef6;
}

.toolbar .chip {
  inline-size: 2.2rem;
  block-size: 0.85rem;
  border-radius: 999px;
  background: #e2e8f0;
}

.toolbar .cta {
  inline-size: 3.2rem;
  block-size: 0.9rem;
  border-radius: 0.45rem;
  background: var(--screen-accent);
}

.tone-ink .toolbar .search,
.tone-ink .toolbar .chip {
  background: #334155;
}

.feature-card {
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgb(47 111 237 / 0.18);
  border-radius: 0.7rem;
  background: #f4f8ff;
}

.tone-ink .feature-card {
  border-color: rgb(148 163 184 / 0.2);
  background: #1e293b;
}

.feature-icon {
  inline-size: 1.5rem;
  block-size: 1.5rem;
  flex: 0 0 auto;
  border-radius: 0.4rem;
  background: var(--screen-accent);
  opacity: 0.85;
}

.feature-card strong {
  display: block;
  font-size: 0.68rem;
}

.feature-card p {
  color: #64748b;
  font-size: 0.58rem;
  line-height: 1.25;
}

.tone-ink .feature-card p {
  color: #94a3b8;
}

.ghost-btn {
  margin-inline-start: auto;
  padding: 0.28rem 0.45rem;
  border: 1px solid rgb(15 23 42 / 0.12);
  border-radius: 0.4rem;
  background: #fff;
  font-size: 0.55rem;
  font-weight: 700;
  white-space: nowrap;
}

.tone-ink .ghost-btn {
  border-color: rgb(226 232 240 / 0.16);
  background: #0f172a;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* Rows must be free to shrink, or the tiles overflow the screen and get clipped mid-card. */
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  min-block-size: 0;
}

.mini-card {
  display: grid;
  gap: 0.28rem;
  align-content: start;
  min-block-size: 0;
  overflow: hidden;
  padding: 0.45rem;
  border: 1px solid rgb(15 23 42 / 0.08);
  border-radius: 0.55rem;
  background: #fff;
}

.tone-ink .mini-card {
  background: #1e293b;
  border-color: rgb(255 255 255 / 0.06);
}

.mini-card i,
.mini-card b,
.mini-card em {
  display: block;
  border-radius: 999px;
}

.mini-card i {
  inline-size: 1rem;
  block-size: 1rem;
  border-radius: 0.3rem;
  background: var(--screen-accent);
  opacity: 0.35;
}

.mini-card b {
  block-size: 0.42rem;
  inline-size: 72%;
  background: #cbd5e1;
}

.mini-card em {
  block-size: 0.35rem;
  inline-size: 48%;
  background: #e2e8f0;
}

.tone-ink .mini-card b {
  background: #64748b;
}

.tone-ink .mini-card em {
  background: #475569;
}

/*
 * Per-screen skeletons. Two panels showing the same wireframe at the same height fuse across an
 * overlap no matter how the geometry behaves, so no two adjacent screens share a silhouette.
 */
.layout-gallery .screen-nav {
  inline-size: 12%;
}

.layout-gallery .feature-card {
  display: none;
}

.layout-gallery .card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}

.layout-detail .screen-nav {
  inline-size: 30%;
}

.layout-detail .card-grid {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(3, minmax(0, 1fr));
}

.layout-detail .mini-card:nth-child(n + 4) {
  display: none;
}

.layout-canvas .screen-nav {
  display: none;
}

.layout-canvas .card-grid {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.layout-canvas .mini-card:nth-child(n + 3) {
  display: none;
}

.layout-canvas .mini-card:first-child {
  background: color-mix(in srgb, var(--screen-accent) 12%, #fff);
}

.layout-roster .toolbar {
  display: none;
}

.layout-roster .card-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
}

.layout-console .screen-nav {
  inline-size: 26%;
}

.layout-console .feature-card {
  display: none;
}

.layout-console .card-grid {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(4, minmax(0, 1fr));
}

.layout-console .mini-card:nth-child(n + 5) {
  display: none;
}

.coverflow-meta {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.coverflow-meta p {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 0.35rem;
  min-inline-size: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.coverflow-inspect {
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

.coverflow-inspect:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ink) 42%, transparent);
  background: color-mix(in srgb, var(--ink) 5%, transparent);
}

.coverflow-inspect:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.coverflow-inspect:disabled {
  cursor: default;
  opacity: 0.42;
}

.coverflow-meta strong {
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

.coverflow-pagination-indicator {
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
  .coverflow-header {
    align-items: start;
    flex-direction: column;
  }

  .brand-row strong {
    max-inline-size: 10rem;
  }

  .feature-card p,
  .ghost-btn {
    display: none;
  }

  .coverflow-meta {
    flex-wrap: wrap;
  }

  .coverflow-meta p {
    flex-basis: calc(100% - 4.5rem);
  }

  .coverflow-inspect span {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
