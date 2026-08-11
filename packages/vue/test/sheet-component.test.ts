import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import Sheet from "../src/sheet/components/Sheet.vue";
interface SheetInstance {
  closeForPresentationChange: () => boolean;
  activeId: string;
  navigateTo: (id: string) => boolean;
  requestClose: (reason?: "programmatic") => void;
  synchronizeTo: (id: string) => boolean;
}

const resolveVisibleExtent = () => 240;

describe("production Sheet component", () => {
  it("no-ops a public close request after controlled and native closure", async () => {
    const wrapper = mount(Sheet, {
      props: { open: false, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
    });
    await nextTick();

    (wrapper.vm as unknown as SheetInstance).requestClose();
    expect(wrapper.emitted("update:open")).toBeUndefined();
    expect(wrapper.emitted("openRequest")).toBeUndefined();
    wrapper.unmount();
  });

  it("defaults an imperative close request to programmatic provenance", async () => {
    const wrapper = mount(Sheet, {
      props: { open: true, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
    });
    await nextTick();
    await nextTick();

    (wrapper.vm as unknown as SheetInstance).requestClose();
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(wrapper.emitted("openRequest")).toEqual([[false, { reason: "programmatic" }]]);
    wrapper.unmount();
  });

  it.each([
    ["top", "y"],
    ["right", "x"],
    ["bottom", "y"],
    ["left", "x"],
  ] as const)("renders stable structural hooks for %s", async (side, axis) => {
    const wrapper = mount(Sheet, {
      props: { open: false, reducedMotionOverride: true, side },
      slots: { title: () => "Sheet title", default: () => h("p", "Body content") },
    });
    await nextTick();

    const dialog = wrapper.get("dialog");
    const panel = wrapper.get(".snap-motion-sheet-panel");
    expect(dialog.attributes("data-sheet-side")).toBe(side);
    expect(dialog.attributes("data-sheet-axis")).toBe(axis);
    expect(dialog.attributes("data-sheet-state")).toBe("closed");
    expect(panel.attributes("data-sheet-side")).toBe(side);
    expect(wrapper.get(".snap-motion-sheet-drag-region").element.parentElement).toBe(panel.element);
    wrapper.unmount();
  });

  it("separates movable surface, constrained regions, measured chrome, and native body scroll", async () => {
    const wrapper = mount(Sheet, {
      props: { activeId: "comfortable", open: false, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => h("p", "Body content") },
    });
    await nextTick();

    const panel = wrapper.get(".snap-motion-sheet-panel");
    const viewport = wrapper.get(".snap-motion-sheet-viewport");
    const chrome = wrapper.get(".snap-motion-sheet-chrome");
    const body = wrapper.get(".snap-motion-sheet-body");
    expect(panel.element.parentElement).toBe(wrapper.element);
    expect(viewport.element.parentElement).toBe(panel.element);
    expect(chrome.element.parentElement).toBe(viewport.element);
    expect(body.element.parentElement).toBe(viewport.element);
    expect(wrapper.findAll(".snap-motion-sheet-content-shell")).toHaveLength(3);
    expect(body.attributes("tabindex")).toBe("0");
    expect(panel.attributes("style")).toContain("--snap-motion-sheet-canonical-position");
    expect(panel.attributes("style")).toContain("--snap-motion-sheet-visible-primary-extent");
    wrapper.unmount();
  });

  it("does not render a meaningless default one-option horizontal picker", async () => {
    const wrapper = mount(Sheet, {
      props: { open: false, reducedMotionOverride: true, side: "right" },
      slots: { title: () => "Inspector", default: () => "Body" },
    });
    await nextTick();
    expect(wrapper.find(".snap-motion-sheet-picker").exists()).toBe(false);
    wrapper.unmount();
  });

  it("never leaks the internal hidden anchor while closed configuration changes", async () => {
    const wrapper = mount(Sheet, {
      props: { activeId: "comfortable", open: false, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
    });
    await wrapper.setProps({ side: "right" });
    await nextTick();
    await nextTick();
    expect(wrapper.emitted("update:activeId") ?? []).not.toContainEqual(["__snap_motion_hidden__"]);
    wrapper.unmount();
  });

  it("closes a presentation swap immediately without publishing a refusable request", async () => {
    const wrapper = mount(Sheet, {
      props: { open: true, reducedMotionOverride: false },
      slots: { title: () => "Sheet title", default: () => h("button", "Inside") },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    expect((wrapper.vm as unknown as SheetInstance).closeForPresentationChange()).toBe(true);
    expect(wrapper.get("dialog").attributes()).not.toHaveProperty("open");
    expect(wrapper.emitted("update:open")).toContainEqual([false]);
    expect(wrapper.emitted("openRequest")).toBeUndefined();
    wrapper.unmount();
  });

  it("does not restore focus to an obsolete trigger when a presentation swap unmounts", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open sheet";
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(Sheet, {
      props: { open: true, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => h("button", "Inside") },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    vi.spyOn(dialog, "close").mockImplementation(() => dialog.removeAttribute("open"));

    expect((wrapper.vm as unknown as SheetInstance).closeForPresentationChange()).toBe(true);
    wrapper.unmount();

    expect(wrapper.emitted("openRequest")).toBeUndefined();
    expect(document.activeElement).not.toBe(opener);
    opener.remove();
  });

  it("lets only the latest close generation finalize a rapid reopen and reclose", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open sheet";
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(Sheet, {
      props: { open: true, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();

    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    const pendingCloseEvents: Array<() => void> = [];
    const pendingFocusFrames: FrameRequestCallback[] = [];
    const closeSpy = vi.spyOn(dialog, "close").mockImplementation(() => {
      dialog.removeAttribute("open");
      pendingCloseEvents.push(() => dialog.dispatchEvent(new Event("close")));
    });
    const requestFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pendingFocusFrames.push(callback);
        return pendingFocusFrames.length;
      });

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await wrapper.setProps({ open: false });
    expect(pendingCloseEvents).toHaveLength(2);

    pendingCloseEvents[0]!();
    await nextTick();
    expect(wrapper.emitted("closed")).toBeUndefined();
    expect(pendingFocusFrames).toHaveLength(0);

    pendingCloseEvents[1]!();
    await nextTick();
    expect(wrapper.emitted("closed")).toEqual([[]]);
    expect(pendingFocusFrames).toHaveLength(1);
    pendingFocusFrames[0]!(0);
    expect(document.activeElement).toBe(opener);

    requestFrameSpy.mockRestore();
    closeSpy.mockRestore();
    wrapper.unmount();
    opener.remove();
  });

  it("keeps a refused controlled close request open and repeatable", async () => {
    const wrapper = mount(Sheet, {
      props: { open: true, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();

    await wrapper.get(".snap-motion-sheet-close").trigger("click");
    await wrapper.get(".snap-motion-sheet-close").trigger("click");
    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    expect(wrapper.get("dialog").attributes("data-sheet-state")).toBe("open");
    expect(wrapper.emitted("openRequest")).toEqual([
      [false, { reason: "close-button" }],
      [false, { reason: "close-button" }],
    ]);
    expect(wrapper.emitted("closed")).toBeUndefined();

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(wrapper.get("dialog").attributes("open")).toBeUndefined();
    expect(wrapper.emitted("closed")).toEqual([[]]);
    wrapper.unmount();
  });

  it("repairs refused unexpected native closure without duplicating lifecycle events", async () => {
    const wrapper = mount(Sheet, {
      props: {
        initialFocus: () =>
          document.querySelector<HTMLElement>("[data-sheet-repair-focus]") ?? undefined,
        open: true,
        reducedMotionOverride: true,
      },
      slots: {
        title: () => "Sheet title",
        default: () => h("button", { "data-sheet-repair-focus": "" }, "Repair focus target"),
      },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();

    const focusTarget = wrapper.get("[data-sheet-repair-focus]").element;
    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    const snap = wrapper.get("dialog").attributes("data-sheet-snap");
    expect(document.activeElement).toBe(focusTarget);

    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("openRequest")).toEqual([[false, { reason: "programmatic" }]]);
    expect(wrapper.emitted("opened")).toEqual([[]]);
    expect(wrapper.emitted("closed")).toBeUndefined();
    expect(wrapper.get("dialog").attributes()).toHaveProperty("open");
    expect(wrapper.get("dialog").attributes("data-sheet-state")).toBe("open");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe(snap);
    expect(document.activeElement).toBe(focusTarget);
    wrapper.unmount();
  });

  it("preserves the same body subtree across snap and side changes", async () => {
    const wrapper = mount(Sheet, {
      props: {
        activeId: "comfortable",
        open: true,
        reducedMotionOverride: true,
        side: "bottom",
      },
      slots: { title: () => "Sheet title", default: () => h("textarea") },
      attachTo: document.body,
    });
    await nextTick();

    const body = wrapper.get(".snap-motion-sheet-body").element;
    const textarea = wrapper.get("textarea").element as HTMLTextAreaElement;
    textarea.value = "preserve me";
    await wrapper.setProps({ activeId: "compact" });
    await nextTick();
    expect((wrapper.vm as unknown as SheetInstance).activeId).toBe("compact");

    await wrapper.setProps({ side: "right" });
    await nextTick();
    await nextTick();
    expect(wrapper.get(".snap-motion-sheet-body").element).toBe(body);
    expect(wrapper.get("textarea").element).toBe(textarea);
    expect(textarea.value).toBe("preserve me");
    expect((wrapper.vm as unknown as SheetInstance).activeId).toBe("compact");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("open");
    wrapper.unmount();
  });

  it("stores authoritative snap changes while closed and opens there without hidden motion", async () => {
    const wrapper = mount(Sheet, {
      props: {
        activeId: "comfortable",
        open: false,
        reducedMotionOverride: true,
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    const panel = wrapper.get(".snap-motion-sheet-panel");
    const closedTransform = panel.attributes("style");

    await wrapper.setProps({ activeId: "compact" });
    await nextTick();
    expect((wrapper.vm as unknown as SheetInstance).activeId).toBe("compact");
    expect(wrapper.get("dialog").attributes("data-sheet-state")).toBe("closed");
    expect(panel.attributes("style")).toBe(closedTransform);
    expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
    expect(wrapper.emitted("settled")).toBeUndefined();

    await wrapper.setProps({ open: true });
    await nextTick();
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("compact");
    expect(wrapper.get("dialog").attributes("data-sheet-state")).toBe("open");
  });

  it("rolls an ignored controlled snap request back without a false settlement", async () => {
    const wrapper = mount(Sheet, {
      props: { activeId: "comfortable", open: true, reducedMotionOverride: true },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const sheet = wrapper.vm as unknown as SheetInstance;

    expect(sheet.navigateTo("compact")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["compact", { reason: "programmatic" }]]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect(sheet.activeId).toBe("comfortable");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("comfortable");
    expect(sheet.synchronizeTo("compact")).toBe(false);
    wrapper.unmount();
  });

  it("anchors rejection to the latest accepted controlled snap", async () => {
    let acceptedFirstRequest = false;
    let wrapper: ReturnType<typeof mount>;
    wrapper = mount(Sheet, {
      props: {
        activeId: "a",
        open: true,
        reducedMotionOverride: true,
        snapPoints: [
          { id: "a", label: "A", resolveVisibleExtent: () => 120 },
          { id: "b", label: "B", resolveVisibleExtent: () => 240 },
          { id: "c", label: "C", resolveVisibleExtent: () => 360 },
        ],
        "onUpdate:activeId": (id: string) => {
          if (!acceptedFirstRequest && id === "b") {
            acceptedFirstRequest = true;
            void wrapper.setProps({ activeId: id });
          }
        },
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const sheet = wrapper.vm as unknown as SheetInstance;

    expect(sheet.navigateTo("b")).toBe(true);
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("b");

    expect(sheet.navigateTo("c")).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(sheet.navigateTo("c")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["b", { reason: "programmatic" }],
      ["c", { reason: "programmatic" }],
      ["c", { reason: "programmatic" }],
    ]);
    expect(sheet.activeId).toBe("b");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("b");
    expect(wrapper.emitted("settled")).toEqual([["b", { reason: "programmatic" }]]);
    wrapper.unmount();
  });

  it("lets external authority replace a pending snap after an accepted destination", async () => {
    let acceptedFirstRequest = false;
    let wrapper: ReturnType<typeof mount>;
    wrapper = mount(Sheet, {
      props: {
        activeId: "a",
        open: true,
        reducedMotionOverride: true,
        snapPoints: [
          { id: "a", label: "A", resolveVisibleExtent: () => 120 },
          { id: "b", label: "B", resolveVisibleExtent: () => 240 },
          { id: "c", label: "C", resolveVisibleExtent: () => 360 },
        ],
        "onUpdate:activeId": (id: string) => {
          if (!acceptedFirstRequest && id === "b") {
            acceptedFirstRequest = true;
            void wrapper.setProps({ activeId: "b" });
          } else if (id === "c") {
            void wrapper.setProps({ activeId: "a" });
          }
        },
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const sheet = wrapper.vm as unknown as SheetInstance;

    expect(sheet.navigateTo("b")).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("b");

    expect(sheet.navigateTo("c")).toBe(true);
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(sheet.activeId).toBe("a");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("a");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["c", { reason: "programmatic" }]);
    expect(wrapper.get('[role="status"]').text()).not.toContain("C");
    wrapper.unmount();
  });

  it("hands controlled ownership off from the latest authority, not a pending snap", async () => {
    const wrapper = mount(Sheet, {
      props: {
        activeId: "a",
        open: true,
        reducedMotionOverride: true,
        snapPoints: [
          { id: "a", label: "A", resolveVisibleExtent: () => 120 },
          { id: "b", label: "B", resolveVisibleExtent: () => 240 },
        ],
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const sheet = wrapper.vm as unknown as SheetInstance;

    expect(sheet.navigateTo("b")).toBe(true);
    // Vue Test Utils has no removeProp API; undefined models an omitted optional runtime prop.
    await wrapper.setProps({ activeId: undefined } as never);
    await Promise.resolve();
    await nextTick();

    expect(sheet.activeId).toBe("a");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("a");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["b", { reason: "programmatic" }]);
    wrapper.unmount();
  });

  it("does not resurrect a snap authority from a completed controlled ownership epoch", async () => {
    const snapPoints = [
      { id: "a", label: "A", resolveVisibleExtent: () => 120 },
      { id: "b", label: "B", resolveVisibleExtent: () => 180 },
      { id: "c", label: "C", resolveVisibleExtent: () => 240 },
      { id: "d", label: "D", resolveVisibleExtent: () => 300 },
    ];
    const futurePoint = {
      id: "future",
      label: "Future",
      resolveVisibleExtent: () => 360,
    };
    const wrapper = mount(Sheet, {
      props: {
        activeId: "a",
        open: true,
        reducedMotionOverride: true,
        snapPoints,
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const sheet = wrapper.vm as unknown as SheetInstance;

    await wrapper.setProps({ activeId: undefined } as never);
    expect(sheet.navigateTo("b")).toBe(true);
    await Promise.resolve();
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("b");

    await wrapper.setProps({ activeId: "future" });
    expect(sheet.navigateTo("c")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(sheet.activeId).toBe("future");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("b");
    expect(wrapper.emitted("settled") ?? []).not.toContainEqual(["c", { reason: "programmatic" }]);
    expect(wrapper.get('[role="status"]').text()).not.toContain("C");

    await wrapper.setProps({ snapPoints: [...snapPoints, futurePoint] });
    await Promise.resolve();
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("future");
    expect(wrapper.get('[role="status"]').text()).not.toContain("Future");
    expect((wrapper.emitted("settled") ?? []).filter(([id]) => id === "future")).toHaveLength(0);

    await wrapper.setProps({ activeId: undefined } as never);
    expect(sheet.activeId).toBe("future");
    expect(sheet.navigateTo("d")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(sheet.activeId).toBe("d");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("d");
    expect(wrapper.emitted("activeIdRequest")).toEqual([
      ["b", { reason: "programmatic" }],
      ["c", { reason: "programmatic" }],
      ["d", { reason: "programmatic" }],
    ]);
    wrapper.unmount();
  });

  it("retains a valid snap anchor while controlled authority is unavailable", async () => {
    const wrapper = mount(Sheet, {
      props: {
        activeId: "future",
        open: true,
        reducedMotionOverride: true,
        snapPoints: [
          { id: "current", label: "Current", resolveVisibleExtent },
          { id: "next", label: "Next", resolveVisibleExtent },
        ],
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const sheet = wrapper.vm as unknown as SheetInstance;

    expect(sheet.navigateTo("next")).toBe(true);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.emitted("activeIdRequest")).toEqual([["next", { reason: "programmatic" }]]);
    expect(wrapper.emitted("settled")).toBeUndefined();
    expect(sheet.activeId).toBe("future");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("current");
    wrapper.unmount();
  });

  it("adopts a pending controlled ID when a later snap-point configuration makes it valid", async () => {
    const wrapper = mount(Sheet, {
      props: {
        activeId: "future",
        open: false,
        reducedMotionOverride: true,
        snapPoints: [{ id: "current", label: "Current", resolveVisibleExtent }],
      },
      slots: { title: () => "Sheet title", default: () => "Body" },
      attachTo: document.body,
    });
    await nextTick();
    expect((wrapper.vm as unknown as SheetInstance).activeId).toBe("future");
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("current");

    await wrapper.setProps({
      snapPoints: [
        { id: "current", label: "Current", resolveVisibleExtent },
        { id: "future", label: "Future", resolveVisibleExtent },
      ],
    });
    await nextTick();
    expect((wrapper.vm as unknown as SheetInstance).activeId).toBe("future");
    expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
    expect(wrapper.emitted("settled")).toBeUndefined();

    await wrapper.setProps({ open: true });
    await nextTick();
    await nextTick();
    expect(wrapper.get("dialog").attributes("data-sheet-snap")).toBe("future");
  });
});
