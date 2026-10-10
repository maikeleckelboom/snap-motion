import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { physicsGroups, physicsParameters } from "../apps/lab/src/fixtures/physics-parameters";
import { MOTION_PRESETS } from "../packages/core/src/index";
import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo, setNumericInput } from "./helpers";

type PresetName = keyof typeof MOTION_PRESETS;

const collectedErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // A controller that rejects a configuration throws inside a Vue watcher, which Vue reports as a
    // warning before the patch that follows fails.
    if (message.type() === "error" || /\[Vue warn\]: Unhandled error/.test(message.text())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(collectedErrors.get(page) ?? []).toEqual([]);
});

function field(page: Page, name: string) {
  return page.getByRole("spinbutton", { name, exact: true });
}

async function openPhysicsGroup(page: Page, name: string) {
  const group = page
    .locator(".physics-group")
    .filter({ has: page.locator("summary", { hasText: name }) });
  if (!(await group.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await group.locator("summary").click();
  }
}

function presetState(page: Page) {
  return page.getByTestId("physics-preset-state");
}

function presetFieldValues(name: PresetName): Record<string, number> {
  const preset = MOTION_PRESETS[name];
  return {
    Stiffness: preset.spring.stiffness,
    Damping: preset.spring.damping,
    Mass: preset.spring.mass,
    "Rest speed": preset.spring.restSpeed,
    "Rest distance": preset.spring.restDistance,
    Projection: preset.release.projectionSeconds,
    "Fling threshold": preset.release.flingVelocity,
    "Maximum skip": preset.release.maxAnchorSkip,
    "Elastic resistance": preset.elasticity.min.resistance,
    "Elastic limit": preset.elasticity.min.maxDistance,
    "Control impulse": preset.programmaticImpulse,
  };
}

async function expectFieldValues(page: Page, expected: Record<string, number>) {
  for (const { label } of physicsGroups) await openPhysicsGroup(page, label);
  for (const [name, value] of Object.entries(expected)) {
    await expect(field(page, name)).toHaveValue(String(value));
  }
  for (const { label } of physicsParameters.filter(({ slider }) => slider)) {
    await expect(page.getByRole("slider", { name: `${label} slider`, exact: true })).toHaveValue(
      String(expected[label]),
    );
  }
}

function nextFrame(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function openLightbox(page: Page) {
  await page.getByTestId("open-lightbox").click();
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await expect(page.getByTestId("close-lightbox")).toBeFocused();
}

async function closeLightbox(page: Page) {
  await page.getByTestId("close-lightbox").click();
  await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
  await expect(page.getByTestId("open-lightbox")).toBeFocused();
}

/**
 * Overdrag past the first media item, read while the pointer is still held. A held drag position
 * at fixed decoded geometry is a pure function of pointer travel and the configured elasticity,
 * so the same gesture compares configurations without including startup remeasurement.
 */
async function heldEdgeOverdrag(page: Page): Promise<number> {
  const carousel = page.getByTestId("media-carousel");
  // Compare settled decoded geometry. Raw held travel also survives a late decode remeasurement;
  // the dedicated regression below covers that independent lifecycle.
  const images = carousel.getByTestId(/^media-image-/);
  await expect(images).toHaveCount(5);
  await expect
    .poll(() =>
      images.evaluateAll((elements) =>
        elements.map((image) => image.getAttribute("data-media-state")),
      ),
    )
    .toEqual(Array(5).fill("loaded"));
  await nextFrame(page);
  await expectCarouselAt(carousel, "regular");
  let held = Number.NaN;
  await dragSyntheticPointerBy(page, carousel, 240, 0, {
    beforeRelease: async () => {
      await nextFrame(page);
      held = Number.parseFloat((await page.getByTestId("position").textContent()) ?? "");
    },
    steps: 8,
  });
  await expectCarouselAt(carousel, "regular");
  return held;
}

test.describe("Gallery / Lightbox live configuration", () => {
  test.beforeEach(async ({ page }) => {
    await openLabDemo(page, "media", "no-preference");
  });

  test("a late media decode preserves resisted travel beneath a stationary held pointer", async ({
    page,
  }) => {
    let releaseDecode!: () => void;
    const decodeGate = new Promise<void>((resolve) => {
      releaseDecode = resolve;
    });
    await page.route("**/*", async (route) => {
      if (
        route.request().resourceType() === "image" &&
        route.request().url().includes("held-decode")
      )
        await decodeGate;
      await route.continue();
    });
    await page.getByLabel("Preset").selectOption("loose");
    await openLightbox(page);
    const carousel = page.getByTestId("media-carousel");
    const delayed = page.getByTestId("media-image-delayed");
    await expect(delayed).toHaveAttribute("data-media-state", "loaded");
    await expect(page.getByTestId("media-image-regular")).toHaveAttribute(
      "data-media-state",
      "loaded",
    );
    await nextFrame(page);
    await dragSyntheticPointerBy(page, carousel, 240, 0, {
      steps: 8,
      beforeRelease: async () => {
        const before = Number.parseFloat((await page.getByTestId("position").textContent())!);
        expect(before).toBeGreaterThan(40);
        await delayed.evaluate((image: HTMLImageElement) => {
          image.dataset.probeDecoded = "false";
          image.addEventListener(
            "load",
            async () => {
              await image.decode();
              image.dataset.probeDecoded = "true";
            },
            { once: true },
          );
          image.src += "?held-decode";
        });
        releaseDecode();
        await expect(delayed).toHaveAttribute("data-probe-decoded", "true");
        await nextFrame(page);
        expect(Number.parseFloat((await page.getByTestId("position").textContent())!)).toBe(before);
        await expect(carousel).toHaveAttribute("data-phase", "dragging");
      },
    });
    await expectCarouselAt(carousel, "regular");
  });

  test("parameter and preset edits reach the mounted controller without a remount", async ({
    page,
  }) => {
    const demo = page.locator("#panel-media .media-demo");
    const carousel = page.getByTestId("media-carousel");
    await demo.evaluate((element) => {
      (element as HTMLElement).dataset.mountProbe = "original";
    });

    await openLightbox(page);
    const balanced = await heldEdgeOverdrag(page);
    expect(balanced).toBeGreaterThan(8);
    await page.getByTestId("media-next").click();
    await expectCarouselAt(carousel, "extremely-wide");
    await closeLightbox(page);

    await openPhysicsGroup(page, "Boundaries");
    await setNumericInput(field(page, "Elastic limit"), 0);
    await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
    await openLightbox(page);
    // The same instance reopens on the item it was left on.
    await expectCarouselAt(carousel, "extremely-wide");
    await page.getByTestId("media-previous").click();
    expect(await heldEdgeOverdrag(page)).toBe(0);
    await closeLightbox(page);

    await page.getByLabel("Preset").selectOption("loose");
    await expect(presetState(page)).toHaveText("Loose · Preset");
    await openLightbox(page);
    expect(await heldEdgeOverdrag(page)).toBeGreaterThan(balanced);
    await closeLightbox(page);

    await expect(demo).toHaveAttribute("data-mount-probe", "original");
  });

  test("a preset change during an active settle keeps the target and applies afterwards", async ({
    page,
  }) => {
    const carousel = page.getByTestId("media-carousel");
    await openLightbox(page);
    const balanced = await heldEdgeOverdrag(page);

    // The modal lightbox makes the workbench inert, so the change is dispatched to the same preset
    // control by script: the path any programmatic writer takes while the stage is moving.
    const atChange = await page.evaluate(async () => {
      const stage = document.querySelector<HTMLElement>('[data-testid="media-carousel"]')!;
      const preset = document.querySelector<HTMLSelectElement>(".preset-control select")!;
      document.querySelector<HTMLButtonElement>('[data-testid="media-next"]')!.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const phase = stage.dataset.phase;
      preset.value = "loose";
      preset.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return { phase, target: stage.dataset.activeId };
    });
    expect(atChange).toEqual({ phase: "settling", target: "extremely-wide" });

    await expectCarouselAt(carousel, "extremely-wide");
    await expect(presetState(page)).toHaveText("Loose · Preset");
    await page.getByTestId("media-previous").click();
    expect(await heldEdgeOverdrag(page)).toBeGreaterThan(balanced);
  });
});

test("Gallery keeps reduced motion and keyboard navigation after a live change", async ({
  page,
}) => {
  await openLabDemo(page, "media", "reduce");
  await page.getByLabel("Preset").selectOption("loose");
  await setNumericInput(field(page, "Stiffness"), 120);
  await expect(presetState(page)).toHaveText("Loose · Modified (1)");

  const carousel = page.getByTestId("media-carousel");
  await openLightbox(page);
  const afterNext = await page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>('[data-testid="media-carousel"]')!;
    document.querySelector<HTMLButtonElement>('[data-testid="media-next"]')!.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { phase: stage.dataset.phase, target: stage.dataset.activeId };
  });
  // Reduced motion still completes a move without a settle.
  expect(afterNext).toEqual({ phase: "idle", target: "extremely-wide" });

  await carousel.focus();
  await page.keyboard.press("ArrowRight");
  await expectCarouselAt(carousel, "extremely-tall");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
  await expect(page.getByTestId("open-lightbox")).toBeFocused();
});

