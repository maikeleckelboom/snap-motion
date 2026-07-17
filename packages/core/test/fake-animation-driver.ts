import type {
  AnimationDriver,
  AnimationPlaybackControls,
  ScalarAnimationRequest,
} from "../src/animation-driver";

export interface FakeAnimationRun {
  readonly request: ScalarAnimationRequest;
  completed: boolean;
  stopped: boolean;
}

export class DeterministicAnimationDriver implements AnimationDriver {
  readonly runs: FakeAnimationRun[] = [];

  get latest(): FakeAnimationRun {
    const run = this.runs.at(-1);
    if (!run) {
      throw new Error("No animation has been requested");
    }
    return run;
  }

  animate(request: ScalarAnimationRequest): AnimationPlaybackControls {
    const run: FakeAnimationRun = { request, completed: false, stopped: false };
    this.runs.push(run);

    return {
      stop: () => {
        if (run.stopped || run.completed) return;
        run.stopped = true;
        request.onStop?.();
      },
    };
  }

  update(position: number, velocity = 0, run = this.latest): void {
    if (!run.stopped && !run.completed) {
      run.request.onUpdate(position, velocity);
    }
  }

  complete(run = this.latest): void {
    if (run.stopped || run.completed) return;
    run.completed = true;
    run.request.onUpdate(run.request.to, 0);
    run.request.onComplete();
  }
}
