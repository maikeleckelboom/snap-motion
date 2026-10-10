import { expect, test } from "@playwright/test";

import {
  expectLoadedMediaFixture,
  mediaFixtureIds,
  observeMediaAssets,
} from "./mediaFixtureAssertions";

test("built lab resolves and decodes every fixture under a non-root base", async ({ page }) => {
  // Listeners attach before the first navigation so no fixture request is missed.
  const probe = observeMediaAssets(page);
  // Direct Lab access keeps the existing query resolver responsible for selecting the demo.
  await page.goto("./lab/?demo=media&view=workbench");
  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  await expect(page.locator("#panel-media")).toBeVisible();
  await page.getByTestId("open-lightbox").click();

  const carousel = page.getByTestId("media-carousel");
  const next = page.getByTestId("media-next");
  const resolvedUrls: string[] = [];

  for (const [index, fixtureId] of mediaFixtureIds.entries()) {
    if (index > 0) {
      await next.click();
    }
    resolvedUrls.push(await expectLoadedMediaFixture(page, carousel, fixtureId, probe));
  }

  expect(probe.failedRequests).toEqual([]);
  expect(resolvedUrls).toHaveLength(5);
  expect(
    resolvedUrls.every((url) => new URL(url).pathname.startsWith("/snap-motion/assets/")),
  ).toBe(true);
  expect(resolvedUrls.some((url) => new URL(url).pathname.startsWith("/fixtures/"))).toBe(false);
});
