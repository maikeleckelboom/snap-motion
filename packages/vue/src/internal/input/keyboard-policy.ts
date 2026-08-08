import { resolveSnapKeyboardAction, type SnapKeyboardAction } from "@snap-motion/core";

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

/**
 * The content container of one item, whatever surface drew it.
 *
 * Arrow keys inside a *slide* belong to the slide's own controls, while arrow keys on a surface's
 * chrome — a Previous button, a pagination dot — belong to the surface. That distinction is about
 * item content, not about which surface happens to be rendering it, so every surface marks its
 * item containers with the same attribute instead of each one teaching this policy a new selector.
 */
const SURFACE_ITEM_SELECTOR = ["[data-slide-id]", "[data-snap-motion-item]"].join(", ");

const ITEM_INTERACTIVE_SELECTOR = ["a[href]", "button", "[role='button']", "[role='link']"].join(
  ", ",
);

/**
 * Whether something inside the surface has already claimed Arrow keys — a text field, a slider, a
 * nested composite widget, or an interactive control inside an item. Purely a DOM question, which
 * is why the semantic key mapping lives in the framework-neutral core instead.
 */
export function elementOwnsSnapMotionKeyboard(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (target.closest("[data-snap-motion-keyboard-navigation]")) return false;
  if (target.closest(KEYBOARD_OWNER_SELECTOR)) return true;
  const item = target.closest(SURFACE_ITEM_SELECTOR);
  const interactive = target.closest(ITEM_INTERACTIVE_SELECTOR);
  return Boolean(item && interactive && item.contains(interactive));
}

/**
 * One semantic key action for a surface laid out in a given writing direction.
 *
 * Previous and Next are directions of travel, not physical arrows, so under RTL the two swap. Every
 * surface in this package resolves them here rather than mirroring locally, which is what keeps
 * pointer, wheel, and keyboard from disagreeing about which way is forward.
 */
export function resolveDirectionalSnapKeyboardAction(
  event: Pick<KeyboardEvent, "key" | "target"> &
    Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "metaKey">>,
  direction: "ltr" | "rtl",
): SnapKeyboardAction | undefined {
  const action = resolveSnapKeyboardAction({
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    defaultPrevented: event.defaultPrevented,
    metaKey: event.metaKey,
    ownedByDescendant: elementOwnsSnapMotionKeyboard(event.target),
  });
  if (direction !== "rtl") return action;
  if (action === "previous") return "next";
  if (action === "next") return "previous";
  return action;
}
