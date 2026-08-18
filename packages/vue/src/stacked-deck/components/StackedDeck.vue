<script setup lang="ts" generic="TItem extends { id: string }">
import type {
  ActiveIdRequestDetails,
  ElasticityOptions,
  SettlementDetails,
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
    /** Application-authoritative semantic selection. Controlled when supplied. */
    activeId?: TId;
    label?: string;
    labelledBy?: string;
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
    fallbackStageWidth?: number;
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
    fallbackStageWidth: 1_120,
  },
);

const emit = defineEmits<{
  (event: "update:activeId", id: TId | undefined): void;
  (event: "activeIdRequest", id: TId | undefined, details: ActiveIdRequestDetails): void;
  (event: "settled", id: TId, details: SettlementDetails): void;
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
let rollbackSettlementId: TId | undefined;
const initialMechanicalId =
  props.activeId !== undefined && ids.value.includes(props.activeId)
    ? props.activeId
    : props.items[Math.floor(props.items.length / 2)]?.id;
const internalActiveId = ref<TId | undefined>(initialMechanicalId);
const semanticActiveId = computed<TId | undefined>(() => props.activeId ?? internalActiveId.value);
const latestValidAuthorityId = ref<TId | undefined>(
  props.activeId !== undefined && ids.value.includes(props.activeId) ? props.activeId : undefined,
);
const mechanicalAnchorId = ref<TId | undefined>(initialMechanicalId);

function resolveRollbackId(): TId | undefined {
  if (
    latestValidAuthorityId.value !== undefined &&
    ids.value.includes(latestValidAuthorityId.value)
  ) {
    return latestValidAuthorityId.value;
  }
  return mechanicalAnchorId.value !== undefined && ids.value.includes(mechanicalAnchorId.value)
    ? mechanicalAnchorId.value
    : ids.value[Math.floor(ids.value.length / 2)];
}

watch(
  [ids, () => props.activeId] as const,
  ([nextIds, controlledId], previousState) => {
    if (controlledId !== undefined && nextIds.includes(controlledId)) {
      latestValidAuthorityId.value = controlledId;
      mechanicalAnchorId.value = controlledId;
    } else if (controlledId === undefined && previousState?.[1] !== undefined) {
      const releasedId = resolveRollbackId();
      internalActiveId.value = releasedId;
      if (releasedId !== undefined) deck.synchronizeTo(releasedId);
      // The released authority may seed uncontrolled state, but it belongs to the completed
      // controlled ownership epoch and must never outrank later uncontrolled navigation.
      latestValidAuthorityId.value = undefined;
    }
  },
  { flush: "sync" },
);

watch(ids, (nextIds, previousIds) => {
  if (props.activeId !== undefined || nextIds.includes(internalActiveId.value as TId)) return;
  const previousIndex = Math.max(0, previousIds.indexOf(internalActiveId.value as TId));
  const nextId = nextIds[Math.min(previousIndex, Math.max(0, nextIds.length - 1))];
  internalActiveId.value = nextId;
  mechanicalAnchorId.value = nextId;
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
  mechanicalAnchorId.value = id;
  if (id === props.activeId) latestValidAuthorityId.value = id;
  return deck.synchronizeTo(id);
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
      if (reason === "reconcile" && ids.value.includes(id) && !ids.value.includes(props.activeId)) {
        mechanicalAnchorId.value = id;
        return;
      }
      const authoritativeId = resolveRollbackId();
      if (authoritativeId !== undefined) {
        rollbackSettlementId = authoritativeId;
        const synchronized = deck.synchronizeTo(authoritativeId);
        if (!synchronized) rollbackSettlementId = undefined;
        else {
          queueMicrotask(() => {
            if (rollbackSettlementId === authoritativeId) rollbackSettlementId = undefined;
          });
        }
      }
      return;
    }
    mechanicalAnchorId.value = id;
    if (reason !== "external") statusText.value = positionLabel(index);
    emit("settled", id, { reason });
  });
}

const deck = useStackedDeckMotion<TId>({
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
    if (props.activeId === undefined) {
      internalActiveId.value = id;
      // Accepted uncontrolled semantics immediately become this epoch's valid mechanical anchor,
      // even while the spring that will settle there is still in flight.
      mechanicalAnchorId.value = id;
    }
    emit("update:activeId", id);
    emit("activeIdRequest", id, { reason });
  },
  onSettled: publishSettlement,
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
      active: item.id === semanticActiveId.value,
      visual: index === state.currentIndex,
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
  "--snap-motion-deck-stage-width": `${Math.min(props.fallbackStageWidth, 1_280)}px`,
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
  activeId: semanticActiveId,
  canNext: deck.canNext,
  canPrevious: deck.canPrevious,
  compositing: deck.compositing,
  visualId: deck.visualId,
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
  navigateTo: deck.navigateTo,
  root,
  settledId: deck.settledId,
  speedInCards: deck.speedInCards,
  state: deck.state,
  synchronizeTo,
  tuning: deck.tuning,
  tuningProfile: deck.tuningProfile,
});
</script>

<template>
  <component
    :is="landmark ? 'section' : 'div'"
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledBy"
    aria-roledescription="carousel"
    class="snap-motion-stacked-deck"
    :data-active-id="semanticActiveId"
    :data-authority-stable="deck.state.value.authorityStable ? 'true' : 'false'"
    :data-owned="deck.owned.value ? 'true' : 'false'"
    :data-phase="deck.diagnostics.value.phase"
    :data-profile="deck.tuningProfile.value"
    :data-reduced-motion="deck.diagnostics.value.reducedMotion ? 'true' : 'false'"
    :data-settled-id="deck.settledId.value"
    :data-visual-id="deck.visualId.value"
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
        :aria-current="card.visual ? 'true' : undefined"
        :aria-hidden="card.pose.interactive ? undefined : 'true'"
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
        :inert="!card.pose.interactive"
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
