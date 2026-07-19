import { expect, test } from "@playwright/test";

import { dragMouseBy, dragTouchBy, expectCarouselAt, openLabDemo } from "./helpers";
import {
  expectLightboxContainment,
  expectLoadedMediaFixture,
  mediaFixtureIds,
  observeMediaAssets,
} from "./mediaFixtureAssertions";

interface CapturedMediaRect {
  height: number;
  layoutHeight: number;
  layoutWidth: number;
  testId: string | undefined;
  width: number;
}

interface CapturedMediaTransition {
  new: CapturedMediaRect | undefined;
  old: CapturedMediaRect | undefined;
}

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
  test("contains the full lightbox across desktop, mobile, landscape, and zoom-equivalent viewports", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const cases = [
      { height: 960, label: "1625 × 960 desktop", width: 1_625 },
      { height: 768, label: "1366 × 768 short desktop", width: 1_366 },
      { height: 900, label: "1440 × 900 desktop", width: 1_440 },
      { height: 844, label: "390 × 844 mobile portrait", width: 390 },
      {
        expectTestRailScroll: true,
        height: 390,
        label: "844 × 390 mobile landscape",
        width: 844,
      },
      {
        expectTestRailScroll: true,
        height: 480,
        label: "200% zoom-equivalent viewport",
        width: 720,
      },
      {
        expectTestRailScroll: true,
        height: 240,
        label: "400% zoom-equivalent viewport",
        width: 360,
      },
    ] as const;

    for (const viewportCase of cases) {
      await page.setViewportSize({ height: viewportCase.height, width: viewportCase.width });
      await openLabDemo(page, "media");
      const initialDocumentScrollHeight = await page
        .locator("html")
        .evaluate((element) => element.scrollHeight);
      expect(
        await page.locator("html").evaluate((element) => element.scrollWidth - element.clientWidth),
        `${viewportCase.label}: thumbnail page inline overflow`,
      ).toBeLessThanOrEqual(1);
      await page.getByTestId("open-lightbox").click();
      await expect(page.getByTestId("media-frame-regular")).toHaveAttribute(
        "data-media-state",
        "loaded",
      );
      await expectLightboxContainment(page, {
        expectTestRailScroll:
          "expectTestRailScroll" in viewportCase && viewportCase.expectTestRailScroll,
        initialDocumentScrollHeight,
        label: viewportCase.label,
      });
    }
  });

  test("loads every Vite-owned fixture without native fallback and keeps one semantic stage", async ({
    page,
  }) => {
    const probe = observeMediaAssets(page);
    await openLabDemo(page, "media");
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
    await page.route("**/regular.svg*", async (route) => {
      if (new URL(route.request().url()).searchParams.has("import")) {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: "Fixture unavailable",
        contentType: "text/plain",
        status: 404,
      });
    });
    await openLabDemo(page, "media");
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
      { locator: page.getByTestId("media-zoom-in"), minimumTextContrast: 4.5 },
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
          viewportLeft: viewportRect.left + viewport.clientLeft,
          viewportRight: viewportRect.left + viewport.clientLeft + viewport.clientWidth,
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
      } else {
        await expect(page.locator('[data-fixture="transformed"] .media-layer')).toHaveClass(
          /media-layer--transformed/,
        );
        await expect(page.locator(".is-transformed")).toHaveCount(0);
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

  test("zooms and bounds media pan without handing the gesture to slide navigation", async ({
    page,
  }) => {
    await openLabDemo(page, "media", "no-preference");
    await page.getByTestId("open-lightbox").click();
    await expect(page.getByTestId("media-frame-regular")).toHaveAttribute(
      "data-media-state",
      "loaded",
    );

    const carousel = page.getByTestId("media-carousel");
    await page.getByTestId("media-zoom-in").click();
    await page.getByTestId("media-zoom-in").click();
    await expect(page.getByTestId("media-zoom-value")).toHaveText("200%");
    await expect(carousel).toHaveAttribute("data-transform-state", "zoomed");

    await dragMouseBy(page, carousel, 500, -250, { steps: 8 });
    await expectCarouselAt(carousel, "regular");

    const transformSnapshot = await page
      .getByTestId("media-transform-regular")
      .evaluate((surface) => {
        const viewport = surface.closest<HTMLElement>('[data-testid="media-carousel"]');
        if (!viewport) throw new Error("Media transform is missing its carousel viewport.");
        const matrix = new DOMMatrixReadOnly(getComputedStyle(surface).transform);
        return {
          scale: matrix.a,
          viewportHeight: viewport.clientHeight,
          viewportWidth: viewport.clientWidth,
          x: matrix.e,
          y: matrix.f,
        };
      });
    expect(transformSnapshot.scale).toBeCloseTo(2, 2);
    expect(Math.abs(transformSnapshot.x)).toBeLessThanOrEqual(
      transformSnapshot.viewportWidth / 2 + 1,
    );
    expect(Math.abs(transformSnapshot.y)).toBeLessThanOrEqual(
      transformSnapshot.viewportHeight / 2 + 1,
    );

    await page.getByTestId("media-next").click();
    await expectCarouselAt(carousel, "extremely-wide");
    await expect(page.getByTestId("media-zoom-value")).toHaveText("100%");
    await expect(carousel).toHaveAttribute("data-transform-state", "fitted");

    await carousel.focus();
    await page.keyboard.press("+");
    await expect(page.getByTestId("media-zoom-value")).toHaveText("150%");
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(carousel, "extremely-wide");
    await page.keyboard.press("0");
    await expect(page.getByTestId("media-zoom-value")).toHaveText("100%");
    await expect(carousel).toHaveAttribute("data-transform-state", "fitted");
    await page.keyboard.press("ArrowRight");
    await expectCarouselAt(carousel, "extremely-tall");
  });

  test("optionally relates a selected thumbnail to the same media on open and close", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const browserWindow = window as Window & {
        mediaTransitionCalls?: number;
        mediaTransitionDestinationStates?: string[];
        mediaTransitionRects?: CapturedMediaTransition[];
      };
      browserWindow.mediaTransitionCalls = 0;
      browserWindow.mediaTransitionDestinationStates = [];
      browserWindow.mediaTransitionRects = [];
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        value(update: () => Promise<void> | void) {
          browserWindow.mediaTransitionCalls = (browserWindow.mediaTransitionCalls ?? 0) + 1;
          // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must serialize with the browser init callback.
          const captureNamedRect = () => {
            const element = Array.from(document.querySelectorAll<HTMLElement>("*")).find(
              (candidate) => candidate.style.viewTransitionName === "media-inspection-media",
            );
            if (!element) return undefined;
            const rect = element.getBoundingClientRect();
            return {
              height: rect.height,
              layoutHeight: element.offsetHeight,
              layoutWidth: element.offsetWidth,
              testId: element.dataset.testid,
              width: rect.width,
            };
          };
          const old = captureNamedRect();
          const finished = Promise.resolve()
            .then(update)
            .then(() => {
              const dialog = document.querySelector<HTMLDialogElement>(
                '[data-testid="media-lightbox"]',
              );
              const activeFrame = dialog?.open
                ? dialog.querySelector<HTMLElement>(".media-slide:not([inert]) [data-media-state]")
                : undefined;
              browserWindow.mediaTransitionDestinationStates?.push(
                activeFrame?.dataset.mediaState ?? "closed",
              );
              browserWindow.mediaTransitionRects?.push({ new: captureNamedRect(), old });
              return undefined;
            });
          return { finished };
        },
      });
    });
    await openLabDemo(page, "media", "no-preference");

    const thumbnail = page.getByTestId("media-thumbnail-extremely-tall");
    await thumbnail.focus();
    await thumbnail.click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await expectCarouselAt(page.getByTestId("media-carousel"), "extremely-tall");
    await expect(page.getByTestId("media-title")).toHaveText("Extremely tall");
    await expect(page.getByTestId("media-frame-extremely-tall")).toHaveAttribute(
      "data-media-state",
      "loaded",
    );
    expect(
      await page.evaluate(
        () => (window as Window & { mediaTransitionCalls?: number }).mediaTransitionCalls,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { mediaTransitionDestinationStates?: string[] })
            .mediaTransitionDestinationStates,
      ),
    ).toEqual(["loaded"]);
    const [openingRect] = await page.evaluate(
      () =>
        (window as Window & { mediaTransitionRects?: CapturedMediaTransition[] })
          .mediaTransitionRects,
    );
    expect(openingRect?.old?.testId).toBe("media-thumbnail-image-extremely-tall");
    expect(openingRect?.new?.testId).toBe("media-image-extremely-tall");
    expect(openingRect?.old?.width / (openingRect?.old?.height ?? 1)).toBeCloseTo(1_600 / 12_000);
    expect(openingRect?.new?.width / (openingRect?.new?.height ?? 1)).toBeCloseTo(1_600 / 12_000);

    await page.getByTestId("close-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).not.toBeVisible();
    await expect(thumbnail).toBeFocused();
    expect(
      await page.evaluate(
        () => (window as Window & { mediaTransitionCalls?: number }).mediaTransitionCalls,
      ),
    ).toBe(2);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { mediaTransitionDestinationStates?: string[] })
            .mediaTransitionDestinationStates,
      ),
    ).toEqual(["loaded", "closed"]);

    const wideThumbnail = page.getByTestId("media-thumbnail-extremely-wide");
    await wideThumbnail.click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await expectCarouselAt(page.getByTestId("media-carousel"), "extremely-wide");
    await page.getByTestId("close-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).not.toBeVisible();

    const transitionRects = await page.evaluate(
      () =>
        (window as Window & { mediaTransitionRects?: CapturedMediaTransition[] })
          .mediaTransitionRects,
    );
    const wideOpeningRect = transitionRects?.[2];
    expect(wideOpeningRect?.old?.testId).toBe("media-thumbnail-image-extremely-wide");
    expect(wideOpeningRect?.new?.testId).toBe("media-image-extremely-wide");
    expect(wideOpeningRect?.old?.width / (wideOpeningRect?.old?.height ?? 1)).toBeCloseTo(
      12_000 / 1_600,
    );
    expect(wideOpeningRect?.new?.width / (wideOpeningRect?.new?.height ?? 1)).toBeCloseTo(
      12_000 / 1_600,
    );

    const transformedThumbnail = page.getByTestId("media-thumbnail-transformed");
    await transformedThumbnail.click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await expectCarouselAt(page.getByTestId("media-carousel"), "transformed");
    await page.getByTestId("close-lightbox").click();
    await expect(page.getByTestId("media-lightbox")).not.toBeVisible();

    const transformedOpeningRect = (
      await page.evaluate(
        () =>
          (window as Window & { mediaTransitionRects?: CapturedMediaTransition[] })
            .mediaTransitionRects,
      )
    )?.[4];
    expect(transformedOpeningRect?.old?.testId).toBe("media-thumbnail-image-transformed");
    expect(transformedOpeningRect?.new?.testId).toBe("media-image-transformed");
    expect(
      transformedOpeningRect?.old?.layoutWidth / (transformedOpeningRect?.old?.layoutHeight ?? 1),
    ).toBeCloseTo(1_600 / 1_000, 1);
    expect(
      transformedOpeningRect?.new?.layoutWidth / (transformedOpeningRect?.new?.layoutHeight ?? 1),
    ).toBeCloseTo(1_600 / 1_000, 1);

    await page.getByTestId("media-transition-toggle").uncheck();
    await page.getByTestId("media-thumbnail-regular").click();
    await expect(page.getByTestId("media-lightbox")).toBeVisible();
    await expectCarouselAt(page.getByTestId("media-carousel"), "regular");
    expect(
      await page.evaluate(
        () => (window as Window & { mediaTransitionCalls?: number }).mediaTransitionCalls,
      ),
    ).toBe(6);
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
