import type { MotionPreset, MotionPresetName } from "./types";

export const tightPreset = {
  name: "tight",
  spring: {
    stiffness: 520,
    damping: 42,
    mass: 0.7,
    restSpeed: 12,
    restDistance: 0.5,
  },
  release: {
    projectionSeconds: 0.18,
    flingVelocity: 520,
    maxAnchorSkip: 2,
    forwardSign: -1,
  },
  elasticity: {
    min: { resistance: 2.4, maxDistance: 56 },
    max: { resistance: 2.4, maxDistance: 56 },
  },
  programmaticImpulse: 320,
} as const satisfies MotionPreset;

export const balancedPreset = {
  name: "balanced",
  spring: {
    stiffness: 400,
    damping: 36,
    mass: 0.85,
    restSpeed: 10,
    restDistance: 0.6,
  },
  release: {
    projectionSeconds: 0.22,
    flingVelocity: 460,
    maxAnchorSkip: 2,
    forwardSign: -1,
  },
  elasticity: {
    min: { resistance: 2, maxDistance: 64 },
    max: { resistance: 2, maxDistance: 64 },
  },
  programmaticImpulse: 280,
} as const satisfies MotionPreset;

export const heavyPreset = {
  name: "heavy",
  spring: {
    stiffness: 360,
    damping: 40,
    mass: 1.25,
    restSpeed: 9,
    restDistance: 0.6,
  },
  release: {
    projectionSeconds: 0.16,
    flingVelocity: 580,
    maxAnchorSkip: 1,
    forwardSign: -1,
  },
  elasticity: {
    min: { resistance: 2.8, maxDistance: 48 },
    max: { resistance: 2.8, maxDistance: 48 },
  },
  programmaticImpulse: 360,
} as const satisfies MotionPreset;

export const loosePreset = {
  name: "loose",
  spring: {
    stiffness: 280,
    damping: 24,
    mass: 0.8,
    restSpeed: 8,
    restDistance: 0.8,
  },
  release: {
    projectionSeconds: 0.28,
    flingVelocity: 400,
    maxAnchorSkip: 2,
    forwardSign: -1,
  },
  elasticity: {
    min: { resistance: 1.6, maxDistance: 76 },
    max: { resistance: 1.6, maxDistance: 76 },
  },
  programmaticImpulse: 240,
} as const satisfies MotionPreset;

export const MOTION_PRESETS = {
  tight: tightPreset,
  balanced: balancedPreset,
  heavy: heavyPreset,
  loose: loosePreset,
} as const satisfies Record<MotionPresetName, MotionPreset>;

export const DEFAULT_MOTION_PRESET: MotionPresetName = "tight";
