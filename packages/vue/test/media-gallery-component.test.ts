import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import MediaGalleryDialog from "../src/media-gallery/components/MediaGalleryDialog.vue";
import type { MediaGalleryItem } from "../src/media-gallery/media-gallery-contracts";

const items: readonly MediaGalleryItem[] = [
  {
    id: "one",
    title: "One",
    alt: "First item",
    previewSrc: "/one-preview.jpg",
    fullSrc: "/one-full.jpg",
    width: 1_600,
    height: 1_000,
  },
  {
    id: "two",
    title: "Two",
    alt: "Second item",
    previewSrc: "/two-preview.jpg",
    fullSrc: "/two-full.jpg",
    width: 1_600,
    height: 1_000,
  },
  {
    id: "three",
    title: "Three",
    alt: "Third item",
    previewSrc: "/three-preview.jpg",
    width: 1_600,
    height: 1_000,
  },
];

let originalShowModal: typeof HTMLDialogElement.prototype.showModal;
let originalClose: typeof HTMLDialogElement.prototype.close;
let originalDecode: typeof HTMLImageElement.prototype.decode;
let originalGetClientRects: typeof HTMLElement.prototype.getClientRects;

function showModalStub(this: HTMLDialogElement) {
  this.setAttribute("open", "");
}

function closeDialogStub(this: HTMLDialogElement) {
  if (!this.open) return;
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
}

function getClientRectsStub(): DOMRectList {
  return [{ width: 44, height: 44 }] as unknown as DOMRectList;
}

function runAnimationFrameImmediately(callback: FrameRequestCallback) {
  callback(0);
  return 1;
}

function useControlledAnimationFrames() {
  let nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn<(callback: FrameRequestCallback) => number>((callback) => {
    const frame = nextFrame;
    nextFrame += 1;
    callbacks.set(frame, callback);
    return frame;
  });
  const cancel = vi.fn<(frame: number) => void>((frame) => {
    callbacks.delete(frame);
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);

  return {
    cancel,
    pending: () => callbacks.size,
    async flushNext() {
      const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) return false;
      callbacks.delete(entry[0]);
      entry[1](0);
      await flushReactiveTasks();
      return true;
    },
    async flushAll() {
      let remaining = 20;
      while (callbacks.size > 0 && remaining > 0) {
        await this.flushNext();
        remaining -= 1;
      }
      if (callbacks.size > 0) throw new Error("Animation-frame queue did not settle.");
    },
  };
}

function preferReducedMotion(): MediaQueryList {
  return Object.assign(new EventTarget(), {
    matches: true,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener() {},
    removeListener() {},
  }) as MediaQueryList;
}

function mountGallery(
  props: Partial<InstanceType<typeof MediaGalleryDialog>["$props"]> = {},
  useReducedMotionOverride = true,
): VueWrapper<InstanceType<typeof MediaGalleryDialog>> {
  return mount(MediaGalleryDialog, {
    attachTo: document.body,
    props: {
      items,
      open: true,
      ...(useReducedMotionOverride ? { reducedMotionOverride: true } : {}),
      ...props,
    },
  });
}

async function settleTrack(wrapper: VueWrapper) {
  await nextTick();
  await wrapper.get('[data-testid="snap-motion-media-gallery-track"]').trigger("transitionend", {
    propertyName: "transform",
  });
  await nextTick();
}

async function flushReactiveTasks() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function exposedSlots(wrapper: VueWrapper) {
  return wrapper
    .findAll(".snap-motion-media-gallery-slot")
    .filter((slot) => slot.attributes("aria-hidden") !== "true");
}

function namedImages(wrapper: VueWrapper) {
  return wrapper.findAll("img").filter((image) => (image.attributes("alt") ?? "").length > 0);
}

beforeEach(() => {
  originalShowModal = HTMLDialogElement.prototype.showModal;
  originalClose = HTMLDialogElement.prototype.close;
  originalDecode = HTMLImageElement.prototype.decode;
  originalGetClientRects = HTMLElement.prototype.getClientRects;

  HTMLDialogElement.prototype.showModal = showModalStub;
  HTMLDialogElement.prototype.close = closeDialogStub;
  HTMLImageElement.prototype.decode = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  HTMLElement.prototype.getClientRects = getClientRectsStub;
  vi.stubGlobal("requestAnimationFrame", runAnimationFrameImmediately);
  vi.stubGlobal("cancelAnimationFrame", vi.fn<(handle: number) => void>());
  Object.defineProperties(HTMLImageElement.prototype, {
    naturalHeight: { configurable: true, get: () => 100 },
    naturalWidth: { configurable: true, get: () => 160 },
  });
});

