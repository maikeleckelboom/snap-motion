<script setup lang="ts" generic="TItem extends { id: string }">
import type {
  ElasticityOptions,
  SpringConfiguration,
  StackedDeckReleasePolicy,
} from "@snap-motion/core";
import type { SnapMotionMessages } from "@snap-motion/vue/localization";
import type { NavigationReason } from "@snap-motion/vue/motion";
import { computed, ref, watch } from "vue";

import { preserveFocusBeforeSemanticChange } from "../../internal/accessibility/focus";
import { createEnglishSnapMotionMessages } from "../../localization/messages";
import type { StackedDeckCardState, StackedDeckPileLayer } from "../stacked-deck-contracts";
import { useStackedDeckMotion } from "../use-stacked-deck-motion";

type TId = TItem["id"];

const props = withDefaults(
  defineProps<{
    items: readonly TItem[];
    /** Durable selection. Controlled when supplied; it changes only at mechanical rest. */
    activeId?: TId;
    label?: string;
    labelledby?: string;
    /** Accessible name of one card. Defaults to its semantic ID. */
    itemLabel?: (item: TItem, index: number) => string;
    /**
     * Region that already counts as holding focus. A swipe only moves focus to the stage when
     * focus was outside it, so a consumer whose controls sit beside the surface passes its own
     * container here. Defaults to the surface itself.
     */
    focusScope?: HTMLElement | undefined;
    /** Refuses every input. Set this while another surface covers the deck. */
    disabled?: boolean;
    /**
     * Publishes the deck as a landmark region rather than a plain group. Only justified when the
     * deck is a major section of the page in its own right; a labelled `group` is the default
     * because a page full of landmarks is harder to navigate than one with none.
     */
    landmark?: boolean;
    /** Fallback stage width, used before the deck has been measured. */
    stageWidth?: number;
    elasticity?: ElasticityOptions;
    messages?: Partial<SnapMotionMessages>;
    programmaticImpulse?: number;
    reducedMotionOverride?: boolean;
    /** Release policy, minus the anchor skip the deck fixes at one adjacent card. */
    releasePolicy?: StackedDeckReleasePolicy;
    spring?: SpringConfiguration;
  }>(),
  {
    disabled: false,
    landmark: false,
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
const focusScope = computed(() => props.focusScope ?? root.value);
const track = ref<HTMLElement>();
const messages = computed(() => createEnglishSnapMotionMessages(props.messages));
const ids = computed<TId[]>(() => props.items.map((item) => item.id));
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
  controlledId: () => props.activeId,
  disabled: () => props.disabled,
  initialId: props.items[Math.floor(props.items.length / 2)]?.id,
  reducedMotionOverride,
  root: focusScope,
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
  onSettled(id, index, reason) {
    statusText.value = positionLabel(index);
    emit("settled", id);
    // A settlement the application itself asked for is not a request back to the application.
    if (reason === "route" || id === props.activeId) return;
    emit("requestActiveId", id, reason);
    emit("update:activeId", id);
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

function pileItem(projection: StackedDeckPileLayer<TId>): TItem {
  const item = props.items[projection.index];
  if (item?.id !== projection.id) {
    throw new Error("Stacked Deck pile projection does not match the current item collection");
  }
  return item;
}

watch(
  () =>
    deck.frame.value.poses
      .map((pose, index) => (pose.interactive ? deck.model.idAt(index) : undefined))
      .filter((id): id is TId => id !== undefined),
  (semanticIds) => {
    const semantic = new Set(semanticIds);
    preserveFocusBeforeSemanticChange(root.value, (activeElement) => {
      const card = activeElement.closest<HTMLElement>("[data-snap-motion-stacked-deck-card]");
      return card !== null && semantic.has((card.dataset.itemId ?? "") as TId);
    });
  },
  { deep: true, flush: "sync" },
);

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
    // A layer hint is only worth its memory while something is actually moving. An idle deck
    // returns every card to `auto` rather than holding the compositor hostage.
    willChange: deck.compositing.value && pose.visible ? ("transform" as const) : ("auto" as const),
    "--snap-motion-deck-shadow-strength": pose.shadowStrength.toFixed(4),
  };
}

defineExpose({
  canNext: deck.canNext,
  canPrevious: deck.canPrevious,
  compositing: deck.compositing,
  currentId: deck.currentId,
  diagnostics: deck.diagnostics,
  frame: deck.frame,
  isInspectEligible: deck.isInspectEligible,
  next: deck.next,
  onKeyDown: deck.onKeyDown,
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
  <component
    :is="landmark ? 'section' : 'div'"
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledby"
    aria-roledescription="carousel"
    class="snap-motion-stacked-deck"
    :data-active-id="deck.currentId.value"
    :data-authority-stable="deck.state.value.authorityStable ? 'true' : 'false'"
    :data-owned="deck.owned.value ? 'true' : 'false'"
    :data-phase="deck.diagnostics.value.phase"
    :data-profile="deck.tuningProfile.value"
    :data-reduced-motion="deck.diagnostics.value.reducedMotion ? 'true' : 'false'"
    :data-settled-id="deck.settledId.value"
    :role="landmark ? 'region' : 'group'"
    :style="[stageStyle, deck.motion.surfaceStyle]"
    tabindex="0"
    @click.capture="deck.onClick"
    @keydown="deck.onKeyDown"
    @lostpointercapture="deck.onLostPointerCapture"
    @pointerdown="deck.onPointerDown"
    @wheel="deck.onWheel"
  >
    <slot name="backdrop" />
    <div ref="track" class="snap-motion-stacked-deck-stage">
      <template v-for="projection in deck.pileLayers.value" :key="projection.key">
        <div
          v-if="items[projection.index]?.id === projection.id"
          aria-hidden="true"
          class="snap-motion-stacked-deck-pile-layer"
          :data-pile-item-id="projection.id"
          :data-pile-item-index="projection.index"
          :data-pile-side="projection.side"
          :data-pile-slot="projection.slot"
          inert
          :style="{
            opacity: projection.opacity,
            transform: projection.transform,
            zIndex: projection.layer,
            '--snap-motion-deck-shadow-strength': projection.shadowStrength.toFixed(4),
          }"
        >
          <slot
            name="pile-layer"
            :item="pileItem(projection)"
            :id="projection.id"
            :index="projection.index"
            :side="projection.side"
            :slot="projection.slot"
          />
        </div>
      </template>
      <div
        v-for="card in cards"
        :key="card.id"
        :aria-current="card.active ? 'true' : undefined"
        :aria-hidden="card.active ? undefined : 'true'"
        :aria-label="positionLabel(card.index)"
        aria-roledescription="slide"
        class="snap-motion-stacked-deck-card"
        data-snap-motion-item
        data-snap-motion-stacked-deck-card
        :data-deck-interactive="card.pose.interactive ? 'true' : 'false'"
        :data-deck-layer="card.pose.layer"
        :data-deck-role="card.role"
        :data-deck-visible="card.pose.visible ? 'true' : 'false'"
        :data-item-id="card.id"
        :inert="!card.active"
        role="group"
        :style="cardStyle(card)"
      >
        <div class="snap-motion-stacked-deck-card-motion" :style="cardMotionStyle(card)">
          <slot name="card" v-bind="card" />
        </div>
      </div>
    </div>
    <p
      aria-atomic="true"
      class="snap-motion-visually-hidden"
      data-testid="snap-motion-stacked-deck-status"
      role="status"
    >
      {{ statusText }}
    </p>
  </component>
</template>
