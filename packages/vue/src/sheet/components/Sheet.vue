<script setup lang="ts" generic="Id extends string = SheetOpenSnapId">
import type {
  ActiveIdRequestDetails,
  ElasticityOptions,
  NavigationReason,
  ReleaseTargetPolicy,
  SettlementDetails,
  SpringConfiguration,
} from "@snap-motion/core";
import type {
  CloseReason,
  FocusReturnOptions,
  InitialFocus,
  OpenRequestDetails,
} from "@snap-motion/vue/dialog";
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
import type { SheetSide } from "../sheet-contracts";
import {
  createDefaultSheetSnapPoints,
  defaultSheetOpenSnapId,
  type SheetOpenSnapId,
  type SheetSnapPoint,
  type SheetViewportPolicy,
} from "../sheet-policy";
import type { SheetDiagnostics } from "../sheetDiagnostics";
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
  (event: "openRequest", open: false, details: OpenRequestDetails): void;
  (event: "activeIdRequest", id: Id, details: ActiveIdRequestDetails): void;
  (event: "opened"): void;
  (event: "closed"): void;
  (event: "settled", id: Id, details: SettlementDetails): void;
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

function hasConfiguredPoint(id: Id) {
  return configuredPoints.value.some((point) => point.id === id);
}

function retainedConfiguredId() {
  if (props.activeId !== undefined && hasConfiguredPoint(props.activeId)) return props.activeId;
  return hasConfiguredPoint(intendedId.value) ? intendedId.value : preferredIdForSide();
}

const intendedId = ref<Id>(preferredIdForSide());
const internalActiveId = ref<Id>(intendedId.value);
const semanticActiveId = computed<Id>(() => props.activeId ?? internalActiveId.value);
const rollbackAnchorId = ref<Id | undefined>(
  props.activeId !== undefined && hasConfiguredPoint(props.activeId)
    ? props.activeId
    : intendedId.value,
);
let mounted = false;
let capturedOpener: HTMLElement | undefined;
let closeReason: CloseReason = "programmatic";
let targetGeneration = 0;
let settledGeneration = 0;
let focusRestoreFrame: number | undefined;
let suppressNextFocusRestore = false;
let presentationChangeClosing = false;
let closingIntentionally = false;

let settlementReason: NavigationReason = "external";

