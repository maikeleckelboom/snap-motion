import {
  tightPreset,
  type ControllerConfiguration,
  type ElasticBoundaryOptions,
  type ElasticityOptions,
  type ReleaseTargetPolicy,
  type SpringConfiguration,
} from "@snap-motion/core";

export interface SurfaceConfigurationOverrides {
  readonly spring?: SpringConfiguration | undefined;
  readonly releasePolicy?: Partial<ReleaseTargetPolicy> | undefined;
  readonly elasticity?: ElasticityOptions | undefined;
  readonly dragEnvelopeElasticity?: ElasticityOptions | undefined;
  readonly programmaticImpulse?: number | undefined;
}

export const DEFAULT_SURFACE_CONFIGURATION: ControllerConfiguration = {
  spring: tightPreset.spring,
  releasePolicy: tightPreset.release,
  elasticity: tightPreset.elasticity,
  dragEnvelopeElasticity: {},
  programmaticImpulse: tightPreset.programmaticImpulse,
};

/**
 * Resolves the complete controller configuration a surface means right now.
 *
 * `SnapController.configure()` is intentionally patch-like: an omitted field keeps the installed
 * value. A reactive adapter has different semantics. Removing an override means returning to the
 * surface default, so adapters always hand the controller a complete configuration rather than a
 * sparse history-dependent patch.
 */
export function resolveSurfaceConfiguration(
  overrides: SurfaceConfigurationOverrides,
  defaults: ControllerConfiguration = DEFAULT_SURFACE_CONFIGURATION,
): ControllerConfiguration {
  return {
    spring: { ...defaults.spring, ...overrides.spring },
    releasePolicy: { ...defaults.releasePolicy, ...overrides.releasePolicy },
    elasticity: cloneElasticity(overrides.elasticity ?? defaults.elasticity),
    dragEnvelopeElasticity: cloneElasticity(
      overrides.dragEnvelopeElasticity ?? defaults.dragEnvelopeElasticity,
    ),
    programmaticImpulse: overrides.programmaticImpulse ?? defaults.programmaticImpulse,
  };
}

/** A deterministic value key for reactive configuration comparison. */
export function surfaceConfigurationKey(configuration: ControllerConfiguration): string {
  const spring = configuration.spring;
  const release = configuration.releasePolicy;
  return JSON.stringify([
    spring.stiffness,
    spring.damping,
    spring.mass,
    spring.restSpeed,
    spring.restDistance,
    release.projectionSeconds,
    release.flingVelocity,
    release.maxAnchorSkip,
    release.forwardSign,
    boundaryKey(configuration.elasticity.min),
    boundaryKey(configuration.elasticity.max),
    boundaryKey(configuration.dragEnvelopeElasticity.min),
    boundaryKey(configuration.dragEnvelopeElasticity.max),
    configuration.programmaticImpulse,
  ]);
}

function cloneElasticity(elasticity: ElasticityOptions): ElasticityOptions {
  return {
    ...(elasticity.min === undefined ? {} : { min: cloneBoundary(elasticity.min) }),
    ...(elasticity.max === undefined ? {} : { max: cloneBoundary(elasticity.max) }),
  };
}

function cloneBoundary(boundary: ElasticBoundaryOptions | false): ElasticBoundaryOptions | false {
  return boundary === false ? false : { ...boundary };
}

function boundaryKey(boundary: ElasticBoundaryOptions | false | undefined) {
  if (boundary === undefined) return null;
  if (boundary === false) return false;
  return [boundary.resistance, boundary.maxDistance] as const;
}
