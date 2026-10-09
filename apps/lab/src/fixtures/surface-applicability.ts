import { STACKED_DECK_ANCHOR_SKIP } from "@snap-motion/core";

import type { InapplicablePhysicsSetting, LabPhysicsSettings } from "./lab-types";

/**
 * Shared physics settings a surface fixes or ignores. The stored value stays untouched, so every
 * other surface keeps using it. Kept apart from the demo registry so a host that mounts only some
 * surfaces does not import every fixture to read it.
 */
export type NotApplicablePhysics = Partial<
  Record<keyof LabPhysicsSettings, InapplicablePhysicsSetting>
>;

export const stackedDeckNotApplicablePhysics: NotApplicablePhysics = {
  maxAnchorSkip: {
    effectiveValue: STACKED_DECK_ANCHOR_SKIP,
    reason: `Fixed at ${STACKED_DECK_ANCHOR_SKIP} by the stacked deck: one interaction exchanges one adjacent screen. Other surfaces keep using the stored value.`,
  },
};
