import { expect, test, type Page } from "@playwright/test";

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
  for (const [name, value] of Object.entries(expected)) {
    await expect(field(page, name)).toHaveValue(String(value));
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
 * is a pure function of pointer travel and the configured elasticity, so the same gesture compares
 * two configurations without any timing.
 */
async function heldEdgeOverdrag(page: Page): Promise<number> {
  const carousel = page.getByTestId("media-carousel");
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
        "Enter a number from 1 to 100. Still using 36.",
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
  await setNumericInput(field(page, "Elastic resistance"), 2.35);
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
