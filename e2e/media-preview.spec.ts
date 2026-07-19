import { expect, test } from "@playwright/test";

import {
  expectLoadedMediaFixture,
  mediaFixtureIds,
  observeMediaAssets,
} from "./mediaFixtureAssertions";

test("built lab resolves and decodes every fixture under a non-root base", async ({ page }) => {
  const probe = observeMediaAssets(page);
  await page.goto("./");
  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
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
