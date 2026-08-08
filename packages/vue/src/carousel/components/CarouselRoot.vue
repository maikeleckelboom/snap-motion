<script setup lang="ts" generic="Id extends string">
import { createFixedStageGeometry, type ControllerSnapshot } from "@snap-motion/core";
import type { SnapMotionMessages } from "@snap-motion/vue/localization";
import type { NavigationReason } from "@snap-motion/vue/motion";
import { useEventListener, useMutationObserver } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, provide, ref, useId, watch, watchEffect } from "vue";

import { createEnglishSnapMotionMessages } from "../../localization/messages";
import { carouselContextKey, type CarouselContext } from "../carousel-context";
import type { CarouselKeyboardScope, SnapMotionDirection } from "../carousel-contracts";
import {
  createFixedStageCarouselGeometryStrategy,
  type CarouselGeometryStrategy,
} from "../carousel-geometry";
import {
  carouselOwnsScopedKeyboardEvent,
  registerDialogCarousel,
  resolveCarouselKeyboardTarget,
} from "../carousel-keyboard";
import { carouselKeyAction } from "../carousel-keyboard";
import { useCarouselMotion } from "../use-carousel-motion";

const props = withDefaults(
  defineProps<{
    activeId: Id;
    direction?: SnapMotionDirection;
    geometryStrategy?: CarouselGeometryStrategy<Id>;
    ids: readonly Id[];
    keyboardInstructions?: string;
    keyboardNavigation?: boolean;
    keyboardPrimary?: boolean;
    keyboardScope?: CarouselKeyboardScope;
    label?: string;
    labelledby?: string;
    landmark?: boolean;
    messages?: Partial<SnapMotionMessages>;
    reducedMotionOverride?: boolean;
  }>(),
  {
    direction: "auto",
    keyboardNavigation: true,
    keyboardPrimary: false,
    keyboardScope: "auto",
    landmark: false,
  },
);

const emit = defineEmits<{
  (event: "update:activeId", id: Id): void;
  (event: "requestActiveId", id: Id, reason: NavigationReason): void;
  (event: "settled", id: Id): void;
  (event: "targetChanged", id: Id, reason: NavigationReason): void;
}>();

const root = ref<HTMLElement>();
const viewport = ref<HTMLElement>();
const track = ref<HTMLElement>();
const instructionId = `snap-motion-carousel-instructions-${useId()}`;
const statusId = `snap-motion-carousel-status-${useId()}`;
const statusText = ref("");
const slideRegistrations = new Map<Id, { element?: HTMLElement; label: string }>();
const reducedMotionOverride = computed(() => props.reducedMotionOverride);
const requestedDirection = computed(() => props.direction);
const contentDirection = ref<"ltr" | "rtl">(props.direction === "rtl" ? "rtl" : "ltr");
const rootStyle = computed(() => ({
  "--snap-motion-content-direction": contentDirection.value,
}));
const ids = computed(() => props.ids);
const messages = computed(() => createEnglishSnapMotionMessages(props.messages));
const defaultGeometryStrategy = createFixedStageCarouselGeometryStrategy<Id>();
const intendedId = ref<Id>(props.activeId);
let latestSnapshot: ControllerSnapshot<Id>;
let targetGeneration = 0;
let settledGeneration = 0;
let settleCheckQueued = false;
let unmounted = false;

function refreshContentDirection() {
  if (props.direction !== "auto") {
    contentDirection.value = props.direction;
    return;
  }
  const target = root.value;
  contentDirection.value =
    target?.ownerDocument.defaultView?.getComputedStyle(target).direction === "rtl" ? "rtl" : "ltr";
}

const directionObservationRoot = computed(() => root.value?.ownerDocument.documentElement);
useMutationObserver(directionObservationRoot, refreshContentDirection, {
  attributes: true,
  attributeFilter: ["class", "dir"],
  subtree: true,
});
watch([requestedDirection, root], () => void nextTick(refreshContentDirection), {
  immediate: true,
});

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
  if (activeSlide?.dataset.slideId !== id) target.focus({ preventScroll: true });
}

