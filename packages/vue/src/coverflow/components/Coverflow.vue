<script setup lang="ts" generic="TItem extends { id: string }">
import type {
  ActiveIdRequestDetails,
  ElasticityOptions,
  ReleaseTargetPolicy,
  SettlementDetails,
  SpringConfiguration,
} from "@snap-motion/core";
import type { SnapMotionMessages } from "@snap-motion/vue/localization";
import type { NavigationReason } from "@snap-motion/vue/motion";
import { computed, ref, watch } from "vue";

import { preserveFocusBeforeSemanticChange } from "../../internal/accessibility/focus";
import { createEnglishSnapMotionMessages } from "../../localization/messages";
import type { CoverflowCardState } from "../coverflow-contracts";
import { useCoverflowMotion } from "../use-coverflow-motion";

type TId = TItem["id"];

const props = withDefaults(
  defineProps<{
    items: readonly TItem[];
    /** Application-authoritative semantic selection. Controlled when supplied. */
    activeId?: TId;
    label?: string;
    labelledBy?: string;
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
    fallbackStageWidth?: number;
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
    fallbackStageWidth: 1_120,
  },
);

const emit = defineEmits<{
  (event: "update:activeId", id: TId | undefined): void;
  (event: "activeIdRequest", id: TId | undefined, details: ActiveIdRequestDetails): void;
  (event: "settled", id: TId, details: SettlementDetails): void;
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
let rollbackSettlementId: TId | undefined;
const initialMechanicalId =
  props.activeId !== undefined && ids.value.includes(props.activeId)
    ? props.activeId
    : props.items[Math.floor(props.items.length / 2)]?.id;
const internalActiveId = ref<TId | undefined>(initialMechanicalId);
const semanticActiveId = computed<TId | undefined>(() => props.activeId ?? internalActiveId.value);
const rollbackAnchorId = ref<TId | undefined>(initialMechanicalId);

watch([ids, () => props.activeId] as const, ([nextIds, controlledId], previousState) => {
  if (controlledId !== undefined && nextIds.includes(controlledId)) {
    rollbackAnchorId.value = controlledId;
  } else if (controlledId === undefined && previousState?.[1] !== undefined) {
    internalActiveId.value = rollbackAnchorId.value;
  }
});

watch(ids, (nextIds, previousIds) => {
  if (props.activeId !== undefined || nextIds.includes(internalActiveId.value as TId)) return;
  const previousIndex = Math.max(0, previousIds.indexOf(internalActiveId.value as TId));
  const nextId = nextIds[Math.min(previousIndex, Math.max(0, nextIds.length - 1))];
  internalActiveId.value = nextId;
  emit("update:activeId", nextId);
  emit("activeIdRequest", nextId, { reason: "reconcile" });
});

function labelFor(item: TItem, index: number): string {
  return props.itemLabel?.(item, index) ?? item.id;
}

/** Exact application-authoritative adoption; the high-level surface always keeps it silent. */
function synchronizeTo(id: TId) {
  if (props.activeId !== undefined && id !== props.activeId) return false;
  if (props.activeId === undefined) internalActiveId.value = id;
  return coverflow.synchronizeTo(id);
}

function positionLabel(index: number): string {
  const item = props.items[index];
  return messages.value.itemPositionStatus({
    ...(item === undefined ? {} : { label: labelFor(item, index) }),
    index,
    count: props.items.length,
  });
}

function publishSettlement(id: TId, index: number, reason: NavigationReason) {
  // Reduced motion and direct synchronization can settle in the same stack as the request. Vue
  // still needs its already-scheduled prop flush before strict authority can be evaluated.
  queueMicrotask(() => {
    if (reason === "external" && rollbackSettlementId === id) {
      rollbackSettlementId = undefined;
      return;
    }
    if (props.activeId !== undefined && id !== props.activeId) {
      if (reason === "reconcile" && ids.value.includes(id)) {
        rollbackAnchorId.value = id;
        return;
      }
      const authoritativeId = rollbackAnchorId.value;
      if (authoritativeId !== undefined) {
        rollbackSettlementId = authoritativeId;
        const synchronized = coverflow.synchronizeTo(authoritativeId);
        if (!synchronized) rollbackSettlementId = undefined;
        else {
          queueMicrotask(() => {
            if (rollbackSettlementId === authoritativeId) rollbackSettlementId = undefined;
          });
        }
      }
      return;
    }
    if (reason !== "external") statusText.value = positionLabel(index);
    emit("settled", id, { reason });
  });
}

const coverflow = useCoverflowMotion<TId>({
  ids,
  controlledId: () => props.activeId,
  disabled: () => props.disabled,
  initialId: props.items[Math.floor(props.items.length / 2)]?.id,
  reducedMotionOverride,
  root: focusScope,
  stageWidth: () => props.fallbackStageWidth,
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
  onActiveIdRequest(id, _index, reason) {
    if (id === semanticActiveId.value) return;
    if (props.activeId === undefined) internalActiveId.value = id;
    emit("update:activeId", id);
    emit("activeIdRequest", id, { reason });
  },
  onSettled: publishSettlement,
});

const cards = computed<CoverflowCardState<TItem, TId>[]>(() => {
  const state = coverflow.state.value;
  return props.items.map((item, index) => ({
    item,
    id: item.id,
    index,
    active: item.id === semanticActiveId.value,
    visual: index === state.visualIndex,
    settled: index === state.settledIndex,
    inspectable: coverflow.isInspectEligible(index),
    presentation: coverflow.presentations.value[index]!,
  }));
});

const stageStyle = computed(() => ({
  "--snap-motion-coverflow-stage-width": `${Math.min(props.fallbackStageWidth, 1_280)}px`,
  "--snap-motion-coverflow-card-width": `${coverflow.tuning.value.cardWidth}px`,
  "--snap-motion-coverflow-card-height": `${coverflow.tuning.value.cardHeight}px`,
  "--snap-motion-coverflow-perspective": `${coverflow.tuning.value.perspective}px`,
}));

watch(
  () =>
    coverflow.presentations.value
      .map((presentation, index) =>
        presentation.interactive ? coverflow.model.idAt(index) : undefined,
      )
      .filter((id): id is TId => id !== undefined),
  (semanticIds) => {
    const semantic = new Set(semanticIds);
    preserveFocusBeforeSemanticChange(root.value, (activeElement) => {
      const card = activeElement.closest<HTMLElement>("[data-snap-motion-coverflow-card]");
      return card !== null && semantic.has((card.dataset.itemId ?? "") as TId);
    });
  },
  { deep: true, flush: "sync" },
);

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
  activeId: semanticActiveId,
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
  navigateTo: coverflow.navigateTo,
  root,
  settledId: coverflow.settledId,
  speedInCards: coverflow.speedInCards,
  state: coverflow.state,
  synchronizeTo,
  tuning: coverflow.tuning,
  visualId: coverflow.visualId,
});
</script>

<template>
  <component
    :is="landmark ? 'section' : 'div'"
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledBy"
    aria-roledescription="carousel"
    class="snap-motion-coverflow"
    :data-active-id="semanticActiveId"
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
        :aria-current="card.visual ? 'true' : undefined"
        :aria-hidden="card.presentation.interactive ? undefined : 'true'"
        :aria-label="positionLabel(card.index)"
        aria-roledescription="slide"
        class="snap-motion-coverflow-card"
        data-snap-motion-item
        data-snap-motion-coverflow-card
        :data-item-id="card.id"
        :data-visible="card.presentation.visible ? 'true' : 'false'"
        :data-semantic="card.presentation.interactive ? 'true' : 'false'"
        :inert="!card.presentation.interactive"
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
