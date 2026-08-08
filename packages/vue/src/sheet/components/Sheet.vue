<script setup lang="ts" generic="Id extends string = SheetOpenSnapId">
import type {
  ElasticityOptions,
  ReleaseTargetPolicy,
  SpringConfiguration,
} from "@snap-motion/core";
import type { CloseReason, FocusReturnOptions, InitialFocus } from "@snap-motion/vue/dialog";
import type { SnapMotionMessages } from "@snap-motion/vue/localization";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  useId,
  useSlots,
  watch,
} from "vue";

import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "../../internal/accessibility/focus";
import { createEnglishSnapMotionMessages } from "../../localization/messages";
import { sheetContextKey, type SheetContext } from "../sheet-context";
import type { SheetNavigationReason, SheetSide } from "../sheet-contracts";
import {
  createDefaultSheetSnapPoints,
  defaultSheetOpenSnapId,
  type SheetOpenSnapId,
  type SheetSnapPoint,
  type SheetViewportPolicy,
} from "../sheet-policy";
import { useSheetMotion, type SheetViewportDimensions } from "../use-sheet-motion";
import SheetSnapPicker from "./SheetSnapPicker.vue";

const props = withDefaults(
  defineProps<{
    activeId?: Id;
    closeLabel?: string;
    descriptionId?: string;
    elasticity?: ElasticityOptions;
    focusReturn?: FocusReturnOptions;
    initialFocus?: InitialFocus;
    initialViewportDimensions?: Partial<SheetViewportDimensions>;
    maximumScrimOpacity?: number;
    messages?: Partial<SnapMotionMessages>;
    open: boolean;
    programmaticImpulse?: number;
    reducedMotionOverride?: boolean;
    releasePolicy?: Partial<ReleaseTargetPolicy>;
    showSnapPicker?: boolean;
    side?: SheetSide;
    snapLabels?: Partial<Record<Id, string>>;
    snapPoints?: readonly SheetSnapPoint<Id>[];
    spring?: SpringConfiguration;
    titleId?: string;
    viewportPolicy?: Partial<SheetViewportPolicy>;
  }>(),
  {
    initialFocus: "title",
    maximumScrimOpacity: 0.56,
    showSnapPicker: true,
    side: "bottom",
  },
);

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "update:activeId", id: Id): void;
  (event: "requestClose", reason: CloseReason): void;
  (event: "requestActiveId", id: Id, reason: SheetNavigationReason): void;
  (event: "opened"): void;
  (event: "closed"): void;
  (event: "settled", id: Id): void;
  (event: "targetChanged", id: Id, reason: SheetNavigationReason): void;
}>();

const slots = useSlots();
const dialog = ref<HTMLDialogElement>();
const panel = ref<HTMLElement>();
const viewport = ref<HTMLElement>();
const chrome = ref<HTMLElement>();
const body = ref<HTMLElement>();
const intrinsicBodyContent = ref<HTMLElement>();
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
    (createDefaultSheetSnapPoints(
      props.side,
      props.viewportPolicy,
    ) as readonly SheetSnapPoint<Id>[]),
);

function preferredIdForSide() {
  if (props.activeId && configuredPoints.value.some((point) => point.id === props.activeId)) {
    return props.activeId;
  }
  const sideDefault = defaultSheetOpenSnapId(props.side) as Id;
  return configuredPoints.value.some((point) => point.id === sideDefault)
    ? sideDefault
    : configuredPoints.value[0]!.id;
}

const intendedId = ref<Id>(preferredIdForSide());
let mounted = false;
let capturedOpener: HTMLElement | undefined;
let closeReason: CloseReason = "programmatic";
let targetGeneration = 0;
let settledGeneration = 0;
let focusRestoreFrame: number | undefined;
let suppressNextFocusRestore = false;
let presentationChangeClosing = false;

