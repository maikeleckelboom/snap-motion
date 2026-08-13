import { afterEach, describe, expect, it } from "vitest";

import { captureFocusOpener, restoreFocus } from "../src/internal/accessibility/focus";
import {
  isElement,
  isHTMLElement,
  isHTMLImageElement,
  isSVGElement,
} from "../src/internal/dom/realm";

afterEach(() => {
  document.body.replaceChildren();
});

describe("realm-aware DOM handling", () => {
  it("captures, validates, and restores focus in an iframe realm", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const foreignDocument = iframe.contentDocument;
    if (!foreignDocument || !iframe.contentWindow) throw new Error("Iframe realm is unavailable.");

    const opener = foreignDocument.createElement("button");
    const other = foreignDocument.createElement("button");
    foreignDocument.body.append(opener, other);
    opener.focus();

    expect(isElement(opener)).toBe(true);
    expect(isHTMLElement(opener)).toBe(true);
    expect(captureFocusOpener(foreignDocument)).toBe(opener);

    other.focus();
    expect(restoreFocus(opener)).toBe(true);
    expect(foreignDocument.activeElement).toBe(opener);
  });

  it("recognizes image and SVG nodes before and after document adoption", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const foreignDocument = iframe.contentDocument;
    if (!foreignDocument) throw new Error("Iframe document is unavailable.");

    const image = foreignDocument.createElement("img");
    const svg = foreignDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(isHTMLImageElement(image)).toBe(true);
    expect(isSVGElement(svg)).toBe(true);

    document.adoptNode(image);
    document.adoptNode(svg);
    expect(image.ownerDocument).toBe(document);
    expect(isHTMLImageElement(image)).toBe(true);
    expect(isSVGElement(svg)).toBe(true);
  });
});
