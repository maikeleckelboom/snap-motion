import { expect, type Page, type Request, type Response } from "@playwright/test";

import { expectCarouselAt } from "./helpers";

export const mediaFixtureIds = [
  "regular",
  "extremely-wide",
  "extremely-tall",
  "transformed",
  "delayed",
] as const;

export type MediaFixtureId = (typeof mediaFixtureIds)[number];

export interface MediaAssetProbe {
  failedRequests: string[];
  responses: Map<string, { ok: boolean; status: number }>;
}

function isSvgRequest(request: Request): boolean {
  return request.resourceType() === "image" && new URL(request.url()).pathname.endsWith(".svg");
}

export function observeMediaAssets(page: Page): MediaAssetProbe {
  const probe: MediaAssetProbe = {
    failedRequests: [],
    responses: new Map(),
  };

  page.on("requestfailed", (request) => {
    if (isSvgRequest(request)) {
      probe.failedRequests.push(request.url());
    }
  });
  page.on("response", (response: Response) => {
    if (isSvgRequest(response.request())) {
      probe.responses.set(response.url(), {
        ok: response.ok(),
        status: response.status(),
      });
    }
  });

  return probe;
}

export async function expectLoadedMediaFixture(
  page: Page,
  carousel: ReturnType<Page["getByTestId"]>,
  fixtureId: MediaFixtureId,
  probe: MediaAssetProbe,
): Promise<string> {
  await expectCarouselAt(carousel, fixtureId);

  const frame = page.getByTestId(`media-frame-${fixtureId}`);
  await expect(frame).toHaveAttribute("data-media-state", "loaded", { timeout: 4_000 });

  const image = page.getByTestId(`media-image-${fixtureId}`);
  await expect(image).toBeVisible();
  const state = await image.evaluate((element) => {
    const imageElement = element as HTMLImageElement;
    const viewport = imageElement.closest<HTMLElement>('[data-testid="media-carousel"]');
    const slide = imageElement.closest<HTMLElement>(".media-slide");
    const frameElement = imageElement.closest<HTMLElement>(".media-frame");
    const viewportRect = viewport?.getBoundingClientRect();
    const slideRect = slide?.getBoundingClientRect();

    return {
      alt: imageElement.alt,
      carouselCount: document.querySelectorAll('[data-testid="media-carousel"]').length,
      complete: imageElement.complete,
      currentSrc: imageElement.currentSrc,
      frameCount: slide?.querySelectorAll(".media-frame").length ?? 0,
      imageInsideStage: viewport?.contains(imageElement) ?? false,
      naturalHeight: imageElement.naturalHeight,
      naturalWidth: imageElement.naturalWidth,
      slideInsideStage:
        viewportRect !== undefined &&
        slideRect !== undefined &&
        slideRect.left >= viewportRect.left - 1.5 &&
        slideRect.right <= viewportRect.right + 1.5 &&
        slideRect.top >= viewportRect.top - 1.5 &&
        slideRect.bottom <= viewportRect.bottom + 1.5,
      visibility: getComputedStyle(imageElement).visibility,
      frameState: frameElement?.dataset.mediaState,
    };
  });

  expect(state.complete).toBe(true);
  expect(state.naturalWidth).toBeGreaterThan(0);
  expect(state.naturalHeight).toBeGreaterThan(0);
  expect(state.alt.length).toBeGreaterThan(0);
  expect(state.visibility).toBe("visible");
  expect(state.frameState).toBe("loaded");
  expect(state.carouselCount).toBe(1);
  expect(state.frameCount).toBe(1);
  expect(state.imageInsideStage).toBe(true);
  expect(state.slideInsideStage).toBe(true);
  await expect(page.getByTestId(`media-error-${fixtureId}`)).toHaveCount(0);
  await expect(page.getByTestId(`media-pending-${fixtureId}`)).toHaveCount(0);

  expect(probe.responses.get(state.currentSrc)).toEqual({ ok: true, status: 200 });
  return state.currentSrc;
}