function acceptTarget(id: Id, reason: NavigationReason, componentOriginated: boolean) {
  if (id === intendedId.value) return false;
  intendedId.value = id;
  settlementReason = reason;
  targetGeneration += 1;
  if (componentOriginated && reason !== "external") {
    if (props.activeId === undefined) internalActiveId.value = id;
    emit("update:activeId", id);
    emit("activeIdRequest", id, { reason });
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
      if (props.activeId !== undefined && id !== props.activeId) {
        settledGeneration = targetGeneration;
        const authoritativeId = rollbackAnchorId.value;
        if (authoritativeId !== undefined) synchronizeExact(authoritativeId, false);
        return;
      }
      settledGeneration = targetGeneration;
      const label =
        props.snapLabels?.[id] ??
        motion.resolvedSnapPoints.value.find((point) => point.id === id)?.label ??
        id;
      if (settlementReason !== "external") {
        statusText.value = messages.value.sheetStatus({ id, label });
      }
      emit("settled", id, { reason: settlementReason });
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
const diagnostics = computed<SheetDiagnostics<Id>>(() => {
  const snapshot = motion.snapshot.value;
  return {
    anchors: snapshot.anchors,
    bounds: snapshot.bounds,
    geometry: motion.geometry.value,
    isAnimating: motion.isAnimating.value,
    nearestId: snapshot.active?.id,
    phase: snapshot.phase,
    pointerInteractionActive: motion.isDragging.value,
    pointerOwned: motion.pointerOwned.value,
    position: motion.position.value,
    primarySurfaceExtent: motion.primarySurfaceExtent.value,
    reducedMotion: motion.reducedMotion.value,
    sheetState: motion.sheetState.value,
    side: motion.side.value,
    targetId: snapshot.target?.id,
    velocity: motion.velocity.value,
  };
});

async function show() {
  const target = dialog.value;
  if (!mounted || !target || target.open) return;
  if (focusRestoreFrame !== undefined) {
    window.cancelAnimationFrame(focusRestoreFrame);
    focusRestoreFrame = undefined;
  }
  suppressNextFocusRestore = false;
  capturedOpener ??= props.focusReturn?.opener ?? captureFocusOpener(target.ownerDocument);
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
  emit("update:open", false);
  emit("openRequest", false, { reason });
}

function beginClose() {
  if (dialog.value?.open && motion.sheetState.value !== "closing") {
    closingIntentionally = true;
    motion.close();
  }
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
  if (props.open) {
    emit("update:open", false);
    emit("openRequest", false, { reason: "programmatic" });
  }
  return focusedInside;
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

async function onClose() {
  const wasIntentional = closingIntentionally;
  closingIntentionally = false;
  if (!mounted) {
    capturedOpener = undefined;
    suppressNextFocusRestore = false;
    presentationChangeClosing = false;
    return;
  }
  motion.interrupt();
  body.value?.scrollTo(0, 0);
  const presentationChange = presentationChangeClosing;
  if (presentationChange) {
    presentationChangeClosing = false;
    capturedOpener = undefined;
    suppressNextFocusRestore = false;
    emit("closed");
    return;
  }
  // A reduced or very short close can beat Vue's parent-to-child prop flush. Let an already
  // accepted `update:open(false)` arrive before classifying the native close as unexpected.
  if (props.open) await nextTick();
  if (props.open) {
    if (!wasIntentional) {
      emit("update:open", false);
      emit("openRequest", false, { reason: closeReason });
      await nextTick();
    }
  }
  if (props.open) {
    if (wasIntentional) emit("closed");
    await show();
    return;
  }
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
}

function navigateWithReason(id: Id, reason: ActiveIdRequestDetails["reason"]) {
  if (!hasConfiguredPoint(id) || !acceptTarget(id, reason, true)) {
    return false;
  }
  motion.snapTo(id);
  return true;
}

function navigateTo(id: Id) {
  return navigateWithReason(id, "programmatic");
}

function synchronizeExact(id: Id, reportSettlement = true) {
  if (!hasConfiguredPoint(id)) return false;
  settlementReason = "external";
  const changed = acceptTarget(id, "external", false);
  if (!reportSettlement) settledGeneration = targetGeneration;
  if (!props.open) return changed || intendedId.value === id;
  motion.interrupt();
  motion.remeasure(id);
  motion.sheetState.value = "open";
  return true;
}

function synchronizeTo(id: Id) {
  if (props.activeId !== undefined && id !== props.activeId) return false;
  if (props.activeId === undefined) internalActiveId.value = id;
  return synchronizeExact(id);
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
    // A v-model confirmation of the semantic destination already accepted by the Sheet is not an
    // external takeover. Re-synchronizing would cancel the spring and lose its original reason.
    if (id !== undefined && hasConfiguredPoint(id)) {
      rollbackAnchorId.value = id;
      if (id !== intendedId.value) synchronizeExact(id);
    } else if (id === undefined) {
      internalActiveId.value = intendedId.value;
    }
  },
);

watch(
  () => props.side,
  async (side) => {
    const retained = retainedConfiguredId();
    if (props.activeId !== undefined && !hasConfiguredPoint(props.activeId)) {
      rollbackAnchorId.value = retained;
    }
    if (retained !== intendedId.value) {
      acceptTarget(
        retained,
        props.activeId === undefined ? "reconcile" : "external",
        props.activeId === undefined,
      );
    }
    motion.setSide(side, retained);
    await nextTick();
    const target = motion.remeasure(retained);
    if (target && target.id !== intendedId.value) {
      acceptTarget(
        target.id,
        props.activeId === undefined ? "reconcile" : "external",
        props.activeId === undefined,
      );
    }
  },
  { flush: "post" },
);

watch(
  configuredPoints,
  () => {
    const retained = retainedConfiguredId();
    if (props.activeId !== undefined && !hasConfiguredPoint(props.activeId)) {
      rollbackAnchorId.value = retained;
    }
    if (retained !== intendedId.value) {
      acceptTarget(
        retained,
        props.activeId === undefined ? "reconcile" : "external",
        props.activeId === undefined,
      );
    }
    const target = motion.remeasure(retained);
    if (target && target.id !== intendedId.value) {
      acceptTarget(
        target.id,
        props.activeId === undefined ? "reconcile" : "external",
        props.activeId === undefined,
      );
    }
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
  activeId: semanticActiveId,
  messages,
  name: pickerName,
  points: resolvedPoints,
  navigateTo: navigateWithReason,
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
  diagnostics,
  intrinsicBodyContent,
  panel,
  activeId: semanticActiveId,
  sheetState: motion.sheetState,
  side: motion.side,
  requestClose,
  navigateTo,
  synchronizeTo,
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
    :data-sheet-snap="intendedId"
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
      :data-sheet-snap="intendedId"
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
