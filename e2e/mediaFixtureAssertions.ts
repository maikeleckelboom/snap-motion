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

export interface LightboxContainmentOptions {
  expectTestRailScroll?: boolean;
  initialDocumentScrollHeight: number;
  label: string;
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

export async function expectLightboxContainment(
  page: Page,
  { expectTestRailScroll = false, initialDocumentScrollHeight, label }: LightboxContainmentOptions,
): Promise<void> {
  const snapshot = await page
    .getByTestId("media-lightbox")
    .evaluate((dialog, initialDocumentHeight) => {
      const requireElement = <T extends HTMLElement>(selector: string): T => {
        const element = dialog.querySelector<T>(selector);
        if (!element) {
          throw new Error(`Missing lightbox containment element: ${selector}`);
        }
        return element;
      };
      const shell = requireElement<HTMLElement>('[data-testid="media-lightbox-shell"]');
      const workspace = requireElement<HTMLElement>('[data-testid="media-stage-workspace"]');
      const instrument = requireElement<HTMLElement>('[data-testid="media-stage-instrument"]');
      const frame = requireElement<HTMLElement>(".carousel-frame");
      const viewport = requireElement<HTMLElement>('[data-testid="media-carousel"]');
      const close = requireElement<HTMLElement>('[data-testid="close-lightbox"]');
      const footer = requireElement<HTMLElement>('[data-testid="media-lightbox-footer"]');
      const caption = requireElement<HTMLElement>('[data-testid="media-caption-rail"]');
      const testRail = requireElement<HTMLElement>('[data-testid="media-test-rail"]');
      const track = requireElement<HTMLElement>(".media-track");
      const slideAction = requireElement<HTMLElement>('[data-testid="slide-action-regular"]');
      const zoomControls = requireElement<HTMLElement>('[data-testid="media-zoom-controls"]');
      const slides = Array.from(dialog.querySelectorAll<HTMLElement>(".media-slide"));
      const dialogRect = dialog.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const slideActionRect = slideAction.getBoundingClientRect();
      const zoomControlsRect = zoomControls.getBoundingClientRect();

      // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must serialize with the browser evaluation callback.
      const isInside = (element: HTMLElement, containerRect: DOMRect, tolerance = 1) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= containerRect.left - tolerance &&
          rect.right <= containerRect.right + tolerance &&
          rect.top >= containerRect.top - tolerance &&
          rect.bottom <= containerRect.bottom + tolerance
        );
      };
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must serialize with the browser evaluation callback.
      const verticalOverflow = (element: HTMLElement) =>
        element.scrollHeight - element.clientHeight;
      const containmentElements = [
        ["dialog", dialog],
        ["shell", shell],
        ["workspace", workspace],
        ["instrument", instrument],
        ["frame", frame],
        ["viewport", viewport],
        ["footer", footer],
        ["caption", caption],
        ["testRail", testRail],
      ] as const;

      return {
        captionVisible: isInside(caption, dialogRect),
        closeVisible: isInside(close, dialogRect),
        slideActionVisible: isInside(slideAction, viewportRect),
        zoomControlsVisible: isInside(zoomControls, dialogRect),
        controlOverlap: !(
          slideActionRect.right <= zoomControlsRect.left ||
          slideActionRect.left >= zoomControlsRect.right ||
          slideActionRect.bottom <= zoomControlsRect.top ||
          slideActionRect.top >= zoomControlsRect.bottom
        ),
        dialogOverflow: verticalOverflow(dialog),
        dialogOverflowStyle: getComputedStyle(dialog).overflowY,
        documentGrowth: document.documentElement.scrollHeight - initialDocumentHeight,
        documentOverflowStyles: {
          body: getComputedStyle(document.body).overflowY,
          html: getComputedStyle(document.documentElement).overflowY,
        },
        geometry: {
          activeId: viewport.dataset.activeId,
          slideWidths: slides.map((slide) => slide.offsetWidth),
          trackWidth: track.scrollWidth,
          viewportWidth: viewport.clientWidth,
        },
        renderedReadout: requireElement<HTMLElement>('[data-testid="media-rendered-size"]')
          .textContent,
        shellOverflow: verticalOverflow(shell),
        stageInsideWorkspace: isInside(viewport, workspaceRect),
        stageRatio: viewportRect.width / viewportRect.height,
        stageVisible: isInside(viewport, dialogRect),
        testRailOverflow: verticalOverflow(testRail),
        verticalScrollOwners: containmentElements
          .filter(([, element]) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY))
          .map(([name]) => name),
        viewportHeight: viewport.clientHeight,
        viewportWidth: viewport.clientWidth,
      };
    }, initialDocumentScrollHeight);

  expect(snapshot.dialogOverflow, `${label}: dialog block overflow`).toBeLessThanOrEqual(1);
  expect(snapshot.shellOverflow, `${label}: shell block overflow`).toBeLessThanOrEqual(1);
  expect(
    snapshot.documentGrowth,
    `${label}: document growth from open lightbox`,
  ).toBeLessThanOrEqual(1);
  expect(snapshot.dialogOverflowStyle, `${label}: dialog overflow ownership`).toBe("clip");
  expect(snapshot.documentOverflowStyles, `${label}: document scrollbar suppression`).toEqual({
    body: "clip",
    html: "clip",
  });
  expect(snapshot.closeVisible, `${label}: close control visibility`).toBe(true);
  expect(snapshot.slideActionVisible, `${label}: slide action visibility`).toBe(true);
  expect(snapshot.zoomControlsVisible, `${label}: zoom controls visibility`).toBe(true);
  expect(snapshot.controlOverlap, `${label}: media controls remain distinct`).toBe(false);
  expect(snapshot.stageVisible, `${label}: stage visibility`).toBe(true);
  expect(snapshot.captionVisible, `${label}: caption visibility`).toBe(true);
  expect(snapshot.stageInsideWorkspace, `${label}: stage workspace containment`).toBe(true);
  expect(snapshot.stageRatio, `${label}: 16:10 stage ratio`).toBeCloseTo(16 / 10, 2);
  expect(snapshot.geometry.activeId, `${label}: active semantic ID`).toBe("regular");
  expect(
    snapshot.geometry.slideWidths.every(
      (width) => Math.abs(width - snapshot.geometry.viewportWidth) <= 1,
    ),
    `${label}: fixed slide geometry`,
  ).toBe(true);
  expect(
    Math.abs(
      snapshot.geometry.trackWidth - snapshot.geometry.viewportWidth * mediaFixtureIds.length,
    ),
    `${label}: fixed track geometry`,
  ).toBeLessThanOrEqual(2);
  expect(snapshot.renderedReadout?.replace(/\s+/g, " ").trim(), `${label}: rendered readout`).toBe(
    `Rendered ${snapshot.viewportWidth} × ${snapshot.viewportHeight} px`,
  );
  expect(
    snapshot.verticalScrollOwners,
    `${label}: test rail owns all permitted block scrolling`,
  ).toEqual(["testRail"]);
  if (expectTestRailScroll) {
    expect(snapshot.testRailOverflow, `${label}: constrained test rail scroll`).toBeGreaterThan(1);
  }
}
