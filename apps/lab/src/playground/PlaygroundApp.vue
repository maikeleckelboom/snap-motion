<script setup lang="ts">
import type { StackedDeckExchange } from "@snap-motion/core";
import { usePreferredReducedMotion } from "@vueuse/core";
import { computed, nextTick, provide, ref } from "vue";

import { useSharedPhysics } from "@/composables/use-shared-physics";
import CoverflowDemo from "@/demos/CoverflowDemo.vue";
import MediaLightboxDemo from "@/demos/MediaLightboxDemo.vue";
import PagedGridDemo from "@/demos/PagedGridDemo.vue";
import SheetDemo from "@/demos/SheetDemo.vue";
import StackedDeckDemo from "@/demos/StackedDeckDemo.vue";
import type { LabPhysicsSettings, LabPresetName, ReducedMotionMode } from "@/fixtures/lab-types";

import PlaygroundNav from "./components/PlaygroundNav.vue";
import PlaygroundSection from "./components/PlaygroundSection.vue";
import { playgroundScreens } from "./demoScreens";
import { playgroundMedia } from "./gallery-media";
import { presetLabel } from "./preset-facts";
import { playgroundSections, type PlaygroundSectionId } from "./sections";
import { playgroundTuningKey } from "./tuning-context";
import { useActiveSection } from "./use-active-section";

/**
 * A pre-measurement fallback that also caps each surface's CSS width. It is the largest value the
 * surfaces accept, so the cap never narrows a stage below its column; each surface measures its own
 * rendered width after mount.
 */
const STAGE_WIDTH = 1_280;

const physics = useSharedPhysics("balanced");
const motionMode = ref<ReducedMotionMode>("system");
const systemReducedMotion = usePreferredReducedMotion();
const reducedMotionOverride = computed<boolean | undefined>(() => {
  if (motionMode.value === "system") return undefined;
  return motionMode.value === "reduce";
});
const effectiveReducedMotion = computed(
  () => reducedMotionOverride.value ?? systemReducedMotion.value === "reduce",
);
const expandedSection = ref<PlaygroundSectionId>();
const exchange = ref<StackedDeckExchange>("shuffle");
const announcement = ref("");
const activeId = useActiveSection(playgroundSections.map(({ id }) => id));
const sectionById = Object.fromEntries(playgroundSections.map((section) => [section.id, section]));

function applyPreset(name: LabPresetName) {
  physics.applyPreset(name);
  announcement.value = `${presetLabel(name)} preset applied`;
}

function resetToPreset() {
  physics.resetToPreset();
  announcement.value = `${presetLabel(physics.preset.value)} preset restored`;
}

function updateSettings(next: LabPhysicsSettings) {
  physics.updateSettings(next);
}

/**
 * Opens one section's editor and closes any other, so there is a single editor instance. The
 * section being operated keeps its on-screen position: browsers without scroll anchoring would
 * otherwise jump when an editor above it collapses.
 */
async function toggleEditor(section: PlaygroundSectionId, anchor?: HTMLElement) {
  const before = anchor?.getBoundingClientRect().top;
  expandedSection.value = expandedSection.value === section ? undefined : section;
  if (anchor === undefined || before === undefined) return;
  await nextTick();
  const shift = anchor.getBoundingClientRect().top - before;
  if (Math.abs(shift) > 0.5) window.scrollBy({ top: shift, behavior: "instant" });
}

provide(playgroundTuningKey, {
  applyPreset,
  effectiveReducedMotion,
  expandedSection,
  modifiedKeys: physics.modifiedKeys,
  motionMode,
  preset: physics.preset,
  resetToPreset,
  settings: physics.settings,
  toggleEditor,
  updateSettings,
});

const labHref = import.meta.env.BASE_URL;
const repositoryHref = "https://github.com/maikeleckelboom/snap-motion";
</script>

