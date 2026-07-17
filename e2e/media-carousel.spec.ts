import { expect, test } from "@playwright/test";

import { dragMouseBy, dragTouchBy, expectCarouselAt, openLabDemo } from "./helpers";

test.describe("media lightbox", () => {
  test("opens as a modal, preserves keyboard boundaries, and restores focus", async ({ page }) => {
    await openLabDemo(page, "media");

    const opener = page.getByTestId("open-lightbox");
    const dialog = page.getByTestId("media-lightbox");
    const carousel = page.getByTestId("media-carousel");
    const previous = page.getByTestId("media-previous");
    const next = page.getByTestId("media-next");

    await opener.focus();
    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("close-lightbox")).toBeFocused();
    await expectCarouselAt(carousel, "regular");
    await expect(previous).toBeDisabled();

    await carousel.focus();
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(carousel, "extremely-wide");
    await expect(page.getByTestId("media-count")).toHaveText("2 / 5");

    await page.keyboard.press("End");
    await expectCarouselAt(carousel, "delayed");
    await expect(next).toBeDisabled();

    await page.keyboard.press("Home");
    await expectCarouselAt(carousel, "regular");
    await expect(previous).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();

    await opener.click();
    await page.getByTestId("close-lightbox").click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });

  test("supports mouse and touch direct manipulation at a mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();

    const carousel = page.getByTestId("media-carousel");
    const box = await carousel.boundingBox();
    if (!box) {
      throw new Error("Media carousel has no layout box.");
    }

    await dragMouseBy(page, carousel, -box.width * 0.62, 0, {
      stepDelay: 35,
      steps: 12,
    });
    await expectCarouselAt(carousel, "extremely-wide");

    await dragTouchBy(page, carousel, -box.width * 0.62, 4, {
      stepDelay: 35,
      steps: 12,
    });
    await expect(carousel).toHaveAttribute("data-active-id", /extremely-tall|transformed/);
    await expect(carousel).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  });

  test("keeps extreme and transformed media subordinate to stage geometry", async ({ page }) => {
    await page.setViewportSize({ width: 1_200, height: 800 });
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();

    const carousel = page.getByTestId("media-carousel");
    const next = page.getByTestId("media-next");

    for (const fixture of ["wide", "tall", "transformed"] as const) {
      await next.click();
      const expectedId =
        fixture === "wide"
          ? "extremely-wide"
          : fixture === "tall"
            ? "extremely-tall"
            : "transformed";
      await expectCarouselAt(carousel, expectedId);

      const geometry = await carousel.evaluate((viewport, fixtureMode) => {
        const track = viewport.querySelector<HTMLElement>(".media-track");
        const activeSlide = viewport.querySelector<HTMLElement>(`[data-fixture="${fixtureMode}"]`);
        const frame = activeSlide?.querySelector<HTMLElement>(".media-frame");
        const image = activeSlide?.querySelector<HTMLImageElement>("img");
        const slides = Array.from(viewport.querySelectorAll<HTMLElement>(".media-slide"));
        if (!track || !activeSlide || !frame) {
          throw new Error("Media stage geometry is incomplete.");
        }

        const viewportRect = viewport.getBoundingClientRect();
        const activeRect = activeSlide.getBoundingClientRect();
        const frameRect = frame.getBoundingClientRect();
        const imageRect = image?.getBoundingClientRect();

        return {
          activeLeft: activeRect.left,
          activeRight: activeRect.right,
          imageContained:
            !imageRect ||
            (imageRect.width <= frameRect.width + 1 && imageRect.height <= frameRect.height + 1),
          slideWidths: slides.map((slide) => slide.offsetWidth),
          trackWidth: track.scrollWidth,
          viewportLeft: viewportRect.left,
          viewportRight: viewportRect.right,
          viewportWidth: viewport.clientWidth,
        };
      }, fixture);

      expect(Math.abs(geometry.activeLeft - geometry.viewportLeft)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(geometry.activeRight - geometry.viewportRight)).toBeLessThanOrEqual(1.5);
      expect(
        geometry.slideWidths.every((width) => Math.abs(width - geometry.viewportWidth) <= 1),
      ).toBe(true);
      expect(Math.abs(geometry.trackWidth - geometry.viewportWidth * 5)).toBeLessThanOrEqual(2);
      if (fixture !== "transformed") {
        expect(geometry.imageContained).toBe(true);
      }
    }
  });

  test("preserves the delayed semantic target through decode and viewport remeasurement", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_000, height: 720 });
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();

    const carousel = page.getByTestId("media-carousel");
    await carousel.focus();
    await page.keyboard.press("End");
    await expectCarouselAt(carousel, "delayed");

    await expect(page.locator('[data-fixture="delayed"] img')).toBeVisible({ timeout: 2_000 });
    await expectCarouselAt(carousel, "delayed");

    await page.setViewportSize({ width: 720, height: 1_000 });
    await expectCarouselAt(carousel, "delayed");
    await page.setViewportSize({ width: 1_000, height: 720 });
    await expectCarouselAt(carousel, "delayed");
  });

  test("keeps one-item boundaries stable and retargets an active settle through resize", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    await page.getByTestId("media-fixture-mode").selectOption("one");
    await page.getByTestId("open-lightbox").click();

    const carousel = page.getByTestId("media-carousel");
    await expectCarouselAt(carousel, "regular");
    await expect(page.getByTestId("media-count")).toHaveText("1 / 1");
    await expect(page.getByTestId("media-previous")).toBeDisabled();
    await expect(page.getByTestId("media-next")).toBeDisabled();
    expect(
      await carousel.evaluate((viewport) => {
        const track = viewport.querySelector<HTMLElement>(".media-track");
        return track
          ? Math.abs(track.scrollWidth - viewport.clientWidth)
          : Number.POSITIVE_INFINITY;
      }),
    ).toBeLessThanOrEqual(1);

    await page.getByTestId("close-lightbox").click();
    await page.getByTestId("media-fixture-mode").selectOption("all");
    await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
    await page.getByLabel("Preset").selectOption("loose");
    await page.getByTestId("open-lightbox").click();

    await page.getByTestId("media-next").click();
    await expect(carousel).toHaveAttribute("data-phase", "settling");
    await page.setViewportSize({ width: 720, height: 1_000 });
    await expect(carousel).toHaveAttribute("data-active-id", "extremely-wide");
    await expectCarouselAt(carousel, "extremely-wide");
  });

  test("retargets rapid controls and a new drag from an in-flight position", async ({ page }) => {
    await openLabDemo(page, "media", "no-preference");
    await page.getByLabel("Preset").selectOption("loose");
    await page.getByTestId("open-lightbox").click();

    const carousel = page.getByTestId("media-carousel");
    const next = page.getByTestId("media-next");
    const previous = page.getByTestId("media-previous");

    await next.click();
    await expect(carousel).toHaveAttribute("data-phase", "settling");
    await previous.click();
    await expectCarouselAt(carousel, "regular");

    await next.click();
    await expect(carousel).toHaveAttribute("data-phase", "settling");
    await next.click();
    await expect(carousel).toHaveAttribute("data-active-id", "extremely-tall");

    await dragMouseBy(page, carousel, 80, 0, {
      beforeRelease: async () => {
        await expect(carousel).toHaveAttribute("data-phase", "dragging");
      },
      stepDelay: 20,
      steps: 5,
    });
    await expect(carousel).toHaveAttribute("data-active-id", /extremely-wide|extremely-tall/);
    await expect(carousel).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
  });
});
