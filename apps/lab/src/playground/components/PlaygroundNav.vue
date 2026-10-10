<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { computed, ref } from "vue";

import { playgroundSections } from "../sections";

const props = defineProps<{ activeId: string | undefined }>();
const compact = useMediaQuery("(max-width: 52rem)");
const menuOpen = ref(false);
const sectionMenu = ref<HTMLDetailsElement>();
const menuToggle = ref<HTMLElement>();
const activeSection = computed(
  () => playgroundSections.find(({ id }) => id === props.activeId) ?? playgroundSections[0]!,
);
function onToggle(event: Event) {
  if (compact.value) menuOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}
function selectSection() {
  if (!compact.value) return;
  menuOpen.value = false;
  // A native open can precede its queued toggle event. Close the disclosure directly even when
  // Vue's model is still false, so a fast selection cannot leave the DOM open without an update.
  if (sectionMenu.value) sectionMenu.value.open = false;
}
function closeMenu() {
  if (!compact.value) return;
  selectSection();
  menuToggle.value?.focus();
}
</script>

<template>
  <header class="pg-bar">
    <div class="bar-inner">
      <a class="bar-brand" href="#top">
        <span aria-hidden="true" class="bar-mark">SM</span>
        <span class="bar-name">Snap Motion</span>
      </a>

      <nav aria-label="Playground sections" class="bar-nav">
        <details
          ref="sectionMenu"
          class="section-menu"
          :open="!compact || menuOpen"
          @toggle="onToggle"
          @keydown.esc.stop.prevent="closeMenu"
        >
          <summary
            ref="menuToggle"
            :aria-label="`Jump to a component, current: ${activeSection.title}`"
            data-testid="section-menu-toggle"
          >
            <span class="nav-number tabular">{{ activeSection.number }}</span>
            <span>{{ activeSection.title }}</span>
            <span aria-hidden="true" class="menu-chevron">⌄</span>
          </summary>
          <ol>
            <li v-for="section in playgroundSections" :key="section.id">
              <a
                :aria-current="activeId === section.id ? 'location' : undefined"
                :href="`#${section.id}`"
                :data-testid="`nav-${section.id}`"
                @click="selectSection"
              >
                <span class="nav-number tabular">{{ section.number }}</span>
                <span class="nav-label">{{ section.title }}</span>
              </a>
            </li>
          </ol>
        </details>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.pg-bar {
  position: sticky;
  z-index: 30;
  inset-block-start: 0;
  border-block-end: 1px solid var(--pg-line);
  background: color-mix(in srgb, var(--pg-bg) 94%, transparent);
  backdrop-filter: blur(10px);
}

.bar-inner {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 1rem;
  max-inline-size: var(--pg-max);
  min-block-size: var(--pg-bar-height);
  margin-inline: auto;
  padding-inline: var(--pg-gutter);
}

.bar-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex: none;
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.bar-mark {
  display: grid;
  place-items: center;
  inline-size: 1.9rem;
  block-size: 1.9rem;
  background: var(--pg-ink);
  color: var(--pg-bg);
  font-family: var(--pg-font-mono);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.bar-nav {
  min-inline-size: 0;
  display: flex;
  align-items: stretch;
}

.section-menu {
  block-size: 100%;
}
.section-menu summary {
  display: none;
}

.bar-nav ol {
  display: flex;
  block-size: 100%;
  align-items: stretch;
  min-block-size: var(--pg-bar-height);
}
.bar-nav li {
  display: flex;
}

.bar-nav a {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  block-size: auto;
  padding-inline: clamp(0.5rem, 1.2vw, 0.9rem);
  color: var(--pg-muted);
  font-size: 0.85rem;
  font-weight: 550;
  text-decoration: none;
}

.bar-nav a:hover {
  color: var(--pg-ink);
}

.bar-nav a[aria-current="location"] {
  color: var(--pg-ink);
}

.bar-nav a[aria-current="location"]::after {
  content: "";
  position: absolute;
  inset-inline: clamp(0.5rem, 1.2vw, 0.9rem);
  inset-block-end: -1px;
  block-size: 2px;
  background: var(--pg-ink);
}

.bar-nav a:focus-visible {
  outline-offset: -4px;
}

.nav-number {
  font-family: var(--pg-font-mono);
  font-size: 0.7rem;
}

/* Forced colours drop the indicator's fill, so the current section is underlined instead. */
@media (forced-colors: active) {
  .bar-nav a[aria-current="location"] {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 0.4em;
  }
}

/* A native disclosure keeps names and real anchors, without a second navigation tree. */
@media (max-width: 52rem) {
  .bar-nav {
    position: relative;
    align-self: center;
    margin-inline-start: auto;
  }
  .section-menu summary {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-block-size: 2.75rem;
    padding-inline: 0.65rem;
    border: 1px solid var(--pg-line);
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }
  .section-menu summary::-webkit-details-marker {
    display: none;
  }
  .menu-chevron {
    margin-inline-start: 0.4rem;
  }
  .bar-nav ol {
    position: absolute;
    inset-block-start: calc(100% + 0.5rem);
    inset-inline-end: 0;
    display: grid;
    inline-size: 15rem;
    block-size: auto;
    min-block-size: 0;
    padding: 0.4rem;
    border: 1px solid var(--pg-line);
    border-radius: 0.65rem;
    background: var(--pg-panel);
    box-shadow: 0 8px 24px rgb(21 20 15 / 0.12);
  }
  .bar-nav a {
    min-block-size: 2.75rem;
    gap: 0.8rem;
    padding-inline: 0.75rem;
    border-radius: 0.3rem;
  }
  .bar-nav a:hover,
  .bar-nav a[aria-current="location"] {
    background: var(--pg-bg);
  }
  .bar-nav a[aria-current="location"]::after {
    display: none;
  }
}

@media (max-width: 40rem) {
  .bar-brand {
    font-size: 0.82rem;
    gap: 0.4rem;
  }
  .bar-mark {
    inline-size: 1.65rem;
    block-size: 1.65rem;
  }

  .bar-inner {
    gap: 0.5rem;
  }
}
</style>