function acceptTarget(id: Id, reason: SheetNavigationReason, userOriginated: boolean) {
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

const motion = useSheetMotion<Id>({
  body,
  chrome,
  defaultOpenSnapId: intendedId.value,
  intrinsicBodyContent,
  maximumScrimOpacity: props.maximumScrimOpacity,
  onHidden: completeClose,
  onSnap(id) {
    queueMicrotask(() => {
      if (id !== intendedId.value || settledGeneration === targetGeneration) return;
      settledGeneration = targetGeneration;
      const label =
        props.snapLabels?.[id] ??
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
  side: props.side,
  snapPoints: configuredPoints,
  ...(props.initialViewportDimensions === undefined
    ? {}
    : { initialViewportDimensions: props.initialViewportDimensions }),
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
    label: props.snapLabels?.[point.id] ?? point.label,
  })),
);
const shouldShowPicker = computed(
  () =>
    props.showSnapPicker &&
    (slots.picker !== undefined ||
      resolvedPoints.value.filter((point) => !point.disabled).length > 1),
);

async function show() {
  const target = dialog.value;
  if (!mounted || !target || target.open) return;
  if (focusRestoreFrame !== undefined) {
    window.cancelAnimationFrame(focusRestoreFrame);
    focusRestoreFrame = undefined;
  }
  suppressNextFocusRestore = false;
  capturedOpener = props.focusReturn?.opener ?? captureFocusOpener(target.ownerDocument);
  target.showModal();
  await nextTick();
  body.value?.scrollTo(0, 0);
  motion.remeasure(intendedId.value);
  motion.open(intendedId.value);
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

/** Immediate host-swap path: no exit animation and no focus return to an unmounting trigger. */
function closeForPresentationChange() {
  const target = dialog.value;
  if (!target?.open) return false;
  const focusedInside = target.contains(target.ownerDocument.activeElement);
  suppressNextFocusRestore = true;
  presentationChangeClosing = true;
  closeReason = "programmatic";
  motion.interrupt();
  motion.sheetState.value = "closed";
  target.close();
  if (props.open) emit("update:open", false);
  return focusedInside;
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

function onClose() {
  if (!mounted) {
    capturedOpener = undefined;
    suppressNextFocusRestore = false;
    presentationChangeClosing = false;
    return;
  }
  motion.interrupt();
  body.value?.scrollTo(0, 0);
  const presentationChange = presentationChangeClosing;
  const opener = capturedOpener ?? props.focusReturn?.opener;
  const shouldRestoreFocus = !suppressNextFocusRestore;
  capturedOpener = undefined;
  if (!presentationChange) suppressNextFocusRestore = false;
  if (shouldRestoreFocus) {
    focusRestoreFrame = window.requestAnimationFrame(() => {
      focusRestoreFrame = undefined;
      restoreFocus({ fallback: props.focusReturn?.fallback, opener });
    });
  }
  emit("closed");
  if (presentationChange) {
    presentationChangeClosing = false;
    return;
  }
  if (props.open) {
    emit("requestClose", closeReason);
    emit("update:open", false);
  }
}

function requestSnap(id: Id, reason: SheetNavigationReason) {
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
    if (id !== undefined && props.open && id !== intendedId.value) requestSnap(id, "route");
  },
);

watch(
  () => props.side,
  async (side) => {
    const retained = configuredPoints.value.some((point) => point.id === intendedId.value)
      ? intendedId.value
      : preferredIdForSide();
    acceptTarget(retained, "side-change", true);
    motion.setSide(side, retained);
    await nextTick();
    const target = motion.remeasure(retained);
    if (target && target.id !== intendedId.value) acceptTarget(target.id, "side-change", true);
  },
  { flush: "post" },
);

watch(
  configuredPoints,
  () => {
    const retained = configuredPoints.value.some((point) => point.id === intendedId.value)
      ? intendedId.value
      : preferredIdForSide();
    acceptTarget(retained, "side-change", true);
    const target = motion.remeasure(retained);
    if (target && target.id !== intendedId.value) acceptTarget(target.id, "side-change", true);
  },
  { deep: true, flush: "post" },
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

provide(sheetContextKey, {
  activeId: computed(() => motion.activeSnapId.value ?? intendedId.value),
  messages,
  name: pickerName,
  points: resolvedPoints,
  requestSnap,
} as unknown as SheetContext);

onMounted(() => {
  mounted = true;
  if (props.open) void show();
});

onBeforeUnmount(() => {
  mounted = false;
  motion.interrupt();
  if (dialog.value?.open) dialog.value.close();
  if (focusRestoreFrame !== undefined) {
    window.cancelAnimationFrame(focusRestoreFrame);
    focusRestoreFrame = undefined;
  }
  if (!suppressNextFocusRestore) {
    restoreFocus({
      fallback: props.focusReturn?.fallback,
      opener: capturedOpener ?? props.focusReturn?.opener,
    });
  }
});

defineExpose({
  body,
  chrome,
  closeForPresentationChange,
  dialog,
  intrinsicBodyContent,
  motion,
  panel,
  requestClose,
  requestSnap,
  titleId: resolvedTitleId,
  viewport,
});
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="resolvedTitleId"
    class="snap-motion-sheet"
    :data-sheet-axis="motion.axis.value"
    :data-sheet-side="motion.side.value"
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
    <section
      ref="panel"
      class="snap-motion-sheet-panel"
      :data-sheet-axis="motion.axis.value"
      :data-sheet-side="motion.side.value"
      :data-sheet-snap="motion.activeSnapId.value"
      :data-sheet-state="motion.sheetState.value"
      :style="motion.panelStyle.value"
    >
      <div ref="viewport" class="snap-motion-sheet-viewport">
        <div ref="chrome" class="snap-motion-sheet-chrome">
          <div class="snap-motion-sheet-header-region">
            <div class="snap-motion-sheet-content-shell">
              <header class="snap-motion-sheet-header">
                <div
                  ref="title"
                  :id="resolvedTitleId"
                  class="snap-motion-sheet-title"
                  tabindex="-1"
                >
                  <slot name="title" />
                </div>
                <button
                  ref="closeButton"
                  :aria-label="closeLabel ?? messages.closeSheet"
                  class="snap-motion-sheet-close"
                  data-snap-motion-ignore-drag
                  type="button"
                  @click="requestClose('close-button')"
                >
                  <slot name="close">{{ messages.closeSheet }}</slot>
                </button>
              </header>
            </div>
          </div>
          <div v-if="shouldShowPicker" class="snap-motion-sheet-picker-region">
            <div class="snap-motion-sheet-content-shell">
              <slot name="picker">
                <SheetSnapPicker />
              </slot>
            </div>
          </div>
        </div>
        <div ref="body" class="snap-motion-sheet-body" tabindex="0">
          <div ref="intrinsicBodyContent" class="snap-motion-sheet-body-content">
            <div class="snap-motion-sheet-content-shell">
              <slot />
            </div>
          </div>
        </div>
      </div>
      <div
        class="snap-motion-sheet-drag-region"
        :style="motion.surfaceStyle"
        @dragstart="motion.onNativeDragStart"
        @pointerdown="motion.onPointerDown"
      >
        <span aria-hidden="true" class="snap-motion-sheet-handle" />
      </div>
    </section>
    <p aria-atomic="true" class="snap-motion-visually-hidden" role="status">{{ statusText }}</p>
  </dialog>
</template>
