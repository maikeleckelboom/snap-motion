import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";

import type { InitialFocus } from "../src/contracts/focus-contracts";
import * as motionDriver from "../src/motion/motion-driver";
import Sheet from "../src/sheet/components/Sheet.vue";
import type { SheetDiagnostics } from "../src/sheet/sheetDiagnostics";
import { ManualAnimationDriver } from "./manual-driver";

interface SheetInstance {
  diagnostics: SheetDiagnostics;
  navigateTo: (id: string) => boolean;
}

const bodyInitialFocus: InitialFocus = () =>
  document.querySelector<HTMLButtonElement>(".sheet-focus-target") ?? undefined;

function mountSheet(initialFocus: InitialFocus = "title", controlled = true) {
  const driver = new ManualAnimationDriver();
  vi.spyOn(motionDriver, "createMotionDriver").mockReturnValue(driver);
  const wrapper = mount(Sheet, {
    props: {
      ...(controlled ? { activeId: "compact" } : {}),
      initialFocus,
      open: false,
      reducedMotionOverride: false,
      side: "top",
      snapPoints: [
        { id: "compact", label: "Compact", resolveVisibleExtent: () => 320 },
        { id: "expanded", label: "Expanded", resolveVisibleExtent: () => 560 },
      ],
    },
    slots: {
      title: () => "Menu",
      default: () => h("button", { class: "sheet-focus-target" }, "Navigation"),
    },
    attachTo: document.body,
  });
  return { driver, wrapper, sheet: wrapper.vm as unknown as SheetInstance };
}

async function flushLifecycle() {
  await nextTick();
  await nextTick();
  await Promise.resolve();
}

describe("Sheet body focus lifecycle", () => {
  it.each(["title", "initial-body", "early-body"] as const)(
    "preserves pending external settlement after a closed authority change with %s focus",
    async (focus) => {
      const { driver, wrapper, sheet } = mountSheet(
        focus === "initial-body" ? bodyInitialFocus : "title",
      );
      try {
        await flushLifecycle();
        await wrapper.setProps({ activeId: "expanded" });
        expect(wrapper.emitted("settled")).toBeUndefined();
        expect(driver.animations).toHaveLength(0);
        await wrapper.setProps({ open: true });
        await flushLifecycle();
        const opening = driver.latest!;
        expect(driver.animations).toHaveLength(1);
        expect(sheet.diagnostics.sheetState).toBe(focus === "initial-body" ? "open" : "opening");
        if (focus === "title") opening.complete();
        else if (focus === "early-body") {
          wrapper.get<HTMLElement>(".snap-motion-sheet-body").element.focus();
        }
        await flushLifecycle();
        expect(sheet.diagnostics.sheetState).toBe("open");
        expect(sheet.diagnostics.isAnimating).toBe(false);
        expect(sheet.diagnostics.position).toBe(opening.request.to);
        expect(sheet.diagnostics.velocity).toBe(0);
        expect(driver.animations).toHaveLength(1);
        expect(opening.stopped).toBe(focus !== "title");
        expect(wrapper.emitted("settled")).toEqual([["expanded", { reason: "external" }]]);
        expect(wrapper.emitted("activeIdRequest")).toBeUndefined();
        opening.update(opening.request.from, 400);
        opening.complete();
        await flushLifecycle();
        expect(sheet.diagnostics.position).toBe(opening.request.to);
        expect(wrapper.emitted("settled")).toHaveLength(1);
        expect(wrapper.emitted("opened")).toEqual([[]]);
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("makes initial body focus visible without manufacturing a snap settlement", async () => {
    const { driver, wrapper, sheet } = mountSheet(bodyInitialFocus);
    try {
      await wrapper.setProps({ open: true });
      await flushLifecycle();
      expect(sheet.diagnostics.sheetState).toBe("open");
      expect(sheet.diagnostics.isAnimating).toBe(false);
      expect(driver.animations).toHaveLength(1);
      expect(driver.latest!.stopped).toBe(true);
      expect(document.activeElement).toBe(wrapper.get(".sheet-focus-target").element);
      expect(wrapper.emitted("settled")).toBeUndefined();
      driver.latest!.complete();
      await flushLifecycle();
      expect(wrapper.emitted("settled")).toBeUndefined();
      expect(wrapper.emitted("opened")).toEqual([[]]);
    } finally {
      wrapper.unmount();
    }
  });

  it.each([false, true])(
    "preserves pending request ownership through close/reopen and body focus, controlled=%s",
    async (controlled) => {
      const { driver, wrapper, sheet } = mountSheet("title", controlled);
      try {
        await wrapper.setProps({ open: true });
        await flushLifecycle();
        driver.latest!.complete();
        await flushLifecycle();
        expect(wrapper.emitted("settled")).toBeUndefined();
        const originalPosition = sheet.diagnostics.position;
        expect(sheet.navigateTo("expanded")).toBe(true);
        const pending = driver.latest!;
        pending.update((pending.request.from + pending.request.to) / 2, -100);
        await wrapper.setProps({ open: false });
        await flushLifecycle();
        const closing = driver.latest!;
        closing.update(closing.request.from + 10, 100);
        await wrapper.setProps({ open: true });
        await flushLifecycle();
        expect(sheet.diagnostics.sheetState).toBe("opening");
        const animationCount = driver.animations.length;
        wrapper.get<HTMLButtonElement>(".sheet-focus-target").element.focus();
        await flushLifecycle();
        expect(driver.animations).toHaveLength(animationCount);
        expect(driver.latest!.stopped).toBe(true);
        expect(sheet.diagnostics.sheetState).toBe("open");
        expect(sheet.diagnostics.isAnimating).toBe(false);
        expect(sheet.diagnostics.velocity).toBe(0);
        expect(sheet.diagnostics.position).toBe(controlled ? originalPosition : pending.request.to);
        expect(wrapper.emitted("activeIdRequest")).toEqual([
          ["expanded", { reason: "programmatic" }],
        ]);
        expect(wrapper.emitted("settled")).toEqual(
          controlled ? undefined : [["expanded", { reason: "programmatic" }]],
        );
        pending.update(pending.request.from, -400);
        pending.complete();
        closing.complete();
        driver.latest!.complete();
        await flushLifecycle();
        expect(sheet.diagnostics.position).toBe(controlled ? originalPosition : pending.request.to);
        expect(wrapper.emitted("settled")).toEqual(
          controlled ? undefined : [["expanded", { reason: "programmatic" }]],
        );
        expect(wrapper.emitted("closed")).toBeUndefined();
      } finally {
        wrapper.unmount();
      }
    },
  );
});
