import { advanceBoundedSpring, type MutableSpringState } from "@snap-motion/core";

import type { LabPhysicsSettings } from "../fixtures/lab-types";

/** One card's width in the preview, so the engine's card-relative limits apply as they do live. */
export const PREVIEW_TRAVEL_PX = 400;
const FRAME_SECONDS = 1 / 60;
const MAX_SECONDS = 4;

export interface SpringResponse {
  /** Position as a fraction of the travel: 0 at the start, 1 at the target. */
  readonly samples: readonly { readonly time: number; readonly progress: number }[];
  /** Largest excursion past the target, as a fraction of the travel. */
  readonly overshoot: number;
  /** Seconds until the spring satisfies its own rest rule, or `undefined` if it does not in 4 s. */
  readonly settleSeconds: number | undefined;
}

/**
 * The settle of one card-width move from rest, integrated by the engine's own spring stepper and
 * stopped by the same rest rule the surfaces use (distance and speed both within their thresholds
 * on a frame). Nothing here re-implements the physics: it only samples it.
 *
 * It shows the spring alone. Release velocity, elastic edges and reduced motion are not part of it.
 */
export function sampleSpringResponse(
  settings: Pick<
    LabPhysicsSettings,
    "damping" | "mass" | "restDistance" | "restSpeed" | "stiffness"
  >,
): SpringResponse {
  const state: MutableSpringState = { position: 0, velocity: 0 };
  const samples = [{ time: 0, progress: 0 }];
  let overshoot = 0;
  let settleSeconds: number | undefined;

  for (let frame = 1; frame * FRAME_SECONDS <= MAX_SECONDS; frame += 1) {
    advanceBoundedSpring(state, PREVIEW_TRAVEL_PX, settings, PREVIEW_TRAVEL_PX, FRAME_SECONDS);
    const time = frame * FRAME_SECONDS;
    const settled =
      Math.abs(state.position - PREVIEW_TRAVEL_PX) <= settings.restDistance &&
      Math.abs(state.velocity) <= settings.restSpeed;
    const progress = settled ? 1 : state.position / PREVIEW_TRAVEL_PX;
    overshoot = Math.max(overshoot, progress - 1);
    samples.push({ time, progress });
    if (settled) {
      settleSeconds = time;
      break;
    }
  }

  return { overshoot, samples, settleSeconds };
}
