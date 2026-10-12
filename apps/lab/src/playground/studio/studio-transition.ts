import { nextTick } from "vue";

/**
 * Native View Transitions for the Studio's application changes: moving between its two views on a
 * narrow layout, and opening or leaving a candidate's detail.
 *
 * What this is, and is not:
 *
 * - It calls the browser's own `document.startViewTransition`. Nothing imitates it with CSS.
 * - It is for changes of *application state* only. It never runs over a Stacked Deck, Coverflow or
 *   Sheet exchange: those own their physics and their native dialogs, and a snapshot of them would
 *   replace the very motion being evaluated.
 * - The transition is document-level, because that is the one form every supported engine has
 *   (element-scoped transitions are Chromium-only). A document transition freezes the rest of the
 *   page for its few hundred milliseconds, so it is used only for a change the visitor just asked
 *   for, and the root's own cross-fade is switched off so the frozen page does not flicker.
 * - A name is set on an element only for the length of one transition and removed afterwards, so a
 *   snapshot never holds the same name twice, and the page's stacking is untouched at rest.
 * - Without support, or under reduced motion, the update simply runs.
 *
 * The update closures callers pass are absolute (they set a target, they do not toggle). A newer
 * transition therefore skips an older one's animation but never its state change: every update
 * still runs, in order, and the last one wins.
 */

interface ViewTransitionLike {
  readonly finished: Promise<void>;
  readonly ready?: Promise<void>;
  skipTransition?: () => void;
}

interface ViewTransitionDocument {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionLike;
}

export type StudioTransitionKind = "view" | "detail";

export interface SharedElement {
  /** The one name this element pair shares for the length of the transition. */
  readonly name: string;
  /** The element in the old state. It need not survive the update. */
  readonly source: HTMLElement | undefined;
  /** Resolves the element in the new state, after the update has been flushed to the DOM. */
  readonly destination: () => HTMLElement | undefined;
}

export interface StudioTransitionOptions {
  readonly kind: StudioTransitionKind;
  /** +1 moves forward through the workflow, -1 back. It steers the direction of the slide. */
  readonly direction: 1 | -1;
  readonly reducedMotion: boolean;
  /** The state change. Absolute, never a toggle. */
  readonly update: () => void;
  /** Runs once the update is in the DOM: where focus and scroll are settled. */
  readonly afterUpdate?: () => void;
  /** The region that changes, named for the length of the transition. */
  readonly region?: { readonly name: string; readonly element: HTMLElement | undefined };
  readonly shared?: SharedElement;
  readonly document?: Document;
}

export type StudioTransitionOutcome = "transitioned" | "updated";

interface ActiveTransition {
  readonly named: Set<HTMLElement>;
  readonly names: Map<HTMLElement, string>;
  transition?: ViewTransitionLike | undefined;
}

const active = new WeakMap<Document, ActiveTransition>();

export function supportsStudioTransitions(doc: Document | undefined): boolean {
  return (
    typeof (doc as unknown as ViewTransitionDocument | undefined)?.startViewTransition ===
    "function"
  );
}

function setName(owner: ActiveTransition, element: HTMLElement | undefined, name: string) {
  if (!element) return;
  element.style.setProperty("view-transition-name", name);
  owner.named.add(element);
  owner.names.set(element, name);
}

function clearNames(owner: ActiveTransition) {
  for (const element of owner.named) element.style.removeProperty("view-transition-name");
  owner.named.clear();
  owner.names.clear();
}

function release(doc: Document, owner: ActiveTransition) {
  if (active.get(doc) !== owner) return;
  active.delete(doc);
  clearNames(owner);
  delete doc.documentElement.dataset.studioTransition;
  delete doc.documentElement.dataset.studioDirection;
}

/** Skips a running transition's animation. Its update has run or will run; only the names go. */
export function cancelStudioTransition(doc: Document) {
  const owner = active.get(doc);
  if (!owner) return;
  owner.transition?.skipTransition?.();
  release(doc, owner);
}

export async function runStudioTransition(
  options: StudioTransitionOptions,
): Promise<StudioTransitionOutcome> {
  const doc = options.document ?? document;
  cancelStudioTransition(doc);

  const applyUpdate = async () => {
    options.update();
    await nextTick();
    options.afterUpdate?.();
  };

  if (options.reducedMotion || !supportsStudioTransitions(doc)) {
    await applyUpdate();
    return "updated";
  }

  const owner: ActiveTransition = { named: new Set(), names: new Map() };
  active.set(doc, owner);
  doc.documentElement.dataset.studioTransition = options.kind;
  doc.documentElement.dataset.studioDirection = options.direction === 1 ? "forward" : "back";
  setName(owner, options.region?.element, options.region?.name ?? "");
  setName(owner, options.shared?.source, options.shared?.name ?? "");
  const stillOwner = () => active.get(doc) === owner;

  let updateRan = false;
  try {
    const transition = (doc as unknown as ViewTransitionDocument).startViewTransition!(async () => {
      updateRan = true;
      options.update();
      await nextTick();
      if (stillOwner()) {
        const shared = options.shared;
        // The new state names its own end of the shared pair; the old end is released first so the
        // snapshot never holds one name on two elements.
        if (shared) {
          const destination = shared.destination();
          if (shared.source && shared.source !== destination) {
            shared.source.style.removeProperty("view-transition-name");
            owner.named.delete(shared.source);
          }
          setName(owner, destination, shared.name);
        }
        const region = options.region;
        if (region?.element && !region.element.isConnected) owner.named.delete(region.element);
      }
      options.afterUpdate?.();
    });
    owner.transition = transition;
    void transition.ready?.catch(() => {});
    await transition.finished;
    return "transitioned";
  } catch {
    // The browser refused or aborted the transition. The state change is what matters: make sure it
    // happened, once.
    if (!updateRan) await applyUpdate();
    return "updated";
  } finally {
    release(doc, owner);
  }
}
