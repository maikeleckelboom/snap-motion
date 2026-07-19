const transitionName = "media-inspection-media";

interface MediaViewTransition {
  finished: Promise<void>;
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
  update: () => Promise<void> | void;
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
    options.reducedMotion ||
    !ownerDocument ||
    !supportsMediaTransition(ownerDocument)
  ) {
    await options.update();
    return false;
  }
  const transitionDocument = ownerDocument as unknown as OptionalViewTransitionDocument;

  let destination: HTMLElement | undefined;
  let updateStarted = false;
  let updateCompleted = false;
  setTransitionName(options.source, transitionName);

  try {
    const transition = transitionDocument.startViewTransition?.(async () => {
      updateStarted = true;
      await options.update();
      updateCompleted = true;
      clearTransitionName(options.source);
      destination = options.destination();
      setTransitionName(destination, transitionName);
    });
    if (!transition) {
      await options.update();
      return false;
    }
    await transition.finished;
    return true;
  } catch (error) {
    if (!updateStarted) {
      await options.update();
      return false;
    }
    if (!updateCompleted) throw error;
    return false;
  } finally {
    clearTransitionName(options.source);
    clearTransitionName(destination);
  }
}