function measure() {
  const surface = viewport.value;
  if (!surface) {
    return createFixedStageGeometry({ itemIds: props.ids, viewportSize: 0 });
  }
  const slides = new Map<Id, HTMLElement>();
  for (const [id, registration] of slideRegistrations) {
    if (registration.element) slides.set(id, registration.element);
  }
  return (props.geometryStrategy ?? defaultGeometryStrategy).measure({
    ids: props.ids,
    slides,
    viewport: surface,
    ...(track.value ? { track: track.value } : {}),
  });
}

function publishSettlement() {
  settleCheckQueued = false;
  const snapshot = latestSnapshot;
  const active = snapshot.active;
  if (
    snapshot.phase !== "idle" ||
    !active ||
    active.id !== intendedId.value ||
    settledGeneration === targetGeneration
  ) {
    return;
  }
  moveFocusOutsideOutgoingSlide(active.id);
  settledGeneration = targetGeneration;
  const label = slideRegistrations.get(active.id)?.label;
  statusText.value = messages.value.itemStatus({
    id: active.id,
    index: active.order,
    count: snapshot.anchors.length,
    ...(label ? { label } : {}),
  });
  emit("settled", active.id);
}

function onControllerChange(snapshot: ControllerSnapshot<Id>) {
  latestSnapshot = snapshot;
  if (snapshot.phase === "idle" && !settleCheckQueued) {
    settleCheckQueued = true;
    queueMicrotask(publishSettlement);
  }
}

function acceptTarget(id: Id, reason: NavigationReason, userOriginated: boolean) {
  if (id === intendedId.value) return false;
  intendedId.value = id;
  targetGeneration += 1;
  emit("targetChanged", id, reason);
  if (userOriginated) {
    emit("requestActiveId", id, reason);
    emit("update:activeId", id);
  }
  return true;
}

const initialGeometry = createFixedStageGeometry({ itemIds: props.ids, viewportSize: 0 });
const motion = useCarouselMotion<Id>({
  anchors: initialGeometry.anchors,
  bounds: initialGeometry.bounds,
  direction: requestedDirection,
  initialPosition: 0,
  initialTargetId: props.activeId,
  measure,
  onChange: onControllerChange,
  onTargetSelected(id, reason) {
    acceptTarget(id, reason, true);
  },
  reducedMotionOverride,
  track,
  viewport,
});

function scheduleRemeasure() {
  void nextTick(() => {
    if (!unmounted) motion.remeasure();
  });
}

function navigateWithReason(id: Id, reason: NavigationReason, userOriginated = true): boolean {
  if (!props.ids.includes(id) || !acceptTarget(id, reason, userOriginated)) return false;
  motion.moveTo(id);
  return true;
}

/** Public imperative navigation has one truthful provenance. */
function navigate(id: Id): boolean {
  return navigateWithReason(id, "programmatic");
}

/** Internal picker navigation used by pagination controls and slots. */
function pick(id: Id): boolean {
  return navigateWithReason(id, "picker");
}

function adjacentId(direction: -1 | 1): Id | undefined {
  const index = props.ids.indexOf(intendedId.value);
  return index < 0 ? undefined : props.ids[index + direction];
}

function previous(): boolean {
  const id = adjacentId(-1);
  return id !== undefined && navigateWithReason(id, "previous");
}

function next(): boolean {
  const id = adjacentId(1);
  return id !== undefined && navigateWithReason(id, "next");
}

function onKeyDown(event: KeyboardEvent) {
  if (effectiveKeyboardScope.value === "off") return;
  // Asked, never remembered. `auto` resolves against computed style, which nothing reactive
  // tracks, so a carousel that mirrored its keys off the memoized direction would keep mirroring
  // by whatever the page happened to be when it first rendered.
  const action = carouselKeyAction(event, motion.resolveDirection());
  if (!action) return;
  const id =
    action === "home"
      ? props.ids[0]
      : action === "end"
        ? props.ids.at(-1)
        : adjacentId(action === "previous" ? -1 : 1);
  if (id === undefined || id === intendedId.value) return;
  if (navigateWithReason(id, "keyboard")) event.preventDefault();
}

