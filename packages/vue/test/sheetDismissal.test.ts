import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import * as motionDriver from "../src/motion/motion-driver";
import Sheet from "../src/sheet/components/Sheet.vue";
import type { SheetDiagnostics } from "../src/sheet/sheetDiagnostics";
import { sheetExitPaintOutset, sheetVisuallyDismissed } from "../src/sheet/sheetDismissal";
import { ManualAnimationDriver } from "./manual-driver";

const clip = { top: 0, right: 400, bottom: 800, left: 0 };

describe("Sheet visual exit geometry", () => {
  it.each(["top", "right", "bottom", "left"] as const)(
    "%s keeps modal ownership until the painted free edge clears the clip",
    (side) => {
      const bounds = (overlap: number) => ({
        top: side === "bottom" ? 800 - overlap : -800 + overlap,
        bottom: side === "top" ? overlap : 1600 - overlap,
        left: side === "right" ? 400 - overlap : -400 + overlap,
        right: side === "left" ? overlap : 800 - overlap,
      });
      expect(sheetVisuallyDismissed(side, bounds(0.26), clip, 0, 2)).toBe(false);
      expect(sheetVisuallyDismissed(side, bounds(0.25), clip, 0, 2)).toBe(true);
      expect(sheetVisuallyDismissed(side, bounds(-0.74), clip, 1, 2)).toBe(false);
      expect(sheetVisuallyDismissed(side, bounds(-0.75), clip, 1, 2)).toBe(true);
      expect(sheetVisuallyDismissed(side, bounds(-50), clip, 0, 2)).toBe(true);
    },
  );

  it("includes outlines, asymmetric and multiple shadows, and fails closed for filters", () => {
    const style = document.createElement("div").style;
    style.boxShadow = "rgba(21, 20, 15, 0.12) 0px 0px 0px 1px";
    expect(sheetExitPaintOutset(style, "bottom")).toBe(1);
    style.boxShadow = "rgb(0, 0, 0) 4px -6px 8px 2px, inset 0px 0px 0px 30px";
    expect(sheetExitPaintOutset(style, "bottom")).toBe(24);
    expect(sheetExitPaintOutset(style, "top")).toBe(12);
    expect(sheetExitPaintOutset(style, "left")).toBe(22);
    style.filter = "drop-shadow(0px 0px 4px black)";
    expect(sheetExitPaintOutset(style, "bottom")).toBe(Infinity);
  });
});

describe("Sheet native visual dismissal", () => {
  it("stops the hidden playback, establishes exact rest, and rejects stale completion after reopen", async () => {
    const driver = new ManualAnimationDriver();
    vi.spyOn(motionDriver, "createMotionDriver").mockReturnValue(driver);
    const wrapper = mount(Sheet, {
      props: { open: false, reducedMotionOverride: false },
      slots: { title: () => "Visual exit", default: () => "Body" },
      attachTo: document.body,
    });
    const sheet = wrapper.vm as unknown as { diagnostics: SheetDiagnostics };
    const dialog = wrapper.get<HTMLDialogElement>("dialog").element;
    const panel = wrapper.get<HTMLElement>(".snap-motion-sheet-panel").element;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1024, 768));
    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, sheet.diagnostics.position, 1024, 768),
    );
    try {
      await wrapper.setProps({ open: true });
      await nextTick();
      await nextTick();
      driver.latest!.complete();
      await nextTick();
      await wrapper.setProps({ open: false });
      const closing = driver.latest!;
      const hidden = closing.request.to;
      closing.update(sheet.diagnostics.primarySurfaceExtent - 0.51, 1000);
      await nextTick();
      expect(dialog.open).toBe(true);
      closing.update(sheet.diagnostics.primarySurfaceExtent - 0.49, 1000);
      await nextTick();
      expect(dialog.open).toBe(true);
      closing.update(sheet.diagnostics.primarySurfaceExtent + 0.01, 1000);
      await nextTick();
      expect(dialog.open).toBe(false);
      expect(closing.stopped).toBe(true);
      expect(sheet.diagnostics.position).toBe(hidden);
      expect(sheet.diagnostics.velocity).toBe(0);
      expect(sheet.diagnostics.phase).toBe("idle");
      expect(sheet.diagnostics.pointerOwned).toBe(false);
      dialog.dispatchEvent(new Event("close"));
      await nextTick();
      expect(wrapper.emitted("closed")).toHaveLength(1);
      await wrapper.setProps({ open: true });
      await nextTick();
      await nextTick();
      const reopening = driver.latest!;
      expect(reopening.request.from).toBe(hidden);
      closing.update(hidden + 30, -100);
      closing.complete();
      await nextTick();
      expect(dialog.open).toBe(true);
      expect(wrapper.emitted("closed")).toHaveLength(1);
      reopening.complete();
      await nextTick();
      expect(sheet.diagnostics.sheetState).toBe("open");
    } finally {
      wrapper.unmount();
    }
  });
});
