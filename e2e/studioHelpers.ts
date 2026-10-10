import { expect, type Locator, type Page } from "@playwright/test";

import { studyDefinitions } from "../apps/lab/src/playground/studio/studies";
import { openPlayground } from "./playgroundHelpers";

export type StudioWidth = "wide" | "narrow";

/** The Studio is behind an activation boundary, so nothing about it exists until this runs. */
export async function openStudio(
  page: Page,
  options: {
    reducedMotion?: "reduce" | "no-preference";
    width?: number;
    height?: number;
  } = {},
): Promise<Locator> {
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 900 });
  await openPlayground(page, options.reducedMotion ?? "reduce");
  await page.getByTestId("studio-activate").click();
  const workspace = page.getByTestId("studio-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace).toBeFocused();
  if ((await workspace.getAttribute("data-layout")) === "wide") await expectStudioIdle(page);
  return workspace;
}

/** Every mounted Studio surface has measured itself and published a settled state. */
export async function expectStudioIdle(page: Page) {
  for (const testid of ["studio-coverflow", "studio-grid"]) {
    const surface = page.getByTestId(testid);
    if ((await surface.count()) > 0) await expect(surface).toHaveAttribute("data-phase", "idle");
  }
  const deck = page.getByTestId("studio-deck");
  if ((await deck.count()) > 0) await expect(deck).toHaveAttribute("data-phase", "idle");
}

export const studio = {
  activeName: (page: Page) => page.getByTestId("studio-active-name"),
  coverflow: (page: Page) => page.getByTestId("studio-coverflow"),
  deck: (page: Page) => page.getByTestId("studio-deck"),
  grid: (page: Page) => page.getByTestId("studio-grid"),
  inspector: (page: Page) => page.getByTestId("studio-inspector"),
  // The page's other galleries live in their own sections; this is the Studio's.
  gallery: (page: Page) => page.getByTestId("studio-gallery"),
  sheet: (page: Page) => page.getByTestId("studio-sheet"),
  status: (page: Page) => page.getByTestId("studio-status"),
  summary: (page: Page) => page.getByTestId("studio-summary"),
  tile: (page: Page, id: string) => page.getByTestId(`studio-tile-${id}`),
  tray: (page: Page, id: string) => page.getByTestId(`studio-tray-${id}`),
};

const studiesPerPage = 4;

/**
 * Chooses a study from the Grid the way a visitor does: page to it, then tap it. The roomy layout
 * holds four per page at every width the specs use (the tablet layout is not exercised here).
 */
export async function selectStudy(page: Page, id: string) {
  const grid = studio.grid(page);
  const target = `page-${Math.floor(studyDefinitions.findIndex((study) => study.id === id) / studiesPerPage) + 1}`;
  for (let guard = 0; guard < 6; guard += 1) {
    const current = await grid.getAttribute("data-active-page");
    if (current === target) break;
    const forward = Number(current!.slice(5)) < Number(target.slice(5));
    await page.getByTestId(forward ? "studio-grid-next" : "studio-grid-previous").click();
    await expect(grid).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  }
  await expect(grid).toHaveAttribute("data-active-page", target);
  await studio.tile(page, id).click();
}

export async function expectActiveStudy(page: Page, id: string, name: string) {
  await expect(studio.activeName(page)).toHaveText(name);
  const coverflow = studio.coverflow(page);
  if ((await coverflow.count()) > 0) {
    await expect(coverflow).toHaveAttribute("data-active-id", id);
    await expect(coverflow).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  }
  const tile = studio.tile(page, id);
  if ((await tile.count()) > 0) await expect(tile).toHaveAttribute("aria-current", "true");
}

/** Which dialogs are open right now: at most one may ever own modality. */
export async function openDialogCount(page: Page): Promise<number> {
  return page.locator("dialog[open]").count();
}

export async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      document.activeElement?.getAttribute("data-testid") ??
      document.activeElement?.tagName ??
      null,
  );
}

export async function expectGalleryOpen(page: Page, title: string) {
  const gallery = studio.gallery(page);
  await expect(gallery).toBeVisible();
  await expect(gallery.getByTestId("snap-motion-media-gallery-title")).toHaveText(title);
}

export async function expectGalleryClosed(page: Page) {
  await expect(studio.gallery(page)).toHaveCount(1);
  await expect(studio.gallery(page)).not.toBeVisible();
  await expect(studio.gallery(page)).toHaveAttribute("data-dialog-state", "closed");
}

export async function expectSheetClosed(page: Page) {
  await expect(studio.sheet(page)).not.toBeVisible();
}
