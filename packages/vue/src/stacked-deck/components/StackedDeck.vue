<script setup lang="ts" generic="TId extends string, TItem extends { id: TId }">
import type {
  ElasticityOptions,
  ReleaseTargetPolicy,
  SpringConfiguration,
} from "@snap-motion/core";
import { computed, ref, watch } from "vue";

import {
  createEnglishSnapMotionMessages,
  type SnapMotionMessages,
} from "../../localization/messages";
import type { NavigationReason } from "../../motion/motion-contracts";
import type { StackedDeckCardState } from "../stacked-deck-contracts";
import { useStackedDeckMotion } from "../use-stacked-deck-motion";

const props = withDefaults(
  defineProps<{
    items: readonly TItem[];
    /** Durable selection. Controlled when supplied; it changes only at mechanical rest. */
    activeId?: TId;
    label?: string;
    labelledby?: string;
    /** Accessible name of one card. Defaults to its semantic ID. */
    itemLabel?: (item: TItem, index: number) => string;
    /** Refuses every input. Set this while another surface covers the deck. */
    disabled?: boolean;
    /** Fallback stage width, used before the deck has been measured. */
    stageWidth?: number;
    elasticity?: ElasticityOptions;
    messages?: Partial<SnapMotionMessages>;
    programmaticImpulse?: number;
    reducedMotionOverride?: boolean;
    releasePolicy?: Partial<ReleaseTargetPolicy>;
    spring?: SpringConfiguration;
  }>(),
  {
    disabled: false,
    stageWidth: 1_120,
  },
);

const emit = defineEmits<{
  (event: "update:activeId", id: TId): void;
  (event: "requestActiveId", id: TId, reason: NavigationReason): void;
  (event: "settled", id: TId): void;
  /** A tap on the current, unambiguous card: the request to open it on another surface. */
  (event: "activate", item: TItem, index: number): void;
}>();

const root = ref<HTMLElement>();
const track = ref<HTMLElement>();
const messages = computed(() => createEnglishSnapMotionMessages(props.messages));
const ids = computed(() => props.items.map((item) => item.id));
const reducedMotionOverride = computed(() => props.reducedMotionOverride);
const statusText = ref("");

function labelFor(item: TItem, index: number): string {
  return props.itemLabel?.(item, index) ?? item.id;
}

function positionLabel(index: number): string {
  const item = props.items[index];
  return messages.value.itemPositionStatus({
    ...(item === undefined ? {} : { label: labelFor(item, index) }),
    index,
    count: props.items.length,
  });
}

const deck = useStackedDeckMotion<TId>({
  ids,
  disabled: () => props.disabled,
  initialId: props.activeId ?? props.items[Math.floor(props.items.length / 2)]?.id,
  reducedMotionOverride,
  root,
  stageWidth: () => props.stageWidth,
  track,
  viewport: root,
  elasticity: () => props.elasticity,
  programmaticImpulse: () => props.programmaticImpulse,
  releasePolicy: () => props.releasePolicy,
  spring: () => props.spring,
  onActivate(_id, index) {
    const item = props.items[index];
    if (item) emit("activate", item, index);
  },
  onSettled(id, index) {
    statusText.value = positionLabel(index);
    emit("settled", id);
    if (id !== props.activeId) {
      emit("requestActiveId", id, "drag");
      emit("update:activeId", id);
    }
  },
});

const cards = computed<StackedDeckCardState<TItem, TId>[]>(() => {
  const frame = deck.frame.value;
  const state = deck.state.value;
  return props.items.map((item, index) => {
    const pose = frame.poses[index]!;
    return {
      item,
      id: item.id,
      index,
      active: index === state.currentIndex,
      settled: index === state.settledIndex,
      inspectable: deck.isInspectEligible(index),
      role: pose.role,
      pose,
    };
  });
});

const stageStyle = computed(() => ({
  "--snap-motion-deck-stage-width": `${Math.min(props.stageWidth, 1_280)}px`,
  "--snap-motion-deck-card-width": `${deck.tuning.value.cardWidth}px`,
  "--snap-motion-deck-card-height": `${deck.tuning.value.cardHeight}px`,
}));

function cardStyle(card: StackedDeckCardState<TItem, TId>) {
  return {
    opacity: card.pose.opacity,
    zIndex: card.pose.layer,
    visibility: card.pose.visible ? ("visible" as const) : ("hidden" as const),
  };
}