afterEach(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
  HTMLImageElement.prototype.decode = originalDecode;
  HTMLElement.prototype.getClientRects = originalGetClientRects;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
});

describe("MediaGalleryDialog lifecycle", () => {
  it("opens at a clamped initial index, focuses close, and emits opened", async () => {
    const wrapper = mountGallery({ initialIndex: 99 });
    await nextTick();

    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("2");
    expect(wrapper.emitted("opened")).toEqual([[2]]);
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="snap-motion-media-gallery-close"]').element,
    );
    expect(document.documentElement.style.overflow).toBe("hidden");

    wrapper.unmount();
  });

  it("uses the system preference for immediate open, navigation, and close completion", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(preferReducedMotion);
    const wrapper = mountGallery({}, false);
    await flushReactiveTasks();

    expect(wrapper.get("dialog").attributes("data-dialog-state")).toBe("open");
    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("1");
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-track"]').classes()).not.toContain(
      "transitioning",
    );
    expect(wrapper.emitted("indexChanged")?.at(-1)).toEqual([1, "next"]);

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(wrapper.get("dialog").attributes("open")).toBeUndefined();
    expect(wrapper.emitted("closed")?.at(-1)).toEqual([1]);
    matchMedia.mockRestore();
  });

  it("fails a requested empty open cycle safely", async () => {
    const wrapper = mountGallery({ items: [] });
    await nextTick();

    expect(wrapper.get("dialog").attributes("open")).toBeUndefined();
    expect(wrapper.emitted("requestClose")).toEqual([[0, "programmatic"]]);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
  });

  it("reports the final index and reason, closes immediately under reduced motion, and restores focus", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mountGallery({ focusReturn: { opener } });
    await nextTick();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await settleTrack(wrapper);
    await wrapper.get('[data-testid="snap-motion-media-gallery-close"]').trigger("click");

    expect(wrapper.emitted("requestClose")?.at(-1)).toEqual([1, "close-button"]);
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
    await wrapper.setProps({ open: false });
    await nextTick();

    expect(wrapper.emitted("closed")?.at(-1)).toEqual([1]);
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("falls back when the opener is removed before close", async () => {
    const opener = document.createElement("button");
    const fallback = document.createElement("button");
    document.body.append(opener, fallback);
    opener.focus();
    const wrapper = mountGallery({ focusReturn: { opener, fallback } });
    await nextTick();
    opener.remove();

    await wrapper.setProps({ open: false });
    await nextTick();

    expect(document.activeElement).toBe(fallback);
  });

  it("restores scroll ownership and focus on unmount", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mountGallery({ focusReturn: { opener } });
    await nextTick();
    expect(document.documentElement.style.overflow).toBe("hidden");

    wrapper.unmount();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("invalidates an opening cycle closed before its nextTick continuation", async () => {
    const frames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const wrapper = mountGallery({ focusReturn: { opener }, reducedMotionOverride: false });

    await wrapper.setProps({ open: false });
    await flushReactiveTasks();

    expect(wrapper.emitted("opened")).toBeUndefined();
    expect(wrapper.get("dialog").attributes("data-dialog-state")).toBe("closing");
    expect(document.activeElement).toBe(opener);
    expect(frames.pending()).toBe(0);

    await wrapper.get('[data-testid="snap-motion-media-gallery-shell"]').trigger("transitionend", {
      propertyName: "opacity",
    });
    await frames.flushAll();
    expect(wrapper.get("dialog").attributes("data-dialog-state")).toBe("closed");
  });

  it("invalidates scheduled navigation before close and reports only the committed index", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery();
    await flushReactiveTasks();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    expect(frames.pending()).toBe(1);

    await wrapper.setProps({ open: false });
    await frames.flushAll();

    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("0");
    expect(wrapper.emitted("indexChanged")).toBeUndefined();
    expect(wrapper.emitted("requestClose")?.at(-1)).toEqual([0, "programmatic"]);
    expect(wrapper.emitted("closed")?.at(-1)).toEqual([0]);
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-status"]').text()).toBe(
      "One, 1 of 3",
    );
  });

  it("invalidates scheduled navigation before item replacement and preserves identity", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery();
    await flushReactiveTasks();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    expect(frames.pending()).toBe(1);

    await wrapper.setProps({ items: [items[2]!, items[0]!] });
    await flushReactiveTasks();
    await frames.flushAll();

    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("1");
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-title"]').text()).toBe("One");
    expect(wrapper.emitted("indexChanged")).toBeUndefined();
    expect(wrapper.get("dialog").attributes("data-track-state")).toBe("idle");
  });

  it("invalidates active settlement when its destination is removed", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery({ reducedMotionOverride: false });
    await flushReactiveTasks();
    await frames.flushNext();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    await frames.flushNext();
    expect(wrapper.get("dialog").attributes("data-track-state")).toBe("settling");

    await wrapper.setProps({ items: [items[0]!, items[2]!] });
    await flushReactiveTasks();
    await frames.flushAll();

    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("0");
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-title"]').text()).toBe("One");
    expect(wrapper.get("dialog").attributes("data-track-state")).toBe("idle");
    expect(wrapper.emitted("indexChanged")).toBeUndefined();
  });

  it("requests one programmatic close for an empty replacement during opening", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery({ reducedMotionOverride: false });

    await wrapper.setProps({ items: [] });
    await flushReactiveTasks();
    await frames.flushAll();

    expect(wrapper.emitted("requestClose")).toEqual([[0, "programmatic"]]);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(wrapper.emitted("opened")).toBeUndefined();
    expect(wrapper.get("dialog").attributes("data-track-state")).toBe("idle");

    await wrapper.setProps({ open: false });
    await wrapper.get('[data-testid="snap-motion-media-gallery-shell"]').trigger("transitionend", {
      propertyName: "opacity",
    });
    expect(wrapper.get("dialog").attributes("data-dialog-state")).toBe("closed");
  });

  it("cancels recenter publication when close begins", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery({ reducedMotionOverride: false });
    await flushReactiveTasks();
    await frames.flushNext();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    await frames.flushNext();
    await wrapper.get('[data-testid="snap-motion-media-gallery-track"]').trigger("transitionend", {
      propertyName: "transform",
    });
    await flushReactiveTasks();

    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("1");
    expect(wrapper.get("dialog").attributes("data-track-state")).toBe("recentering");
    expect(wrapper.emitted("indexChanged")).toBeUndefined();
    expect(frames.pending()).toBe(1);

    await wrapper.setProps({ open: false });
    await wrapper.get('[data-testid="snap-motion-media-gallery-shell"]').trigger("transitionend", {
      propertyName: "opacity",
    });
    await frames.flushAll();

    expect(wrapper.emitted("indexChanged")).toBeUndefined();
    expect(wrapper.emitted("closed")?.at(-1)).toEqual([1]);
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-status"]').text()).toBe(
      "One, 1 of 3",
    );
    expect(wrapper.get("dialog").attributes("data-dialog-state")).toBe("closed");
  });

  it("keeps an old generation from mutating an immediate reopen", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery();
    await flushReactiveTasks();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    expect(frames.pending()).toBe(1);

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ initialIndex: 2 });
    await wrapper.setProps({ open: true });
    await flushReactiveTasks();
    await frames.flushAll();

    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("2");
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-title"]').text()).toBe("Three");
    expect(wrapper.emitted("opened")).toEqual([[0], [2]]);
    expect(wrapper.emitted("indexChanged")).toBeUndefined();
  });

  it("cancels scheduled opening and navigation work before unmount cleanup", async () => {
    const openingFrames = useControlledAnimationFrames();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const openingWrapper = mountGallery({
      focusReturn: { opener },
      reducedMotionOverride: false,
    });
    await flushReactiveTasks();
    expect(openingFrames.pending()).toBe(1);
    const openingEmissions = openingWrapper.emitted("opened") ?? [];
    const openingEmissionCount = openingEmissions.length;

    openingWrapper.unmount();
    await openingFrames.flushAll();
    expect(openingFrames.pending()).toBe(0);
    expect(openingEmissions).toHaveLength(openingEmissionCount);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);

    const navigationFrames = useControlledAnimationFrames();
    const navigationWrapper = mountGallery();
    await flushReactiveTasks();
    await navigationWrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    expect(navigationFrames.pending()).toBe(1);

    navigationWrapper.unmount();
    await navigationFrames.flushAll();
    expect(navigationFrames.pending()).toBe(0);
    expect(navigationWrapper.emitted("indexChanged")).toBeUndefined();
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("MediaGalleryDialog navigation", () => {
  it("uses one centralized track settlement for buttons, Home, and End", async () => {
    const wrapper = mountGallery({ initialIndex: 1 });
    await nextTick();

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await settleTrack(wrapper);
    expect(wrapper.emitted("indexChanged")?.at(-1)).toEqual([2, "next"]);

    await wrapper.get("dialog").trigger("keydown", { key: "Home" });
    await settleTrack(wrapper);
    expect(wrapper.emitted("indexChanged")?.at(-1)).toEqual([0, "home"]);

    await wrapper.get("dialog").trigger("keydown", { key: "End" });
    await settleTrack(wrapper);
    expect(wrapper.emitted("indexChanged")?.at(-1)).toEqual([2, "end"]);
  });

  it("keeps one-item boundaries disabled without hiding focused controls", async () => {
    const wrapper = mountGallery({ items: [items[0]!] });
    await nextTick();

    expect(
      wrapper.get('[data-testid="snap-motion-media-gallery-previous"]').attributes(),
    ).toHaveProperty("disabled");
    expect(
      wrapper.get('[data-testid="snap-motion-media-gallery-next"]').attributes(),
    ).toHaveProperty("disabled");
    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("0");
  });

  it("preserves the current identity across replacement and clamps when it is removed", async () => {
    const wrapper = mountGallery();
    await nextTick();
    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await settleTrack(wrapper);

    await wrapper.setProps({ items: [items[2]!, items[1]!, items[0]!] });
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("1");
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-title"]').text()).toBe("Two");

    await wrapper.setProps({ items: [items[2]!] });
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-gallery-index")).toBe("0");
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-title"]').text()).toBe("Three");
  });

  it("leaves modified browser shortcuts untouched", async () => {
    const wrapper = mountGallery();
    await nextTick();
    const event = new KeyboardEvent("keydown", {
      key: "+",
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });

    wrapper.get("dialog").element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.get("dialog").attributes("data-scale")).toBe("1.0000");
  });

  it("keeps only the committed item exposed throughout directional settlement", async () => {
    const frames = useControlledAnimationFrames();
    const wrapper = mountGallery({ reducedMotionOverride: false });
    await flushReactiveTasks();
    await frames.flushNext();

    expect(exposedSlots(wrapper)).toHaveLength(1);
    expect(exposedSlots(wrapper)[0]?.attributes("data-item-id")).toBe("one");
    expect(namedImages(wrapper)).toHaveLength(1);

    await wrapper.get('[data-testid="snap-motion-media-gallery-next"]').trigger("click");
    await flushReactiveTasks();
    await frames.flushNext();

    expect(wrapper.get("dialog").attributes("data-track-state")).toBe("settling");
    expect(exposedSlots(wrapper)).toHaveLength(1);
    expect(exposedSlots(wrapper)[0]?.attributes("data-item-id")).toBe("one");
    expect(
      wrapper.get('.snap-motion-media-gallery-slot[data-item-id="two"]').attributes("aria-hidden"),
    ).toBe("true");
    expect(namedImages(wrapper)).toHaveLength(1);

    await wrapper.get('[data-testid="snap-motion-media-gallery-track"]').trigger("transitionend", {
      propertyName: "transform",
    });
    await flushReactiveTasks();
    expect(exposedSlots(wrapper)).toHaveLength(1);
    expect(exposedSlots(wrapper)[0]?.attributes("data-item-id")).toBe("two");
    expect(wrapper.emitted("indexChanged")).toBeUndefined();

    await frames.flushNext();
    expect(wrapper.emitted("indexChanged")?.at(-1)).toEqual([1, "next"]);
    expect(wrapper.get('[data-testid="snap-motion-media-gallery-status"]').text()).toBe(
      "Two, 2 of 3",
    );
  });
});

