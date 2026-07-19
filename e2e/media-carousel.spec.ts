import { expect, test } from "@playwright/test";

import { dragMouseBy, dragTouchBy, expectCarouselAt, openLabDemo } from "./helpers";
import {
  expectLoadedMediaFixture,
  mediaFixtureIds,
  observeMediaAssets,
} from "./mediaFixtureAssertions";

function channelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const channels = color.startsWith("#")
    ? color
        .slice(1)
        .match(/.{2}/g)
        ?.map((channel) => Number.parseInt(channel, 16))
    : color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Cannot parse computed color: ${color}`);
  }
  return (
    0.2126 * channelToLinear(channels[0]!) +
    0.7152 * channelToLinear(channels[1]!) +
    0.0722 * channelToLinear(channels[2]!)
  );
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("media lightbox", () => {
  test("loads every Vite-owned fixture without native fallback and keeps one semantic stage", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    const probe = observeMediaAssets(page);
    const opener = page.getByTestId("open-lightbox");
    await opener.focus();
    await opener.click();

    const carousel = page.getByTestId("media-carousel");
    const next = page.getByTestId("media-next");
    const resolvedUrls: string[] = [];

    for (const [index, fixtureId] of mediaFixtureIds.entries()) {
      if (index > 0) {
        await next.focus();
        await page.keyboard.press("Enter");
        await expect(next).toBeFocused();
      } else {
        await expect(page.getByTestId("close-lightbox")).toBeFocused();
      }

      resolvedUrls.push(await expectLoadedMediaFixture(page, carousel, fixtureId, probe));
      await expect(page.getByTestId("media-semantic-id")).toHaveText(fixtureId);
    }

    expect(probe.failedRequests).toEqual([]);
    expect(resolvedUrls).toHaveLength(5);
    expect(resolvedUrls.every((url) => url.includes("/src/assets/media-fixtures/"))).toBe(true);
    expect(resolvedUrls.some((url) => new URL(url).pathname.startsWith("/fixtures/"))).toBe(false);
  });

  test("renders an accessible media error instead of the browser broken-image fallback", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    await page.route("**/regular.svg*", async (route) => {
      await route.fulfill({
        body: "Fixture unavailable",
        contentType: "text/plain",
        status: 404,
      });
    });
    await page.getByTestId("open-lightbox").click();

    const frame = page.getByTestId("media-frame-regular");
    await expect(frame).toHaveAttribute("data-media-state", "failed");
    await expect(page.getByTestId("media-error-regular")).toContainText(
      "Regular landscapeMedia could not be loaded.",
    );
    await expect(page.getByTestId("media-pending-regular")).toHaveCount(0);
    await expectCarouselAt(page.getByTestId("media-carousel"), "regular");

    const image = page.getByTestId("media-image-regular");
    await expect(image).toBeHidden();
    expect(
      await image.evaluate((element) => {
        const imageElement = element as HTMLImageElement;
        return {
          alt: imageElement.alt,
          complete: imageElement.complete,
          naturalHeight: imageElement.naturalHeight,
          naturalWidth: imageElement.naturalWidth,
          visibility: getComputedStyle(imageElement).visibility,
        };
      }),
    ).toEqual({
      alt: "",
      complete: true,
      naturalHeight: 0,
      naturalWidth: 0,
      visibility: "hidden",
    });
  });

  test("supplies explicit text, boundary, icon, and focus contrast to every lightbox control", async ({
    page,
  }) => {
    await openLabDemo(page, "media");
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-frame-regular")).toHaveAttribute(
      "data-media-state",
      "loaded",
    );

    const controls = [
      { locator: page.getByTestId("close-lightbox"), minimumTextContrast: 3 },
      { locator: page.getByTestId("media-previous"), minimumTextContrast: 3 },
      { locator: page.getByTestId("media-next"), minimumTextContrast: 3 },
      { locator: page.getByTestId("slide-action-regular"), minimumTextContrast: 4.5 },
      { locator: page.getByTestId("caption-action"), minimumTextContrast: 4.5 },
      { locator: page.getByTestId("caption-input"), minimumTextContrast: 4.5 },
      { locator: page.locator(".radio-probe"), minimumTextContrast: 4.5 },
      { locator: page.locator(".media-control-probe"), minimumTextContrast: 4.5 },
      { locator: page.getByTestId("media-controls"), minimumTextContrast: 3 },
      { locator: page.getByTestId("ownership-end"), minimumTextContrast: 4.5 },
    ];

    for (const { locator, minimumTextContrast } of controls) {
      const style = await locator.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderTopColor,
          color: computed.color,
        };
      });
      expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(
        minimumTextContrast,
      );
      expect(contrastRatio(style.borderColor, style.backgroundColor)).toBeGreaterThanOrEqual(3);
    }

    const dialog = page.getByTestId("media-lightbox");
    const palette = await dialog.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        canvas: computed.getPropertyValue("--lightbox-canvas").trim(),
        colorScheme: computed.colorScheme,
        controlBorder: computed.getPropertyValue("--lightbox-control-border").trim(),
        focus: computed.getPropertyValue("--lightbox-focus").trim(),
        separator: computed.getPropertyValue("--lightbox-separator").trim(),
        surface: computed.getPropertyValue("--lightbox-surface").trim(),
        surfaceRaised: computed.getPropertyValue("--lightbox-surface-raised").trim(),
        text: computed.getPropertyValue("--lightbox-text").trim(),
        textSecondary: computed.getPropertyValue("--lightbox-text-secondary").trim(),
      };
    });
    expect(palette.colorScheme).toContain("dark");
    expect(contrastRatio(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.textSecondary, palette.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.controlBorder, palette.surfaceRaised)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.separator, palette.surface)).toBeGreaterThanOrEqual(3);

    const captionAction = page.getByTestId("caption-action");
    await captionAction.focus();
    const focusColor = await captionAction.evaluate(
      (element) => getComputedStyle(element).outlineColor,
    );
    expect(contrastRatio(focusColor, palette.canvas)).toBeGreaterThanOrEqual(3);
  });

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

    const delayedFrame = page.getByTestId("media-frame-delayed");
    await expect(delayedFrame).toHaveAttribute("data-media-state", "loaded", { timeout: 2_000 });
    const delayedImage = page.getByTestId("media-image-delayed");
    await expect(delayedImage).toBeVisible();
    const delayedImageState = await delayedImage.evaluate((element) => {
      const image = element as HTMLImageElement;
      return {
        complete: image.complete,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
      };
    });
    expect(delayedImageState.complete).toBe(true);
    expect(delayedImageState.naturalWidth).toBeGreaterThan(0);
    expect(delayedImageState.naturalHeight).toBeGreaterThan(0);
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
