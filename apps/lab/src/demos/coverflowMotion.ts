import type {
  AnimationDriver,
  ControllerPhase,
  ScalarAnimationRequest,
  SpringConfiguration,
} from "@snap-motion/core";
import { useRafFn } from "@vueuse/core";

export const COVERFLOW_MOTION_TUNING = {
  kineticStartSpeed: 1.5,
  kineticFullSpeed: 5.5,
  centerInnerRadius: 0.08,
  centerOuterRadius: 0.42,
  maximumKineticScaleLoss: 0.014,
  maximumKineticRecess: 16,
  maximumKineticYaw: 1.5,
  maximumShadowAttenuation: 0.55,
  settledSpeedStart: 0.75,
  settledSpeedEnd: 2.5,
  maximumFreeVelocity: 12,
  maximumFreeAcceleration: 520,
  releaseVelocityKnee: 6.5,
  maximumFrameDelta: 0.05,
  integrationStep: 1 / 120,
} as const;

export const COVERFLOW_PAGINATION_TUNING = {
  slotSize: 44,
  slotGap: 2,
  restingWidth: 22.4,
  height: 8.8,
  maximumStretchRatio: 0.42,
  stretchStartSpeed: 0.35,
  stretchFullSpeed: 4.5,
  directionSofteningSpeed: 1.5,
  directionalBias: 0.18,
  visualHysteresis: 0.04,
} as const;

export interface CoverflowKineticState {
  speedInCards: number;
  centerInfluence: number;
  kinetic: number;
  kineticFocus: number;
  settledness: number;
  scaleLoss: number;
  recess: number;
  retainedYaw: number;
  contactShadowStrength: number;
}

export interface CoverflowPaginationIndicatorState {
  position: number;
  x: number;
  scaleX: number;
  stretchRatio: number;
  speedInCards: number;
  softDirection: number;
  leftStretch: number;
  rightStretch: number;
}

export interface MutableSpringState {
  position: number;
  velocity: number;
}

interface ActiveSpring {
  readonly token: number;
  readonly request: ScalarAnimationRequest;
  readonly pitch: number;
  readonly state: MutableSpringState;
}

interface SettledSelectionUpdate {
  readonly phase: ControllerPhase;
  readonly targetIndex: number | null;
  readonly activeIndex: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  if (maximum <= minimum) {
    return value < minimum ? 0 : 1;
  }
  const normalized = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export function resolveSpeedInCards(velocityPxPerSecond: number, cardPitchPx: number): number {
  if (!Number.isFinite(velocityPxPerSecond) || !Number.isFinite(cardPitchPx) || cardPitchPx <= 0) {
    return 0;
  }
  return Math.abs(velocityPxPerSecond) / cardPitchPx;
}

/**
 * Projects the physical carousel mass onto the fixed pagination rail. The physical position owns
 * translation; velocity contributes only a bounded, directionally biased capsule stretch.
 */
export function resolveCoverflowPaginationIndicator(
  physicalIndex: number,
  velocityPxPerSecond: number,
  cardPitchPx: number,
  itemCount: number,
  output: CoverflowPaginationIndicatorState,
): CoverflowPaginationIndicatorState {
  const maximumIndex = Math.max(0, itemCount - 1);
  const position = clamp(Number.isFinite(physicalIndex) ? physicalIndex : 0, 0, maximumIndex);
  const speedInCards = resolveSpeedInCards(velocityPxPerSecond, cardPitchPx);
  const stretchProgress = smoothstep(
    COVERFLOW_PAGINATION_TUNING.stretchStartSpeed,
    COVERFLOW_PAGINATION_TUNING.stretchFullSpeed,
    speedInCards,
  );
  const stretchRatio = COVERFLOW_PAGINATION_TUNING.maximumStretchRatio * stretchProgress;
  const totalStretch = COVERFLOW_PAGINATION_TUNING.restingWidth * stretchRatio;
  const signedSpeedInCards =
    Number.isFinite(velocityPxPerSecond) && cardPitchPx > 0
      ? -velocityPxPerSecond / cardPitchPx
      : 0;
  const softDirection = clamp(
    signedSpeedInCards / COVERFLOW_PAGINATION_TUNING.directionSofteningSpeed,
    -1,
    1,
  );
  const leftStretch =
    totalStretch * (0.5 - COVERFLOW_PAGINATION_TUNING.directionalBias * softDirection);
  const rightStretch =
    totalStretch * (0.5 + COVERFLOW_PAGINATION_TUNING.directionalBias * softDirection);
  const slotPitch = COVERFLOW_PAGINATION_TUNING.slotSize + COVERFLOW_PAGINATION_TUNING.slotGap;

  output.position = position;
  output.x = position * slotPitch + (rightStretch - leftStretch) / 2;
  output.scaleX = 1 + stretchRatio;
  output.stretchRatio = stretchRatio;
  output.speedInCards = speedInCards;
  output.softDirection = softDirection;
  output.leftStretch = leftStretch;
  output.rightStretch = rightStretch;
  return output;
}

/**
 * Follows the nearest physical card with a narrow dead band around the midpoint. The dead band is
 * symmetric, so a reversal retraces the same small threshold instead of retaining source authority.
 */
export function resolveCoverflowVisualIndex(
  physicalIndex: number,
  currentIndex: number,
  itemCount: number,
): number {
  const maximumIndex = Math.max(0, itemCount - 1);
  const position = clamp(Number.isFinite(physicalIndex) ? physicalIndex : 0, 0, maximumIndex);
  let nextIndex = clamp(currentIndex, 0, maximumIndex);
  const boundary = 0.5 + COVERFLOW_PAGINATION_TUNING.visualHysteresis;

  while (nextIndex < maximumIndex && position >= nextIndex + boundary) {
    nextIndex += 1;
  }
  while (nextIndex > 0 && position <= nextIndex - boundary) {
    nextIndex -= 1;
  }
  return nextIndex;
}

export type CoverflowKeyboardAction = "end" | "home" | "next" | "previous";

const COVERFLOW_KEYBOARD_OWNER_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "video[controls]",
  "audio[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='combobox']",
  "[role='listbox']",
  "[data-snap-motion-keyboard-owner]",
].join(", ");

