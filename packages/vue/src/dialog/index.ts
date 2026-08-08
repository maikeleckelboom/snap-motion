export { default as ModalDialog } from "./components/ModalDialog.vue";
export type { CloseReason } from "./dialog-contracts";
export type { FocusReturnOptions, InitialFocus } from "../contracts/focus-contracts";
export {
  captureFocusOpener,
  focusInitial,
  maintainModalTabOrder,
  restoreFocus,
} from "../internal/accessibility/focus";
