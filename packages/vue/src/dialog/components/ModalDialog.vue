<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";

import type { FocusReturnOptions, InitialFocus } from "../../contracts/focus-contracts";
import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "../../internal/accessibility/focus";
import {
  observeFocusHandoffFromOpener,
  scheduleVerifiedFocusRestore,
  type FocusHandoffObservation,
  type FocusRestoreVerification,
} from "../../internal/accessibility/focus-restore";
import {
  createEnglishSnapMotionMessages,
  type SnapMotionMessages,
} from "../../localization/messages";
import type { CloseReason, OpenRequestDetails } from "../dialog-contracts";

const props = withDefaults(
  defineProps<{
    closeLabel?: string;
    descriptionId?: string;
    focusReturn?: FocusReturnOptions;
    initialFocus?: InitialFocus;
    messages?: Partial<SnapMotionMessages>;
    open: boolean;
    titleId?: string;
  }>(),
  {
    initialFocus: "close",
  },
);

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "openRequest", open: false, details: OpenRequestDetails): void;
  (event: "opened"): void;
  (event: "closed"): void;
}>();

const dialog = ref<HTMLDialogElement>();
const content = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const title = ref<HTMLElement>();
const generatedTitleId = `snap-motion-dialog-title-${useId()}`;
const resolvedTitleId = props.titleId ?? generatedTitleId;
const messages = computed(() => createEnglishSnapMotionMessages(props.messages));
let capturedOpener: HTMLElement | undefined;
let capturedOpenerGeneration = 0;
let capturedOpenerWasExplicit = false;
let mounted = false;
let lifecycleGeneration = 0;
let openedGeneration = 0;
let finalizedGeneration = 0;
const nativeCloseLifecycles: {
  focusHandoff: FocusHandoffObservation;
  generation: number;
}[] = [];
let focusRestoreVerification: FocusRestoreVerification | undefined;

function explicitOpenerForCurrentLifecycle() {
  if (capturedOpener) return capturedOpenerWasExplicit ? capturedOpener : undefined;
  return props.focusReturn?.opener;
}

function cancelPendingCloseHandoffs() {
  for (const lifecycle of nativeCloseLifecycles) lifecycle.focusHandoff.cancel();
}

function clearPendingCloseHandoffs() {
  cancelPendingCloseHandoffs();
  nativeCloseLifecycles.length = 0;
}

function captureLifecycleOpener(target: HTMLDialogElement, generation: number) {
  if (capturedOpenerGeneration === generation) return;
  capturedOpenerGeneration = generation;
  const explicitOpener = props.focusReturn?.opener;
  if (explicitOpener) {
    capturedOpener = explicitOpener;
    capturedOpenerWasExplicit = true;
    return;
  }
  capturedOpenerWasExplicit = false;
  const activeElement = captureFocusOpener(target.ownerDocument);
  if (activeElement && !target.contains(activeElement)) {
    capturedOpener = activeElement;
  }
}

async function show(generation: number) {
  const target = dialog.value;
  if (!mounted || !props.open || generation !== lifecycleGeneration || !target) return;
  focusRestoreVerification?.cancel();
  focusRestoreVerification = undefined;
  captureLifecycleOpener(target, generation);
  if (!target.open) target.showModal();
  await nextTick();
  if (!mounted || !props.open || generation !== lifecycleGeneration || !target.open) {
    return;
  }
  focusInitial(props.initialFocus, {
    close: closeButton.value,
    container: content.value,
    title: title.value,
  });
  if (openedGeneration === generation) return;
  openedGeneration = generation;
  emit("opened");
}

function beginOpenLifecycle() {
  cancelPendingCloseHandoffs();
  lifecycleGeneration += 1;
  void show(lifecycleGeneration);
}

function closeNative() {
  const target = dialog.value;
  if (!target?.open) return;
  nativeCloseLifecycles.push({
    focusHandoff: observeFocusHandoffFromOpener(explicitOpenerForCurrentLifecycle()),
    generation: lifecycleGeneration,
  });
  target.close();
}

function requestClose(reason: CloseReason = "programmatic") {
  if (!props.open || !dialog.value?.open) return;
  emit("update:open", false);
  emit("openRequest", false, { reason });
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

async function onClose() {
  const target = dialog.value;
  const closeLifecycle = nativeCloseLifecycles.shift();
  const initialTransferredOwner = closeLifecycle?.focusHandoff.consume();
  if (target?.open) return;
  if (!mounted) return;
  if (closeLifecycle && closeLifecycle.generation !== lifecycleGeneration) return;
  if (props.open) {
    if (closeLifecycle) return;
    emit("update:open", false);
    emit("openRequest", false, { reason: "programmatic" });
    await nextTick();
    if (props.open) {
      await show(lifecycleGeneration);
      return;
    }
  }
  if (finalizedGeneration === lifecycleGeneration) return;
  finalizedGeneration = lifecycleGeneration;
  const opener = capturedOpener ?? props.focusReturn?.opener;
  const explicitOpener = capturedOpener ? capturedOpenerWasExplicit : opener !== undefined;
  const focusGeneration = lifecycleGeneration;
  focusRestoreVerification = scheduleVerifiedFocusRestore({
    explicitOpener,
    fallback: props.focusReturn?.fallback,
    initialTransferredOwner,
    isCurrent: () => mounted && !props.open && focusGeneration === lifecycleGeneration,
    opener,
  });
  capturedOpener = undefined;
  capturedOpenerWasExplicit = false;
  emit("closed");
}

watch(
  () => props.open,
  (open) => {
    if (open) beginOpenLifecycle();
    else closeNative();
  },
);

onMounted(() => {
  mounted = true;
  if (props.open) beginOpenLifecycle();
});

onBeforeUnmount(() => {
  mounted = false;
  lifecycleGeneration += 1;
  clearPendingCloseHandoffs();
  if (dialog.value?.open) {
    dialog.value.close();
  }
  focusRestoreVerification?.cancel();
  focusRestoreVerification = undefined;
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
});

defineExpose({ dialog, requestClose, titleId: resolvedTitleId });
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="resolvedTitleId"
    class="snap-motion-dialog"
    v-bind="descriptionId ? { 'aria-describedby': descriptionId } : {}"
    @cancel="onCancel"
    @close="onClose"
    @keydown="maintainModalTabOrder($event, dialog)"
  >
    <div ref="content" class="snap-motion-dialog-content">
      <div ref="title" :id="resolvedTitleId" class="snap-motion-dialog-title" tabindex="-1">
        <slot name="title" />
      </div>
      <button
        ref="closeButton"
        :aria-label="closeLabel ?? messages.closeDialog"
        class="snap-motion-dialog-close"
        type="button"
        @click="requestClose('close-button')"
      >
        <slot name="close">{{ messages.closeDialog }}</slot>
      </button>
      <slot :request-close="requestClose" />
    </div>
  </dialog>
</template>
