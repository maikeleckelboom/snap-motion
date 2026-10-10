import { expect, test } from "@playwright/test";

import { playgroundSections } from "../apps/lab/src/playground/sections";
import { expectCarouselAt } from "./helpers";
import { expectPublicNavigation, openPlayground, section, tuningState } from "./playgroundHelpers";

test("the built playground resolves every asset under a non-root base", async ({ page }) => {
  // Listeners attach before the first navigation so no request is missed.
  const requested: string[] = [];
  const failed: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("requestfailed", (request) => failed.push(`failed ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await openPlayground(page);
  expect(new URL(page.url()).pathname).toBe("/snap-motion/playground/");

  // Hashed bundles, stylesheets and plates all come from the base, never from the host root.
  const assets = requested.filter((url) => new URL(url).pathname.includes("/assets/"));
  expect(assets.length).toBeGreaterThan(5);
  expect(assets.every((url) => new URL(url).pathname.startsWith("/snap-motion/assets/"))).toBe(
    true,
  );
  // No development-only certification endpoint leaks into the public page.
  expect(requested.some((url) => url.includes("__at-media__"))).toBe(false);
  expect(requested.some((url) => new URL(url).pathname.startsWith("/fixtures/"))).toBe(false);

  // The six plates decode from their built URLs.
  const thumbnails = page.locator(".media-thumbnail-visual img");
  await expect(thumbnails).toHaveCount(6);
  await page.locator("#gallery").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      thumbnails.evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);

  // Public screen plates decode from external assets under the same production base.
  for (const id of ["coverflow", "stacked-deck"] as const) {
    const plates = page
      .getByTestId(id === "coverflow" ? "coverflow-viewport" : "stacked-deck-viewport")
      .locator("img");
    await expect(plates).toHaveCount(5);
    const sources = await plates.evaluateAll(async (images) =>
      Promise.all(
        images.map(async (element) => {
          const image = element as HTMLImageElement;
          await image.decode();
          return {
            source: image.src,
            width: image.naturalWidth,
            text: await (await fetch(image.src)).text(),
          };
        }),
      ),
    );
    for (const { source, width, text } of sources) {
      expect(width).toBe(1600);
      expect(new URL(source).pathname.startsWith("/snap-motion/assets/")).toBe(true);
      expect(text).toContain("SNAP MOTION");
      expect(text).not.toMatch(/Yoot|Portaal/);
    }
  }

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test("the built Studio loads on demand from the base and decodes every plate it shows", async ({
  page,
}) => {
  const requested: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("requestfailed", (request) => failed.push(`failed ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await openPlayground(page);
  // Nothing of the workspace is fetched until the visitor opens it.
  const studioAssets = () =>
    requested.filter((url) => /StudioWorkspace|-(cover|route|timing)-[\w-]+\.svg/.test(url));
  expect(studioAssets()).toEqual([]);

  await page.getByTestId("studio-activate").click();
  await expect(page.getByTestId("studio-workspace")).toBeVisible();
  await expect(page.getByTestId("studio-coverflow")).toHaveAttribute("data-phase", "idle");
  const loaded = studioAssets();
  expect(loaded.some((url) => /StudioWorkspace-[\w-]+\.js/.test(url))).toBe(true);
  expect(loaded.every((url) => new URL(url).pathname.startsWith("/snap-motion/assets/"))).toBe(
    true,
  );

  // Every cover the Coverflow, the Grid and the Deck show decodes from its built URL.
  const covers = page.locator("#studio img[src*='-cover-']");
  await expect.poll(() => covers.count()).toBeGreaterThan(24);
  await expect
    .poll(() =>
      covers.evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth === 1_600),
      ),
    )
    .toBe(true);

  // The Gallery's plates come from the same base, and only the plates it is showing are fetched.
  const beforeGallery = loaded.length;
  await page.getByTestId("studio-plate-timing").click();
  const gallery = page.getByTestId("studio-gallery");
  await expect(gallery).toBeVisible();
  await expect(gallery.getByTestId("snap-motion-media-gallery-title")).toHaveText("Fold — Timing");
  const plate = gallery.locator("img[src*='fold-timing']").first();
  await expect(plate).toBeVisible();
  await expect
    .poll(() => plate.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1_600);
  const source = await plate.evaluate((image) => (image as HTMLImageElement).currentSrc);
  expect(new URL(source).pathname.startsWith("/snap-motion/assets/")).toBe(true);
  expect(studioAssets().length).toBeGreaterThanOrEqual(beforeGallery);

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test("the built playground is fully interactive and shares one configuration", async ({ page }) => {
  await openPlayground(page);
  await section(page, "coverflow").getByTestId("coverflow-next").click();
  await expectCarouselAt(page.getByTestId("coverflow-viewport"), "team");

  await section(page, "stacked-deck").getByTestId("preset-heavy").click();
  for (const { id } of playgroundSections) {
    await expect(tuningState(page, id)).toHaveText("Preset");
    await expect(section(page, id).getByTestId("preset-heavy")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }

  await section(page, "paged-grid").getByTestId("tuning-customize").click();
  await expect(page.getByRole("spinbutton", { name: "Stiffness", exact: true })).toHaveValue("360");

  await page.getByTestId("open-lightbox").scrollIntoViewIfNeeded();
  await page.getByTestId("open-lightbox").click();
  await expect(page.getByTestId("media-lightbox")).toBeVisible();
  await expect(page.getByTestId("close-lightbox")).toBeFocused();
  await page.getByTestId("close-lightbox").click();
  await expect(page.getByTestId("open-lightbox")).toBeFocused();
});

test("a missing trailing slash reaches the Playground, not the Lab", async ({ page }) => {
  await page.goto("./playground?from=link");
  expect(new URL(page.url()).pathname).toBe("/snap-motion/playground/");
  expect(new URL(page.url()).search).toBe("?from=link");
  await expect(page).toHaveTitle("Snap Motion Playground");
});

for (const width of [1280, 390]) {
  test(`built public entries have no Lab navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await expect(page).toHaveTitle("Snap Motion Playground");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectPublicNavigation(page);
    await openPlayground(page);
    await expectPublicNavigation(page);
  });
}

test("the built Lab keeps direct Workbench and Fixtures deep links", async ({ page }) => {
  await page.goto("./lab/");
  await expect(page.locator(".lab-app")).toBeVisible();
  await expect(page.locator("#panel-coverflow")).toBeVisible();
  for (const demo of ["coverflow", "stacked-deck", "grid", "media", "sheet"]) {
    await page.goto(`./lab/?demo=${demo}&view=workbench`);
    await expect(page.locator(`#panel-${demo}`)).toBeVisible();
    await expect(page.getByText("Advanced physics", { exact: true })).toBeVisible();
  }
  await page.goto("./lab/?view=fixtures");
  await expect(page.locator("#panel-defaults")).toBeVisible();
});

test("the built Lab directory redirect preserves deep-link queries", async ({ page }) => {
  await page.goto("./lab?demo=sheet&view=workbench");
  expect(new URL(page.url()).pathname).toBe("/snap-motion/lab/");
  expect(new URL(page.url()).search).toBe("?demo=sheet&view=workbench");
  await expect(page.locator("#panel-sheet")).toBeVisible();
});