function targetOwnsCoverflowKeyboard(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  return Boolean(candidate?.closest?.(COVERFLOW_KEYBOARD_OWNER_SELECTOR));
}

export function resolveCoverflowKeyboardAction(
  event: Pick<KeyboardEvent, "key" | "target"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "metaKey">>,
): CoverflowKeyboardAction | undefined {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    targetOwnsCoverflowKeyboard(event.target)
  ) {
    return undefined;
  }

  switch (event.key) {
    case "ArrowLeft":
      return "previous";
    case "ArrowRight":
      return "next";
    case "Home":
      return "home";
    case "End":
      return "end";
    default:
      return undefined;
  }
}

export function resolveAdjacentCoverflowIndex(
  currentIndex: number,
  direction: -1 | 1,
  itemCount: number,
): number {
  return clamp(currentIndex + direction, 0, Math.max(0, itemCount - 1));
}

/**
 * Resolves visual commitment without changing horizontal position. The caller supplies a reusable
 * output object so the per-card frame path does not need another allocation.
 */
export function resolveCoverflowKinetics(
  relativePosition: number,
  velocityPxPerSecond: number,
  cardPitchPx: number,
  output: CoverflowKineticState,
): CoverflowKineticState {
  const speedInCards = resolveSpeedInCards(velocityPxPerSecond, cardPitchPx);
  const kinetic = smoothstep(
    COVERFLOW_MOTION_TUNING.kineticStartSpeed,
    COVERFLOW_MOTION_TUNING.kineticFullSpeed,
    speedInCards,
  );
  const centerInfluence =
    1 -
    smoothstep(
      COVERFLOW_MOTION_TUNING.centerInnerRadius,
      COVERFLOW_MOTION_TUNING.centerOuterRadius,
      Math.abs(relativePosition),
    );
  const kineticFocus = kinetic * centerInfluence;
  const settledness =
    1 -
    smoothstep(
      COVERFLOW_MOTION_TUNING.settledSpeedStart,
      COVERFLOW_MOTION_TUNING.settledSpeedEnd,
      speedInCards,
    );

  output.speedInCards = speedInCards;
  output.centerInfluence = centerInfluence;
  output.kinetic = kinetic;
  output.kineticFocus = kineticFocus;
  output.settledness = settledness;
  output.scaleLoss = COVERFLOW_MOTION_TUNING.maximumKineticScaleLoss * kineticFocus;
  output.recess = COVERFLOW_MOTION_TUNING.maximumKineticRecess * kineticFocus;
  output.retainedYaw =
    Math.sign(velocityPxPerSecond) * COVERFLOW_MOTION_TUNING.maximumKineticYaw * kineticFocus;
  output.contactShadowStrength =
    centerInfluence *
    settledness *
    (1 - COVERFLOW_MOTION_TUNING.maximumShadowAttenuation * kineticFocus);
  return output;
}

/**
 * Keeps low release speeds exact and compresses only the high-speed tail. Target resolution uses
 * the original pointer velocity before this release-only limiter is applied.
 */
export function resolveAutonomousReleaseVelocity(
  velocityPxPerSecond: number,
  cardPitchPx: number,
  isDragging: boolean,
): number {
  if (isDragging || !Number.isFinite(velocityPxPerSecond) || cardPitchPx <= 0) {
    return velocityPxPerSecond;
  }

  const direction = Math.sign(velocityPxPerSecond);
  const speedInCards = resolveSpeedInCards(velocityPxPerSecond, cardPitchPx);
  const { maximumFreeVelocity, releaseVelocityKnee } = COVERFLOW_MOTION_TUNING;
  if (speedInCards <= releaseVelocityKnee) {
    return velocityPxPerSecond;
  }

  const headroom = maximumFreeVelocity - releaseVelocityKnee;
  const excess = speedInCards - releaseVelocityKnee;
  const limitedSpeed = releaseVelocityKnee + headroom * (1 - Math.exp(-excess / headroom));
  return direction * Math.min(maximumFreeVelocity, limitedSpeed) * cardPitchPx;
}

