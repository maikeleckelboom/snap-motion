<script setup lang="ts">
import {
  createCoverflowGeometry,
  resolveCoverflowPresentation,
  resolveCoverflowProgress,
} from "@snap-motion/core";
import { useCarouselMotion } from "@snap-motion/vue/carousel";
import { useElementSize } from "@vueuse/core";
import { computed, nextTick, ref, watch } from "vue";

import DiagnosticsPanel from "@/components/DiagnosticsPanel.vue";
import {
  carouselReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "@/fixtures/lab-settings";
import type { LabDiagnostics, LabPhysicsSettings } from "@/fixtures/lab-types";

type ScreenId = "templates" | "project" | "map" | "team" | "settings";

interface ShowcaseScreen {
  readonly id: ScreenId;
  readonly title: string;
  readonly eyebrow: string;
  readonly accent: string;
  readonly tone: "light" | "mist" | "ink";
}

const props = defineProps<{
  reducedMotionOverride: boolean | undefined;
  settings: LabPhysicsSettings;
  stageWidth: number;
}>();

const screens: readonly ShowcaseScreen[] = [
  {
    id: "templates",
    title: "Projectsjablonen",
    eyebrow: "Yoot Portaal",
    accent: "#2f6fed",
    tone: "light",
  },
  {
    id: "project",
    title: "Project 24031 — Horizon",
    eyebrow: "Projectdetail",
    accent: "#1f9d7a",
    tone: "mist",
  },
  {
    id: "map",
    title: "Locatie & planning",
    eyebrow: "Kaartweergave",
    accent: "#d9480f",
    tone: "light",
  },
  {
    id: "team",
    title: "Team & rollen",
    eyebrow: "Organisatie",
    accent: "#7048e8",
    tone: "mist",
  },
  {
    id: "settings",
    title: "Werkruimte-instellingen",
    eyebrow: "Beheer",
    accent: "#0b7285",
    tone: "ink",
  },
];

const ids = screens.map((screen) => screen.id);
const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const reducedOverride = computed(() => props.reducedMotionOverride);
const { width: viewportWidth } = useElementSize(viewport);

const stageWidthPx = computed(() =>
  Math.max(320, viewportWidth.value || Math.min(props.stageWidth, 1_280)),
);

/** Drag distance between snaps — feel lives here, not in the visual fan. */
const pitch = computed(() => Math.round(clamp(stageWidthPx.value * 0.34, 200, 320)));

const cardWidth = computed(() => Math.round(clamp(stageWidthPx.value * 0.48, 300, 480)));
const cardHeight = computed(() => Math.round(cardWidth.value * 0.7));

/**
 * First side-rail X must clear most of the center face.
 * Too small → translucent pile. Too large → empty stage.
 */
const sidePeakX = computed(() => Math.round(cardWidth.value * 0.5));
const stackGapX = computed(() => Math.round(cardWidth.value * 0.06));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function measureGeometry() {
  return createCoverflowGeometry({
    itemIds: ids,
    pitch: pitch.value,
    viewportSize: Math.max(1, viewport.value?.clientWidth ?? props.stageWidth),
  });
}

const initialGeometry = measureGeometry();
const motion = useCarouselMotion({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  elasticity: symmetricElasticityFromSettings(props.settings),
  initialTargetId: ids[Math.floor(ids.length / 2)]!,
  measure: measureGeometry,
  programmaticImpulse: props.settings.programmaticImpulse,
  reducedMotionOverride: reducedOverride,
  releasePolicy: carouselReleaseFromSettings(props.settings),
  spring: springFromSettings(props.settings),
  track,
  viewport,
});

const activeId = computed(
  () => motion.targetId.value ?? motion.activeId.value ?? ids[Math.floor(ids.length / 2)]!,
);
const activeIndex = computed(() => Math.max(0, ids.indexOf(activeId.value)));
const activeScreen = computed(() => screens[activeIndex.value] ?? screens[0]!);

/** Continuous index glued to controller position — drives live pagination. */
const floatIndex = computed(() => {
  const max = Math.max(0, ids.length - 1);
  const raw = pitch.value <= 0 ? 0 : -motion.position.value / pitch.value;
  return clamp(raw, 0, max);
});

const paginationDots = computed(() =>
  screens.map((screen, index) => {
    const distance = Math.abs(index - floatIndex.value);
    const weight = clamp(1 - distance, 0, 1);
    return {
      id: screen.id,
      title: screen.title,
      weight,
      selected: distance < 0.5,
    };
  }),
);

const anchorsById = computed(() => {
  const map = new Map<string, number>();
  for (const anchor of motion.snapshot.value.anchors) {
    map.set(anchor.id, anchor.position);
  }
  return map;
});

const slideStyles = computed(() => {
  const reduced = motion.reducedMotion.value;
  const position = motion.position.value;
  const currentPitch = pitch.value;
  return Object.fromEntries(
    screens.map((screen) => {
      const anchorPosition = anchorsById.value.get(screen.id) ?? 0;
      const progress = resolveCoverflowProgress({
        anchorPosition,
        pitch: currentPitch,
        position,
      });
      const presentation = resolveCoverflowPresentation({
        progress,
        reducedMotion: reduced,
        sidePeakX: sidePeakX.value,
        stackGapX: stackGapX.value,
        maxRotateY: 52,
        sideDepth: -160,
        stackGapZ: -44,
        sideScale: 0.9,
        sideOpacity: 1,
        hideAfter: 3.25,
      });
      return [
        screen.id,
        {
          opacity: presentation.opacity,
          transform: `translate3d(-50%, -50%, 0) ${presentation.transform}`,
          zIndex: presentation.zIndex,
          visibility: presentation.visible ? ("visible" as const) : ("hidden" as const),
          pointerEvents:
            presentation.visible && Math.abs(progress) < 1.2
              ? ("auto" as const)
              : ("none" as const),
        },
      ];
    }),
  ) as Record<
    ScreenId,
    {
      opacity: number;
      transform: string;
      zIndex: number;
      visibility: "visible" | "hidden";
      pointerEvents: "auto" | "none";
    }
  >;
});

const stageStyle = computed(() => ({
  "--coverflow-stage-width": `${Math.min(props.stageWidth, 1_280)}px`,
  "--coverflow-card-width": `${cardWidth.value}px`,
  "--coverflow-card-height": `${cardHeight.value}px`,
}));

const diagnostics = computed<LabDiagnostics>(() => {
  const geometry = measureGeometry();
  return {
    ...(motion.activeId.value ? { activeId: motion.activeId.value } : {}),
    anchors: motion.snapshot.value.anchors,
    bounds: motion.snapshot.value.bounds,
    isAnimating: motion.isAnimating.value,
    phase: motion.phase.value,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    reducedMotion: motion.reducedMotion.value,
    ...(motion.targetId.value ? { targetId: motion.targetId.value } : {}),
    trackExtent: geometry.trackExtent,
    velocity: motion.velocity.value,
    viewportSize: geometry.viewportSize,
  };
});

function selectScreen(id: ScreenId) {
  if (id === activeId.value || motion.isDragging.value || motion.pointerOwned.value) return;
  motion.moveTo(id);
}

watch(
  () => props.settings,
  (settings) => {
    motion.configure({
      elasticity: symmetricElasticityFromSettings(settings),
      programmaticImpulse: settings.programmaticImpulse,
      releasePolicy: carouselReleaseFromSettings(settings),
      spring: springFromSettings(settings),
    });
  },
  { deep: true },
);

watch(
  () => [props.stageWidth, pitch.value, cardWidth.value] as const,
  () => void nextTick(motion.remeasure),
);
</script>

<template>
  <section class="coverflow-demo" aria-labelledby="coverflow-title">
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
          :disabled="!motion.canPrevious.value"
          type="button"
          @click="motion.previous()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
        <button
          aria-label="Next screen"
          data-testid="coverflow-next"
          :disabled="!motion.canNext.value"
          type="button"
          @click="motion.next()"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>
      </div>
    </header>

    <div
      ref="viewport"
      aria-label="Product screen coverflow"
      aria-roledescription="carousel"
      class="coverflow-viewport"
      data-testid="coverflow-viewport"
      :data-active-id="activeId"
      :style="[stageStyle, motion.surfaceStyle]"
      tabindex="0"
      @keydown="motion.onKeyDown"
      @pointerdown="motion.onPointerDown"
      @wheel="motion.onWheel"
    >
      <div ref="track" class="coverflow-stage">
        <article
          v-for="(screen, index) in screens"
          :key="screen.id"
          :aria-current="screen.id === activeId ? 'true' : undefined"
          :aria-hidden="slideStyles[screen.id]?.visibility === 'hidden' ? 'true' : undefined"
          :aria-label="`${screen.title}, ${index + 1} of ${screens.length}`"
          aria-roledescription="slide"
          class="coverflow-card"
          :class="[`tone-${screen.tone}`, { active: screen.id === activeId }]"
          :data-screen-id="screen.id"
          :style="{
            opacity: slideStyles[screen.id]?.opacity,
            transform: slideStyles[screen.id]?.transform,
            zIndex: slideStyles[screen.id]?.zIndex,
            visibility: slideStyles[screen.id]?.visibility,
            pointerEvents: slideStyles[screen.id]?.pointerEvents,
            '--screen-accent': screen.accent,
          }"
          @click="selectScreen(screen.id)"
        >
          <div class="screen-chrome">
            <header class="screen-top">
              <div class="brand-row">
                <span class="brand-mark">Y</span>
                <div>
                  <p>{{ screen.eyebrow }}</p>
                  <strong>{{ screen.title }}</strong>
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
                  <span v-for="slot in 4" :key="slot" class="mini-card">
                    <i />
                    <b />
                    <em />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div class="coverflow-meta">
      <p>
        <span class="tabular">{{ activeIndex + 1 }}</span>
        /
        <span class="tabular">{{ screens.length }}</span>
        <strong>{{ activeScreen.title }}</strong>
      </p>
      <div
        class="dots"
        role="tablist"
        aria-label="Coverflow screens"
        :style="{ '--dot-float': String(floatIndex) }"
      >
        <button
          v-for="dot in paginationDots"
          :key="dot.id"
          :aria-label="dot.title"
          :aria-selected="dot.selected"
          class="dot"
          role="tab"
          type="button"
          :style="{
            '--dot-weight': String(dot.weight),
          }"
          @click="selectScreen(dot.id)"
        />
      </div>
    </div>

    <DiagnosticsPanel :diagnostics="diagnostics" />
  </section>
