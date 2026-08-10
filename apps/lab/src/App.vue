<script setup lang="ts">
import { useUrlSearchParams } from "@vueuse/core";
import { computed, ref, shallowRef, watch } from "vue";

import PhysicsControls from "@/components/PhysicsControls.vue";
import StageControls from "@/components/StageControls.vue";
import {
  demos,
  isDemoId,
  isLabView,
  type DemoGroup,
  type DemoId,
  type LabView,
} from "@/fixtures/demo-registry";
import { settingsFromPreset } from "@/fixtures/lab-settings";
import type { LabPhysicsSettings, LabPresetName, ReducedMotionMode } from "@/fixtures/lab-types";

interface LabParams {
  demo?: string;
  view?: string;
}

const showcaseGroups: DemoGroup[] = ["Spatial", "Media", "Surfaces"];
const fixtureGroups: DemoGroup[] = ["Certification", "Geometry"];
const labParams = useUrlSearchParams<LabParams>("history", { write: true, writeMode: "replace" });
const initialDemoId: DemoId = isDemoId(labParams.demo) ? labParams.demo : "coverflow";
const initialDemo = demos.find((demo) => demo.id === initialDemoId) ?? demos[0];
const inferredView: LabView = initialDemo?.audience === "fixture" ? "fixtures" : "showcase";
const activeDemoId = ref<DemoId>(initialDemoId);
const view = ref<LabView>(isLabView(labParams.view) ? labParams.view : inferredView);
const preset = ref<LabPresetName>("balanced");
const settings = shallowRef<LabPhysicsSettings>(settingsFromPreset(preset.value));
const stageWidth = ref(1_120);
const reducedMotionMode = ref<ReducedMotionMode>("system");

const activeDemo = computed(
  () => demos.find((demo) => demo.id === activeDemoId.value) ?? demos[0]!,
);
const activeComponent = computed(() => activeDemo.value.component);
const navigationGroups = computed(() => {
  const audience = view.value === "fixtures" ? "fixture" : "showcase";
  const groups = audience === "fixture" ? fixtureGroups : showcaseGroups;
  return groups.map((group) => ({
    group,
    demos: demos.filter((demo) => demo.audience === audience && demo.group === group),
  }));
});
const workbench = computed(() => view.value === "workbench");
const inspectionPresentation = computed(
  () =>
    "inspectionPresentation" in activeDemo.value.capabilities &&
    activeDemo.value.capabilities.inspectionPresentation,
);
const reducedMotionOverride = computed<boolean | undefined>(() => {
  if (reducedMotionMode.value === "system") return undefined;
  return reducedMotionMode.value === "reduce";
});
const notApplicableControls = computed<Partial<Record<keyof LabPhysicsSettings, string>>>(() =>
  "notApplicablePhysics" in activeDemo.value ? activeDemo.value.notApplicablePhysics : {},
);

watch([activeDemoId, view], ([demo, currentView]) => {
  labParams.demo = demo;
  if (currentView === "showcase") delete labParams.view;
  else labParams.view = currentView;
});

function selectDemo(id: DemoId) {
  const selected = demos.find((demo) => demo.id === id);
  if (!selected) return;
  activeDemoId.value = id;
  if (selected.audience === "fixture") view.value = "fixtures";
  else if (view.value === "fixtures") view.value = "showcase";
}

function selectView(nextView: LabView) {
  view.value = nextView;
  if (nextView === "fixtures" && activeDemo.value.audience !== "fixture") {
    activeDemoId.value = "defaults";
  } else if (nextView !== "fixtures" && activeDemo.value.audience !== "showcase") {
    activeDemoId.value = "coverflow";
  }
}

function applyPreset(name: LabPresetName) {
  preset.value = name;
  settings.value = settingsFromPreset(name);
}

function resetPreset() {
  settings.value = settingsFromPreset(preset.value);
}
</script>

