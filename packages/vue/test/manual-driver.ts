import type {
  AnimationDriver,
  AnimationPlaybackControls,
  ScalarAnimationRequest,
} from "@snap-motion/core";

export interface ManualAnimation {
  complete: () => void;
  request: ScalarAnimationRequest;
  stop: () => void;
  stopped: boolean;
  update: (position: number, velocity: number) => void;
}

export class ManualAnimationDriver implements AnimationDriver {
  readonly animations: ManualAnimation[] = [];

  get latest() {
    return this.animations.at(-1);
  }

  animate(request: ScalarAnimationRequest): AnimationPlaybackControls {
    const animation: ManualAnimation = {
      request,
      stopped: false,
      complete: () => request.onComplete(),
      stop: () => {
        animation.stopped = true;
        request.onStop?.();
      },
      update: (position, velocity) => request.onUpdate(position, velocity),
    };
    this.animations.push(animation);
    return { stop: animation.stop };
  }
}
