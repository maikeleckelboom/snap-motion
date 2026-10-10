const transitionName = "media-inspection-media";

interface MediaViewTransition {
  finished: Promise<void>;
  ready?: Promise<void>;
  skipTransition?: () => void;
}

interface OptionalViewTransitionDocument {
  startViewTransition?: (update: () => Promise<void> | void) => MediaViewTransition;
}

export interface MediaTransitionOptions {
  destination: () => HTMLElement | undefined;
  document?: Document;
  enabled: boolean;
  reducedMotion: boolean;
  source: HTMLElement | undefined;
  isCurrent?: () => boolean;
  update: () => Promise<void> | void;
}

interface TransitionOwnership {
  source: HTMLElement;
  destination?: HTMLElement | undefined;
  transition?: MediaViewTransition | undefined;
}
const owners = new WeakMap<Document, TransitionOwnership>();

export function cancelMediaTransition(document: Document) {
  const owner = owners.get(document);
  if (!owner) return;
  owners.delete(document);
  owner.transition?.skipTransition?.();
  clearTransitionName(owner.source);
  clearTransitionName(owner.destination);
}

function setTransitionName(element: HTMLElement | undefined, name: string) {
  element?.style.setProperty("view-transition-name", name);
}

function clearTransitionName(element: HTMLElement | undefined) {
  element?.style.removeProperty("view-transition-name");
}

export function supportsMediaTransition(document: Document | undefined): boolean {
  return (
    typeof (document as unknown as OptionalViewTransitionDocument | undefined)
      ?.startViewTransition === "function"
  );
}

export async function runMediaTransition(options: MediaTransitionOptions): Promise<boolean> {
  const ownerDocument = options.document ?? options.source?.ownerDocument;
  if (
    !options.enabled ||
    !options.source?.isConnected ||
    options.reducedMotion ||
    !ownerDocument ||
    !supportsMediaTransition(ownerDocument)
  ) {
    if (options.isCurrent?.() !== false) await options.update();
    return false;
  }
  const transitionDocument = ownerDocument as unknown as OptionalViewTransitionDocument;
  cancelMediaTransition(ownerDocument);
  const owner: TransitionOwnership = {
    source: options.source,
  };
  owners.set(ownerDocument, owner);
  const isCurrent = () => owners.get(ownerDocument) === owner && options.isCurrent?.() !== false;

  let destination: HTMLElement | undefined;
  let updateStarted = false;
  let updateCompleted = false;
  setTransitionName(options.source, transitionName);

  try {
    const transition = transitionDocument.startViewTransition?.(async () => {
      if (!isCurrent()) return;
      updateStarted = true;
      await options.update();
      updateCompleted = true;
      if (!isCurrent()) return;
      clearTransitionName(options.source);
      destination = options.destination();
      owner.destination = destination;
      setTransitionName(destination, transitionName);
    });
    owner.transition = transition;
    void transition?.ready?.catch(() => {});
    if (!transition) {
      if (isCurrent()) await options.update();
      return false;
    }
    await transition.finished;
    return true;
  } catch (error) {
    if (!updateStarted) {
      if (isCurrent()) await options.update();
      return false;
    }
    if (!updateCompleted) throw error;
    return false;
  } finally {
    if (owners.get(ownerDocument) === owner) {
      cancelMediaTransition(ownerDocument);
    }
  }
}
