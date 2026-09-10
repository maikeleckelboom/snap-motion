import { resolveStackedDeckPile } from "@snap-motion/core";
import { computed, ref } from "vue";

import { stackedDeckTransform, type StackedDeckPileLayer } from "./stacked-deck-contracts";
import {
  useStackedDeckComponentMotion,
  type UseStackedDeckMotionOptions,
  type UseStackedDeckMotionReturn,
} from "./use-stacked-deck-motion";

/** Binds the Stacked Deck model to Vue, browser input, and its compatibility pile projection. */
export function useStackedDeckMotion<Id extends string>(
  options: UseStackedDeckMotionOptions<Id>,
): UseStackedDeckMotionReturn<Id> {
  const statusIndex = ref<number | null>(null);
  const motion = useStackedDeckComponentMotion(options, (index) => (statusIndex.value = index));
  const anchorsById = computed(() => {
    const map = new Map<Id, number>();
    for (const anchor of motion.motion.snapshot.value.anchors) map.set(anchor.id, anchor.position);
    return map;
  });
  const pileLayers = computed<readonly StackedDeckPileLayer<Id>[]>(() => {
    const layers: StackedDeckPileLayer<Id>[] = [];
    for (const pose of resolveStackedDeckPile({
      frame: motion.frame.value,
      tuning: motion.tuning.value,
    })) {
      const id = motion.model.idAt(pose.itemIndex);
      if (id === undefined) continue;
      layers.push({
        id,
        index: pose.itemIndex,
        key: id,
        depth: pose.depth,
        side: pose.slot < 0 ? -1 : 1,
        slot: Number(pose.slot.toFixed(3)),
        layer: pose.layer,
        opacity: pose.opacity,
        shadowStrength: pose.shadowStrength,
        transform: stackedDeckTransform(pose),
      });
    }
    return layers;
  });
  return {
    ...motion,
    anchorsById,
    pileLayers,
    statusIndex: computed(() => statusIndex.value),
  };
}