const effectiveKeyboardScope = computed<CarouselKeyboardScope>(() =>
  props.keyboardNavigation ? props.keyboardScope : "off",
);
const keyboardTarget = computed(() =>
  resolveCarouselKeyboardTarget(root.value, effectiveKeyboardScope.value),
);

useEventListener(keyboardTarget, "keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  const rootElement = root.value;
  if (!rootElement || !carouselOwnsScopedKeyboardEvent(rootElement, event)) return;
  onKeyDown(event);
});

watchEffect((onCleanup) => {
  const target = keyboardTarget.value;
  if (typeof HTMLDialogElement === "undefined" || !(target instanceof HTMLDialogElement)) return;
  onCleanup(
    registerDialogCarousel(target, {
      primary: () => props.keyboardPrimary,
      root: root.value!,
    }),
  );
});

watch(
  [() => JSON.stringify(props.ids), () => props.activeId] as const,
  async ([idsKey, controlledId], priorState) => {
    const nextIds = props.ids;
    const idsChanged = priorState === undefined || idsKey !== priorState[0];
    const controlledChanged = priorState !== undefined && controlledId !== priorState[1];
    if (!idsChanged && !controlledChanged) return;

    const activeElement = viewport.value?.ownerDocument.activeElement;
    const focusNeedsFallback =
      !nextIds.includes(intendedId.value) &&
      typeof HTMLElement !== "undefined" &&
      activeElement instanceof HTMLElement &&
      viewport.value?.contains(activeElement);
    if (focusNeedsFallback) viewport.value?.focus({ preventScroll: true });
    motion.interrupt();
    await nextTick();
    if (unmounted) return;
    if (nextIds.includes(controlledId)) {
      acceptTarget(controlledId, "route", false);
      motion.controller.remeasure({ ...measure(), activeId: controlledId });
      return;
    }
    const target = motion.remeasure();
    if (target && target.id !== intendedId.value) acceptTarget(target.id, "route", false);
  },
);

watch(() => props.geometryStrategy, scheduleRemeasure);

provide(carouselContextKey, {
  activeId: motion.activeId,
  canNext: motion.canNext,
  canPrevious: motion.canPrevious,
  count: computed(() => props.ids.length),
  direction: motion.direction,
  ids,
  instructionId,
  messages,
  next,
  onKeyDown,
  onPointerDown: motion.onPointerDown,
  onWheel: motion.onWheel,
  phase: motion.phase,
  pick,
  previous,
  request: navigate,
  registerSlide(id, label, element) {
    slideRegistrations.set(id as Id, { label, ...(element ? { element } : {}) });
    if (element) scheduleRemeasure();
  },
  registerTrack(element) {
    track.value = element;
  },
  registerViewport(element) {
    viewport.value = element;
  },
  unregisterSlide(id) {
    slideRegistrations.delete(id as Id);
  },
  statusId,
  statusText,
  surfaceStyle: motion.surfaceStyle,
  trackStyle: motion.trackStyle,
} satisfies CarouselContext<Id> as unknown as CarouselContext);

defineExpose({ motion, navigate, next, previous });

onBeforeUnmount(() => {
  unmounted = true;
});
</script>

<template>
  <component
    :is="landmark ? 'section' : 'div'"
    ref="root"
    :aria-label="label"
    :aria-labelledby="labelledby"
    aria-roledescription="carousel"
    class="snap-motion-carousel"
    data-snap-motion-carousel-root
    :data-snap-motion-primary-carousel="keyboardPrimary ? '' : undefined"
    :dir="direction === 'auto' ? undefined : direction"
    :role="landmark ? 'region' : 'group'"
    :style="rootStyle"
  >
    <slot />
    <p :id="instructionId" class="snap-motion-visually-hidden">
      {{ keyboardInstructions ?? messages.carouselInstructions }}
    </p>
  </component>
</template>
