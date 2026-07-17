const focusableSelector = [
  "[autofocus]",
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function captureFocusOpener(documentTarget?: Document) {
  const activeElement = documentTarget?.activeElement;
  return typeof HTMLElement !== "undefined" && activeElement instanceof HTMLElement
    ? activeElement
    : undefined;
}

export function focusInside(container: HTMLElement | undefined) {
  if (!container) {
    return false;
  }

  const candidates = [...container.querySelectorAll<HTMLElement>(focusableSelector), container];
  for (const candidate of candidates) {
    candidate.focus({ preventScroll: true });
    if (candidate === container.ownerDocument.activeElement) {
      return true;
    }
  }

  return false;
}

export function restoreFocus(opener: HTMLElement | undefined) {
  if (!opener?.isConnected) {
    return false;
  }

  opener.focus({ preventScroll: true });
  return true;
}