</template>

<style scoped>
.coverflow-demo {
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
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
  position: relative;
  inline-size: min(100%, var(--coverflow-stage-width));
  min-block-size: calc(var(--coverflow-card-height) + 7rem);
  margin-inline: auto;
  border-radius: 1.5rem;
  background: linear-gradient(180deg, #eef2f7 0%, #e5ebf3 100%);
  overflow: hidden;
  perspective: 1200px;
  perspective-origin: 50% 50%;
  touch-action: pan-y;
  user-select: none;
  cursor: grab;
}

.coverflow-viewport:active {
  cursor: grabbing;
}

.coverflow-stage {
  position: relative;
  inline-size: 100%;
  block-size: calc(var(--coverflow-card-height) + 7rem);
  transform-style: preserve-3d;
}

.coverflow-card {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  inline-size: var(--coverflow-card-width);
  block-size: var(--coverflow-card-height);
  margin: 0;
  border: 0;
  padding: 0;
  background: transparent;
  transform-style: preserve-3d;
  transform-origin: center center;
  backface-visibility: hidden;
  will-change: transform;
  cursor: pointer;
}

.screen-chrome {
  inline-size: 100%;
  block-size: 100%;
  border: 1px solid rgb(15 23 42 / 0.1);
  border-radius: 1.15rem;
  overflow: hidden;
  background: #fff;
  box-shadow:
    0 18px 40px rgb(15 23 42 / 0.14),
    0 4px 12px rgb(15 23 42 / 0.08);
  color: #0f172a;
}

.tone-mist .screen-chrome {
  background: #f8fafc;
}

.tone-ink .screen-chrome {
  background: #0f172a;
  color: #e2e8f0;
  border-color: rgb(255 255 255 / 0.08);
}

.coverflow-card.active .screen-chrome {
  box-shadow:
    0 28px 56px rgb(15 23 42 / 0.18),
    0 8px 18px rgb(15 23 42 / 0.1);
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
  gap: 0.45rem;
  min-block-size: 0;
}

.mini-card {
  display: grid;
  gap: 0.28rem;
  align-content: start;
  min-block-size: 0;
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

.coverflow-meta {
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.coverflow-meta p {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.coverflow-meta strong {
  color: var(--ink);
  font-size: 1rem;
}

.dots {
  align-items: center;
  gap: 0.35rem;
}

.dot {
  --dot-weight: 0;
  inline-size: calc(0.55rem + var(--dot-weight) * 0.85rem);
  min-inline-size: 0.55rem;
  block-size: 0.55rem;
  min-block-size: 0.55rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) calc(var(--dot-weight) * 100%), #c9d2de);
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
}
</style>
