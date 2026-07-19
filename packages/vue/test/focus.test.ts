import { describe, expect, it, vi } from "vitest";

import { captureFocusOpener, focusInside, restoreFocus } from "../src/internal/accessibility/focus";

describe("focus helpers", () => {
  it("captures and restores a connected opener", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const captured = captureFocusOpener(document);
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();

    expect(captured).toBe(opener);
    expect(restoreFocus(captured)).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("focuses the first control inside a sheet", () => {
    const panel = document.createElement("section");
    panel.tabIndex = -1;
    const close = document.createElement("button");
    panel.append(close);
    document.body.append(panel);

    expect(focusInside(panel)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it("continues to the next candidate when an autofocus target cannot receive focus", () => {
    const panel = document.createElement("section");
    const unusable = document.createElement("div");
    unusable.setAttribute("autofocus", "");
    unusable.focus = vi.fn<HTMLElement["focus"]>();
    const close = document.createElement("button");
    panel.append(unusable, close);
    document.body.append(panel);

    expect(focusInside(panel)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it("does not restore focus to a disconnected opener", () => {
    const opener = document.createElement("button");
    expect(restoreFocus(opener)).toBe(false);
  });
});