const navigableSurfaces = [
  {
    demo: "coverflow",
    viewport: "coverflow-viewport",
    next: "coverflow-next",
    previous: "coverflow-previous",
    start: "map",
    advanced: "team",
  },
  {
    demo: "grid",
    viewport: "paged-grid",
    next: "grid-next",
    previous: "grid-previous",
    start: "page-1",
    advanced: "page-2",
  },
] as const;

for (const surface of navigableSurfaces) {
  test(`${surface.demo} never receives an incomplete or unsupported draft`, async ({ page }) => {
    await openLabDemo(page, surface.demo, "no-preference");
    const viewport = page.getByTestId(surface.viewport);
    const damping = field(page, "Damping");
    await expectCarouselAt(viewport, surface.start);

    // Idle: empty, below and above the supported range, then malformed text.
    for (const draft of ["", "-5", "250"]) {
      await damping.fill(draft);
      await expect(damping).toHaveAttribute("aria-invalid", "true");
      await expect(damping).toHaveAccessibleDescription(
        "Enter a number from 1 to 100. Still using 36. Resistance to motion during settling.",
      );
      await expect(presetState(page)).toHaveText("Balanced · Preset");
    }
    // Escape discards the draft rather than bounding it.
    await damping.press("Escape");
    await expect(damping).toHaveValue("36");
    await expect(damping).not.toHaveAttribute("aria-invalid");
    await expect(page.getByTestId("physics-error-damping")).toHaveCount(0);
    await damping.fill("");
    await damping.pressSequentially("-e");
    await expect(damping).toHaveAttribute("aria-invalid", "true");
    await expect(presetState(page)).toHaveText("Balanced · Preset");
    await damping.press("Escape");
    await expect(damping).toHaveValue("36");

    // Settling: the draft arrives while the surface is moving.
    const phaseAtDraft = await page.evaluate(async (ids) => {
      const stage = document.querySelector<HTMLElement>(`[data-testid="${ids.viewport}"]`)!;
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Damping"]')!;
      document.querySelector<HTMLButtonElement>(`[data-testid="${ids.next}"]`)!.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const phase = stage.dataset.phase;
      input.focus();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return phase;
    }, surface);
    expect(phaseAtDraft).toBe("settling");
    await expectCarouselAt(viewport, surface.advanced);
    await expect(damping).toHaveAttribute("aria-invalid", "true");
    await expect(presetState(page)).toHaveText("Balanced · Preset");

    // Blur keeps the last committed value; the surface keeps answering every control.
    await damping.blur();
    await expect(damping).toHaveValue("36");
    await page.getByTestId(surface.previous).click();
    await expectCarouselAt(viewport, surface.start);
    await page.getByTestId(surface.next).click();
    await expectCarouselAt(viewport, surface.advanced);

    // A finite out-of-range draft commits at its bound; a supported edit still applies live.
    await damping.fill("250");
    await damping.press("Enter");
    await expect(damping).toHaveValue("100");
    await expect(damping).toBeFocused();
    await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
    await damping.fill("-5");
    await damping.blur();
    await expect(damping).toHaveValue("1");
    await setNumericInput(damping, 30);
    await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
    await page.getByTestId(surface.previous).click();
    await expectCarouselAt(viewport, surface.start);
  });
}

