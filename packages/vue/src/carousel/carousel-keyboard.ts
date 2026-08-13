import type { SnapKeyboardAction } from "@snap-motion/core";

import { isElement } from "../internal/dom/realm";
import { resolveDirectionalSnapKeyboardAction } from "../internal/input/keyboard-policy";
import type { CarouselKeyboardScope } from "./carousel-contracts";

/**
 * Semantic key mapping from core, with the DOM ownership question and the writing direction
 * answered by the adapter. Direction defaults to `ltr` so a caller that has not resolved one yet
 * still gets the unmirrored reading.
 */
export function carouselKeyAction(
  event: Pick<KeyboardEvent, "key" | "target"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "metaKey">>,
  direction: "ltr" | "rtl" = "ltr",
): SnapKeyboardAction | undefined {
  return resolveDirectionalSnapKeyboardAction(event, direction);
}

interface DialogCarouselRegistration {
  readonly primary: () => boolean;
  readonly root: HTMLElement;
}

const dialogCarousels = new WeakMap<HTMLDialogElement, Set<DialogCarouselRegistration>>();
const warnedDialogs = new WeakSet<HTMLDialogElement>();
const isDevelopmentBuild =
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false;

export function registerDialogCarousel(
  dialog: HTMLDialogElement,
  registration: DialogCarouselRegistration,
): () => void {
  const registrations = dialogCarousels.get(dialog) ?? new Set<DialogCarouselRegistration>();
  registrations.add(registration);
  dialogCarousels.set(dialog, registrations);
  return () => {
    registrations.delete(registration);
    if (registrations.size === 0) dialogCarousels.delete(dialog);
  };
}

export function resolveCarouselKeyboardTarget(
  root: HTMLElement | undefined,
  scope: CarouselKeyboardScope,
): HTMLElement | undefined {
  if (!root || scope === "off") return undefined;
  if (scope === "carousel") return root;
  return root.closest<HTMLDialogElement>("dialog") ?? root;
}

function relevantRegistrations(dialog: HTMLDialogElement): DialogCarouselRegistration[] {
  return [...(dialogCarousels.get(dialog) ?? [])].filter(
    ({ root }) => root.isConnected && root.closest("dialog") === dialog,
  );
}

/** Resolves one owner before a scoped Arrow-key handler mutates an event. */
export function carouselOwnsScopedKeyboardEvent(root: HTMLElement, event: KeyboardEvent): boolean {
  if (!isElement(event.target) || !root.isConnected) return false;
  const nearestCarousel = event.target.closest<HTMLElement>("[data-snap-motion-carousel-root]");
  if (nearestCarousel) return nearestCarousel === root;

  const dialog = root.closest<HTMLDialogElement>("dialog");
  if (!dialog || !dialog.open || !dialog.contains(event.target)) return root.contains(event.target);

  const registrations = relevantRegistrations(dialog);
  if (registrations.length <= 1) return registrations[0]?.root === root;

  const primary = registrations.filter(
    (registration) =>
      registration.primary() || registration.root.hasAttribute("data-snap-motion-primary-carousel"),
  );
  if (primary.length === 1) return primary[0]?.root === root;

  if (isDevelopmentBuild && !warnedDialogs.has(dialog)) {
    warnedDialogs.add(dialog);
    // oxlint-disable-next-line no-console -- This is an intentional development-only ownership warning.
    console.warn(
      "Snap Motion found multiple dialog-wide carousels without one primary carousel. Arrow navigation is restricted to the carousel containing focus.",
    );
  }
  return false;
}
