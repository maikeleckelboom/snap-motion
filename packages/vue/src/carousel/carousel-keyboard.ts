import type { CarouselKeyboardScope } from "./carousel-contracts";

const KEYBOARD_OWNER_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "video[controls]",
  "audio[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menu']",
  "[role='menubar']",
  "[role='tree']",
  "[role='grid']",
  "[role='tablist']",
  "[role='radiogroup']",
  "[data-snap-motion-keyboard-owner]",
].join(", ");

const SLIDE_INTERACTIVE_SELECTOR = ["a[href]", "button", "[role='button']", "[role='link']"].join(
  ", ",
);

export function elementOwnsCarouselKeyboard(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (target.closest("[data-snap-motion-keyboard-navigation]")) return false;
  if (target.closest(KEYBOARD_OWNER_SELECTOR)) return true;
  const slide = target.closest("[data-slide-id]");
  const interactive = target.closest(SLIDE_INTERACTIVE_SELECTOR);
  return Boolean(slide && interactive && slide.contains(interactive));
}

export function carouselKeyAction(
  event: Pick<KeyboardEvent, "key" | "target"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "metaKey">>,
): "end" | "home" | "next" | "previous" | undefined {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    elementOwnsCarouselKeyboard(event.target)
  ) {
    return undefined;
  }

  switch (event.key) {
    case "ArrowLeft":
      return "previous";
    case "ArrowRight":
      return "next";
    case "Home":
      return "home";
    case "End":
      return "end";
    default:
      return undefined;
  }
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
  if (!(event.target instanceof Element) || !root.isConnected) return false;
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
