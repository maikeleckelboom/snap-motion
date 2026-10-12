// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelStudioTransition,
  runStudioTransition,
  supportsStudioTransitions,
  type StudioTransitionOptions,
} from "../src/playground/studio/studio-transition";

interface FakeTransition {
  readonly finished: Promise<void>;
  readonly ready: Promise<void>;
  skipTransition: () => void;
  finish: () => void;
  callbackDone: Promise<void>;
}

/** A controllable stand-in for the browser's transition: the test decides when it finishes. */
function installFake(options: { throws?: boolean; skipBeforeCallback?: boolean } = {}) {
  const transitions: FakeTransition[] = [];
  const named: string[][] = [];
  const start = vi.fn<(callback: () => Promise<void> | void) => FakeTransition>((callback) => {
    if (options.throws) throw new Error("InvalidStateError");
    let finish!: () => void;
    let reject!: (error: unknown) => void;
    const finished = new Promise<void>((resolve, rejectFinished) => {
      finish = resolve;
      reject = rejectFinished;
    });
    const ready = Promise.resolve();
    // A real transition calls the callback after capturing the old state, in a later task.
    const callbackDone = (async () => {
      await Promise.resolve();
      if (options.skipBeforeCallback) {
        reject(new DOMException("skipped", "AbortError"));
        return;
      }
      await callback();
    })();
    const transition: FakeTransition = {
      finished,
      ready,
      callbackDone,
      finish,
      skipTransition: vi.fn<() => void>(() => finish()),
    };
    transitions.push(transition);
    named.push(snapshotNames());
    return transition;
  });
  (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
  return { start, transitions, named };
}

function snapshotNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>("*")]
    .map((element) => element.style.getPropertyValue("view-transition-name"))
    .filter((name) => name !== "");
}

function mount(id: string) {
  const node = document.createElement("div");
  node.id = id;
  document.body.append(node);
  return node;
}

function request(overrides: Partial<StudioTransitionOptions> = {}): StudioTransitionOptions {
  return {
    kind: "view",
    direction: 1,
    reducedMotion: false,
    update: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cancelStudioTransition(document);
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});

