<script setup lang="ts">
/**
 * The package as an ordinary consumer gets it.
 *
 * Every other demo injects the inspector's physics, which is what makes them useful for tuning and
 * useless as evidence about the product. This one supplies nothing but `items`: no spring, no
 * elasticity, no release policy, no stage width. Whatever these surfaces do here is what a reader
 * of the README gets, so the behaviours the package promises — one bounded card exchange, honest
 * navigation reasons, a route that can always take over, usable slotted controls — are certified
 * against this rather than against a tuned rig.
 */
import { Coverflow } from "@snap-motion/vue/coverflow";
import type { ActiveIdRequestDetails, NavigationReason } from "@snap-motion/vue/motion";
import { StackedDeck } from "@snap-motion/vue/stacked-deck";
import { ref } from "vue";

import { showcaseScreens, type ShowcaseScreenId } from "./showcaseScreens";

defineProps<{
  reducedMotionOverride: boolean | undefined;
}>();

const screens = showcaseScreens;
const deckId = ref<ShowcaseScreenId>(screens[Math.floor(screens.length / 2)]!.id);
const railId = ref<ShowcaseScreenId>(screens[Math.floor(screens.length / 2)]!.id);
const deckReason = ref<NavigationReason | "none">("none");
const railReason = ref<NavigationReason | "none">("none");
const deckCovered = ref(false);
const activations = ref(0);

function onDeckRequest(_id: ShowcaseScreenId | undefined, details: ActiveIdRequestDetails) {
  deckReason.value = details.reason;
}

function onRailRequest(_id: ShowcaseScreenId | undefined, details: ActiveIdRequestDetails) {
  railReason.value = details.reason;
}

/**
 * What a router does: it assigns controlled state and expects the surface to agree, including while
 * the surface is covered by something else and refusing input.
 */
function navigateAsRoute(id: ShowcaseScreenId) {
  deckId.value = id;
  railId.value = id;
}
</script>

<template>
  <section aria-labelledby="defaults-title" class="defaults-demo">
    <header>
      <h3 id="defaults-title">Zero-configuration consumer contract</h3>
      <p class="lede">
        Zero configuration: only <code>items</code>. No spring, elasticity, release policy, or stage
        width is supplied, so this is the behaviour the package ships rather than the behaviour the
        inspector produces.
      </p>
    </header>

    <div class="defaults-controls">
      <button
        data-testid="defaults-route-first"
        type="button"
        @click="navigateAsRoute(screens[0]!.id)"
      >
        Route to first
      </button>
      <button
        data-testid="defaults-route-last"
        type="button"
        @click="navigateAsRoute(screens.at(-1)!.id)"
      >
        Route to last
      </button>
      <label class="defaults-cover">
        <input v-model="deckCovered" data-testid="defaults-cover" type="checkbox" />
        <span>Cover the deck (disabled)</span>
      </label>
    </div>

    <p class="defaults-trace">
      <span data-testid="defaults-deck-id">{{ deckId }}</span>
      <span data-testid="defaults-deck-reason">{{ deckReason }}</span>
      <span data-testid="defaults-rail-id">{{ railId }}</span>
      <span data-testid="defaults-rail-reason">{{ railReason }}</span>
      <span data-testid="defaults-activations">{{ activations }}</span>
    </p>

    <StackedDeck
      v-model:active-id="deckId"
      class="defaults-surface"
      data-testid="defaults-deck"
      :disabled="deckCovered"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Default stacked deck"
      :reduced-motion-override="reducedMotionOverride"
      @active-id-request="onDeckRequest"
    >
      <template #card="card">
        <article class="defaults-card">
          <h4>{{ card.item.title }}</h4>
          <!-- Arbitrary application content: it has to keep working inside a motion surface. -->
          <p class="defaults-card-actions">
            <a
              class="defaults-card-link"
              data-testid="defaults-card-link"
              :href="`#${card.item.id}`"
              @click="activations += 1"
            >
              Open {{ card.item.title }}
            </a>
            <button
              class="defaults-card-button"
              data-testid="defaults-card-button"
              type="button"
              @click="activations += 1"
            >
              Act
            </button>
            <input aria-label="Note" data-testid="defaults-card-input" type="text" />
          </p>
        </article>
      </template>
    </StackedDeck>

    <Coverflow
      v-model:active-id="railId"
      class="defaults-surface"
      data-testid="defaults-rail"
      :items="screens"
      :item-label="(screen) => screen.title"
      label="Default coverflow"
      :reduced-motion-override="reducedMotionOverride"
      @active-id-request="onRailRequest"
    >
      <template #card="card">
        <article class="defaults-card">
          <h4>{{ card.item.title }}</h4>
        </article>
      </template>
    </Coverflow>
  </section>
</template>

<style scoped>
.defaults-demo {
  display: grid;
  gap: 1rem;
  min-inline-size: 0;
}

.defaults-demo h3 {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
}

.lede {
  margin: 0;
  max-inline-size: 44rem;
  color: var(--muted);
  line-height: 1.45;
}

.defaults-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.defaults-controls button {
  min-block-size: 2.75rem;
  padding: 0 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ink) 24%, transparent);
  border-radius: 0.6rem;
  background: transparent;
  color: var(--ink);
  font: inherit;
}

.defaults-cover {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.defaults-trace {
  display: flex;
  gap: 0.75rem;
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.defaults-surface {
  border-radius: 1rem;
  background: #f1f4f8;
}

.defaults-card {
  display: grid;
  align-content: center;
  gap: 0.6rem;
  inline-size: 100%;
  block-size: 100%;
  padding: 1.2rem;
  border: 1px solid rgb(15 23 42 / 0.16);
  border-radius: 0.8rem;
  background: #fff;
  color: #0f172a;
}

.defaults-card h4 {
  margin: 0;
  font-size: 1.05rem;
}

.defaults-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
}

.defaults-card-input,
.defaults-card-button,
.defaults-card-link {
  min-block-size: 2.25rem;
}
</style>
