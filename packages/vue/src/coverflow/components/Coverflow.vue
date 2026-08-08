<script setup lang="ts" generic="TItem extends { id: string }">
import type {
  ElasticityOptions,
  ReleaseTargetPolicy,
  SpringConfiguration,
} from "@snap-motion/core";
import { computed, ref } from "vue";

import {
  createEnglishSnapMotionMessages,
  type SnapMotionMessages,
} from "../../localization/messages";
import type { NavigationReason } from "../../motion/motion-contracts";
import type { CoverflowCardState } from "../coverflow-contracts";
import { useCoverflowMotion } from "../use-coverflow-motion";

type TId = TItem["id"];

const props = withDefaults(
  defineProps<{
    items: readonly TItem[];
    /** Durable selection. Controlled when supplied; it changes only at mechanical rest. */
    activeId?: TId;
    label?: string;
    labelledby?: string;
    /** Accessible name of one item. Defaults to its semantic ID. */
    itemLabel?: (item: TItem, index: number) => string;
    /**
     * Region that already counts as holding focus. A swipe only moves focus to the stage when
     * focus was outside it, so a consumer whose controls sit beside the surface passes its own
     * container here. Defaults to the surface itself.
     */
    focusScope?: HTMLElement | undefined;
    /** Refuses every input. Set this while another surface covers the rail. */
    disabled?: boolean;
    /**
     * Publishes the rail as a landmark region rather than a plain group. Only justified when the
     * rail is a major section of the page in its own right; a labelled `group` is the default
     * because a page full of landmarks is harder to navigate than one with none.
     */
    landmark?: boolean;
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
    landmark: false,
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

const coverflow = useCoverflowMotion<TId>({
  ids,
  controlledId: () => props.activeId,
  disabled: () => props.disabled,
  initialId: props.activeId ?? props.items[Math.floor(props.items.length / 2)]?.id,
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

const cards = computed<CoverflowCardState<TItem, TId>[]>(() => {
  const state = coverflow.state.value;
  return props.items.map((item, index) => ({
    item,
    id: item.id,
    index,
    active: index === state.visualIndex,
    settled: index === state.settledIndex,
    inspectable: coverflow.isInspectEligible(index),
    presentation: coverflow.presentations.value[index]!,
  }));
});

const stageStyle = computed(() => ({
  "--snap-motion-coverflow-stage-width": `${Math.min(props.stageWidth, 1_280)}px`,
  "--snap-motion-coverflow-card-width": `${coverflow.tuning.value.cardWidth}px`,
  "--snap-motion-coverflow-card-height": `${coverflow.tuning.value.cardHeight}px`,
  "--snap-motion-coverflow-perspective": `${coverflow.tuning.value.perspective}px`,
}));

function cardStyle(card: CoverflowCardState<TItem, TId>) {
  const presentation = card.presentation;
  const flat = coverflow.diagnostics.value.reducedMotion;
  return {
    transform: flat
      ? `translate3d(-50%, -50%, 0) translate3d(${presentation.translateX.toFixed(3)}px, 0, 0) scale(${presentation.scale.toFixed(4)})`
      : `translate3d(-50%, -50%, 0) translate3d(${presentation.translateX.toFixed(3)}px, 0, ${presentation.translateZ.toFixed(3)}px) rotateY(${presentation.rotateY.toFixed(3)}deg) scale(${presentation.scale.toFixed(4)})`,
    zIndex: presentation.zIndex,
    visibility: presentation.visible ? ("visible" as const) : ("hidden" as const),
    pointerEvents: presentation.interactive ? ("auto" as const) : ("none" as const),
    // A layer hint is only worth its memory while something is actually moving. An idle rail
    // returns every card to `auto` rather than holding the compositor hostage.
    willChange:
      coverflow.compositing.value && presentation.visible
        ? ("transform" as const)
        : ("auto" as const),
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

defineExpose({
  canNext: coverflow.canNext,
  canPrevious: coverflow.canPrevious,
  compositing: coverflow.compositing,
  diagnostics: coverflow.diagnostics,
  isInspectEligible: coverflow.isInspectEligible,
  next: coverflow.next,
  onKeyDown: coverflow.onKeyDown,
  paginationIndicator: coverflow.paginationIndicator,
  physicalIndex: coverflow.physicalIndex,
  presentations: coverflow.presentations,
  pitch: coverflow.pitch,
  previous: coverflow.previous,
  requestId: coverflow.requestId,
  root,
  settledId: coverflow.settledId,
  speedInCards: coverflow.speedInCards,
  state: coverflow.state,
  synchronizeId: coverflow.synchronizeId,
  tuning: coverflow.tuning,
  visualId: coverflow.visualId,
});
</script>

<template>
  <component
    :is="landmark ? 'section' : 'div'"
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledby"
    aria-roledescription="carousel"
    class="snap-motion-coverflow"
    :data-active-id="coverflow.settledId.value"
    :data-phase="coverflow.diagnostics.value.phase"
    :data-reduced-motion="coverflow.diagnostics.value.reducedMotion ? 'true' : 'false'"
    :data-visual-id="coverflow.visualId.value"
    :role="landmark ? 'region' : 'group'"
    :style="[stageStyle, coverflow.motion.surfaceStyle]"
    tabindex="0"
    @click.capture="coverflow.onClick"
    @keydown="coverflow.onKeyDown"
    @lostpointercapture="coverflow.onLostPointerCapture"
    @pointerdown="coverflow.onPointerDown"
    @wheel="coverflow.onWheel"
  >
    <div ref="track" class="snap-motion-coverflow-stage">
      <div
        v-for="card in cards"
        :key="card.id"
        :aria-current="card.active ? 'true' : undefined"
        :aria-hidden="card.presentation.visible ? undefined : 'true'"
        :aria-label="positionLabel(card.index)"
        aria-roledescription="slide"
        class="snap-motion-coverflow-card"
        data-snap-motion-item
        data-snap-motion-coverflow-card
        :data-item-id="card.id"
        :data-visible="card.presentation.visible ? 'true' : 'false'"
        :inert="!card.presentation.visible"
        role="group"
        :style="cardStyle(card)"
      >
        <slot name="card" v-bind="card" />
      </div>
    </div>
    <p
      aria-atomic="true"
      class="snap-motion-visually-hidden"
      data-testid="snap-motion-coverflow-status"
      role="status"
    >
      {{ statusText }}
    </p>
  </component>
</template>