describe("without the API, or with reduced motion", () => {
  it("detects support from the document, not from the user agent", () => {
    expect(supportsStudioTransitions(document)).toBe(false);
    installFake();
    expect(supportsStudioTransitions(document)).toBe(true);
    expect(supportsStudioTransitions(undefined)).toBe(false);
  });

  it("runs the update and reports that it did not transition", async () => {
    const update = vi.fn<() => void>();
    const after = vi.fn<() => void>();
    const outcome = await runStudioTransition(request({ update, afterUpdate: after }));
    expect(outcome).toBe("updated");
    expect(update).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.studioTransition).toBeUndefined();
  });

  it("does not start a transition under reduced motion, but still updates", async () => {
    const fake = installFake();
    const update = vi.fn<() => void>();
    const outcome = await runStudioTransition(request({ update, reducedMotion: true }));
    expect(outcome).toBe("updated");
    expect(fake.start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("with the API", () => {
  it("runs the update inside the transition, names the region only while it runs, then cleans up", async () => {
    const fake = installFake();
    const region = mount("region");
    const update = vi.fn<() => void>(() => {
      region.dataset.changed = "true";
    });
    const run = runStudioTransition(
      request({ update, region: { name: "studio-view", element: region } }),
    );
    // Named before the browser captures the old state, and marked for the stylesheet.
    expect(region.style.getPropertyValue("view-transition-name")).toBe("studio-view");
    expect(document.documentElement.dataset.studioTransition).toBe("view");
    expect(document.documentElement.dataset.studioDirection).toBe("forward");
    await fake.transitions[0]!.callbackDone;
    expect(update).toHaveBeenCalledTimes(1);
    expect(region.dataset.changed).toBe("true");
    fake.transitions[0]!.finish();
    await expect(run).resolves.toBe("transitioned");
    expect(region.style.getPropertyValue("view-transition-name")).toBe("");
    expect(document.documentElement.dataset.studioTransition).toBeUndefined();
    expect(document.documentElement.dataset.studioDirection).toBeUndefined();
  });

  it("steers the direction of a transition that goes back", async () => {
    const fake = installFake();
    const run = runStudioTransition(request({ direction: -1 }));
    expect(document.documentElement.dataset.studioDirection).toBe("back");
    fake.transitions[0]!.finish();
    await run;
  });

  it("moves a shared name from the old element to the new one, never holding it twice", async () => {
    const fake = installFake();
    const source = mount("source");
    const destination = mount("destination");
    const run = runStudioTransition(
      request({
        kind: "detail",
        shared: { name: "studio-glyph", source, destination: () => destination },
      }),
    );
    expect(snapshotNames()).toEqual(["studio-glyph"]);
    expect(source.style.getPropertyValue("view-transition-name")).toBe("studio-glyph");
    await fake.transitions[0]!.callbackDone;
    // In the new state only the destination carries it.
    expect(snapshotNames()).toEqual(["studio-glyph"]);
    expect(source.style.getPropertyValue("view-transition-name")).toBe("");
    expect(destination.style.getPropertyValue("view-transition-name")).toBe("studio-glyph");
    fake.transitions[0]!.finish();
    await run;
    expect(snapshotNames()).toEqual([]);
  });

  it("copes with a shared element that has no destination", async () => {
    const fake = installFake();
    const source = mount("source");
    const run = runStudioTransition(
      request({ shared: { name: "studio-glyph", source, destination: () => undefined } }),
    );
    await fake.transitions[0]!.callbackDone;
    fake.transitions[0]!.finish();
    await expect(run).resolves.toBe("transitioned");
    expect(snapshotNames()).toEqual([]);
  });

  it("waits for the DOM before it settles focus", async () => {
    const fake = installFake();
    const order: string[] = [];
    const run = runStudioTransition(
      request({ update: () => order.push("update"), afterUpdate: () => order.push("after") }),
    );
    await fake.transitions[0]!.callbackDone;
    expect(order).toEqual(["update", "after"]);
    fake.transitions[0]!.finish();
    await run;
  });
});

describe("repeated and interrupted transitions", () => {
  it("skips the older animation but never loses its state change, and the last update wins", async () => {
    const fake = installFake();
    const applied: string[] = [];
    const firstRegion = mount("first");
    const secondRegion = mount("second");
    const first = runStudioTransition(
      request({
        update: () => applied.push("compare"),
        region: { name: "studio-view", element: firstRegion },
      }),
    );
    const second = runStudioTransition(
      request({
        direction: -1,
        update: () => applied.push("candidates"),
        region: { name: "studio-view", element: secondRegion },
      }),
    );
    expect(fake.transitions[0]!.skipTransition).toHaveBeenCalledTimes(1);
    // Only the newest transition owns a name at any moment.
    expect(snapshotNames()).toEqual(["studio-view"]);
    expect(firstRegion.style.getPropertyValue("view-transition-name")).toBe("");
    await Promise.all(fake.transitions.map(({ callbackDone }) => callbackDone));
    expect(applied).toEqual(["compare", "candidates"]);
    fake.transitions[1]!.finish();
    await Promise.all([first, second]);
    expect(snapshotNames()).toEqual([]);
    expect(document.documentElement.dataset.studioTransition).toBeUndefined();
  });

  it("does not let a stale transition clear the names of a newer one", async () => {
    const fake = installFake();
    const first = runStudioTransition(request({ region: { name: "a", element: mount("one") } }));
    const newerRegion = mount("two");
    const second = runStudioTransition(
      request({ region: { name: "studio-view", element: newerRegion } }),
    );
    // The older one finishes late, after the newer one has begun.
    fake.transitions[0]!.finish();
    await first;
    expect(newerRegion.style.getPropertyValue("view-transition-name")).toBe("studio-view");
    expect(document.documentElement.dataset.studioTransition).toBe("view");
    fake.transitions[1]!.finish();
    await second;
    expect(snapshotNames()).toEqual([]);
  });

  it("cancelling skips the animation and removes every name", async () => {
    const fake = installFake();
    const region = mount("region");
    const run = runStudioTransition(request({ region: { name: "studio-view", element: region } }));
    cancelStudioTransition(document);
    expect(fake.transitions[0]!.skipTransition).toHaveBeenCalledTimes(1);
    expect(snapshotNames()).toEqual([]);
    await run;
  });
});

describe("when the browser refuses", () => {
  it("applies the update once if the API throws", async () => {
    installFake({ throws: true });
    const update = vi.fn<() => void>();
    const outcome = await runStudioTransition(request({ update }));
    expect(outcome).toBe("updated");
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.studioTransition).toBeUndefined();
  });

  it("applies the update once if the transition is aborted before its callback", async () => {
    installFake({ skipBeforeCallback: true });
    const update = vi.fn<() => void>();
    const region = mount("region");
    const outcome = await runStudioTransition(
      request({ update, region: { name: "studio-view", element: region } }),
    );
    expect(outcome).toBe("updated");
    expect(update).toHaveBeenCalledTimes(1);
    expect(region.style.getPropertyValue("view-transition-name")).toBe("");
  });
});