describe("MediaGalleryDialog media lifecycle", () => {
  it("keeps previews mounted, reveals only decoded full media, and retries only a failed full layer", async () => {
    const wrapper = mountGallery();
    await nextTick();

    const currentSlot = wrapper.get('.snap-motion-media-gallery-slot[data-slot-position="0"]');
    const preview = currentSlot.get(".snap-motion-media-gallery-preview");
    expect(preview.attributes("alt")).toBe("First item");
    expect(preview.attributes("aria-hidden")).toBeUndefined();
    const full = currentSlot.get<HTMLImageElement>(".snap-motion-media-gallery-full");
    expect(full.attributes("alt")).toBe("");
    expect(full.attributes("aria-hidden")).toBe("true");
    expect(namedImages(wrapper)).toHaveLength(1);
    await full.trigger("load");
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("loaded");
    expect(full.classes()).toContain("revealed");
    expect(full.attributes("alt")).toBe("First item");
    expect(full.attributes("aria-hidden")).toBeUndefined();
    expect(preview.attributes("alt")).toBe("");
    expect(preview.attributes("aria-hidden")).toBe("true");
    expect(namedImages(wrapper)).toHaveLength(1);

    await full.trigger("error");
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("failed");
    expect(currentSlot.find(".snap-motion-media-gallery-preview").exists()).toBe(true);
    expect(currentSlot.find(".snap-motion-media-gallery-full").exists()).toBe(false);
    expect(preview.attributes("alt")).toBe("First item");
    expect(preview.attributes("aria-hidden")).toBeUndefined();
    expect(namedImages(wrapper)).toHaveLength(1);

    await wrapper.get(".snap-motion-media-gallery-status button").trigger("click");
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("pending");
    expect(
      currentSlot.get(".snap-motion-media-gallery-full").attributes("data-retry-attempt"),
    ).toBe("1");
  });

  it("treats missing or identical full sources as complete preview-only media", async () => {
    const wrapper = mountGallery({
      items: [
        items[2]!,
        {
          ...items[0]!,
          id: "same",
          fullSrc: items[0]!.previewSrc,
        },
      ],
    });
    await nextTick();

    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("preview");
    expect(wrapper.find(".snap-motion-media-gallery-full").exists()).toBe(false);
    expect(wrapper.find('[data-testid="snap-motion-media-gallery-loading"]').exists()).toBe(false);
    expect(namedImages(wrapper)).toHaveLength(1);
    expect(namedImages(wrapper)[0]?.attributes("alt")).toBe("Third item");
  });

  it("reports preview failure without converting it into a full-image retry", async () => {
    const wrapper = mountGallery({ items: [items[2]!] });
    await nextTick();
    await wrapper.get(".snap-motion-media-gallery-preview").trigger("error");
    await nextTick();

    expect(wrapper.get('[data-testid="snap-motion-media-gallery-preview-error"]').text()).toBe(
      "Preview unavailable.",
    );
    expect(wrapper.find(".snap-motion-media-gallery-status button").exists()).toBe(false);
    expect(namedImages(wrapper)).toHaveLength(1);
  });

  it("keeps a stale decode from publishing across close and reopen", async () => {
    let releaseDecode: (() => void) | undefined;
    HTMLImageElement.prototype.decode = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          releaseDecode = resolve;
        }),
    );
    const wrapper = mountGallery();
    await flushReactiveTasks();
    const staleFull = wrapper.get<HTMLImageElement>(
      '[data-slot-position="0"] .snap-motion-media-gallery-full',
    );
    const staleCycle = staleFull.attributes("data-open-cycle");

    void staleFull.trigger("load");
    await Promise.resolve();
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await flushReactiveTasks();

    const currentFull = wrapper.get<HTMLImageElement>(
      '[data-slot-position="0"] .snap-motion-media-gallery-full',
    );
    expect(currentFull.attributes("data-open-cycle")).not.toBe(staleCycle);
    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("pending");

    if (!releaseDecode) throw new Error("Decode hold was not initialized.");
    releaseDecode();
    await flushReactiveTasks();

    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("pending");
    expect(currentFull.classes()).not.toContain("revealed");
    expect(namedImages(wrapper)).toHaveLength(1);
  });

  it("normalizes a partially invalid intrinsic pair to a usable square viewport", async () => {
    const wrapper = mountGallery({
      items: [{ ...items[0]!, height: -1 }],
    });
    await flushReactiveTasks();

    const viewportStyle = wrapper
      .get('[data-testid="snap-motion-media-gallery-viewport"]')
      .attributes("style");
    const preview = wrapper.get<HTMLImageElement>(".snap-motion-media-gallery-preview");
    const ratio = Number(/--_gallery-aspect-ratio:\s*([^;]+)/.exec(viewportStyle ?? "")?.[1]);

    expect(preview.attributes("width")).toBe("1");
    expect(preview.attributes("height")).toBe("1");
    expect(Number.isFinite(ratio)).toBe(true);
    expect(ratio).toBe(1);
  });

  it("surfaces invalid IDs as a RangeError", () => {
    expect(() =>
      mountGallery({
        items: [items[0]!, { ...items[1]!, id: " one " }],
      }),
    ).toThrowError(RangeError);
  });

  it("surfaces invalid IDs introduced by a component update", async () => {
    const wrapper = mountGallery();
    await flushReactiveTasks();

    await expect(
      wrapper.setProps({
        items: [items[0]!, { ...items[1]!, id: " one " }],
      }),
    ).rejects.toThrowError(RangeError);
  });
});
