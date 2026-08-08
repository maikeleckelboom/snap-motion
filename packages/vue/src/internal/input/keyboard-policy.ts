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

/**
 * Whether something inside the surface has already claimed Arrow keys — a text field, a slider, a
 * nested composite widget, or an interactive control inside a slide. Purely a DOM question, which
 * is why the semantic key mapping lives in the framework-neutral core instead.
 */
export function elementOwnsSnapMotionKeyboard(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (target.closest("[data-snap-motion-keyboard-navigation]")) return false;
  if (target.closest(KEYBOARD_OWNER_SELECTOR)) return true;
  const slide = target.closest("[data-slide-id]");
  const interactive = target.closest(SLIDE_INTERACTIVE_SELECTOR);
  return Boolean(slide && interactive && slide.contains(interactive));
}
