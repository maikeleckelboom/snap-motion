<script setup lang="ts">
import type {
  ElasticityOptions,
  ReleaseTargetPolicy,
  SpringConfiguration,
} from "@snap-motion/core";
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, useId, watch } from "vue";

import type { BottomSheetOpenSnapId, BottomSheetViewportPolicy } from "../bottom-sheet-policy";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
  type FocusReturnOptions,
  type InitialFocus,
} from "../focus";
import { useBottomSheetMotion } from "../use-bottom-sheet-motion";
import { bottomSheetContextKey } from "./bottom-sheet-context";
import BottomSheetSnapPicker from "./BottomSheetSnapPicker.vue";
import type { CloseReason, NavigationReason } from "./contracts";

const props = withDefaults(
  defineProps<{
    activeId: BottomSheetOpenSnapId;
    closeLabel?: string;
    descriptionId?: string;
    elasticity?: ElasticityOptions;
    focusReturn?: FocusReturnOptions;
    initialFocus?: InitialFocus;
    initialViewportHeight?: number;
    maximumScrimOpacity?: number;
    open: boolean;
    programmaticImpulse?: number;
    reducedMotionOverride?: boolean;
    releasePolicy?: Partial<ReleaseTargetPolicy>;
    showSnapPicker?: boolean;
    snapLabels?: Partial<Record<BottomSheetOpenSnapId, string>>;
    spring?: SpringConfiguration;
    titleId?: string;
    viewportPolicy?: Partial<BottomSheetViewportPolicy>;
  }>(),
  {
    closeLabel: "Close bottom sheet",
    initialFocus: "title",
    initialViewportHeight: 800,
    maximumScrimOpacity: 0.56,
    showSnapPicker: true,
  },
);

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "update:activeId", id: BottomSheetOpenSnapId): void;
  (event: "requestClose", reason: CloseReason): void;
  (event: "requestActiveId", id: BottomSheetOpenSnapId, reason: NavigationReason): void;
  (event: "opened"): void;
  (event: "closed"): void;
  (event: "settled", id: BottomSheetOpenSnapId): void;
  (event: "targetChanged", id: BottomSheetOpenSnapId, reason: NavigationReason): void;
}>();

const dialog = ref<HTMLDialogElement>();
const panel = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const title = ref<HTMLElement>();
const generatedTitleId = `snap-motion-sheet-title-${useId()}`;
const resolvedTitleId = props.titleId ?? generatedTitleId;
const pickerName = `snap-motion-sheet-snap-${useId()}`;
const labels: Record<BottomSheetOpenSnapId, string> = {
  full: props.snapLabels?.full ?? "Full",
  comfortable: props.snapLabels?.comfortable ?? "Comfortable",
  compact: props.snapLabels?.compact ?? "Compact",
};
const statusText = ref("");
const reducedMotionOverride = computed(() => props.reducedMotionOverride);
let mounted = false;
let capturedOpener: HTMLElement | undefined;
let closeReason: CloseReason = "programmatic";

const motion = useBottomSheetMotion({
  defaultOpenSnapId: props.activeId,
  initialViewportHeight: props.initialViewportHeight,
  maximumScrimOpacity: props.maximumScrimOpacity,
  onHidden: completeClose,
  onSnap(id) {
    statusText.value = `Sheet height: ${labels[id]}`;
    emit("settled", id);
  },
  panel,
  reducedMotionOverride,
  ...(props.elasticity === undefined ? {} : { elasticity: props.elasticity }),
  ...(props.programmaticImpulse === undefined
    ? {}
    : { programmaticImpulse: props.programmaticImpulse }),
  ...(props.releasePolicy === undefined ? {} : { releasePolicy: props.releasePolicy }),
  ...(props.spring === undefined ? {} : { spring: props.spring }),
  ...(props.viewportPolicy === undefined ? {} : { viewportPolicy: props.viewportPolicy }),
});

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

function requestSnap(id: BottomSheetOpenSnapId, reason: NavigationReason) {
  if (id === motion.activeSnapId.value && motion.sheetState.value === "open") return;
  const target = motion.snapTo(id);
  if (!target) return;
  emit("targetChanged", id, reason);
  emit("requestActiveId", id, reason);
  emit("update:activeId", id);
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
    if (props.open && id !== motion.activeSnapId.value) requestSnap(id, "route");
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
  activeId: () => {
    const id = motion.activeSnapId.value;
    return id === undefined || id === "hidden" ? props.activeId : id;
  },
  labels,
  name: pickerName,
  requestSnap,
});

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
    :aria-describedby="descriptionId"
    :aria-labelledby="resolvedTitleId"
    class="snap-motion-sheet"
    :data-sheet-snap="motion.activeSnapId.value"
    :data-sheet-state="motion.sheetState.value"
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
          :aria-label="closeLabel"
          class="snap-motion-sheet-close"
          type="button"
          @click="requestClose('close-button')"
        >
          <slot name="close">Close</slot>
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

<style>
.snap-motion-sheet {
  position: fixed;
  inset: 0;
  inline-size: 100%;
  max-inline-size: none;
  block-size: 100%;
  max-block-size: none;
  padding: 0;
  border: 0;
  margin: 0;
  background: transparent;
  overflow: clip;
  pointer-events: none;
}
.snap-motion-sheet::backdrop {
  background: transparent;
}
.snap-motion-sheet-scrim {
  position: absolute;
  inset: 0;
  background: #000;
  pointer-events: auto;
}
.snap-motion-sheet-panel {
  position: absolute;
  inset: 24px 0 auto;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  block-size: calc(100dvh - 24px);
  background: Canvas;
  color: CanvasText;
  pointer-events: auto;
}
.snap-motion-sheet-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}
.snap-motion-sheet-drag-region {
  min-inline-size: 0;
  padding: 0.75rem 1rem;
  cursor: grab;
  user-select: none;
}
.snap-motion-sheet-handle {
  display: block;
  inline-size: 3rem;
  block-size: 0.25rem;
  margin-inline: auto;
  background: currentColor;
}
.snap-motion-sheet-title:focus {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}
.snap-motion-sheet-close {
  min-inline-size: 44px;
  min-block-size: 44px;
  margin: 0.75rem 1rem;
}
.snap-motion-sheet-picker {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 0;
  margin: 0;
}
.snap-motion-sheet-picker-option {
  position: relative;
  min-block-size: 44px;
  display: inline-grid;
  place-items: center;
}
.snap-motion-sheet-picker-option input {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.snap-motion-sheet-picker-option span {
  padding: 0.65rem;
  border: 1px solid currentColor;
}
.snap-motion-sheet-picker-option input:checked + span {
  background: CanvasText;
  color: Canvas;
}
.snap-motion-sheet-picker-option input:focus-visible + span {
  outline: 2px solid Highlight;
  outline-offset: 2px;
}
.snap-motion-sheet-body {
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
