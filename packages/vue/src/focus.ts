export type InitialFocus =
  | "close"
  | "title"
  | "first-interactive"
  | HTMLElement
  | (() => HTMLElement | undefined);

export interface FocusReturnOptions {
  fallback?: HTMLElement | (() => HTMLElement | undefined) | undefined;
  opener?: HTMLElement | undefined;
}

const interactiveSelector = [
  "button",
  "[href]",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable='true']",
  "audio[controls]",
  "video[controls]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function isRendered(element: HTMLElement) {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    style?.display !== "none" &&
    style?.visibility !== "hidden" &&
    element.getClientRects().length > 0
  );
}

function isDisabled(element: HTMLElement) {
  if (element.matches(":disabled, [aria-disabled='true']")) {
    return true;
  }

  const fieldset = element.closest("fieldset[disabled]");
  if (!fieldset) {
    return false;
  }

  const firstLegend = fieldset.querySelector(":scope > legend");
  return !firstLegend?.contains(element);
}

function isInteractive(element: HTMLElement) {
  return (
    !element.closest("[inert]") &&
    !element.closest("[hidden], [aria-hidden='true']") &&
    !isDisabled(element) &&
    isRendered(element) &&
    element.tabIndex >= 0
  );
}

export function interactiveElements(container: HTMLElement | undefined) {
  if (!container) return [];
  const candidates = [...container.querySelectorAll<HTMLElement>(interactiveSelector)].filter(
    isInteractive,
  );
  return candidates.filter((candidate) => {
    if (
      !(candidate instanceof HTMLInputElement) ||
      candidate.type !== "radio" ||
      candidate.checked
    ) {
      return true;
    }
    const name = CSS.escape(candidate.name);
    return !container.querySelector<HTMLInputElement>(
      `input[type='radio'][name='${name}']:checked`,
    );
  });
}

export function captureFocusOpener(documentTarget?: Document) {
  const activeElement = documentTarget?.activeElement;
  return typeof HTMLElement !== "undefined" && activeElement instanceof HTMLElement
    ? activeElement
    : undefined;
}

export function firstInteractive(container: HTMLElement | undefined) {
  return interactiveElements(container)[0];
}

export function maintainModalTabOrder(event: KeyboardEvent, container: HTMLElement | undefined) {
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

export function resolveInitialFocus(
  policy: InitialFocus,
  targets: {
    close?: HTMLElement | undefined;
    container?: HTMLElement | undefined;
    title?: HTMLElement | undefined;
  },
) {
  if (policy instanceof HTMLElement) {
    return policy;
  }
  if (typeof policy === "function") {
    return policy();
  }
  if (policy === "close") {
    return targets.close;
  }
  if (policy === "title") {
    return targets.title;
  }
  return firstInteractive(targets.container);
}

export function focusInitial(
  policy: InitialFocus,
  targets: {
    close?: HTMLElement | undefined;
    container?: HTMLElement | undefined;
    title?: HTMLElement | undefined;
  },
) {
  const target = resolveInitialFocus(policy, targets);
  target?.focus({ preventScroll: true });
  return target !== undefined && target === target.ownerDocument.activeElement;
}

/** @deprecated Prefer an explicit InitialFocus policy with focusInitial(). */
export function focusInside(container: HTMLElement | undefined) {
  return focusInitial("first-interactive", { container });
}

function resolveFocusTarget(target: HTMLElement | (() => HTMLElement | undefined) | undefined) {
  return typeof target === "function" ? target() : target;
}

export function restoreFocus(options: FocusReturnOptions | HTMLElement | undefined) {
  const normalized = options instanceof HTMLElement ? { opener: options } : (options ?? {});
  const target = [normalized.opener, resolveFocusTarget(normalized.fallback)].find(
    (candidate) => candidate?.isConnected,
  );
  if (!target) {
    return false;
  }

  target.focus({ preventScroll: true });
  return target === target.ownerDocument.activeElement;
}