test("preset state counts every shared edit and Reset restores the exact preset", async ({
  page,
}) => {
  await openLabDemo(page, "coverflow");
  const preset = page.getByLabel("Preset");
  await expect(preset).toHaveValue("balanced");
  await expect(presetState(page)).toHaveText("Balanced · Preset");
  await expect(preset).toHaveAccessibleDescription("Balanced · Preset");
  await expectFieldValues(page, presetFieldValues("balanced"));

  await setNumericInput(field(page, "Stiffness"), 620);
  await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
  await setNumericInput(field(page, "Mass"), 1.2);
  await expect(presetState(page)).toHaveText("Balanced · Modified (2)");
  await expect(preset).toHaveValue("balanced");

  // Editing each value back to the preset clears the state.
  await setNumericInput(field(page, "Stiffness"), 400);
  await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
  await setNumericInput(field(page, "Mass"), 0.85);
  await expect(presetState(page)).toHaveText("Balanced · Preset");

  await setNumericInput(field(page, "Projection"), 0.3);
  await openPhysicsGroup(page, "Boundaries");
  await setNumericInput(field(page, "Elastic resistance"), 2.35);
  await openPhysicsGroup(page, "Buttons & keys");
  await setNumericInput(field(page, "Control impulse"), 1_000);
  await expect(presetState(page)).toHaveText("Balanced · Modified (3)");
  await page.getByRole("button", { name: "Reset to preset" }).click();
  await expect(presetState(page)).toHaveText("Balanced · Preset");
  await expectFieldValues(page, presetFieldValues("balanced"));

  // Choosing a preset replaces edits with that preset's exact values.
  await setNumericInput(field(page, "Damping"), 50);
  await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
  await preset.selectOption("heavy");
  await expect(presetState(page)).toHaveText("Heavy · Preset");
  await expectFieldValues(page, presetFieldValues("heavy"));
  await setNumericInput(field(page, "Fling threshold"), 600);
  await expect(presetState(page)).toHaveText("Heavy · Modified (1)");
  await page.getByRole("button", { name: "Reset to preset" }).click();
  await expectFieldValues(page, presetFieldValues("heavy"));
});

