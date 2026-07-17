<script setup lang="ts" generic="Id extends string = BottomSheetOpenSnapId">
import type {
  ElasticityOptions,
  ReleaseTargetPolicy,
  SpringConfiguration,
} from "@snap-motion/core";
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, useId, watch } from "vue";

import {
  createViewportBottomSheetSnapPoints,
  type BottomSheetOpenSnapId,
  type BottomSheetSnapPoint,
  type BottomSheetViewportPolicy,
} from "../bottom-sheet-policy.js";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
  type FocusReturnOptions,
  type InitialFocus,
} from "../focus.js";
import { createEnglishSnapMotionMessages, type SnapMotionMessages } from "../messages.js";
import { useBottomSheetMotion } from "../use-bottom-sheet-motion.js";
import { bottomSheetContextKey, type BottomSheetContext } from "./bottom-sheet-context.js";
import BottomSheetSnapPicker from "./BottomSheetSnapPicker.vue";
import type { CloseReason, NavigationReason } from "./contracts.js";

const props = withDefaults(
  defineProps<{
    activeId: Id;
    closeLabel?: string;
    descriptionId?: string;
    elasticity?: ElasticityOptions;
    focusReturn?: FocusReturnOptions;
    initialFocus?: InitialFocus;
    initialViewportHeight?: number;
    maximumScrimOpacity?: number;
    messages?: Partial<SnapMotionMessages>;
    open: boolean;
    programmaticImpulse?: number;
    reducedMotionOverride?: boolean;
    releasePolicy?: Partial<ReleaseTargetPolicy>;
    showSnapPicker?: boolean;
    snapLabels?: Partial<Record<Id, string>>;
    snapPoints?: readonly BottomSheetSnapPoint<Id>[];
    spring?: SpringConfiguration;
    titleId?: string;
    viewportPolicy?: Partial<BottomSheetViewportPolicy>;
  }>(),
  {
    initialFocus: "title",
    initialViewportHeight: 800,
    maximumScrimOpacity: 0.56,
    showSnapPicker: true,
  },
);

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "update:activeId", id: Id): void;
  (event: "requestClose", reason: CloseReason): void;
  (event: "requestActiveId", id: Id, reason: NavigationReason): void;
  (event: "opened"): void;
  (event: "closed"): void;
  (event: "settled", id: Id): void;
  (event: "targetChanged", id: Id, reason: NavigationReason): void;
}>();

const dialog = ref<HTMLDialogElement>();
const panel = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const title = ref<HTMLElement>();
const generatedTitleId = `snap-motion-sheet-title-${useId()}`;
const resolvedTitleId = props.titleId ?? generatedTitleId;
const pickerName = `snap-motion-sheet-snap-${useId()}`;
const statusText = ref("");
const reducedMotionOverride = computed(() => props.reducedMotionOverride);
const messages = computed(() => createEnglishSnapMotionMessages(props.messages));
const configuredPoints = computed(
  () =>
    props.snapPoints ??
    (createViewportBottomSheetSnapPoints(
      props.viewportPolicy,
    ) as readonly BottomSheetSnapPoint<Id>[]),
);
const intendedId = ref<Id>(props.activeId);
let mounted = false;
let capturedOpener: HTMLElement | undefined;
let closeReason: CloseReason = "programmatic";
let targetGeneration = 0;
let settledGeneration = 0;

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

const motion = useBottomSheetMotion<Id>({
  defaultOpenSnapId: props.activeId,
  initialViewportHeight: props.initialViewportHeight,
  maximumScrimOpacity: props.maximumScrimOpacity,
  onHidden: completeClose,
  onSnap(id) {
    queueMicrotask(() => {
      if (id !== intendedId.value || settledGeneration === targetGeneration) return;
      settledGeneration = targetGeneration;
      const label =
        props.snapLabels?.[id as Id] ??
        motion.resolvedSnapPoints.value.find((point) => point.id === id)?.label ??
        id;
      statusText.value = messages.value.sheetStatus({ id, label });
      emit("settled", id);
    });
  },
  onTargetSelected(id) {
    acceptTarget(id, "drag", true);
  },
  panel,
  reducedMotionOverride,
  snapPoints: configuredPoints.value,
  ...(props.elasticity === undefined ? {} : { elasticity: props.elasticity }),
  ...(props.programmaticImpulse === undefined
    ? {}
    : { programmaticImpulse: props.programmaticImpulse }),
  ...(props.releasePolicy === undefined ? {} : { releasePolicy: props.releasePolicy }),
  ...(props.spring === undefined ? {} : { spring: props.spring }),
  ...(props.viewportPolicy === undefined ? {} : { viewportPolicy: props.viewportPolicy }),
});

