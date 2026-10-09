<script setup lang="ts">
import { playgroundSections } from "../sections";

defineProps<{ activeId: string | undefined }>();

const labHref = import.meta.env.BASE_URL;
</script>

<template>
  <header class="pg-bar">
    <div class="bar-inner">
      <a class="bar-brand" href="#top">
        <span aria-hidden="true" class="bar-mark">SM</span>
        <span class="bar-name">Snap Motion</span>
      </a>

      <nav aria-label="Playground sections" class="bar-nav">
        <ol>
          <li v-for="section in playgroundSections" :key="section.id">
            <a
              :aria-current="activeId === section.id ? 'location' : undefined"
              :href="`#${section.id}`"
              :data-testid="`nav-${section.id}`"
            >
              <span class="nav-number tabular">{{ section.number }}</span>
              <span class="nav-label">{{ section.title }}</span>
            </a>
          </li>
        </ol>
      </nav>

      <a class="bar-lab" :href="labHref">Engineering Lab</a>
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
}

.bar-nav ol {
  display: flex;
  block-size: 100%;
  align-items: stretch;
}

.bar-nav a {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  block-size: 100%;
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

.bar-lab {
  display: flex;
  flex: none;
  align-items: center;
  color: var(--pg-muted);
  font-size: 0.82rem;
  text-underline-offset: 0.2em;
}

.bar-lab:hover {
  color: var(--pg-ink);
}

/* Narrow screens keep all five anchors visible as numbers; the intro lists their names. */
@media (max-width: 52rem) {
  .nav-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .bar-nav a {
    min-inline-size: 2.75rem;
    justify-content: center;
    padding-inline: 0.3rem;
  }

  .bar-nav a[aria-current="location"]::after {
    inset-inline: 0.5rem;
  }
}

@media (max-width: 40rem) {
  /* Visually hidden, not removed, so the brand link keeps its accessible name. */
  .bar-name {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .bar-lab {
    display: none;
  }

  .bar-inner {
    gap: 0.5rem;
  }
}
</style>
