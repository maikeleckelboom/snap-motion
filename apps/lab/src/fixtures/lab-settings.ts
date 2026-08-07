import { MOTION_PRESETS, type MotionPresetName } from "@snap-motion/core";

import type { LabPhysicsSettings, LabPresetName } from "./lab-types";

export function settingsFromPreset(name: LabPresetName): LabPhysicsSettings {
  const preset = MOTION_PRESETS[name as MotionPresetName];
  const minimumElasticity = preset.elasticity.min;

  return {
    stiffness: preset.spring.stiffness,
    damping: preset.spring.damping,
    mass: preset.spring.mass,
    restSpeed: preset.spring.restSpeed,
    restDistance: preset.spring.restDistance,
    projectionSeconds: preset.release.projectionSeconds,
    flingVelocity: preset.release.flingVelocity,
    maxAnchorSkip: preset.release.maxAnchorSkip,
    elasticResistance: minimumElasticity.resistance,
    maxElasticDistance: minimumElasticity.maxDistance,
    programmaticImpulse: preset.programmaticImpulse,
  };
}

export function springFromSettings(settings: LabPhysicsSettings) {
  return {
    stiffness: settings.stiffness,
    damping: settings.damping,
    mass: settings.mass,
    restSpeed: settings.restSpeed,
    restDistance: settings.restDistance,
  };
}

export function carouselReleaseFromSettings(settings: LabPhysicsSettings) {
  return {
    projectionSeconds: settings.projectionSeconds,
    flingVelocity: settings.flingVelocity,
    maxAnchorSkip: Math.max(1, Math.round(settings.maxAnchorSkip)),
    forwardSign: -1 as const,
  };
}

/**
 * The stacked deck is a physical card transaction, not a rail: one interaction may exchange exactly
 * one adjacent screen. That is a presentation policy, so the deck fixes its own effective skip and
 * the shared Maximum skip control keeps governing every other surface unchanged.
 */
export const STACKED_DECK_MAX_ANCHOR_SKIP = 1;

export function stackedDeckReleaseFromSettings(settings: LabPhysicsSettings) {
  return {
    ...carouselReleaseFromSettings(settings),
    maxAnchorSkip: STACKED_DECK_MAX_ANCHOR_SKIP,
  };
}

export function symmetricElasticityFromSettings(settings: LabPhysicsSettings) {
  const boundary = {
    resistance: settings.elasticResistance,
    maxDistance: settings.maxElasticDistance,
  };
  return { min: boundary, max: boundary };
}
