import { describe, expect, it } from "vitest";

import {
  carouselKeyAction,
  horizontalWheelDelta,
  isSupportedPrimaryPointerStart,
  normalizeWheelDelta,
  resolvePointerIntent,
} from "../src/input-policy";

describe("browser input policy", () => {
  it("accepts only primary pointers and the left mouse button", () => {
    expect(
      isSupportedPrimaryPointerStart({ button: 0, isPrimary: true, pointerType: "mouse" }),
    ).toBe(true);
    expect(
      isSupportedPrimaryPointerStart({ button: 2, isPrimary: true, pointerType: "mouse" }),
    ).toBe(false);
    expect(
      isSupportedPrimaryPointerStart({ button: 0, isPrimary: false, pointerType: "touch" }),
    ).toBe(false);
  });

  it("waits for touch intent and preserves vertical scrolling", () => {
    expect(resolvePointerIntent(4, 1)).toBe("pending");
    expect(resolvePointerIntent(20, 4)).toBe("horizontal");
    expect(resolvePointerIntent(4, 20)).toBe("vertical");
  });

  it("normalizes pixel, line, and page wheel delta modes", () => {
    expect(normalizeWheelDelta({ deltaMode: 0, deltaX: 2, deltaY: 3 }, 800)).toEqual({
      x: 2,
      y: 3,
    });
    expect(normalizeWheelDelta({ deltaMode: 1, deltaX: 2, deltaY: 3 }, 800)).toEqual({
      x: 32,
      y: 48,
    });
    expect(normalizeWheelDelta({ deltaMode: 2, deltaX: 2, deltaY: 3 }, 800)).toEqual({
      x: 1_600,
      y: 2_400,
    });
  });

  it("accepts horizontal intent and Shift+wheel without trapping vertical scroll", () => {
    expect(
      horizontalWheelDelta({ deltaMode: 0, deltaX: 20, deltaY: 2, shiftKey: false }, 800),
    ).toBe(20);
    expect(horizontalWheelDelta({ deltaMode: 0, deltaX: 0, deltaY: 20, shiftKey: true }, 800)).toBe(
      20,
    );
    expect(
      horizontalWheelDelta({ deltaMode: 0, deltaX: 2, deltaY: 20, shiftKey: false }, 800),
    ).toBeUndefined();
  });

  it("maps carousel keys without intercepting Tab or editable controls", () => {
    const input = document.createElement("input");

    expect(carouselKeyAction({ key: "ArrowRight", target: document.body })).toBe("next");
    expect(carouselKeyAction({ key: "Home", target: document.body })).toBe("home");
    expect(carouselKeyAction({ key: "Tab", target: document.body })).toBeUndefined();
    expect(carouselKeyAction({ key: "ArrowRight", target: input })).toBeUndefined();
  });
});
