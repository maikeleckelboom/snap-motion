import { expect, type Locator, type Page } from "@playwright/test";

import { playgroundSections } from "../apps/lab/src/playground/sections";
import { MOTION_PRESETS } from "../packages/core/src/index";

export type PresetName = keyof typeof MOTION_PRESETS;
export const presetNames: PresetName[] = ["tight", "balanced", "heavy", "loose"];
export const sectionIds = playgroundSections.map(({ id }) => id);

export const presetLabels: Record<PresetName, string> = {
  tight: "Tight",
  balanced: "Balanced",
  heavy: "Heavy",
  loose: "Loose",
};

export function section(page: Page, id: string): Locator {
  return page.locator(`#${id}`);
}

export function tuningState(page: Page, id: string): Locator {
  return section(page, id).getByTestId("tuning-state");
}

export function editor(page: Page): Locator {
  return page.getByTestId("tuning-panel");
}

export function field(page: Page, name: string): Locator {
  return editor(page).getByRole("spinbutton", { name, exact: true });
}

/** Base-relative, so it also resolves under the preview build's non-root base. */
export async function openPlayground(
  page: Page,
  reducedMotion: "reduce" | "no-preference" = "reduce",
) {
  await page.emulateMedia({ reducedMotion });
  await page.goto("./playground/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Every surface has measured itself and published a settled state.
  for (const testid of ["coverflow-viewport", "stacked-deck-viewport", "paged-grid"]) {
    await expect(page.getByTestId(testid)).toHaveAttribute("data-phase", "idle");
  }
}

export async function openEditor(page: Page, id: string) {
  const customize = section(page, id).getByTestId("tuning-customize");
  if ((await customize.getAttribute("aria-expanded")) !== "true") await customize.click();
  await expect(editor(page)).toBeVisible();
  await expect(customize).toHaveAttribute("aria-expanded", "true");
}

export async function expectEveryBarShows(page: Page, preset: PresetName, modifiedCount = 0) {
  for (const id of sectionIds) {
    await expect(tuningState(page, id)).toHaveText(
      modifiedCount === 0 ? "Preset" : `Modified (${modifiedCount})`,
    );
    await expect(section(page, id).getByTestId(`preset-${preset}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
}

export function expectedFieldValues(name: PresetName): Record<string, number> {
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

export async function duplicateIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Map<string, number>();
    for (const element of document.querySelectorAll("[id]"))
      seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
    return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
  });
}

export async function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}
