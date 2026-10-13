// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { effectScope, ref, type EffectScope } from "vue";

import { useItemTap } from "../src/playground/studio/media/use-item-tap";

/**
 * The tap decision, with real DOM events and no motion engine: which item a press meant to open, and
 * when it meant none. The engine's own drag recogniser is not involved; this is the half it leaves to
 * the application.
 */

const query = (selector: string) => document.body.querySelector<HTMLElement>(selector)!;
let scope: EffectScope | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  scope?.stop();
  host?.remove();
});

function setup(options: { moving?: () => boolean } = {}) {
  const taps: string[] = [];
  host = document.createElement("div");
  host.dataset.testid = "viewport";
  host.innerHTML =
    '<figure data-media-id="a"><img data-testid="img-a"></figure><figure data-media-id="b"></figure>';
  document.body.append(host);
  const viewport = ref<HTMLElement>(host);
  scope = effectScope();
  scope.run(() =>
    useItemTap({
      viewport,
      itemAt(target) {
        const element =
          target instanceof Element ? target.closest<HTMLElement>("[data-media-id]") : null;
        const id = element?.dataset.mediaId;
        return element && id !== undefined ? { id, element } : undefined;
      },
      isMoving: options.moving ?? (() => false),
      onTap: (id) => taps.push(id),
    }),
  );
  return { taps, element: query };
}

function pointer(
  type: string,
  target: EventTarget,
  init: PointerEventInit & { clientX: number; clientY: number },
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      ...init,
    }),
  );
}

describe("a tap on an item", () => {
  it("opens the item the press began on", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='b']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointerup", target, { clientX: 100, clientY: 50 });
    expect(taps).toEqual(["b"]);
  });

  it("opens the item under a child element, such as its image", () => {
    const { taps, element } = setup();
    const image = element("[data-testid='img-a']");
    pointer("pointerdown", image, { clientX: 10, clientY: 10 });
    pointer("pointerup", image, { clientX: 10, clientY: 10 });
    expect(taps).toEqual(["a"]);
  });

  it("tolerates the small movement of a real finger", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointermove", window, { clientX: 103, clientY: 52 });
    pointer("pointerup", window, { clientX: 103, clientY: 52 });
    expect(taps).toEqual(["a"]);
  });
});

describe("a drag", () => {
  it("opens nothing, wherever it is released", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 200, clientY: 50 });
    pointer("pointermove", window, { clientX: 120, clientY: 52 });
    pointer("pointerup", window, { clientX: 120, clientY: 52 });
    expect(taps).toEqual([]);
  });

  it("opens nothing when it ends back where it began, because it still travelled", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 200, clientY: 50 });
    pointer("pointermove", window, { clientX: 140, clientY: 50 });
    pointer("pointermove", window, { clientX: 200, clientY: 50 });
    pointer("pointerup", window, { clientX: 200, clientY: 50 });
    expect(taps).toEqual([]);
  });
});

describe("a press that is not a tap", () => {
  it("is a catch when the strip was still moving: it stops it and opens nothing", () => {
    const { taps, element } = setup({ moving: () => true });
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointerup", target, { clientX: 100, clientY: 50 });
    expect(taps).toEqual([]);
  });

  it("opens nothing on the gap between items", () => {
    const { taps, element } = setup();
    const gap = element("[data-testid='viewport']");
    pointer("pointerdown", gap, { clientX: 100, clientY: 50 });
    pointer("pointerup", gap, { clientX: 100, clientY: 50 });
    expect(taps).toEqual([]);
  });

  it("opens nothing when the browser cancels the gesture", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointercancel", window, { clientX: 100, clientY: 50 });
    expect(taps).toEqual([]);
  });

  it("opens nothing when a second finger joins", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointerdown", target, { clientX: 120, clientY: 50, pointerId: 2, isPrimary: false });
    pointer("pointerup", window, { clientX: 100, clientY: 50 });
    expect(taps).toEqual([]);
  });

  it("ignores a secondary mouse button", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50, button: 2 });
    pointer("pointerup", target, { clientX: 100, clientY: 50, button: 2 });
    expect(taps).toEqual([]);
  });

  it("does not let one press leak into the next", () => {
    const { taps, element } = setup();
    const target = element("[data-media-id='a']");
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointermove", window, { clientX: 20, clientY: 50 });
    pointer("pointerup", window, { clientX: 20, clientY: 50 });
    pointer("pointerdown", target, { clientX: 100, clientY: 50 });
    pointer("pointerup", target, { clientX: 100, clientY: 50 });
    expect(taps).toEqual(["a"]);
  });
});
