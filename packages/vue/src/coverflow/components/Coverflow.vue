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
import type { CoverflowCardState } from "../coverflow-contracts";
import { useCoverflowMotion } from "../use-coverflow-motion";

const props = withDefaults(
  defineProps<{
    items: readonly TItem[];
    /** Durable selection. Controlled when supplied; it changes only at mechanical rest. */
    activeId?: TId;
    label?: string;
    labelledby?: string;
    /** Accessible name of one item. Defaults to its semantic ID. */
    itemLabel?: (item: TItem, index: number) => string;
    /** Refuses every input. Set this while another surface covers the rail. */
    disabled?: boolean;
    /** Fallback stage width, used before the rail has been measured. */
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
  /** A tap on the settled card: the request to open it on another surface. */
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

const coverflow = useCoverflowMotion<TId>({
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

const cards = computed<CoverflowCardState<TItem, TId>[]>(() =>
  props.items.map((item, index) => ({
    item,
    id: item.id,
    index,
    active: index === coverflow.visualIndex.value,
    settled: index === coverflow.settledIndex.value,
    inspectable: coverflow.isInspectEligible(index),
    presentation: coverflow.presentations.value[index]!,
  })),
);

const stageStyle = computed(() => ({
  "--snap-motion-coverflow-stage-width": `${Math.min(props.stageWidth, 1_280)}px`,
  "--snap-motion-coverflow-card-width": `${coverflow.tuning.value.cardWidth}px`,
  "--snap-motion-coverflow-card-height": `${coverflow.tuning.value.cardHeight}px`,
  "--snap-motion-coverflow-perspective": `${coverflow.tuning.value.perspective}px`,
}));

function cardStyle(card: CoverflowCardState<TItem, TId>) {
  const presentation = card.presentation;
  const flat = coverflow.motion.reducedMotion.value;
  return {
    transform: flat
      ? `translate3d(-50%, -50%, 0) translate3d(${presentation.translateX.toFixed(3)}px, 0, 0) scale(${presentation.scale.toFixed(4)})`
      : `translate3d(-50%, -50%, 0) translate3d(${presentation.translateX.toFixed(3)}px, 0, ${presentation.translateZ.toFixed(3)}px) rotateY(${presentation.rotateY.toFixed(3)}deg) scale(${presentation.scale.toFixed(4)})`,
    zIndex: presentation.zIndex,
    visibility: presentation.visible ? ("visible" as const) : ("hidden" as const),
    pointerEvents: presentation.interactive ? ("auto" as const) : ("none" as const),
    willChange: presentation.visible ? ("transform" as const) : ("auto" as const),
    "--snap-motion-coverflow-depth": presentation.depth.toFixed(4),
    "--snap-motion-coverflow-deep-rail": presentation.deepRail.toFixed(4),
    "--snap-motion-coverflow-center-influence": presentation.centerInfluence.toFixed(4),
    "--snap-motion-coverflow-kinetic-focus": presentation.kineticFocus.toFixed(4),
    "--snap-motion-coverflow-settledness": presentation.settledness.toFixed(4),
    "--snap-motion-coverflow-contact-shadow": presentation.contactShadow.toFixed(4),
    "--snap-motion-coverflow-yaw": presentation.yaw.toFixed(4),
    "--snap-motion-coverflow-sheen": presentation.sheen.toFixed(4),
    "--snap-motion-coverflow-occlusion": presentation.occlusion.toFixed(4),
    "--snap-motion-coverflow-edge-offset": `${presentation.edgeOffset.toFixed(3)}px`,
    "--snap-motion-coverflow-edge-strength": presentation.edgeStrength.toFixed(4),
  };
}

watch(
  () => props.activeId,
  (id) => {
    if (id === undefined || id === coverflow.settledId.value) return;
    coverflow.requestId(id);
  },
);

watch(
  () => props.items.length,
  () => void coverflow.remeasure(),
);

defineExpose({
  canNext: coverflow.canNext,
  canPrevious: coverflow.canPrevious,
  commandIndex: coverflow.commandIndex,
  isInspectEligible: coverflow.isInspectEligible,
  motion: coverflow.motion,
  next: coverflow.next,
  paginationIndicator: coverflow.paginationIndicator,
  pendingTargetIndex: coverflow.pendingTargetIndex,
  physicalIndex: coverflow.physicalIndex,
  pitch: coverflow.pitch,
  previous: coverflow.previous,
  requestId: coverflow.requestId,
  root,
  settledId: coverflow.settledId,
  settledIndex: coverflow.settledIndex,
  speedInCards: coverflow.speedInCards,
  synchronizeId: coverflow.synchronizeId,
  tuning: coverflow.tuning,
  visualId: coverflow.visualId,
  visualIndex: coverflow.visualIndex,
});
</script>

<template>
  <div
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledby"
    aria-roledescription="carousel"
    class="snap-motion-coverflow"
    :data-active-id="coverflow.settledId.value"
    :data-phase="coverflow.motion.phase.value"
    :data-reduced-motion="coverflow.motion.reducedMotion.value ? 'true' : 'false'"
    :data-visual-id="coverflow.visualId.value"
    :style="[stageStyle, coverflow.motion.surfaceStyle]"
    tabindex="0"
    @keydown="coverflow.onKeyDown"
    @pointerdown="coverflow.onPointerDown"
    @wheel="coverflow.onWheel"
  >
    <div ref="track" class="snap-motion-coverflow-stage">
      <article
        v-for="card in cards"
        :key="card.id"
        :aria-current="card.active ? 'true' : undefined"
        :aria-hidden="card.presentation.visible ? undefined : 'true'"
        :aria-label="positionLabel(card.index)"
        aria-roledescription="slide"
        class="snap-motion-coverflow-card"
        data-snap-motion-coverflow-card
        :data-item-id="card.id"
        :data-visible="card.presentation.visible ? 'true' : 'false'"
        :style="cardStyle(card)"
        @click.prevent
      >
        <slot name="card" v-bind="card" />
      </article>
    </div>
    <p
      aria-atomic="true"
      class="snap-motion-visually-hidden"
      data-testid="snap-motion-coverflow-status"
      role="status"
    >
      {{ statusText }}
    </p>
  </div>
</template>
