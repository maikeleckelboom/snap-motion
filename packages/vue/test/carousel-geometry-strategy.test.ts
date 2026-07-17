import { describe, expect, it } from "vitest";

import {
  createFixedStageCarouselGeometryStrategy,
  createVariableWidthCenteredCarouselGeometryStrategy,
} from "../src/carousel-geometry";

function setLayout(
  element: HTMLElement,
  values: { left?: number; width?: number; scroll?: number },
) {
  if (values.left !== undefined)
    Object.defineProperty(element, "offsetLeft", { value: values.left });
  if (values.width !== undefined)
    Object.defineProperty(element, "offsetWidth", { value: values.width });
  if (values.scroll !== undefined)
    Object.defineProperty(element, "scrollWidth", { value: values.scroll });
}

describe("carousel geometry strategies", () => {
  it("keeps fixed-stage as the default ergonomic strategy", () => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "clientWidth", { value: 320 });
    const measurement = createFixedStageCarouselGeometryStrategy<"a" | "b">().measure({
      ids: ["a", "b"],
      slides: new Map(),
      viewport,
    });
    expect(measurement.anchors.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: -320 },
    ]);
  });

  it("centers registered variable-width layout boxes without reading descendants", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    const first = document.createElement("article");
    const second = document.createElement("article");
    Object.defineProperty(viewport, "clientWidth", { value: 300 });
    setLayout(track, { scroll: 500 });
    setLayout(first, { left: 0, width: 100 });
    setLayout(second, { left: 180, width: 200 });

    const measurement = createVariableWidthCenteredCarouselGeometryStrategy<"a" | "b">().measure({
      ids: ["a", "b"],
      slides: new Map([
        ["a", first],
        ["b", second],
      ]),
      track,
      viewport,
    });
    expect(measurement.anchors.map((anchor) => anchor.id)).toEqual(["a", "b"]);
    expect(measurement.anchors[1]?.position).toBe(-130);
  });

  it("uses physical leading and trailing track insets to make both edge items centerable", () => {
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    const first = document.createElement("article");
    const last = document.createElement("article");
    Object.defineProperty(viewport, "clientWidth", { value: 300 });
    setLayout(track, { scroll: 650 });
    setLayout(first, { left: 100, width: 100 });
    setLayout(last, { left: 450, width: 100 });

    const measurement = createVariableWidthCenteredCarouselGeometryStrategy<
      "first" | "last"
    >().measure({
      ids: ["first", "last"],
      slides: new Map([
        ["first", first],
        ["last", last],
      ]),
      track,
      viewport,
    });
    expect(measurement.anchors.map((anchor) => anchor.position)).toEqual([0, -350]);
    expect(measurement.bounds).toEqual({ min: -350, max: 0 });
  });
});
