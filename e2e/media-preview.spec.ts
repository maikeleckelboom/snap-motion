import { expect, test } from "@playwright/test";

import { openLabDemo } from "./helpers";
import {
  expectLoadedMediaFixture,
  mediaFixtureIds,
  observeMediaAssets,
} from "./mediaFixtureAssertions";

test("built lab resolves and decodes every fixture under a non-root base", async ({ page }) => {
  // Listeners attach before the first navigation so no fixture request is missed.
  const probe = observeMediaAssets(page);
  // The lightbox opener only exists once its own demo panel is selected; the lab opens on a
  // different demo, so navigating without selecting the tab leaves nothing to click.
  await openLabDemo(page, "media");
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
