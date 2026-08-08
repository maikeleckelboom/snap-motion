import {
  CoverflowModel,
  SettledSelection,
  SnapController,
  STACKED_DECK_ANCHOR_SKIP,
  STACKED_DECK_INTERIOR_ELASTICITY,
  StackedDeckModel,
  createFixedStageGeometry,
  resolveCoverflowTuning,
  type AnimationDriver,
  type StackedDeckReleasePolicy,
} from "@snap-motion/core";

const ids = ["overview", "system", "outcome"] as const;
type Id = (typeof ids)[number];
const driver: AnimationDriver = {
  animate: ({ onComplete }) => {
    onComplete();
    return { stop() {} };
  },
};
const geometry = createFixedStageGeometry({ itemIds: ids, viewportSize: 800 });
const controller = new SnapController<Id>({
  anchors: geometry.anchors,
  bounds: geometry.bounds,
  driver,
  initialTargetId: "system",
});
controller.moveTo("outcome");

const deck = new StackedDeckModel({ ids, initialId: "system" });
deck.resolveAbsoluteCommand(deck.indexOf("outcome"), { atRest: true, owned: false });
const rail = new CoverflowModel({ ids });
rail.resolveRelativeCommand(1, { owned: false });
new SettledSelection(0, ids.length).adopt(1, { announce: true });
resolveCoverflowTuning({ stageWidth: 1_120 });
void STACKED_DECK_INTERIOR_ELASTICITY;
void STACKED_DECK_ANCHOR_SKIP;

const deckRelease: StackedDeckReleasePolicy = {
  flingVelocity: 320,
  projectionSeconds: 0.12,
};
void deckRelease;

// @ts-expect-error Semantic IDs are strings.
createFixedStageGeometry({ itemIds: [1, 2], viewportSize: 800 });
