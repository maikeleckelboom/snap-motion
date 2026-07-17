<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import {
  useBottomSheetMotion,
  type BottomSheetSnapPoint,
} from "./useBottomSheetMotion";

type BottomSheetMode = "edge" | "inset" | "auto";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: BottomSheetMode;
    title?: string;
    ariaLabel?: string;
    closeLabel?: string;
  }>(),
  {
    mode: "auto",
    title: "Bottom sheet",
    ariaLabel: undefined,
    closeLabel: "Close",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  opened: [];
  closed: [];
  snap: [point: BottomSheetSnapPoint];
}>();

const dialog = ref<HTMLDialogElement>();
const panel = ref<HTMLElement>();
const sheetBody = ref<HTMLElement>();
const opener = ref<HTMLElement>();
const mounted = ref(false);

const titleId = `bottom-sheet-title-${useId()}`;
const ariaLabel = computed(() => props.ariaLabel?.trim() || undefined);
const labelledBy = computed(() => (ariaLabel.value ? undefined : titleId));

let ignoreNextCloseEvent = false;
let openFrame: number | undefined;

const motion = useBottomSheetMotion({
  onHidden: completeClose,
  onSnap: (point) => emit("snap", point),
});

const panelStyle = computed(() => ({
  "--_bottom-sheet-y": `${motion.offset.value}px`,
  transform: motion.transform.value,
}));

const scrimStyle = computed(() => ({
  opacity: motion.scrimOpacity.value,
}));

const sheetMode = computed(() => props.mode);
const sheetState = computed(() => motion.state.value);
const sheetSnap = computed(() => motion.activeSnapPoint.value);
const sheetDragging = computed(() =>
  motion.isDragging.value ? "true" : "false",
);

function storeOpener() {
  if (typeof document === "undefined") {
    opener.value = undefined;
    return;
  }

  const activeElement = document.activeElement;
  opener.value = activeElement instanceof HTMLElement ? activeElement : undefined;
}

function focusInsideSheet() {
  const focusTarget = panel.value?.querySelector<HTMLElement>(
    "[autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );

  (focusTarget ?? panel.value)?.focus({ preventScroll: true });
}

function cancelScheduledOpen() {
  if (openFrame === undefined || typeof window === "undefined") {
    return;
  }

  window.cancelAnimationFrame(openFrame);
  openFrame = undefined;
}

function setDocumentSheetOpen(isOpen: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  if (isOpen) {
    document.documentElement.setAttribute("data-sheet-open", "true");
    return;
  }

  document.documentElement.removeAttribute("data-sheet-open");
}

function resetSheetScroll() {
  sheetBody.value?.scrollTo(0, 0);
}

async function openDialog() {
  const dialogElement = dialog.value;

  if (!dialogElement) {
    return;
  }

  cancelScheduledOpen();
  setDocumentSheetOpen(true);
  motion.prepareOpen();
  resetSheetScroll();

  if (!dialogElement.open) {
    storeOpener();
    dialogElement.showModal();
  }

  await nextTick();
  motion.prepareOpen();
  resetSheetScroll();

  openFrame = requestAnimationFrame(() => {
    resetSheetScroll();

    openFrame = requestAnimationFrame(() => {
      openFrame = undefined;
      motion.open(() => emit("opened"));
      requestAnimationFrame(focusInsideSheet);
    });
  });
}

function requestClose() {
  cancelScheduledOpen();

  if (!dialog.value?.open) {
    setDocumentSheetOpen(false);
    emit("update:modelValue", false);
    return;
  }

  motion.close();
}

function returnFocusToOpener() {
  if (opener.value?.isConnected) {
    opener.value.focus({ preventScroll: true });
  }

  opener.value = undefined;
}

function completeClose() {
  const dialogElement = dialog.value;

  cancelScheduledOpen();

  if (dialogElement?.open) {
    ignoreNextCloseEvent = true;
    dialogElement.close();
  }

  resetSheetScroll();
  setDocumentSheetOpen(false);
  emit("update:modelValue", false);
  emit("closed");
  returnFocusToOpener();
}

function onNativeClose() {
  if (ignoreNextCloseEvent) {
    ignoreNextCloseEvent = false;
    return;
  }

  emit("update:modelValue", false);
  emit("closed");
  resetSheetScroll();
  setDocumentSheetOpen(false);
  returnFocusToOpener();
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!mounted.value) {
      return;
    }

    if (isOpen) {
      void openDialog();
      return;
    }

    requestClose();
  },
);

onMounted(() => {
  mounted.value = true;

  if (props.modelValue) {
    void openDialog();
  }
});

onBeforeUnmount(() => {
  cancelScheduledOpen();
  setDocumentSheetOpen(false);
});

defineExpose({
  close: requestClose,
  snapTo: motion.snapTo,
});
</script>

