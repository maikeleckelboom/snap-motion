import type { AnimationDriver, AnimationPlaybackControls } from "./animation-driver";
import { assertFiniteNumber, assertNonNegative, clampToBounds, createBounds } from "./bounds";
import { applyElasticity, validateElasticityOptions } from "./elastic";
import { tightPreset } from "./presets";
import {
  clampAnchorsToBounds,
  directionalAnchor,
  findAnchorById,
  nearestAnchor,
  resolveReleaseTarget,
  validateReleaseTargetPolicy,
} from "./snap-targets";
import type {
  ControllerConfiguration,
  ControllerConfigurationUpdate,
  ControllerMeasurement,
  ControllerMoveByOptions,
  ControllerMoveOptions,
  ControllerSnapshot,
  ElasticBoundaryOptions,
  ElasticityOptions,
  ReleaseTargetPolicy,
  ScalarBounds,
  SemanticId,
  SnapAnchor,
  SnapDirection,
  SpringConfiguration,
} from "./types";

const POSITION_EPSILON = 1e-9;

export type ControllerListener<Id extends SemanticId = SemanticId> = (
  snapshot: ControllerSnapshot<Id>,
) => void;

export interface SnapControllerOptions<Id extends SemanticId = SemanticId> {
  readonly driver: AnimationDriver;
  readonly bounds: ScalarBounds;
  readonly anchors: readonly SnapAnchor<Id>[];
  readonly initialTargetId?: Id;
  readonly initialPosition?: number;
  readonly spring?: SpringConfiguration;
  readonly releasePolicy?: Partial<ReleaseTargetPolicy>;
  readonly elasticity?: ElasticityOptions;
  readonly programmaticImpulse?: number;
  readonly reducedMotion?: boolean;
  readonly onChange?: ControllerListener<Id>;
  readonly onComplete?: (target: SnapAnchor<Id>, snapshot: ControllerSnapshot<Id>) => void;
}

function cloneBoundary(
  boundary: ElasticBoundaryOptions | false | undefined,
): ElasticBoundaryOptions | false | undefined {
  return boundary === false || boundary === undefined ? boundary : { ...boundary };
}

function cloneElasticity(elasticity: ElasticityOptions): ElasticityOptions {
  const result: { min?: ElasticBoundaryOptions | false; max?: ElasticBoundaryOptions | false } = {};
  const min = cloneBoundary(elasticity.min);
  const max = cloneBoundary(elasticity.max);
  if (min !== undefined) result.min = min;
  if (max !== undefined) result.max = max;
  return result;
}

function validateSpring(spring: SpringConfiguration): void {
  assertFiniteNumber(spring.stiffness, "spring.stiffness");
  assertFiniteNumber(spring.damping, "spring.damping");
  assertFiniteNumber(spring.mass, "spring.mass");
  assertNonNegative(spring.restSpeed, "spring.restSpeed");
  assertNonNegative(spring.restDistance, "spring.restDistance");
  if (spring.stiffness <= 0 || spring.damping <= 0 || spring.mass <= 0) {
    throw new RangeError("spring stiffness, damping, and mass must be greater than zero");
  }
}

function cloneAnchor<Id extends SemanticId>(anchor: SnapAnchor<Id>): SnapAnchor<Id> {
  return { ...anchor };
}

export class SnapController<Id extends SemanticId = SemanticId> {
  readonly #driver: AnimationDriver;
  readonly #listeners = new Set<ControllerListener<Id>>();
  readonly #onChange: ControllerListener<Id> | undefined;
  readonly #onComplete:
    | ((target: SnapAnchor<Id>, snapshot: ControllerSnapshot<Id>) => void)
    | undefined;

  #bounds: ScalarBounds;
  #anchors: readonly SnapAnchor<Id>[];
  #spring: SpringConfiguration;
  #releasePolicy: ReleaseTargetPolicy;
  #elasticity: ElasticityOptions;
  #programmaticImpulse: number;
  #phase: ControllerSnapshot<Id>["phase"] = "idle";
  #position: number;
  #velocity = 0;
  #target: SnapAnchor<Id> | null;
  #active: SnapAnchor<Id> | null;
  #reducedMotion: boolean;
  #playback: AnimationPlaybackControls | null = null;
  #animationGeneration = 0;
  #dragStartPosition = 0;
  #dragAnchorId: Id | null = null;
  #disposed = false;