/**
 * Advances the same scalar mass-spring-damper model used by the rest of the lab, with autonomous
 * acceleration and velocity limits expressed in cards rather than viewport pixels.
 */
export function advanceBoundedCoverflowSpring(
  state: MutableSpringState,
  target: number,
  spring: SpringConfiguration,
  cardPitchPx: number,
  deltaTime: number,
): void {
  if (deltaTime <= 0 || cardPitchPx <= 0) {
    return;
  }

  const maximumAcceleration = COVERFLOW_MOTION_TUNING.maximumFreeAcceleration * cardPitchPx;
  const maximumVelocity = COVERFLOW_MOTION_TUNING.maximumFreeVelocity * cardPitchPx;
  const stepCount = Math.max(1, Math.ceil(deltaTime / COVERFLOW_MOTION_TUNING.integrationStep));
  const step = deltaTime / stepCount;

  for (let index = 0; index < stepCount; index += 1) {
    const springForce = -spring.stiffness * (state.position - target);
    const dampingForce = -spring.damping * state.velocity;
    const acceleration = clamp(
      (springForce + dampingForce) / spring.mass,
      -maximumAcceleration,
      maximumAcceleration,
    );
    state.velocity = clamp(state.velocity + acceleration * step, -maximumVelocity, maximumVelocity);
    state.position += state.velocity * step;
  }
}

export function useBoundedCoverflowDriver(cardPitchPx: () => number): AnimationDriver {
  let token = 0;
  let active: ActiveSpring | undefined;

  const { pause, resume } = useRafFn(
    ({ delta }) => {
      const current = active;
      if (!current) {
        pause();
        return;
      }

      const deltaTime = Math.min(
        Math.max(0, delta / 1_000),
        COVERFLOW_MOTION_TUNING.maximumFrameDelta,
      );
      advanceBoundedCoverflowSpring(
        current.state,
        current.request.to,
        current.request.spring,
        current.pitch,
        deltaTime,
      );

      const distance = Math.abs(current.state.position - current.request.to);
      const speed = Math.abs(current.state.velocity);
      if (
        distance <= current.request.spring.restDistance &&
        speed <= current.request.spring.restSpeed
      ) {
        active = undefined;
        pause();
        current.request.onUpdate(current.request.to, 0);
        current.request.onComplete();
        return;
      }

      current.request.onUpdate(current.state.position, current.state.velocity);
    },
    { immediate: false },
  );

  return {
    animate(request) {
      const previous = active;
      active = undefined;
      if (previous) {
        previous.request.onStop?.();
      }

      const currentToken = ++token;
      const pitch = Math.max(1, cardPitchPx());
      const state = {
        position: request.from,
        velocity: resolveAutonomousReleaseVelocity(request.initialVelocity, pitch, false),
      };
      active = { token: currentToken, request, pitch, state };
      request.onUpdate(state.position, state.velocity);
      resume();

      return {
        stop() {
          const current = active;
          if (!current || current.token !== currentToken) {
            return;
          }
          active = undefined;
          pause();
          request.onStop?.();
        },
      };
    },
  };
}

export class CoverflowSettledSelection {
  settledIndex: number;
  pendingTargetIndex: number | null = null;

  readonly #itemCount: number;
  #lastAnnouncedIndex: number;
  #settlingTargetIndex: number | null = null;

  constructor(initialIndex: number, itemCount: number) {
    this.#itemCount = Math.max(1, itemCount);
    this.settledIndex = clamp(initialIndex, 0, this.#itemCount - 1);
    this.#lastAnnouncedIndex = this.settledIndex;
  }

  /**
   * Returns the index to announce only when the controller reaches idle. Drag feedback,
   * intermediate cards, obsolete targets, and autonomous retargets never write to the live region.
   */
  update(input: SettledSelectionUpdate): number | null {
    if (input.phase === "dragging") {
      this.pendingTargetIndex = null;
      this.#settlingTargetIndex = null;
      return null;
    }

    if (input.phase === "settling") {
      if (input.targetIndex !== this.#settlingTargetIndex) {
        this.#settlingTargetIndex = input.targetIndex;
        this.pendingTargetIndex = input.targetIndex;
      }
      return null;
    }

    this.pendingTargetIndex = null;
    this.#settlingTargetIndex = null;
    this.settledIndex = clamp(input.activeIndex, 0, this.#itemCount - 1);
    if (this.settledIndex === this.#lastAnnouncedIndex) {
      return null;
    }

    this.#lastAnnouncedIndex = this.settledIndex;
    return this.settledIndex;
  }
}