<template>
  <div class="lab-app" :data-view="view">
    <header class="lab-header">
      <div class="lab-header-topline">
        <div class="lab-identity">
          <span aria-hidden="true" class="identity-mark">SM</span>
          <div>
            <p>Interaction research</p>
            <h1>Snap Motion</h1>
          </div>
        </div>

        <nav aria-label="Lab view" class="view-nav">
          <button :aria-pressed="view === 'showcase'" type="button" @click="selectView('showcase')">
            Showcase
          </button>
          <button
            :aria-pressed="view === 'workbench'"
            type="button"
            @click="selectView('workbench')"
          >
            Workbench
          </button>
          <button :aria-pressed="view === 'fixtures'" type="button" @click="selectView('fixtures')">
            Fixtures
          </button>
        </nav>
      </div>

      <nav
        :aria-label="view === 'fixtures' ? 'Engineering fixtures' : 'Showcase surfaces'"
        class="demo-navigation"
      >
        <section v-for="group in navigationGroups" :key="group.group" class="demo-group">
          <h2>{{ group.group }}</h2>
          <div>
            <button
              v-for="demo in group.demos"
              :id="`nav-${demo.id}`"
              :key="demo.id"
              :aria-current="activeDemoId === demo.id ? 'page' : undefined"
              type="button"
              @click="selectDemo(demo.id)"
            >
              {{ demo.label }}
            </button>
          </div>
        </section>
      </nav>
    </header>

    <div class="lab-workspace" :class="{ 'has-workbench': workbench }">
      <main class="lab-main">
        <section class="demo-intro" aria-live="polite">
          <div>
            <p class="eyebrow">
              {{ view === "fixtures" ? "Engineering fixture" : "Interaction surface" }}
            </p>
            <h2 :id="`surface-${activeDemo.id}`">{{ activeDemo.label }}</h2>
            <p>{{ activeDemo.description }}</p>
          </div>
          <button
            v-if="view === 'showcase'"
            class="inspect-motion"
            type="button"
            @click="selectView('workbench')"
          >
            Inspect motion
          </button>
          <button
            v-else-if="view === 'workbench'"
            class="inspect-motion"
            type="button"
            @click="selectView('showcase')"
          >
            Close workbench
          </button>
        </section>

        <section
          v-if="activeDemo.capabilities.stageWidth || activeDemo.capabilities.motionPreference"
          class="surface-controls"
          aria-label="Surface presentation"
        >
          <StageControls
            v-if="activeDemo.capabilities.stageWidth"
            v-model="stageWidth"
            :compact="!workbench"
          />
          <label v-if="activeDemo.capabilities.motionPreference" class="motion-override">
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
        </section>

        <section
          :id="`panel-${activeDemo.id}`"
          :aria-labelledby="`surface-${activeDemo.id}`"
          class="demo-panel"
        >
          <component
            :is="activeComponent"
            :key="activeDemo.id"
            :reduced-motion-override="reducedMotionOverride"
            :settings="settings"
            :stage-width="stageWidth"
            v-bind="inspectionPresentation ? { inspectionMode: workbench } : {}"
          />
        </section>
      </main>

      <aside v-if="workbench" class="lab-inspector" aria-label="Motion workbench">
        <div class="workbench-heading">
          <p>Surface tools</p>
          <h2>Workbench</h2>
          <span
            >Telemetry stays live below the interaction. Expand only the tuning depth you
            need.</span
          >
        </div>
        <details v-if="activeDemo.capabilities.physics" class="advanced-physics">
          <summary>Advanced physics</summary>
          <PhysicsControls
            :model-value="settings"
            :not-applicable="notApplicableControls"
            :preset="preset"
            @reset="resetPreset"
            @update:model-value="settings = $event"
            @update:preset="applyPreset"
          />
        </details>
        <p v-else class="workbench-unavailable">
          This surface intentionally uses its public defaults and has no lab physics override.
        </p>
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
  border-block-end: 1px solid var(--strong);
  background: color-mix(in srgb, var(--paper) 96%, transparent);
  backdrop-filter: blur(12px);
}

