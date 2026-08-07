<script setup lang="ts">
import { useUrlSearchParams } from "@vueuse/core";
import { computed, ref, shallowRef } from "vue";

import PhysicsControls from "@/components/PhysicsControls.vue";
import StageControls from "@/components/StageControls.vue";
import CoverflowDemo from "@/demos/CoverflowDemo.vue";
import MediaGalleryAtCertificationDemo from "@/demos/MediaGalleryAtCertificationDemo.vue";
import MediaLightboxDemo from "@/demos/MediaLightboxDemo.vue";
import PagedGridDemo from "@/demos/PagedGridDemo.vue";
import SheetDemo from "@/demos/SheetDemo.vue";
import StackedDeckDemo from "@/demos/StackedDeckDemo.vue";
import { settingsFromPreset, STACKED_DECK_MAX_ANCHOR_SKIP } from "@/fixtures/lab-settings";
import type { LabPhysicsSettings, LabPresetName, ReducedMotionMode } from "@/fixtures/lab-types";

type DemoId = "coverflow" | "stacked-deck" | "gallery-at" | "media" | "grid" | "sheet";

function isDemoId(value: unknown): value is DemoId {
  return (
    value === "coverflow" ||
    value === "stacked-deck" ||
    value === "gallery-at" ||
    value === "media" ||
    value === "grid" ||
    value === "sheet"
  );
}

const demos = [
  {
    id: "coverflow" as const,
    label: "Coverflow stack",
    shortLabel: "Coverflow",
    description: "Physical 2.5D stack: 1:1 drag, spring settle, elastic ends.",
    component: CoverflowDemo,
  },
  {
    id: "stacked-deck" as const,
    label: "Stacked deck",
    shortLabel: "Deck",
    description:
      "A compact pile where one physical interaction exchanges exactly one adjacent screen.",
    component: StackedDeckDemo,
  },
  {
    id: "gallery-at" as const,
    label: "Gallery AT harness",
    shortLabel: "Gallery AT",
    description: "Deterministic manual assistive-technology certification scenarios and trace.",
    component: MediaGalleryAtCertificationDemo,
  },
  {
    id: "media" as const,
    label: "Media lightbox",
    shortLabel: "Media",
    description: "Containment, semantic resize, interruption, and boundary behavior.",
    component: MediaLightboxDemo,
  },
  {
    id: "grid" as const,
    label: "Paged grid",
    shortLabel: "Grid",
    description: "Rows, columns, gaps, dynamic pages, and direct manipulation.",
    component: PagedGridDemo,
  },
  {
    id: "sheet" as const,
    label: "Sheet",
    shortLabel: "Sheet",
    description: "Four physical sides, canonical closing motion, and adaptive host composition.",
    component: SheetDemo,
  },
];

const labParams = useUrlSearchParams<{ demo?: string }>("history", { write: false });
const activeDemoId = ref<DemoId>(isDemoId(labParams.demo) ? labParams.demo : "coverflow");
const activeDemo = computed(
  () => demos.find((demo) => demo.id === activeDemoId.value) ?? demos[0]!,
);
const activeComponent = computed(() => activeDemo.value.component);
const preset = ref<LabPresetName>("balanced");
const settings = shallowRef<LabPhysicsSettings>(settingsFromPreset(preset.value));
const stageWidth = ref(1_120);
const reducedMotionMode = ref<ReducedMotionMode>("system");
const reducedMotionOverride = computed<boolean | undefined>(() => {
  if (reducedMotionMode.value === "system") {
    return undefined;
  }
  return reducedMotionMode.value === "reduce";
});

const notApplicableControls = computed<Partial<Record<keyof LabPhysicsSettings, string>>>(() =>
  activeDemoId.value === "stacked-deck"
    ? {
        maxAnchorSkip: `Fixed at ${STACKED_DECK_MAX_ANCHOR_SKIP} by the stacked deck: one interaction exchanges one adjacent screen. Other surfaces keep using the stored value.`,
      }
    : {},
);

function applyPreset(name: LabPresetName) {
  preset.value = name;
  settings.value = settingsFromPreset(name);
}

function resetPreset() {
  settings.value = settingsFromPreset(preset.value);
}
</script>

