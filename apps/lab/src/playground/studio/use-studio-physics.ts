import { computed } from "vue";

import {
  carouselReleaseFromSettings,
  deckReleaseFromSettings,
  springFromSettings,
  symmetricElasticityFromSettings,
} from "../../fixtures/lab-settings";
import type { LabPhysicsSettings } from "../../fixtures/lab-types";

/**
 * Maps the Playground's one shared physics configuration onto the options each Studio surface
 * takes. It owns no state: `settings` is the object the page root's `useSharedPhysics()` publishes,
 * so a preset or an edit made anywhere reaches every Studio surface through the same prop path the
 * five demonstrations use.
 *
 * Coverflow, the Paged Grid and the Stacked Deck use the same mappings as their demonstrations. The
 * Sheet's two mappings below mirror `SheetDemo.vue` (the Sheet is a one-sided edge surface, so it
 * resists only at its closed end and its forward direction is positive); they are pinned by
 * `studio-physics.test.ts` so the two cannot drift apart unnoticed.
 */
export function useStudioPhysics(settings: () => LabPhysicsSettings) {
  return {
    carouselRelease: computed(() => carouselReleaseFromSettings(settings())),
    deckRelease: computed(() => deckReleaseFromSettings(settings())),
    elasticity: computed(() => symmetricElasticityFromSettings(settings())),
    programmaticImpulse: computed(() => settings().programmaticImpulse),
    sheetElasticity: computed(() => sheetElasticityFromSettings(settings())),
    sheetRelease: computed(() => sheetReleaseFromSettings(settings())),
    spring: computed(() => springFromSettings(settings())),
  };
}

export function sheetElasticityFromSettings(settings: LabPhysicsSettings) {
  return {
    min: { resistance: settings.elasticResistance, maxDistance: settings.maxElasticDistance },
    max: false as const,
  };
}

export function sheetReleaseFromSettings(settings: LabPhysicsSettings) {
  return {
    projectionSeconds: settings.projectionSeconds,
    flingVelocity: settings.flingVelocity,
    maxAnchorSkip: Math.max(1, Math.round(settings.maxAnchorSkip)),
    forwardSign: 1 as const,
  };
}