<template>
  <dialog
    ref="dialog"
    class="bottom-sheet-dialog"
    :aria-label="ariaLabel"
    :aria-labelledby="labelledBy"
    :data-sheet-mode="sheetMode"
    :data-sheet-state="sheetState"
    :data-sheet-snap="sheetSnap"
    :data-sheet-dragging="sheetDragging"
    @cancel.prevent="requestClose"
    @close="onNativeClose"
    @keydown.esc.prevent="requestClose"
  >
    <div
      class="scrim"
      aria-hidden="true"
      :style="scrimStyle"
      @click="requestClose"
    />

    <div class="sheet-layer" :data-sheet-mode="sheetMode">
      <section
        ref="panel"
        class="panel"
        :style="panelStyle"
        :data-sheet-mode="sheetMode"
        :data-sheet-state="sheetState"
        :data-sheet-snap="sheetSnap"
        :data-sheet-dragging="sheetDragging"
        tabindex="-1"
      >
        <div class="panel-clip">
          <header class="header">
            <div class="drag-region" @pointerdown="motion.onDragPointerDown">
              <span class="handle" aria-hidden="true" />
              <div :id="titleId" class="title">
                <slot name="title">{{ title }}</slot>
              </div>
            </div>

            <div class="close-container">
              <button class="close-button" type="button" @click="requestClose">
                {{ closeLabel }}
              </button>
            </div>
          </header>

          <div ref="sheetBody" class="body">
            <slot/>
          </div>
        </div>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
@layer components {
  .bottom-sheet-dialog {
    position: fixed;
    inset: 0;
    overflow: hidden;
    inline-size: 100%;
    max-inline-size: none;
    block-size: 100%;
    max-block-size: none;
    padding: 0;
    border: 0;
    margin: 0;
    background: transparent;
    color: inherit;
    pointer-events: none;
  }

  .bottom-sheet-dialog::backdrop {
    background: transparent;
  }

  .scrim {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgb(11 11 8 / 0.74);
    cursor: pointer;
    pointer-events: auto;
    touch-action: none;
    will-change: opacity;
  }

  .sheet-layer {
    --_sheet-inset: 0;

    position: fixed;
    inset-inline: 0;
    inset-block-start: 0;
    inset-block-end: 0;
    display: grid;
    align-items: end;
    justify-items: stretch;
    overflow: visible;
    padding-inline: var(--_sheet-inset);
    pointer-events: none;
  }

  .panel {
    --_bottom-sheet-y: 1.5rem;
    --_sheet-content-inline: max(var(--page-gutter), env(safe-area-inset-left), env(safe-area-inset-right));
    --_sheet-inline-size: 100%;
    --_sheet-max-inline: none;
    --_sheet-radius: var(--sheet-radius, 1.1rem);

    position: relative;
    box-sizing: border-box;
    justify-self: stretch;
    inline-size: var(--_sheet-inline-size);
    max-inline-size: var(--_sheet-max-inline);
    min-inline-size: 0;
    block-size: calc(100dvh - 1.5rem);
    color: var(--ink);
    overflow: visible;
    outline: none;
    pointer-events: auto;
    will-change: transform;
  }

  .panel-clip {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    box-sizing: border-box;
    block-size: max(0px, calc(100dvh - var(--_bottom-sheet-y, 1.5rem) - 1px));
    border: 1px solid var(--strong);
    border-block-end: 0;
    border-start-start-radius: var(--_sheet-radius);
    border-start-end-radius: var(--_sheet-radius);
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    background: var(--surface);
    box-shadow: 0 -1.2rem 3rem rgb(11 11 8 / 0.22);
    color: var(--ink);
    overflow: clip;
  }

  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem;
    border-block-end: 1px solid var(--line);
  }

  .drag-region {
    display: grid;
    min-inline-size: 0;
    cursor: grab;
    touch-action: none;
    user-select: none;
    padding: 0.65rem var(--_sheet-content-inline) 0.85rem;
  }

  .panel[data-sheet-dragging="true"] .drag-region {
    cursor: grabbing;
  }

  .handle {
    justify-self: center;
    inline-size: 2.8rem;
    block-size: 0.28rem;
    border-radius: 999px;
    background: var(--strong);
  }

  .title {
    min-inline-size: 0;
    font-size: 0.96rem;
    font-weight: 720;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .close-container {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding-inline-end: var(--_sheet-content-inline);
    height: 100%;
  }

  .close-button {
    padding: 0.4rem 0.72rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    cursor: pointer;
  }

  .close-button:hover {
    border-color: var(--strong);
    background: var(--surface);
  }

  .close-button:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 3px;
  }

  .body {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: clamp(1rem, 2vw, 1.35rem) var(--_sheet-content-inline) calc(2rem + env(safe-area-inset-bottom));
    -webkit-overflow-scrolling: touch;
  }

  :global(html[data-sheet-open="true"]),
  :global(html[data-sheet-open="true"] body) {
    overflow: hidden;
  }

  /* Fixed overlays are out of the page grid, so inset mode follows shared rail tokens rather than subgrid. */
  @media (width >= 48rem) {
    .bottom-sheet-dialog[data-sheet-mode="inset"] .sheet-layer,
    .bottom-sheet-dialog[data-sheet-mode="auto"] .sheet-layer {
      --_sheet-inset: var(--sheet-inset, 0);
    }

    .bottom-sheet-dialog[data-sheet-mode="inset"] .panel,
    .bottom-sheet-dialog[data-sheet-mode="auto"] .panel {
      --_sheet-inline-size: min(100%, var(--sheet-max-inline, 100%));
      --_sheet-max-inline: var(--sheet-max-inline, none);

      justify-self: center;
    }

    .bottom-sheet-dialog[data-sheet-mode="inset"] .panel-clip,
    .bottom-sheet-dialog[data-sheet-mode="auto"] .panel-clip {
      border-end-start-radius: var(--_sheet-radius);
      border-end-end-radius: var(--_sheet-radius);
    }
  }

  @media (width <= 660px) {
    .panel {
      block-size: calc(100dvh - 1.5rem);
    }
  }
}
</style>
