import type { SpringConfiguration } from "./types";

export interface ScalarAnimationRequest {
  readonly from: number;
  readonly to: number;
  readonly initialVelocity: number;
  readonly spring: SpringConfiguration;
  readonly onUpdate: (position: number, velocity: number) => void;
  readonly onComplete: () => void;
  readonly onStop?: () => void;
}

export interface AnimationPlaybackControls {
  stop(): void;
}

export interface AnimationDriver {
  animate(request: ScalarAnimationRequest): AnimationPlaybackControls;
}