<template>
  <a class="skip-link" href="#coverflow">Skip to the demonstrations</a>
  <PlaygroundNav :active-id="activeId" />

  <main class="pg-main">
    <header id="top" class="intro">
      <p class="intro-eyebrow">Snap Motion · Playground</p>
      <h1>Motion you can interrupt and tune.</h1>
      <div class="intro-body">
        <p class="intro-lede">
          Explore five interactive surfaces. Drag, reverse, switch presets and adjust the motion in
          real time.
        </p>
        <p id="shared-motion-scope" class="intro-tuning">
          One motion configuration, shared across all five. Tune it beneath any demo.
        </p>
      </div>
    </header>

    <PlaygroundSection :section="sectionById.coverflow!">
      <CoverflowDemo
        presentation="playground"
        :screen-content="playgroundScreens"
        :reduced-motion-override="reducedMotionOverride"
        :settings="physics.settings.value"
        :stage-width="STAGE_WIDTH"
      />
    </PlaygroundSection>

    <PlaygroundSection :section="sectionById['stacked-deck']!">
      <StackedDeckDemo
        :exchange="exchange"
        presentation="playground"
        :screen-content="playgroundScreens"
        :reduced-motion-override="reducedMotionOverride"
        :settings="physics.settings.value"
        :stage-width="STAGE_WIDTH"
        @exchange-change="exchange = $event"
      />
    </PlaygroundSection>

    <PlaygroundSection :section="sectionById['paged-grid']!">
      <PagedGridDemo
        presentation="playground"
        :reduced-motion-override="reducedMotionOverride"
        :settings="physics.settings.value"
        :stage-width="STAGE_WIDTH"
      />
    </PlaygroundSection>

    <PlaygroundSection :section="sectionById.gallery!">
      <MediaLightboxDemo
        :inspection-mode="false"
        :media="playgroundMedia"
        presentation="playground"
        :reduced-motion-override="reducedMotionOverride"
        :settings="physics.settings.value"
        :stage-width="STAGE_WIDTH"
      />
    </PlaygroundSection>

    <PlaygroundSection :section="sectionById.sheet!">
      <SheetDemo
        presentation="playground"
        :reduced-motion-override="reducedMotionOverride"
        :settings="physics.settings.value"
        :stage-width="STAGE_WIDTH"
      />
    </PlaygroundSection>
  </main>

  <footer class="closing" aria-labelledby="closing-title">
    <div class="closing-inner">
      <h2 id="closing-title">Under the hood</h2>
      <div class="closing-copy">
        <p>
          Snap Motion separates where a surface is from where it is going. Its framework-neutral
          core handles geometry and interaction; Vue components render the surfaces, with springs
          powered by Motion.
        </p>
        <p>
          The packages are beta candidates and are not published to npm. Documentation is in
          preparation.
        </p>
      </div>
      <ul class="closing-links">
        <li><a :href="repositoryHref">Source on GitHub</a></li>
        <li><a :href="labHref">Engineering Lab</a></li>
        <li class="closing-pending">Documentation <span>in preparation</span></li>
      </ul>
    </div>
  </footer>

  <p class="sr-only" role="status" aria-atomic="true" data-testid="tuning-announcement">
    {{ announcement }}
  </p>
</template>

<style scoped>
.skip-link {
  position: absolute;
  z-index: 50;
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  padding: 0.6rem 0.9rem;
  background: var(--pg-ink);
  color: var(--pg-white);
  font-size: 0.9rem;
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: none;
}

.pg-main {
  max-inline-size: var(--pg-max);
  margin-inline: auto;
  padding-inline: var(--pg-gutter);
}

.intro {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  grid-template-areas:
    "eyebrow eyebrow"
    "title   body";
  align-items: end;
  gap: 0.9rem clamp(1.5rem, 5vw, 4rem);
  padding-block: clamp(1.25rem, 4vw, 2.75rem) clamp(1.25rem, 3vw, 2.25rem);
  scroll-margin-block-start: var(--pg-bar-height);
}

.intro-eyebrow {
  grid-area: eyebrow;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.intro h1 {
  grid-area: title;
  max-inline-size: 15ch;
  font-size: clamp(2.1rem, 1.3rem + 3.4vw, 4rem);
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.04em;
  text-wrap: balance;
}

.intro-body {
  grid-area: body;
  display: grid;
  gap: 0.9rem;
  padding-block-end: 0.35rem;
}

.intro-lede {
  max-inline-size: 30rem;
  color: var(--pg-ink-soft);
  font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  line-height: 1.5;
}

.intro-tuning {
  max-inline-size: 32rem;
  color: var(--pg-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.closing {
  border-block-start: 2px solid var(--pg-ink);
  background: var(--pg-ink);
  color: var(--pg-bg);
}

.closing-inner {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) minmax(0, 2fr) auto;
  gap: 1.5rem clamp(1.5rem, 4vw, 3rem);
  max-inline-size: var(--pg-max);
  margin-inline: auto;
  padding: clamp(2rem, 5vw, 3.5rem) var(--pg-gutter);
}

.closing h2 {
  font-size: clamp(1.4rem, 1rem + 1.4vw, 2rem);
  font-weight: 650;
  letter-spacing: -0.03em;
}

.closing-copy {
  display: grid;
  gap: 0.75rem;
  max-inline-size: 40rem;
  color: #cfcbbd;
  font-size: 0.95rem;
}

.closing-links {
  display: grid;
  align-content: start;
  gap: 0.35rem;
  font-size: 0.92rem;
}

.closing-links a {
  display: inline-block;
  padding-block: 0.25rem;
  text-underline-offset: 0.25em;
}

.closing-pending {
  color: #a7a396;
}

.closing-pending span {
  margin-inline-start: 0.4rem;
  font-family: var(--pg-font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.closing :focus-visible {
  outline-color: #fff;
}

@media (max-width: 52rem) {
  .intro {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "eyebrow"
      "title"
      "body";
    align-items: start;
    gap: 0.6rem;
    padding-block: 1.1rem 1.25rem;
  }

  .intro-body {
    gap: 0.5rem;
    padding-block-end: 0;
  }

  .intro-lede {
    font-size: 0.98rem;
    line-height: 1.45;
  }
}

@media (max-width: 62rem) {
  .closing-inner {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