.lab-header-topline {
  display: flex;
  min-block-size: 4rem;
  align-items: stretch;
  justify-content: space-between;
  border-block-end: 1px solid var(--line);
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

.lab-identity :is(p, h1),
.workbench-heading :is(p, h2, span) {
  margin: 0;
}

.lab-identity p,
.workbench-heading p {
  color: var(--muted);
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.lab-identity h1 {
  font-size: 1rem;
}

.view-nav {
  display: flex;
  align-items: stretch;
  border-inline-start: 1px solid var(--strong);
}

.view-nav button {
  min-inline-size: 7rem;
  padding: 0.75rem 1rem;
  border: 0;
  border-inline-end: 1px solid var(--line);
  font-size: 0.75rem;
  font-weight: 700;
}

.view-nav button:last-child {
  border-inline-end: 0;
}

.view-nav button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
}

.demo-navigation {
  display: flex;
  min-inline-size: 0;
  align-items: stretch;
  justify-content: center;
  overflow-x: auto;
}

.demo-group {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  border-inline-start: 1px solid var(--line);
}

.demo-group:last-child {
  border-inline-end: 1px solid var(--line);
}

.demo-group h2 {
  margin: 0;
  padding-inline: 0.8rem 0.45rem;
  color: var(--muted);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-group > div {
  display: flex;
  align-items: stretch;
}

.demo-group button {
  min-block-size: 3rem;
  padding: 0.65rem 0.9rem;
  border: 0;
  background: transparent;
  font-size: 0.78rem;
  white-space: nowrap;
}

.demo-group button[aria-current="page"] {
  box-shadow: inset 0 -3px var(--ink);
  font-weight: 800;
}

.lab-workspace {
  min-block-size: calc(100vh - 7rem);
}

.lab-workspace.has-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(19rem, 23rem);
}

.lab-main {
  min-inline-size: 0;
  padding: clamp(1.25rem, 3vw, 3.5rem);
}

.lab-workspace.has-workbench .lab-main {
  padding: clamp(1rem, 2.5vw, 2.5rem);
}

.lab-inspector {
  padding: clamp(1.25rem, 2vw, 1.75rem);
  border-inline-start: 1px solid var(--strong);
  background: var(--paper);
}

.workbench-heading {
  display: grid;
  gap: 0.3rem;
  padding-block-end: 1rem;
}

.workbench-heading h2 {
  font-size: 1.15rem;
}

.workbench-heading span,
.workbench-unavailable {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.advanced-physics {
  border-block: 1px solid var(--strong);
}

.advanced-physics > summary {
  padding-block: 0.9rem;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
}

.advanced-physics > :deep(.physics-controls) {
  padding-block-end: 1rem;
}

.demo-intro {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
  max-inline-size: 96rem;
  margin: 0 auto clamp(1rem, 2vw, 1.75rem);
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
  font-size: clamp(1.55rem, 3vw, 2.5rem);
}

.demo-intro p:last-child {
  max-inline-size: 48rem;
  margin: 0.45rem 0 0;
  color: var(--muted);
  font-size: 0.86rem;
}

.inspect-motion {
  min-block-size: 2.6rem;
  flex: 0 0 auto;
  padding: 0.6rem 0.9rem;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.78rem;
  font-weight: 800;
}

.surface-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  max-inline-size: 96rem;
  margin: 0 auto 1rem;
  padding-block: 0.6rem;
  border-block: 1px solid var(--line);
}

.surface-controls :deep(.stage-controls) {
  flex: 1 1 auto;
}

.motion-override {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.motion-override select {
  min-block-size: 2rem;
  border: 1px solid var(--line);
  border-radius: 0;
  background: var(--paper);
}

.demo-panel {
  min-inline-size: 0;
  max-inline-size: 96rem;
  margin-inline: auto;
}

.lab-app[data-view="fixtures"] .demo-panel {
  max-inline-size: 76rem;
}

.lab-app[data-view="fixtures"] #panel-defaults {
  max-inline-size: 53rem;
}

.lab-app[data-view="showcase"] :deep(.diagnostics) {
  display: none;
}

@media (max-width: 72rem) {
  .lab-header {
    position: static;
  }

  .lab-workspace.has-workbench {
    display: block;
  }

  .lab-inspector {
    border-block-start: 1px solid var(--strong);
    border-inline-start: 0;
  }

  .advanced-physics[open] :deep(.physics-fields) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 48rem) {
  .lab-header-topline {
    display: grid;
  }

  .view-nav {
    border-block-start: 1px solid var(--line);
    border-inline-start: 0;
  }

  .view-nav button {
    min-inline-size: 0;
    flex: 1;
  }

  .demo-navigation {
    justify-content: start;
  }

  .demo-intro {
    align-items: start;
  }

  .surface-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .motion-override {
    align-self: end;
  }
}

@media (max-width: 34rem) {
  .lab-identity,
  .lab-main {
    padding-inline: 0.75rem;
  }

  .lab-identity p,
  .identity-mark,
  .demo-group h2 {
    display: none;
  }

  .demo-group button {
    padding-inline: 0.75rem;
  }

  .demo-intro {
    display: grid;
  }

  .inspect-motion {
    justify-self: start;
  }

  .advanced-physics[open] :deep(.physics-fields) {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