function cardMotionStyle(card: StackedDeckCardState<TItem, TId>) {
  const pose = card.pose;
  return {
    pointerEvents: pose.interactive ? ("auto" as const) : ("none" as const),
    transform: `translate3d(-50%, -50%, 0) translate3d(${pose.translateX.toFixed(3)}px, ${pose.translateY.toFixed(3)}px, 0) scale(${pose.scale.toFixed(5)}) rotate(${pose.rotate.toFixed(3)}deg)`,
    transformOrigin: "center center",
    willChange: pose.visible ? ("transform" as const) : ("auto" as const),
    "--snap-motion-deck-shadow-strength": pose.shadowStrength.toFixed(4),
  };
}

watch(
  () => props.activeId,
  (id) => {
    if (id === undefined || id === deck.settledId.value) return;
    deck.requestId(id);
  },
);

watch(
  () => props.items.length,
  () => void deck.remeasure(),
);

defineExpose({
  canNext: deck.canNext,
  canPrevious: deck.canPrevious,
  currentId: deck.currentId,
  frame: deck.frame,
  isInspectEligible: deck.isInspectEligible,
  motion: deck.motion,
  next: deck.next,
  owned: deck.owned,
  paginationIndicator: deck.paginationIndicator,
  physicalIndex: deck.physicalIndex,
  pitch: deck.pitch,
  previous: deck.previous,
  requestId: deck.requestId,
  root,
  settledId: deck.settledId,
  speedInCards: deck.speedInCards,
  state: deck.state,
  synchronizeId: deck.synchronizeId,
  tuning: deck.tuning,
  tuningProfile: deck.tuningProfile,
});
</script>

<template>
  <div
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledby"
    aria-roledescription="carousel"
    class="snap-motion-stacked-deck"
    :data-active-id="deck.currentId.value"
    :data-authority-stable="deck.state.value.authorityStable ? 'true' : 'false'"
    :data-owned="deck.owned.value ? 'true' : 'false'"
    :data-phase="deck.motion.phase.value"
    :data-profile="deck.tuningProfile.value"
    :data-reduced-motion="deck.motion.reducedMotion.value ? 'true' : 'false'"
    :data-settled-id="deck.settledId.value"
    :style="[stageStyle, deck.motion.surfaceStyle]"
    tabindex="0"
    @keydown="deck.onKeyDown"
    @lostpointercapture="deck.onLostPointerCapture"
    @pointerdown="deck.onPointerDown"
    @wheel="deck.onWheel"
  >
    <slot name="backdrop" />
    <div ref="track" class="snap-motion-stacked-deck-stage">
      <div
        v-for="layer in deck.pileLayers.value"
        :key="layer.key"
        aria-hidden="true"
        class="snap-motion-stacked-deck-pile-layer"
        :data-pile-layer="layer.layer"
        :data-pile-opacity="layer.opacity"
        :data-pile-side="layer.side"
        :data-pile-slot="layer.slot"
        :style="{
          opacity: layer.opacity,
          transform: layer.transform,
          zIndex: layer.layer,
          '--snap-motion-deck-shadow-strength': layer.shadowStrength.toFixed(4),
        }"
      />
      <article
        v-for="card in cards"
        :key="card.id"
        :aria-current="card.active ? 'true' : undefined"
        :aria-hidden="card.active ? undefined : 'true'"
        :aria-label="positionLabel(card.index)"
        aria-roledescription="slide"
        class="snap-motion-stacked-deck-card"
        data-snap-motion-stacked-deck-card
        :data-deck-interactive="card.pose.interactive ? 'true' : 'false'"
        :data-deck-layer="card.pose.layer"
        :data-deck-role="card.role"
        :data-deck-visible="card.pose.visible ? 'true' : 'false'"
        :data-item-id="card.id"
        :style="cardStyle(card)"
        @click.prevent
      >
        <div class="snap-motion-stacked-deck-card-motion" :style="cardMotionStyle(card)">
          <slot name="card" v-bind="card" />
        </div>
      </article>
    </div>
    <p
      aria-atomic="true"
      class="snap-motion-visually-hidden"
      data-testid="snap-motion-stacked-deck-status"
      role="status"
    >
      {{ statusText }}
    </p>
  </div>
</template>