test("a fixed skip shows its effective value while the shared edit stays modified", async ({
  page,
}) => {
  await openLabDemo(page, "coverflow");
  const skip = field(page, "Maximum skip");
  const note = page.getByTestId("physics-note-maxAnchorSkip");
  await expect(skip).toBeEnabled();
  await expect(skip).toHaveValue("2");
  await expect(note).toHaveCount(0);
  await setNumericInput(skip, 4);
  await expect(presetState(page)).toHaveText("Balanced · Modified (1)");

  await page.locator("#nav-stacked-deck").click();
  await expect(page.locator("#panel-stacked-deck")).toBeVisible();
  await expect(skip).toBeDisabled();
  await expect(skip).toHaveValue("1");
  await expect(note).toContainText("Fixed at 1");
  await expect(note).toContainText("Stored value: 4.");
  await expect(skip).toHaveAccessibleDescription(/^Fixed at 1 by the stacked deck/);
  await expect(page.getByTestId("stacked-deck-viewport")).toHaveAttribute(
    "data-max-anchor-skip",
    "1",
  );
  // The surface does not consume the edit, but the shared configuration is still modified.
  await expect(presetState(page)).toHaveText("Balanced · Modified (1)");

  await page.locator("#nav-coverflow").click();
  await expect(skip).toBeEnabled();
  await expect(skip).toHaveValue("4");
  await expect(note).toHaveCount(0);

  await page.locator("#nav-stacked-deck").click();
  await page.getByRole("button", { name: "Reset to preset" }).click();
  await expect(presetState(page)).toHaveText("Balanced · Preset");
  await expect(skip).toHaveValue("1");
  await expect(note).toContainText("Stored value: 2.");
  await page.locator("#nav-coverflow").click();
  await expect(skip).toHaveValue("2");
});

test("physics groups preserve semantic membership and compact disclosure defaults", async ({
  page,
}) => {
  await openLabDemo(page, "coverflow");
  const editor = page.getByRole("region", { name: "Physics", exact: true });
  for (const group of physicsGroups) {
    const details = editor
      .locator(".physics-group")
      .filter({ has: page.locator("summary", { hasText: group.label }) });
    await expect(details).toHaveJSProperty("open", group.defaultOpen);
    if (!group.defaultOpen) await details.locator("summary").click();
    const fields = editor.getByRole("group", { name: group.label, exact: true });
    const members = physicsParameters.filter((parameter) => parameter.group === group.key);
    await expect(fields.getByRole("spinbutton")).toHaveCount(members.length);
    for (const parameter of members) {
      await expect(
        fields.getByRole("spinbutton", { name: parameter.label, exact: true }),
      ).toHaveAccessibleDescription(parameter.description);
    }
  }
  await expect(editor.getByRole("spinbutton")).toHaveCount(11);
  await expect(editor.getByRole("slider")).toHaveCount(8);
  for (const label of ["Maximum skip", "Rest speed", "Rest distance"]) {
    await expect(editor.getByRole("slider", { name: `${label} slider`, exact: true })).toHaveCount(
      0,
    );
  }
});