const resolvedPoints = computed(() =>
  motion.resolvedSnapPoints.value.map((point) => ({
    ...point,
    label: props.snapLabels?.[point.id as Id] ?? point.label,
  })),
);

async function show() {
  const target = dialog.value;
  if (!mounted || !target || target.open) return;
  capturedOpener = props.focusReturn?.opener ?? captureFocusOpener(target.ownerDocument);
  target.showModal();
  await nextTick();
  motion.remeasure();
  motion.open(props.activeId);
  focusInitial(props.initialFocus, {
    close: closeButton.value,
    container: panel.value,
    title: title.value,
  });
  emit("opened");
}

function requestClose(reason: CloseReason) {
  if (!dialog.value?.open) return;
  closeReason = reason;
  emit("requestClose", reason);
  emit("update:open", false);
}

function beginClose() {
  if (dialog.value?.open && motion.sheetState.value !== "closing") motion.close();
}

function completeClose() {
  if (dialog.value?.open) dialog.value.close();
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

function onClose() {
  motion.interrupt();
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
  capturedOpener = undefined;
  emit("closed");
  if (props.open) {
    emit("requestClose", closeReason);
    emit("update:open", false);
  }
}

function requestSnap(id: Id, reason: NavigationReason) {
  if (!acceptTarget(id, reason, reason !== "route")) return;
  motion.snapTo(id);
}

watch(
  () => props.open,
  (open) => {
    if (open) void show();
    else beginClose();
  },
);

watch(
  () => props.activeId,
  (id) => {
    if (props.open && id !== intendedId.value) requestSnap(id, "route");
  },
);

watch(
  () => [props.spring, props.releasePolicy, props.elasticity, props.programmaticImpulse] as const,
  () => {
    motion.configure({
      ...(props.elasticity === undefined ? {} : { elasticity: props.elasticity }),
      ...(props.programmaticImpulse === undefined
        ? {}
        : { programmaticImpulse: props.programmaticImpulse }),
      ...(props.releasePolicy === undefined ? {} : { releasePolicy: props.releasePolicy }),
      ...(props.spring === undefined ? {} : { spring: props.spring }),
    });
  },
  { deep: true },
);

provide(bottomSheetContextKey, {
  activeId: computed(() => motion.activeSnapId.value ?? intendedId.value),
  messages,
  name: pickerName,
  points: resolvedPoints,
  requestSnap,
} as unknown as BottomSheetContext);

onMounted(() => {
  mounted = true;
  if (props.open) void show();
});

onBeforeUnmount(() => {
  mounted = false;
  motion.interrupt();
  if (dialog.value?.open) dialog.value.close();
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
});

defineExpose({ dialog, motion, panel, requestClose, requestSnap, titleId: resolvedTitleId });
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="resolvedTitleId"
    class="snap-motion-sheet"
    :data-sheet-snap="motion.activeSnapId.value"
    :data-sheet-state="motion.sheetState.value"
    v-bind="descriptionId ? { 'aria-describedby': descriptionId } : {}"
    @cancel="onCancel"
    @close="onClose"
    @keydown="maintainModalTabOrder($event, dialog)"
  >
    <div
      aria-hidden="true"
      class="snap-motion-sheet-scrim"
      :style="{ opacity: motion.scrimOpacity.value }"
      @click="requestClose('scrim')"
    />
    <section ref="panel" class="snap-motion-sheet-panel" :style="motion.panelStyle.value">
      <header class="snap-motion-sheet-header">
        <div
          class="snap-motion-sheet-drag-region"
          :style="motion.surfaceStyle"
          @pointerdown="motion.onPointerDown"
        >
          <span aria-hidden="true" class="snap-motion-sheet-handle" />
          <div ref="title" :id="resolvedTitleId" class="snap-motion-sheet-title" tabindex="-1">
            <slot name="title" />
          </div>
        </div>
        <button
          ref="closeButton"
          :aria-label="closeLabel ?? messages.closeBottomSheet"
          class="snap-motion-sheet-close"
          type="button"
          @click="requestClose('close-button')"
        >
          <slot name="close">{{ messages.closeBottomSheet }}</slot>
        </button>
      </header>
      <slot name="picker">
        <BottomSheetSnapPicker v-if="showSnapPicker" />
      </slot>
      <div class="snap-motion-sheet-body">
        <slot />
      </div>
    </section>
    <p aria-atomic="true" class="snap-motion-visually-hidden" role="status">{{ statusText }}</p>
  </dialog>
</template>
