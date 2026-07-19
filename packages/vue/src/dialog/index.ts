export { default as ModalDialog } from "./components/ModalDialog.vue";
export type { CloseReason } from "./dialog-contracts";
export {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "../internal/accessibility/focus";
export type { FocusReturnOptions, InitialFocus } from "../internal/accessibility/focus";