<template>
  <div class="lab-app">
    <header class="lab-header">
      <div class="lab-identity">
        <span aria-hidden="true" class="identity-mark">SM</span>
        <div>
          <p>Interaction research</p>
          <h1>Snap Motion</h1>
        </div>
      </div>

      <nav aria-label="Lab surfaces" class="demo-tabs" role="tablist">
        <button
          v-for="demo in demos"
          :id="`tab-${demo.id}`"
          :key="demo.id"
          :aria-controls="`panel-${demo.id}`"
          :aria-selected="activeDemoId === demo.id"
          role="tab"
          type="button"
          @click="activeDemoId = demo.id"
        >
          <span class="wide-label">{{ demo.label }}</span>
          <span class="short-label">{{ demo.shortLabel }}</span>
        </button>
      </nav>

      <label class="motion-override">
        <span>Motion</span>
        <select
          v-model="reducedMotionMode"
          aria-label="Motion preference"
          data-testid="reduced-motion-mode"
        >
          <option value="system">System</option>
          <option value="no-preference">Full</option>
          <option value="reduce">Reduced</option>
        </select>
      </label>
    </header>

    <div class="lab-workspace">
      <main class="lab-main">
        <section class="demo-intro" aria-live="polite">
          <div>
            <p class="eyebrow">Current surface</p>
            <h2>{{ activeDemo.label }}</h2>
            <p>{{ activeDemo.description }}</p>
          </div>
          <StageControls v-model="stageWidth" />
        </section>

        <section
          :id="`panel-${activeDemo.id}`"
          :aria-labelledby="`tab-${activeDemo.id}`"
          class="demo-panel"
          role="tabpanel"
        >
          <component
            :is="activeComponent"
            :key="activeDemo.id"
            :reduced-motion-override="reducedMotionOverride"
            :settings="settings"
            :stage-width="stageWidth"
          />
        </section>
      </main>

      <aside class="lab-inspector" aria-label="Physics inspector">
        <PhysicsControls
          :model-value="settings"
          :not-applicable="notApplicableControls"
          :preset="preset"
          @reset="resetPreset"
          @update:model-value="settings = $event"
          @update:preset="applyPreset"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.lab-app {
  min-block-size: 100vh;
}

.lab-header {
  position: sticky;
  z-index: 20;
  inset-block-start: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 20rem) minmax(0, 1fr) minmax(10rem, 16rem);
  align-items: stretch;
  min-block-size: 4.5rem;
  border-block-end: 1px solid var(--strong);
  background: var(--paper);
}

.lab-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-inline-size: 0;
  padding-inline: clamp(1rem, 2vw, 2rem);
}

.identity-mark {
  display: grid;
  place-items: center;
  inline-size: 2.25rem;
  block-size: 2.25rem;
  flex: 0 0 auto;
  border: 1px solid var(--strong);
  background: var(--ink);
  color: var(--paper);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.lab-identity p,
.lab-identity h1 {
  margin: 0;
}

.lab-identity p {
  color: var(--muted);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.lab-identity h1 {
  font-size: 1rem;
}

.demo-tabs {
  display: flex;
  align-items: stretch;
  border-inline: 1px solid var(--strong);
  overflow-x: auto;
}

.demo-tabs button {
  flex: 1;
  min-inline-size: 7.25rem;
  padding: 0.75rem 0.85rem;
  border: 0;
  border-inline-end: 1px solid var(--line);
  font-size: 0.78rem;
}

.demo-tabs button:last-child {
  border-inline-end: 0;
}

.demo-tabs button[aria-selected="true"] {
  background: var(--ink);
  color: var(--paper);
}

.short-label {
  display: none;
}

.motion-override {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 0.65rem;
  padding-inline: clamp(1rem, 2vw, 2rem);
  font-size: 0.72rem;
  font-weight: 700;
}

.motion-override select {
  min-block-size: 2rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
}

.lab-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(19rem, 23rem);
  min-block-size: calc(100vh - 4.5rem);
}

.lab-main {
  min-inline-size: 0;
  padding: clamp(1rem, 2.5vw, 2.5rem);
}

.lab-inspector {
  padding: clamp(1rem, 2vw, 1.5rem);
  border-inline-start: 1px solid var(--strong);
  background: var(--paper);
}

.demo-intro {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) auto;
  align-items: end;
  gap: 1.5rem;
  max-inline-size: 90rem;
  margin: 0 auto clamp(1.25rem, 2.5vw, 2.5rem);
}

.demo-intro .eyebrow {
  margin: 0 0 0.35rem;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-intro h2 {
  margin: 0;
  font-size: clamp(1.4rem, 2vw, 2rem);
}

.demo-intro p:last-child {
  max-inline-size: 42rem;
  margin: 0.45rem 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.demo-panel {
  min-inline-size: 0;
  max-inline-size: 90rem;
  margin-inline: auto;
}

@media (max-width: 72rem) {
  .lab-header {
    grid-template-columns: minmax(12rem, 18rem) minmax(0, 1fr) minmax(9rem, auto);
  }

  .demo-tabs button {
    min-inline-size: 5rem;
  }

  .wide-label {
    display: none;
  }

  .short-label {
    display: inline;
  }

  .lab-workspace {
    grid-template-columns: minmax(0, 1fr) 19rem;
  }
}

@media (max-width: 54rem) {
  .lab-header {
    position: static;
    grid-template-columns: 1fr auto;
  }

  .demo-tabs {
    grid-column: 1 / -1;
    grid-row: 2;
    border-block-start: 1px solid var(--strong);
    border-inline: 0;
  }

  .demo-tabs button {
    flex: 1;
    min-inline-size: 0;
    padding-inline: 0.4rem;
  }

  .lab-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .lab-inspector {
    border-block-start: 1px solid var(--strong);
    border-inline-start: 0;
  }

  .demo-intro {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 34rem) {
  .lab-identity {
    padding-inline: 0.75rem;
  }

  .lab-identity p,
  .identity-mark {
    display: none;
  }

  .motion-override {
    padding-inline: 0.75rem;
  }

  .motion-override > span {
    display: none;
  }

  .lab-main {
    padding-inline: 0.75rem;
  }
}
</style>