for (const parameter of physicsParameters.filter(({ slider }) => slider)) {
  test(`${parameter.label} slider exposes limits, keyboard adjustment and exact numeric synchronization`, async ({
    page,
  }) => {
    await openLabDemo(page, "coverflow");
    await openPhysicsGroup(page, physicsGroups.find(({ key }) => key === parameter.group)!.label);
    const slider = page.getByRole("slider", { name: `${parameter.label} slider`, exact: true });
    const number = field(page, parameter.label);
    await expect(slider).toHaveAccessibleName(`${parameter.label} slider`);
    await expect(slider).toHaveAccessibleDescription(parameter.description);
    await expect(slider).toHaveAttribute("min", String(parameter.min));
    await expect(slider).toHaveAttribute("max", String(parameter.max));
    await expect(slider).not.toHaveAttribute("aria-hidden", "true");
    await expect(slider).not.toHaveAttribute("tabindex", "-1");
    const original = Number(await number.inputValue());
    await number.focus();
    await page.keyboard.press("Tab");
    await expect(slider).toBeFocused();
    await expect(slider).toHaveValue(String(original));
    expect(await slider.evaluate((input) => getComputedStyle(input).outlineStyle)).toBe("solid");
    await slider.press("ArrowRight");
    const increased = Number((original + parameter.step).toPrecision(12));
    await expect(slider).toHaveValue(String(increased));
    await expect(number).toHaveValue(String(increased));
    await slider.press("Home");
    await expect(number).toHaveValue(String(parameter.min));
    await slider.press("PageUp");
    await expect(number).toHaveValue(
      String(Number((parameter.min + parameter.step * 10).toPrecision(12))),
    );
    await slider.press("End");
    await expect(number).toHaveValue(String(parameter.max));
    await slider.press("ArrowUp");
    await expect(slider).toHaveValue(String(parameter.max));

    // Numeric precision is independent of slider increments, including the thumb's actual value.
    const precise = Number(
      (parameter.min + (parameter.max - parameter.min) * 0.12345).toPrecision(12),
    );
    await number.fill(String(precise));
    await expect(slider).toHaveValue(String(precise));
    await expect(number).not.toHaveAttribute("aria-invalid");
    expect(await number.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    expect(await slider.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
    await number.press("Escape");
    await expect(number).toHaveValue(String(precise));
    await expect(presetState(page)).toHaveText("Balanced · Modified (1)");

    // Exercise a real pointer edit as well as keyboard events.
    await slider.click({ position: { x: 8, y: 12 } });
    await expect
      .poll(async () => Number(await number.inputValue()))
      .toBe(Number(await slider.inputValue()));
    await expect(page.getByTestId("coverflow-viewport")).toHaveAttribute("data-active-id", "map");
  });
}

test("slider writes supersede unfinished numeric drafts, including same-value writes", async ({
  page,
}) => {
  await openLabDemo(page, "coverflow");
  const damping = field(page, "Damping");
  const slider = page.getByRole("slider", { name: "Damping slider", exact: true });
  for (const [draft, value] of [
    ["", 60],
    ["250", 60],
    ["-5", 70],
  ] as const) {
    await damping.fill(draft);
    await expect(damping).toHaveAttribute("aria-invalid", "true");
    await expect(slider).toHaveAccessibleDescription(
      `Enter a number from 1 to 100. Still using ${await slider.inputValue()}. Resistance to motion during settling.`,
    );
    // Keep the number focused so blur cannot resolve the draft before the slider writes.
    await slider.evaluate((input: HTMLInputElement, next) => {
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await expect(damping).toBeFocused();
    await expect(damping).toHaveValue(String(value));
    await expect(slider).toHaveValue(String(value));
    await expect(damping).not.toHaveAttribute("aria-invalid");
    await damping.press("Enter");
    await damping.blur();
    await expect(damping).toHaveValue(String(value));
    await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
  }
  await damping.fill("72.3");
  await damping.press("Escape");
  await expect(damping).toHaveValue("72.3");
  await expect(slider).toHaveValue("72.3");
});

test("preset replacements synchronize every field even while an incomplete draft has focus", async ({
  page,
}) => {
  await openLabDemo(page, "coverflow");
  await field(page, "Damping").fill("");
  for (const name of ["tight", "balanced", "heavy", "loose"] as const) {
    await field(page, "Damping").fill("250");
    await page
      .getByRole("combobox", { name: "Preset", exact: true })
      .evaluate((select: HTMLSelectElement, next) => {
        select.value = next;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, name);
    await expectFieldValues(page, presetFieldValues(name));
    await field(page, "Damping").press("Enter");
    await expect(presetState(page)).toHaveText(
      `${name[0]!.toUpperCase()}${name.slice(1)} · Preset`,
    );
  }
  // Reapplying the same preset must clear even an unchanged value's draft.
  await openPhysicsGroup(page, "Settling precision");
  await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("balanced");
  await field(page, "Rest distance").fill("");
  await page
    .getByRole("combobox", { name: "Preset", exact: true })
    .evaluate((select: HTMLSelectElement) => {
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(field(page, "Rest distance")).toHaveValue("0.6");
  await expect(field(page, "Rest distance")).not.toHaveAttribute("aria-invalid");
});

for (const surface of navigableSurfaces) {
  test(`${surface.demo} keeps its target through a live slider update during settling and preserves keyboard focus ownership`, async ({
    page,
  }) => {
    await openLabDemo(page, surface.demo, "no-preference");
    const viewport = page.getByTestId(surface.viewport);
    await viewport.evaluate((element: HTMLElement) => {
      element.dataset.mountProbe = "original";
    });
    const during = await page.evaluate(async (ids) => {
      const stage = document.querySelector<HTMLElement>(`[data-testid="${ids.viewport}"]`)!;
      const slider = document.querySelector<HTMLInputElement>(
        'input[type="range"][aria-label="Damping slider"]',
      )!;
      document.querySelector<HTMLButtonElement>(`[data-testid="${ids.next}"]`)!.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const phase = stage.dataset.phase;
      slider.value = "80";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return { phase, target: stage.dataset.activeId };
    }, surface);
    expect(during).toEqual({ phase: "settling", target: surface.advanced });
    await expectCarouselAt(viewport, surface.advanced);
    await expect(viewport).toHaveAttribute("data-mount-probe", "original");
    await expect(field(page, "Damping")).toHaveValue("80");
    await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
    await field(page, "Damping").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.getByRole("slider", { name: "Damping slider", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(viewport, surface.advanced);
    await expect(field(page, "Damping")).toHaveValue("81");
    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    await expectCarouselAt(viewport, surface.start);
  });
}

test("a live field edit preserves an unfinished sibling draft", async ({ page }) => {
  await openLabDemo(page, "coverflow");
  const damping = field(page, "Damping");
  await damping.fill("");
  await page
    .getByRole("slider", { name: "Mass slider", exact: true })
    .evaluate((input: HTMLInputElement) => {
      input.value = "1.2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await expect(damping).toBeFocused();
  await expect(damping).toHaveValue("");
  await expect(damping).toHaveAttribute("aria-invalid", "true");
  await expect(field(page, "Mass")).toHaveValue("1.2");
  await damping.press("Escape");
  await expect(damping).toHaveValue("36");
  await expect(presetState(page)).toHaveText("Balanced · Modified (1)");
});

for (const width of [1440, 768, 390, 320]) {
  test(`physics editor stays accessible and inside its host at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openLabDemo(page, "coverflow");
    await field(page, "Stiffness").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("slider", { name: "Stiffness slider", exact: true })).toBeFocused();
    for (const { label } of physicsGroups) await openPhysicsGroup(page, label);
    const editor = page.locator(".physics-controls");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const measurements = await editor.evaluate((element) => {
      const host = element.getBoundingClientRect();
      return [...element.querySelectorAll<HTMLInputElement>("input")].map((input) => {
        const box = input.getBoundingClientRect();
        return {
          left: box.left >= host.left,
          right: box.right <= host.right,
          width: box.width,
          name: input.getAttribute("aria-label"),
        };
      });
    });
    expect(
      measurements.every(
        ({ left, right, width: controlWidth }) => left && right && controlWidth >= 24,
      ),
    ).toBe(true);
    expect(new Set(measurements.map(({ name }) => name)).size).toBe(measurements.length);
    const accessibility = await new AxeBuilder({ page }).include(".physics-controls").analyze();
    expect(accessibility.violations).toEqual([]);
    await field(page, "Damping").fill("250");
    await expect(field(page, "Damping")).toHaveAttribute("aria-invalid", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await field(page, "Damping").press("Escape");
    // Supported extremes must fit the precise input and stay synchronized with the slider.
    await field(page, "Fling threshold").fill("3000");
    await expect(
      page.getByRole("slider", { name: "Fling threshold slider", exact: true }),
    ).toHaveValue("3000");
    await page.getByRole("button", { name: "Reset to preset", exact: true }).click();
    await expectFieldValues(page, presetFieldValues("balanced"));
  });
}
