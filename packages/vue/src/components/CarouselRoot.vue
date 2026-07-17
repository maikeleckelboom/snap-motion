<script setup lang="ts" generic="Id extends string">
import { createFixedStageGeometry, type ControllerSnapshot } from "@snap-motion/core";
import { computed, nextTick, provide, ref, useId, watch } from "vue";

import { useCarouselMotion } from "../use-carousel-motion";
import { carouselContextKey, type CarouselContext } from "./carousel-context";
import type { NavigationReason } from "./contracts";

const props = withDefaults(
  defineProps<{
    activeId: Id;
    ids: readonly Id[];
    keyboardInstructions?: string;
    label?: string;
    labelledby?: string;
    landmark?: boolean;
    reducedMotionOverride?: boolean;
  }>(),
  {
    keyboardInstructions:
      "Use Left and Right Arrow to move between items. Use Home and End to jump.",
    landmark: false,
  },
);

const emit = defineEmits<{
  (event: "update:activeId", id: Id): void;
  (event: "requestActiveId", id: Id, reason: NavigationReason): void;
  (event: "settled", id: Id): void;
  (event: "targetChanged", id: Id, reason: NavigationReason): void;
}>();

const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const instructionId = `snap-motion-carousel-instructions-${useId()}`;
const statusId = `snap-motion-carousel-status-${useId()}`;
const statusText = ref("");
const slideLabels = new Map<string, string>();
const reducedMotionOverride = computed(() => props.reducedMotionOverride);
let pendingReason: NavigationReason = "route";
let lastCompletedId: Id | undefined;

function moveFocusOutsideOutgoingSlide(id: Id) {
  const target = viewport.value;
  const activeElement = target?.ownerDocument.activeElement;
  if (
    typeof HTMLElement === "undefined" ||
    !(activeElement instanceof HTMLElement) ||
    !target?.contains(activeElement)
  ) {
    return;
  }
  const activeSlide = activeElement.closest<HTMLElement>("[data-slide-id]");
  if (activeSlide?.dataset.slideId !== id) {
    target.focus({ preventScroll: true });
  }
}

function measure() {
  return createFixedStageGeometry({
    itemIds: props.ids,
    viewportSize: viewport.value?.clientWidth ?? 0,
  });
}

function onControllerChange(snapshot: ControllerSnapshot<Id>) {
  if (snapshot.phase !== "idle" || !snapshot.active || snapshot.active.id === lastCompletedId) {
    return;
  }
  moveFocusOutsideOutgoingSlide(snapshot.active.id);
  lastCompletedId = snapshot.active.id;
  const label = slideLabels.get(snapshot.active.id);
  statusText.value = label ?? `${snapshot.active.order + 1} of ${snapshot.anchors.length}`;
  emit("settled", snapshot.active.id);
}

const initialGeometry = createFixedStageGeometry({
  itemIds: props.ids,
  viewportSize: 0,
});

const motion = useCarouselMotion<Id>({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  initialPosition: 0,
  initialTargetId: props.activeId,
  measure,
  onChange: onControllerChange,
  reducedMotionOverride,
  track,
  viewport,
});

function requestNavigation(id: Id, reason: NavigationReason) {
  pendingReason = reason;
  emit("targetChanged", id, reason);
  emit("requestActiveId", id, reason);
  emit("update:activeId", id);
}

function navigate(id: Id, reason: NavigationReason) {
  pendingReason = reason;
  const target = motion.moveTo(id);
  if (target) {
    requestNavigation(target.id, reason);
  }
}

function previous(reason: NavigationReason = "previous") {
  pendingReason = reason;
  const target = motion.previous();
  if (target) {
    requestNavigation(target.id, reason);
  }
}

function next(reason: NavigationReason = "next") {
  pendingReason = reason;
  const target = motion.next();
  if (target) {
    requestNavigation(target.id, reason);
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  const before = motion.targetId.value ?? motion.activeId.value;
  motion.onKeyDown(event);
  const after = motion.targetId.value ?? motion.activeId.value;
  if (event.defaultPrevented && after !== undefined && after !== before) {
    requestNavigation(after, "keyboard");
  }
}

watch(
  () => props.ids,
  async (ids) => {
    const semanticId = motion.targetId.value ?? motion.activeId.value;
    const activeElement = viewport.value?.ownerDocument.activeElement;
    const focusNeedsFallback =
      semanticId !== undefined &&
      !ids.includes(semanticId) &&
      typeof HTMLElement !== "undefined" &&
      activeElement instanceof HTMLElement &&
      viewport.value?.contains(activeElement);
    if (focusNeedsFallback) viewport.value?.focus({ preventScroll: true });
    await nextTick();
    motion.remeasure();
  },
  { deep: true },
);

watch(
  () => props.activeId,
  (id) => {
    if (id !== motion.targetId.value && id !== motion.activeId.value && props.ids.includes(id)) {
      pendingReason = "route";
      motion.moveTo(id);
      emit("targetChanged", id, "route");
    }
  },
);

provide(carouselContextKey, {
  activeId: motion.activeId,
  canNext: motion.canNext,
  canPrevious: motion.canPrevious,
  instructionId,
  navigate,
  next,
  onKeyDown,
  onPointerDown(event) {
    pendingReason = "drag";
    motion.onPointerDown(event);
  },
  onWheel(event) {
    pendingReason = "wheel";
    motion.onWheel(event);
  },
  phase: motion.phase,
  previous,
  registerSlide(id, label) {
    slideLabels.set(id, label);
  },
  registerTrack(element) {
    track.value = element;
  },
  registerViewport(element) {
    viewport.value = element;
  },
  unregisterSlide(id) {
    slideLabels.delete(id);
  },
  statusId,
  statusText,
  surfaceStyle: motion.surfaceStyle,
  trackStyle: motion.trackStyle,
} satisfies CarouselContext<Id> as unknown as CarouselContext);

defineExpose({ motion, navigate, next, previous });
</script>

<template>
  <component
    :is="landmark ? 'section' : 'div'"
    :aria-label="label"
    :aria-labelledby="labelledby"
    aria-roledescription="carousel"
    class="snap-motion-carousel"
    :role="landmark ? 'region' : 'group'"
  >
    <slot />
    <p :id="instructionId" class="snap-motion-visually-hidden">{{ keyboardInstructions }}</p>
  </component>
</template>

<style>
.snap-motion-visually-hidden {
  position: absolute !important;
  inline-size: 1px !important;
  block-size: 1px !important;
  padding: 0 !important;
  border: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
}
</style>
