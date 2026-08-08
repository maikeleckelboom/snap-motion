export { default as StackedDeck } from "./components/StackedDeck.vue";
export type {
  StackedDeckCardState,
  StackedDeckPileLayer,
  StackedDeckPose,
  StackedDeckRole,
} from "./stacked-deck-contracts";
export { useStackedDeckMotion } from "./use-stacked-deck-motion";
export type {
  StackedDeckHandle,
  UseStackedDeckMotionOptions,
  UseStackedDeckMotionReturn,
} from "./use-stacked-deck-motion";
export type { NavigationReason } from "../motion/motion-contracts";
