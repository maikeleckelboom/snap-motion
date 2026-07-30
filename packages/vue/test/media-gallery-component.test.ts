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

function mountGallery(
  props: Partial<InstanceType<typeof MediaGalleryDialog>["$props"]> = {},
): VueWrapper<InstanceType<typeof MediaGalleryDialog>> {
  return mount(MediaGalleryDialog, {
    attachTo: document.body,
    props: {
      items,
      open: true,
      reducedMotionOverride: true,
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
});

describe("MediaGalleryDialog media lifecycle", () => {
  it("keeps previews mounted, reveals only decoded full media, and retries only a failed full layer", async () => {
    const wrapper = mountGallery();
    await nextTick();

    const currentSlot = wrapper.get('.snap-motion-media-gallery-slot[data-slot-position="0"]');
    expect(currentSlot.find(".snap-motion-media-gallery-preview").exists()).toBe(true);
    const full = currentSlot.get<HTMLImageElement>(".snap-motion-media-gallery-full");
    await full.trigger("load");
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("loaded");
    expect(full.classes()).toContain("revealed");

    await full.trigger("error");
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-image-state")).toBe("failed");
    expect(currentSlot.find(".snap-motion-media-gallery-preview").exists()).toBe(true);
    expect(currentSlot.find(".snap-motion-media-gallery-full").exists()).toBe(false);

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
  });
});
