// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";

import PhysicsField from "../src/components/PhysicsField.vue";
import type { InapplicablePhysicsSetting } from "../src/fixtures/lab-types";
import { physicsParameters } from "../src/fixtures/physics-parameters";

const damping = physicsParameters.find(({ key }) => key === "damping")!;
let app: App | undefined;

afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
});

function mountField(inapplicable?: InapplicablePhysicsSetting) {
  const value = ref(36);
  const version = ref(0);
  const container = document.createElement("div");
  document.body.append(container);
  app = createApp({
    setup: () => () =>
      h(PhysicsField, {
        modelValue: value.value,
        parameter: damping,
        resetVersion: version.value,
        inapplicable,
        "onUpdate:modelValue": (next: number) => {
          value.value = next;
        },
      }),
  });
  app.mount(container);
  return {
    container,
    value,
    version,
    number: container.querySelector<HTMLInputElement>('input[type="number"]')!,
  };
}

describe("reusable physics fields", () => {
  it.each([
    { reason: "This surface uses fixed damping.", effectiveValue: 40 },
    { reason: "This surface does not consume damping." },
  ])("does not offer an ineffective slider for $reason", async (inapplicable) => {
    const field = mountField(inapplicable);
    expect(field.number.disabled).toBe(true);
    expect(Number(field.number.value)).toBe(inapplicable.effectiveValue ?? 36);
    expect(field.container.querySelector('input[type="range"]')).toBeNull();
    expect(field.container.textContent).toContain(inapplicable.reason);
    expect(field.container.textContent?.includes("Stored value: 36.")).toBe(
      inapplicable.effectiveValue !== undefined,
    );
    field.number.value = "60";
    field.number.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(field.value.value).toBe(36);
  });

  it("discards an incomplete draft on an external replacement with the same numeric value", async () => {
    const field = mountField();
    field.number.value = "";
    field.number.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(field.number.getAttribute("aria-invalid")).toBe("true");
    field.version.value += 1;
    await nextTick();
    expect(field.number.value).toBe("36");
    expect(field.number.hasAttribute("aria-invalid")).toBe(false);
  });
});
