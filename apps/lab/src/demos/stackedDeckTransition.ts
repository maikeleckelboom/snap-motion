import type { ControllerPhase, StackedDeckTransition } from "@snap-motion/core";

const DRAG_PROGRESS_LIMIT = 0.88;
const CONCEALED_PROGRESS = 0;
const TRANSITION_EPSILON = 0.000_001;

export interface StackedDeckTransitionInput {
  readonly controllerPhase: ControllerPhase;
  readonly itemCount: number;
  readonly physicalIndex: number;
  readonly settledIndex: number;
  /** Rendered fraction of the subordinate card that is currently exposed by opacity or aperture. */
  readonly subordinateExposure: number;
  readonly targetIndex: number | null;
}

interface ProgressMapping {
  readonly startPhysicalIndex: number;
  readonly endPhysicalIndex: number;
  readonly startProgress: number;
  readonly endProgress: number;
}

type TransitionMode = "tracking" | "concealing" | "restoring";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function phaseFor(progress: number): StackedDeckTransition["phase"] {
  if (progress < 0.34) return "peel";
  if (progress < 0.78) return "handoff";
  return "settle";
}

function idleTransition(settledIndex: number): StackedDeckTransition {
  return {
    settledIndex,
    fromIndex: settledIndex,
    toIndex: settledIndex,
    direction: 0,
    progress: 0,
    phase: "idle",
  };
}

function mappingProgress(mapping: ProgressMapping, physicalIndex: number): number {
  const distance = mapping.endPhysicalIndex - mapping.startPhysicalIndex;
  if (Math.abs(distance) <= Number.EPSILON) return mapping.endProgress;
  const travel = clamp((physicalIndex - mapping.startPhysicalIndex) / distance, 0, 1);
  return mapping.startProgress + (mapping.endProgress - mapping.startProgress) * travel;
}

function mappingComplete(mapping: ProgressMapping, physicalIndex: number): boolean {
  return mapping.endPhysicalIndex >= mapping.startPhysicalIndex
    ? physicalIndex >= mapping.endPhysicalIndex - TRANSITION_EPSILON
    : physicalIndex <= mapping.endPhysicalIndex + TRANSITION_EPSILON;
}

function assertInput(input: StackedDeckTransitionInput): void {
  if (!Number.isInteger(input.itemCount) || input.itemCount <= 0) {
    throw new RangeError("itemCount must be a positive integer");
  }
  if (!Number.isFinite(input.physicalIndex)) {
    throw new TypeError("physicalIndex must be finite");
  }
  if (
    !Number.isFinite(input.subordinateExposure) ||
    input.subordinateExposure < 0 ||
    input.subordinateExposure > 1
  ) {
    throw new RangeError("subordinateExposure must be between zero and one");
  }
  if (
    !Number.isInteger(input.settledIndex) ||
    input.settledIndex < 0 ||
    input.settledIndex >= input.itemCount
  ) {
    throw new RangeError("settledIndex must identify an item");
  }
  if (
    input.targetIndex !== null &&
    (!Number.isInteger(input.targetIndex) ||
      input.targetIndex < 0 ||
      input.targetIndex >= input.itemCount)
  ) {
    throw new RangeError("targetIndex must identify an item or be null");
  }
}

/**
 * Presentation-owned transition state layered over the generic scalar controller. It never
 * commits selection. Retargeting while an incoming face is exposed first reverses to a concealed
 * exchange state, then replaces the subordinate card without returning to idle geometry.
 */
export class StackedDeckTransitionState {
  #transition: StackedDeckTransition;
  #mapping: ProgressMapping | null = null;
  #mode: TransitionMode = "tracking";
  #pendingTargetIndex: number | null = null;

  constructor(initialIndex: number, itemCount: number) {
    if (!Number.isInteger(itemCount) || itemCount <= 0) {
      throw new RangeError("itemCount must be a positive integer");
    }
    if (!Number.isInteger(initialIndex) || initialIndex < 0 || initialIndex >= itemCount) {
      throw new RangeError("initialIndex must identify an item");
    }
    this.#transition = idleTransition(initialIndex);
  }

  get transition(): StackedDeckTransition {
    return this.#transition;
  }

  reset(settledIndex: number): StackedDeckTransition {
    this.#mapping = null;
    this.#mode = "tracking";
    this.#pendingTargetIndex = null;
    this.#transition = idleTransition(settledIndex);
    return this.#transition;
  }

