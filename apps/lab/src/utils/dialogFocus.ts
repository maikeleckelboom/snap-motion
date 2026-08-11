const interactiveSelector = [
  "button",
  "[href]",
  "input",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function interactiveElements(container: HTMLElement | undefined): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(interactiveSelector)].filter((element) => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return (
      !element.closest("[inert], [hidden], [aria-hidden='true']") &&
      !element.matches(":disabled, [aria-disabled='true']") &&
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      element.getClientRects().length > 0 &&
      element.tabIndex >= 0
    );
  });
}

export function captureFocusOpener(documentTarget?: Document): HTMLElement | undefined {
  const activeElement = documentTarget?.activeElement;
  return activeElement instanceof HTMLElement ? activeElement : undefined;
}

export function focusCloseButton(
  close: HTMLElement | undefined,
  container: HTMLElement | undefined,
): boolean {
  const target = close ?? interactiveElements(container)[0];
  target?.focus({ preventScroll: true });
  return target !== undefined && target === target.ownerDocument.activeElement;
}

export function maintainModalTabOrder(
  event: KeyboardEvent,
  container: HTMLElement | undefined,
): boolean {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return false;
  const candidates = interactiveElements(container);
  const first = candidates[0];
  const last = candidates.at(-1);
  const active = container?.ownerDocument.activeElement;
  const target =
    event.shiftKey && active === first
      ? last
      : !event.shiftKey && active === last
        ? first
        : undefined;
  if (!target) return false;
  event.preventDefault();
  target.focus({ preventScroll: true });
  return true;
}

export function restoreFocus(target: HTMLElement | undefined): boolean {
  if (!target?.isConnected) return false;
  target.focus({ preventScroll: true });
  return target === target.ownerDocument.activeElement;
}
