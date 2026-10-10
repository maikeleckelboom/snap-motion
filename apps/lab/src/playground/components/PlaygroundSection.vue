<script setup lang="ts">
import { computed } from "vue";

import type { PlaygroundSection } from "../sections";
import MotionTuning from "./MotionTuning.vue";

const props = defineProps<{ section: PlaygroundSection }>();

const titleId = computed(() => `${props.section.id}-title`);
// A secondary path to the engineering Lab's Workbench for this surface; never needed to tune.
const workbenchHref = computed(
  () => `${import.meta.env.BASE_URL}?demo=${props.section.workbench}&view=workbench`,
);
</script>

<template>
  <section :id="section.id" class="pg-section" :aria-labelledby="titleId" tabindex="-1">
    <header class="section-head">
      <div class="section-title">
        <p class="section-number">
          <span class="tabular">{{ section.number }}</span> / {{ section.category }}
        </p>
        <h2 :id="titleId" tabindex="-1">{{ section.title }}</h2>
        <p class="section-summary">{{ section.summary }}</p>
      </div>
      <ul class="section-hints" aria-label="How to interact">
        <li v-for="hint in section.hints" :key="hint">{{ hint }}</li>
      </ul>
    </header>

    <div class="section-stage">
      <slot />
    </div>

    <MotionTuning :section-id="section.id" />

    <p class="section-foot">
      <a :href="workbenchHref">Inspect {{ section.title }} in the Workbench</a>
      <span aria-hidden="true">↗</span>
    </p>
  </section>
</template>

<style scoped>
.pg-section {
  display: grid;
  gap: clamp(1.25rem, 2.5vw, 2rem);
  min-inline-size: 0;
  padding-block: clamp(2rem, 5vw, 4rem) clamp(2.5rem, 6vw, 4.5rem);
  border-block-start: 2px solid var(--pg-ink);
  scroll-margin-block-start: calc(var(--pg-bar-height) - 2px);
}

.section-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 16rem);
  align-items: start;
  gap: 0.75rem clamp(1rem, 3vw, 2rem);
}

.section-number {
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.section-title {
  display: grid;
  gap: 0.55rem;
  min-inline-size: 0;
}

.section-title h2 {
  font-size: clamp(1.75rem, 1.2rem + 2vw, 2.75rem);
  font-weight: 650;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.section-title h2:focus {
  outline: none;
}

.section-title h2:focus-visible {
  outline: 2px solid var(--pg-focus);
  outline-offset: 4px;
}

.section-summary {
  max-inline-size: 42rem;
  color: var(--pg-ink-soft);
  font-size: 1rem;
  line-height: 1.55;
}

.section-hints {
  display: grid;
  gap: 0.35rem;
  padding-block-start: 0.2rem;
  color: var(--pg-muted);
  font-family: var(--pg-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.03em;
}

.section-hints li {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}

.section-hints li::before {
  content: "";
  flex: none;
  inline-size: 0.45rem;
  block-size: 1px;
  background: currentColor;
  transform: translateY(-0.2em);
}

.section-stage {
  min-inline-size: 0;
}

.section-foot {
  display: flex;
  gap: 0.4rem;
  color: var(--pg-muted);
  font-size: 0.82rem;
}

.section-foot a {
  text-underline-offset: 0.2em;
}

.section-foot a:hover {
  color: var(--pg-ink);
}

@media (max-width: 62rem) {
  .section-head {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}

@media (max-width: 40rem) {
  .pg-section {
    padding-block-start: 1.5rem;
  }

  .section-head {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.65rem;
  }

  .section-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1rem;
    padding-block-start: 0;
  }

  .section-summary {
    font-size: 0.95rem;
    line-height: 1.45;
  }
}
</style>