  update(input: StackedDeckTransitionInput): StackedDeckTransition {
    assertInput(input);
    if (input.controllerPhase === "idle") return this.reset(input.settledIndex);

    if (this.#transition.phase === "idle" || this.#transition.settledIndex !== input.settledIndex) {
      return this.#start(input);
    }

    const requestedTarget = this.#requestedTarget(input);
    if (requestedTarget === input.settledIndex) {
      this.#beginRestoration(input.physicalIndex, input.settledIndex);
    } else if (
      requestedTarget !== null &&
      requestedTarget !== this.#transition.toIndex &&
      requestedTarget !== this.#pendingTargetIndex
    ) {
      this.#beginRetarget(input.physicalIndex, requestedTarget, input.subordinateExposure);
    }

    if (this.#mode === "concealing" && this.#mapping) {
      const concealProgress = mappingProgress(this.#mapping, input.physicalIndex);
      this.#setProgress(concealProgress, input.controllerPhase);
      if (
        mappingComplete(this.#mapping, input.physicalIndex) &&
        input.subordinateExposure <= TRANSITION_EPSILON
      ) {
        this.#completeConceal(input.physicalIndex);
      }
    } else if (this.#mapping) {
      let progress = mappingProgress(this.#mapping, input.physicalIndex);
      if (input.controllerPhase === "dragging" && this.#mode !== "restoring") {
        progress = Math.min(progress, DRAG_PROGRESS_LIMIT);
      }
      this.#setProgress(progress, input.controllerPhase);
    }

    if (input.controllerPhase === "dragging" && this.#transition.progress <= TRANSITION_EPSILON) {
      const displacement = input.physicalIndex - input.settledIndex;
      const direction = Math.sign(displacement) as -1 | 0 | 1;
      if (direction !== 0 && direction !== this.#transition.direction) {
        const candidate = input.settledIndex + direction;
        if (candidate >= 0 && candidate < input.itemCount) {
          this.#beginRetarget(input.physicalIndex, candidate, input.subordinateExposure);
        }
      }
    }

    return this.#transition;
  }

  #requestedTarget(input: StackedDeckTransitionInput): number | null {
    if (input.controllerPhase === "settling") {
      return input.targetIndex ?? input.settledIndex;
    }
    if (this.#transition.phase !== "idle") return this.#transition.toIndex;
    const direction = Math.sign(input.physicalIndex - input.settledIndex);
    if (direction === 0) return null;
    const candidate = input.settledIndex + direction;
    return candidate >= 0 && candidate < input.itemCount ? candidate : null;
  }

  #start(input: StackedDeckTransitionInput, forcedTarget?: number): StackedDeckTransition {
    let targetIndex = forcedTarget;
    if (targetIndex === undefined && input.controllerPhase === "settling") {
      targetIndex = input.targetIndex ?? undefined;
    }
    if (targetIndex === undefined || targetIndex === input.settledIndex) {
      const direction = Math.sign(input.physicalIndex - input.settledIndex);
      const candidate = input.settledIndex + direction;
      if (direction === 0 || candidate < 0 || candidate >= input.itemCount) {
        return this.reset(input.settledIndex);
      }
      targetIndex = candidate;
    }

    const direction = Math.sign(targetIndex - input.settledIndex) as -1 | 1;
    const targetDistance = Math.abs(targetIndex - input.settledIndex);
    const physicalProgress = clamp(
      Math.abs(input.physicalIndex - input.settledIndex) / Math.max(1, targetDistance),
      0,
      input.controllerPhase === "dragging" ? DRAG_PROGRESS_LIMIT : 0.999_999,
    );
    this.#mapping = {
      startPhysicalIndex: input.settledIndex,
      endPhysicalIndex: targetIndex,
      startProgress: 0,
      endProgress: 1,
    };
    this.#mode = "tracking";
    this.#pendingTargetIndex = null;
    this.#transition = {
      settledIndex: input.settledIndex,
      fromIndex: input.settledIndex,
      toIndex: targetIndex,
      direction,
      progress: physicalProgress,
      phase: phaseFor(physicalProgress),
    };
    return this.#transition;
  }

  #beginRestoration(physicalIndex: number, settledIndex: number): void {
    if (this.#mode === "restoring") return;
    this.#pendingTargetIndex = null;
    this.#mode = "restoring";
    this.#mapping = {
      startPhysicalIndex: physicalIndex,
      endPhysicalIndex: settledIndex,
      startProgress: this.#transition.progress,
      endProgress: 0,
    };
  }

  #beginRetarget(physicalIndex: number, targetIndex: number, subordinateExposure: number): void {
    if (subordinateExposure <= TRANSITION_EPSILON) {
      this.#transition = {
        ...this.#transition,
        toIndex: targetIndex,
        direction: Math.sign(targetIndex - this.#transition.fromIndex) as -1 | 1,
      };
      this.#mapping = {
        startPhysicalIndex: physicalIndex,
        endPhysicalIndex: targetIndex,
        startProgress: this.#transition.progress,
        endProgress: 1,
      };
      this.#mode = "tracking";
      this.#pendingTargetIndex = null;
      return;
    }

    const remainingDistance = Math.abs(targetIndex - physicalIndex);
    const directionToTarget = Math.sign(targetIndex - physicalIndex) || this.#transition.direction;
    const concealDistance = Math.min(0.32, Math.max(0.08, remainingDistance * 0.28));
    this.#mapping = {
      startPhysicalIndex: physicalIndex,
      endPhysicalIndex: physicalIndex + directionToTarget * concealDistance,
      startProgress: this.#transition.progress,
      endProgress: CONCEALED_PROGRESS,
    };
    this.#mode = "concealing";
    this.#pendingTargetIndex = targetIndex;
  }

  #completeConceal(physicalIndex: number): void {
    const targetIndex = this.#pendingTargetIndex;
    if (targetIndex === null) return;
    this.#transition = {
      ...this.#transition,
      toIndex: targetIndex,
      direction: Math.sign(targetIndex - this.#transition.fromIndex) as -1 | 1,
      progress: CONCEALED_PROGRESS,
      phase: phaseFor(CONCEALED_PROGRESS),
    };
    this.#mapping = {
      startPhysicalIndex: physicalIndex,
      endPhysicalIndex: targetIndex,
      startProgress: CONCEALED_PROGRESS,
      endProgress: 1,
    };
    this.#mode = "tracking";
    this.#pendingTargetIndex = null;
  }

  #setProgress(progress: number, controllerPhase: ControllerPhase): void {
    const bounded = clamp(
      progress,
      0,
      controllerPhase === "dragging" && this.#mode !== "restoring" ? DRAG_PROGRESS_LIMIT : 1,
    );
    this.#transition = {
      ...this.#transition,
      progress: bounded,
      phase: phaseFor(bounded),
    };
  }
}