  constructor(options: SnapControllerOptions<Id>) {
    this.#driver = options.driver;
    this.#bounds = createBounds(options.bounds.min, options.bounds.max);
    this.#anchors = clampAnchorsToBounds(options.anchors, this.#bounds);
    this.#spring = { ...(options.spring ?? tightPreset.spring) };
    this.#releasePolicy = { ...tightPreset.release, ...options.releasePolicy };
    this.#elasticity = cloneElasticity(options.elasticity ?? tightPreset.elasticity);
    this.#programmaticImpulse = options.programmaticImpulse ?? tightPreset.programmaticImpulse;
    this.#reducedMotion = options.reducedMotion ?? false;
    this.#onChange = options.onChange;
    this.#onComplete = options.onComplete;

    validateSpring(this.#spring);
    validateReleaseTargetPolicy(this.#releasePolicy);
    validateElasticityOptions(this.#elasticity);
    assertNonNegative(this.#programmaticImpulse, "programmaticImpulse");

    if (options.initialPosition !== undefined) {
      assertFiniteNumber(options.initialPosition, "initialPosition");
    }

    const requestedTarget = findAnchorById(this.#anchors, options.initialTargetId);
    const fallbackPosition =
      options.initialPosition ?? requestedTarget?.position ?? this.#bounds.max;
    this.#position = clampToBounds(fallbackPosition, this.#bounds);
    this.#active =
      requestedTarget ??
      nearestAnchor<Id>(
        this.#anchors,
        this.#position,
        options.initialTargetId === undefined ? {} : { activeId: options.initialTargetId },
      );
    this.#target = requestedTarget ?? this.#active;
  }

  get snapshot(): ControllerSnapshot<Id> {
    return this.getSnapshot();
  }

  get configuration(): ControllerConfiguration {
    return {
      spring: { ...this.#spring },
      releasePolicy: { ...this.#releasePolicy },
      elasticity: cloneElasticity(this.#elasticity),
      programmaticImpulse: this.#programmaticImpulse,
    };
  }

  get position(): number {
    return this.#position;
  }

  get velocity(): number {
    return this.#velocity;
  }

  get currentTarget(): SnapAnchor<Id> | null {
    return this.#target ? cloneAnchor(this.#target) : null;
  }

  get activeAnchor(): SnapAnchor<Id> | null {
    return this.#active ? cloneAnchor(this.#active) : null;
  }

  getSnapshot(): ControllerSnapshot<Id> {
    return {
      phase: this.#phase,
      position: this.#position,
      velocity: this.#velocity,
      target: this.#target ? cloneAnchor(this.#target) : null,
      active: this.#active ? cloneAnchor(this.#active) : null,
      bounds: { ...this.#bounds },
      anchors: this.#anchors.map(cloneAnchor),
      reducedMotion: this.#reducedMotion,
      isAnimating: this.#phase === "settling",
    };
  }

  subscribe(listener: ControllerListener<Id>): () => void {
    this.#assertUsable();
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  }

  configure(update: ControllerConfigurationUpdate): void {
    this.#assertUsable();
    const nextSpring = { ...this.#spring, ...update.spring };
    const nextReleasePolicy = { ...this.#releasePolicy, ...update.releasePolicy };
    const nextElasticity =
      update.elasticity === undefined ? this.#elasticity : cloneElasticity(update.elasticity);
    const nextProgrammaticImpulse = update.programmaticImpulse ?? this.#programmaticImpulse;

    validateSpring(nextSpring);
    validateReleaseTargetPolicy(nextReleasePolicy);
    validateElasticityOptions(nextElasticity);
    assertNonNegative(nextProgrammaticImpulse, "programmaticImpulse");

    const springChanged = update.spring !== undefined;
    const settlingTarget = springChanged && this.#phase === "settling" ? this.#target : null;
    const settlingVelocity = this.#velocity;

    this.#spring = nextSpring;
    this.#releasePolicy = nextReleasePolicy;
    this.#elasticity = nextElasticity;
    this.#programmaticImpulse = nextProgrammaticImpulse;

    if (settlingTarget) {
      this.#stopPlayback();
      this.#startSettlement(settlingTarget, settlingVelocity);
    } else {
      this.#emit();
    }
  }

  beginDrag(): void {
    this.#assertUsable();
    this.#stopPlayback();
    this.#phase = "dragging";
    this.#velocity = 0;
    this.#dragStartPosition = this.#position;
    this.#dragAnchorId = this.#active?.id ?? this.#target?.id ?? null;
    this.#target = null;
    this.#emit();
  }

  dragBy(delta: number): void {
    this.#assertDragging();
    assertFiniteNumber(delta, "delta");
    this.#writeDragPosition(this.#dragStartPosition + delta);
  }

  dragTo(position: number): void {
    this.#assertDragging();
    assertFiniteNumber(position, "position");
    this.#writeDragPosition(position);
  }

  release(velocity: number): SnapAnchor<Id> | null {
    this.#assertUsable();
    assertFiniteNumber(velocity, "velocity");
    if (this.#phase !== "dragging") {
      return null;
    }

    const target = resolveReleaseTarget({
      anchors: this.#anchors,
      position: this.#position,
      velocity,
      activeId: this.#dragAnchorId,
      policy: this.#releasePolicy,
    });
    this.#dragAnchorId = null;

    if (target === null) {
      this.#phase = "idle";
      this.#position = clampToBounds(this.#position, this.#bounds);
      this.#velocity = 0;
      this.#target = null;
      this.#active = null;
      this.#emit();
      return null;
    }

    this.#startSettlement(target, velocity);
    return cloneAnchor(target);
  }

  moveTo(id: Id, options: ControllerMoveOptions = {}): SnapAnchor<Id> | null {
    this.#assertUsable();
    const target = findAnchorById(this.#anchors, id);
    if (target === null) {
      return null;
    }

    const base = this.#target ?? this.#active;
    const logicalDirection = base ? Math.sign(target.order - base.order) : 0;
    const initialVelocity =
      options.initialVelocity ??
      logicalDirection * this.#releasePolicy.forwardSign * this.#programmaticImpulse;
    assertFiniteNumber(initialVelocity, "initialVelocity");
    this.#startSettlement(target, initialVelocity);
    return cloneAnchor(target);
  }

  moveBy(direction: SnapDirection, options: ControllerMoveByOptions = {}): SnapAnchor<Id> | null {
    this.#assertUsable();
    if (direction !== -1 && direction !== 1) {
      throw new RangeError("direction must be -1 or 1");
    }
    const steps = options.steps ?? 1;
    assertNonNegative(steps, "steps");
    if (!Number.isInteger(steps)) {
      throw new RangeError("steps must be an integer");
    }

    const base = this.#target ?? this.#active ?? nearestAnchor<Id>(this.#anchors, this.#position);
    if (base === null) {
      return null;
    }
    const target = directionalAnchor(this.#anchors, base.id, direction, steps);
    if (target === null) {
      return null;
    }
    const initialVelocity =
      options.initialVelocity ??
      direction * this.#releasePolicy.forwardSign * this.#programmaticImpulse;
    return this.moveTo(target.id, { initialVelocity });
  }

  next(options: ControllerMoveByOptions = {}): SnapAnchor<Id> | null {
    return this.moveBy(1, options);
  }

  previous(options: ControllerMoveByOptions = {}): SnapAnchor<Id> | null {
    return this.moveBy(-1, options);
  }

  interrupt(): void {
    this.#assertUsable();
    this.#stopPlayback();
    this.#phase = "idle";
    this.#velocity = 0;
    this.#active = nearestAnchor<Id>(
      this.#anchors,
      this.#position,
      this.#active ? { activeId: this.#active.id } : {},
    );
    this.#target = this.#active;
    this.#dragAnchorId = null;
    this.#emit();
  }

  remeasure(measurement: ControllerMeasurement<Id>): SnapAnchor<Id> | null {
    this.#assertUsable();
    const nextBounds = createBounds(measurement.bounds.min, measurement.bounds.max);
    const nextAnchors = clampAnchorsToBounds(measurement.anchors, nextBounds);
    const previousPhase = this.#phase;
    const previousPosition = this.#position;
    const previousVelocity = this.#velocity;
    const previousTargetId = this.#target?.id ?? null;
    const semanticId =
      measurement.activeId ??
      (previousPhase === "dragging"
        ? this.#dragAnchorId
        : (previousTargetId ?? this.#active?.id)) ??
      null;
    const previousAnchor =
      findAnchorById(this.#anchors, semanticId) ??
      nearestAnchor<Id>(this.#anchors, previousPosition, { activeId: semanticId });

    this.#stopPlayback();
    this.#bounds = nextBounds;
    this.#anchors = nextAnchors;

    if (previousPhase === "dragging") {
      const nextAnchor =
        findAnchorById(nextAnchors, semanticId) ??
        nearestAnchor<Id>(nextAnchors, clampToBounds(previousPosition, nextBounds));
      const anchorDelta = (nextAnchor?.position ?? 0) - (previousAnchor?.position ?? 0);
      this.#dragStartPosition += anchorDelta;
      this.#position = applyElasticity(
        previousPosition + anchorDelta,
        nextBounds,
        this.#elasticity,
      );
      this.#phase = "dragging";
      this.#velocity = 0;
      this.#target = null;
      this.#dragAnchorId = nextAnchor?.id ?? null;
      this.#active = nearestAnchor<Id>(
        nextAnchors,
        this.#position,
        nextAnchor ? { activeId: nextAnchor.id } : {},
      );
      this.#emit();
      return nextAnchor ? cloneAnchor(nextAnchor) : null;
    }

    const desiredId = measurement.activeId ?? previousTargetId ?? semanticId;
    const nextTarget =
      findAnchorById(nextAnchors, desiredId) ??
      nearestAnchor<Id>(nextAnchors, clampToBounds(previousPosition, nextBounds), {
        activeId: desiredId,
      });

    if (nextTarget === null) {
      this.#phase = "idle";
      this.#position = clampToBounds(previousPosition, nextBounds);
      this.#velocity = 0;
      this.#target = null;
      this.#active = null;
      this.#emit();
      return null;
    }

    if (previousPhase === "settling") {
      this.#position = previousPosition;
      this.#active = nearestAnchor<Id>(nextAnchors, previousPosition, { activeId: semanticId });
      this.#startSettlement(nextTarget, previousVelocity);
    } else {
      this.#phase = "idle";
      this.#position = nextTarget.position;
      this.#velocity = 0;
      this.#target = nextTarget;
      this.#active = nextTarget;
      this.#emit();
    }

    return cloneAnchor(nextTarget);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.#assertUsable();
    if (this.#reducedMotion === reducedMotion) {
      return;
    }
    this.#reducedMotion = reducedMotion;

    if (reducedMotion && this.#phase === "settling" && this.#target) {
      const target = this.#target;
      this.#stopPlayback();
      this.#finishSettlement(target);
    } else {
      this.#emit();
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#stopPlayback();
    this.#disposed = true;
    this.#listeners.clear();
  }

  #writeDragPosition(rawPosition: number): void {
    this.#position = applyElasticity(rawPosition, this.#bounds, this.#elasticity);
    this.#velocity = 0;
    this.#active = nearestAnchor<Id>(
      this.#anchors,
      this.#position,
      this.#active ? { activeId: this.#active.id } : {},
    );
    this.#emit();
  }

  #startSettlement(target: SnapAnchor<Id>, initialVelocity: number): void {
    this.#stopPlayback();
    this.#target = target;
    this.#phase = "settling";
    this.#velocity = initialVelocity;

    if (this.#reducedMotion || Math.abs(this.#position - target.position) <= POSITION_EPSILON) {
      this.#finishSettlement(target);
      return;
    }

    const generation = ++this.#animationGeneration;
    this.#emit();
    if (generation !== this.#animationGeneration || this.#phase !== "settling") {
      return;
    }

    let completedSynchronously = false;
    try {
      const playback = this.#driver.animate({
        from: this.#position,
        to: target.position,
        initialVelocity,
        spring: { ...this.#spring },
        onUpdate: (position, velocity) => {
          if (
            generation !== this.#animationGeneration ||
            this.#phase !== "settling" ||
            !Number.isFinite(position) ||
            !Number.isFinite(velocity)
          ) {
            return;
          }
          this.#position = position;
          this.#velocity = velocity;
          this.#active = nearestAnchor<Id>(
            this.#anchors,
            position,
            this.#active ? { activeId: this.#active.id } : {},
          );
          this.#emit();
        },
        onComplete: () => {
          if (generation !== this.#animationGeneration || this.#phase !== "settling") {
            return;
          }
          completedSynchronously = true;
          this.#playback = null;
          this.#finishSettlement(target);
        },
        onStop: () => {
          if (generation !== this.#animationGeneration || this.#phase !== "settling") {
            return;
          }
          this.#playback = null;
          this.#phase = "idle";
          this.#velocity = 0;
          this.#target = this.#active;
          this.#emit();
        },
      });

      if (
        !completedSynchronously &&
        generation === this.#animationGeneration &&
        this.#phase === "settling"
      ) {
        this.#playback = playback;
      }
    } catch (error) {
      if (generation === this.#animationGeneration) {
        this.#animationGeneration += 1;
        this.#phase = "idle";
        this.#velocity = 0;
        this.#target = this.#active;
        this.#emit();
      }
      throw error;
    }
  }

  #finishSettlement(target: SnapAnchor<Id>): void {
    this.#position = target.position;
    this.#velocity = 0;
    this.#phase = "idle";
    this.#target = target;
    this.#active = target;
    this.#emit();
    this.#onComplete?.(cloneAnchor(target), this.getSnapshot());
  }

  #stopPlayback(): void {
    this.#animationGeneration += 1;
    const playback = this.#playback;
    this.#playback = null;
    playback?.stop();
  }

  #emit(): void {
    if (this.#disposed) {
      return;
    }
    const snapshot = this.getSnapshot();
    this.#onChange?.(snapshot);
    const listeners: ControllerListener<Id>[] = [];
    this.#listeners.forEach((listener) => listeners.push(listener));
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  #assertUsable(): void {
    if (this.#disposed) {
      throw new Error("SnapController has been disposed");
    }
  }

  #assertDragging(): void {
    this.#assertUsable();
    if (this.#phase !== "dragging") {
      throw new Error("beginDrag() must be called before writing a drag position");
    }
  }
}
