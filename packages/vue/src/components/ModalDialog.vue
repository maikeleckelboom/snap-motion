<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";

import {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
  type FocusReturnOptions,
  type InitialFocus,
} from "../focus";
import type { CloseReason } from "./contracts";

const props = withDefaults(
  defineProps<{
    closeLabel?: string;
    descriptionId?: string;
    focusReturn?: FocusReturnOptions;
    initialFocus?: InitialFocus;
    open: boolean;
    titleId?: string;
  }>(),
  {
    closeLabel: "Close dialog",
    initialFocus: "close",
  },
);

const emit = defineEmits<{
  (event: "update:open", open: boolean): void;
  (event: "requestClose", reason: CloseReason): void;
  (event: "opened"): void;
  (event: "closed"): void;
}>();

const dialog = ref<HTMLDialogElement>();
const content = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
const title = ref<HTMLElement>();
const generatedTitleId = `snap-motion-dialog-title-${useId()}`;
const resolvedTitleId = props.titleId ?? generatedTitleId;
let capturedOpener: HTMLElement | undefined;
let mounted = false;
let closingIntentionally = false;

async function show() {
  const target = dialog.value;
  if (!mounted || !target || target.open) return;
  capturedOpener = props.focusReturn?.opener ?? captureFocusOpener(target.ownerDocument);
  target.showModal();
  await nextTick();
  focusInitial(props.initialFocus, {
    close: closeButton.value,
    container: content.value,
    title: title.value,
  });
  emit("opened");
}

function closeNative() {
  if (!dialog.value?.open) return;
  closingIntentionally = true;
  dialog.value.close();
}

function requestClose(reason: CloseReason) {
  emit("requestClose", reason);
  emit("update:open", false);
}

function onCancel(event: Event) {
  event.preventDefault();
  requestClose("escape");
}

function onClose() {
  const wasIntentional = closingIntentionally;
  closingIntentionally = false;
  if (!wasIntentional && props.open) {
    emit("requestClose", "programmatic");
    emit("update:open", false);
  }
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
  capturedOpener = undefined;
  emit("closed");
}

watch(
  () => props.open,
  (open) => {
    if (open) void show();
    else closeNative();
  },
);

onMounted(() => {
  mounted = true;
  if (props.open) void show();
});

onBeforeUnmount(() => {
  mounted = false;
  if (dialog.value?.open) {
    closingIntentionally = true;
    dialog.value.close();
  }
  restoreFocus({
    fallback: props.focusReturn?.fallback,
    opener: capturedOpener ?? props.focusReturn?.opener,
  });
});

defineExpose({ close: closeNative, dialog, requestClose, titleId: resolvedTitleId });
</script>

<template>
  <dialog
    ref="dialog"
    :aria-describedby="descriptionId"
    :aria-labelledby="resolvedTitleId"
    class="snap-motion-dialog"
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
        :aria-label="closeLabel"
        class="snap-motion-dialog-close"
        type="button"
        @click="requestClose('close-button')"
      >
        <slot name="close">Close</slot>
      </button>
      <slot :request-close="requestClose" />
    </div>
  </dialog>
</template>

<style>
.snap-motion-dialog-close {
  min-inline-size: 44px;
  min-block-size: 44px;
}
</style>
