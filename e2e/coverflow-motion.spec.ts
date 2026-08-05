import { expect, test, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo, setNumericInput } from "./helpers";

async function setMaximumSkip(page: Page, value: number) {
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), value);
}

function paginationButton(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Coverflow screens" })
    .getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) });
}

async function maximumCardProperty(page: Page, property: string) {
  return page
    .locator(".coverflow-card")
    .evaluateAll(
      (cards, propertyName) =>
        Math.max(
          ...cards.map((card) =>
            Number.parseFloat(getComputedStyle(card).getPropertyValue(propertyName)),
          ),
        ),
      property,
    );
}

test.beforeEach(async ({ page }) => {
  await openLabDemo(page, "coverflow", "no-preference");
});

test("slow direct drag stays 1:1 and visually neutral in both directions", async ({ page }) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const initialPosition = Number(await viewport.getAttribute("data-position"));

  await dragSyntheticPointerBy(page, viewport, -120, 0, {
    steps: 6,
    stepDelay: 0,
    eventIntervalMs: 50,
    async beforeRelease() {
      const draggedPosition = Number(await viewport.getAttribute("data-position"));
      expect(draggedPosition - initialPosition).toBeCloseTo(-120, 3);
      expect(await maximumCardProperty(page, "--kinetic-focus")).toBeCloseTo(0, 5);
    },
  });
  await expect(viewport).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });

  const reverseStart = Number(await viewport.getAttribute("data-position"));
  await dragSyntheticPointerBy(page, viewport, 120, 0, {
    steps: 6,
    stepDelay: 0,
    eventIntervalMs: 50,
    async beforeRelease() {
      const draggedPosition = Number(await viewport.getAttribute("data-position"));
      expect(draggedPosition - reverseStart).toBeCloseTo(120, 3);
      expect(await maximumCardProperty(page, "--kinetic-focus")).toBeCloseTo(0, 5);
    },
  });
  await expect(viewport).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
});

test("fast maximum-skip traversal projects every intermediate card and announces only the settle", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const status = page.getByTestId("coverflow-status");
  await setMaximumSkip(page, 5);
  await paginationButton(page, "Projectsjablonen").click();
  await expectCarouselAt(viewport, "templates");
  const sourceAnnouncement = await status.textContent();

  await dragSyntheticPointerBy(page, viewport, -250, 0, {
    steps: 3,
    stepDelay: 0,
    eventIntervalMs: 3,
    async beforeRelease() {
      await viewport.evaluate((element) => {
        const visualValues = [element.getAttribute("data-visual-id") ?? ""];
        const visualObserver = new MutationObserver(() => {
          visualValues.push(element.getAttribute("data-visual-id") ?? "");
        });
        visualObserver.observe(element, {
          attributes: true,
          attributeFilter: ["data-visual-id"],
        });
        const statusElement = document.querySelector<HTMLElement>(
          '[data-testid="coverflow-status"]',
        );
        const announcements = statusElement ? [statusElement.textContent?.trim() ?? ""] : [];
        const statusObserver = new MutationObserver(() => {
          announcements.push(statusElement?.textContent?.trim() ?? "");
        });
        if (statusElement) {
          statusObserver.observe(statusElement, {
            characterData: true,
            childList: true,
            subtree: true,
          });
        }
        const trace = {
          announcements,
          contactAtMaximumKinetic: 1,
          frame: 0,
          indicatorPositions: [] as number[],
          maximumIndicatorScale: 1,
          maximumKinetic: 0,
          stopped: false,
          statusObserver,
          visualObserver,
          visualValues,
        };
        const sampleMotion = () => {
          if (trace.stopped) {
            return;
          }

          let maximumContact = 0;
          let maximumKinetic = 0;
          for (const card of document.querySelectorAll<HTMLElement>(".coverflow-card")) {
            const style = getComputedStyle(card);
            maximumContact = Math.max(
              maximumContact,
              Number.parseFloat(style.getPropertyValue("--contact-shadow")),
            );
            maximumKinetic = Math.max(
              maximumKinetic,
              Number.parseFloat(style.getPropertyValue("--kinetic-focus")),
            );
          }

          if (maximumKinetic > trace.maximumKinetic) {
            trace.contactAtMaximumKinetic = maximumContact;
            trace.maximumKinetic = maximumKinetic;
          }
          const indicator = document.querySelector<HTMLElement>(
            '[data-testid="coverflow-pagination-indicator"]',
          );
          trace.indicatorPositions.push(Number(indicator?.dataset.position ?? 0));
          trace.maximumIndicatorScale = Math.max(
            trace.maximumIndicatorScale,
            Number(indicator?.dataset.scaleX ?? 1),
          );
          trace.frame = requestAnimationFrame(sampleMotion);
        };
        trace.frame = requestAnimationFrame(sampleMotion);
        (
          window as typeof window & {
            coverflowTraversalTrace?: typeof trace;
          }
        ).coverflowTraversalTrace = trace;
      });
    },
  });

  await expect(viewport).toHaveAttribute("data-target-id", "settings");
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  await expect(viewport).toHaveAttribute("data-active-id", "templates");
  await expect(viewport).not.toHaveAttribute("data-visual-id", "templates");
  await expect(status).toHaveText(sourceAnnouncement ?? "");
  await expectCarouselAt(viewport, "settings");
  const paginationIndicator = page.getByTestId("coverflow-pagination-indicator");
  await expect(paginationIndicator).toHaveAttribute("data-position", "4.00000");
  const traces = await page.evaluate(() => {
    const trace = (
      window as typeof window & {
        coverflowTraversalTrace?: {
          announcements: string[];
          contactAtMaximumKinetic: number;
          frame: number;
          indicatorPositions: number[];
          maximumIndicatorScale: number;
          maximumKinetic: number;
          stopped: boolean;
          statusObserver: MutationObserver;
          visualObserver: MutationObserver;
          visualValues: string[];
        };
      }
    ).coverflowTraversalTrace;
    if (trace) {
      trace.stopped = true;
      cancelAnimationFrame(trace.frame);
      trace.statusObserver.disconnect();
      trace.visualObserver.disconnect();
    }
    return {
      announcements: trace?.announcements ?? [],
      contactAtMaximumKinetic: trace?.contactAtMaximumKinetic ?? 1,
      indicatorPositions: trace?.indicatorPositions ?? [],
      maximumIndicatorScale: trace?.maximumIndicatorScale ?? 1,
      maximumKinetic: trace?.maximumKinetic ?? 0,
      visualValues: trace?.visualValues ?? [],
    };
  });
  expect(traces.maximumKinetic).toBeGreaterThan(0.05);
  expect(traces.contactAtMaximumKinetic).toBeLessThan(0.8);
  expect(traces.maximumIndicatorScale).toBeGreaterThan(1.05);
  expect(traces.maximumIndicatorScale).toBeLessThanOrEqual(1.42);
  expect(traces.indicatorPositions.length).toBeGreaterThan(3);
  expect(traces.indicatorPositions.every(Number.isFinite)).toBe(true);
  for (let index = 1; index < traces.indicatorPositions.length; index += 1) {
    expect(traces.indicatorPositions[index]! - traces.indicatorPositions[index - 1]!).toBeLessThan(
      0.75,
    );
  }
  expect(traces.visualValues).toEqual(
    expect.arrayContaining(["project", "map", "team", "settings"]),
  );
  expect(
    traces.announcements.every(
      (message) =>
        message === sourceAnnouncement?.trim() || message === "Werkruimte-instellingen, 5 of 5",
    ),
  ).toBe(true);
  await expect(status).toContainText("Werkruimte-instellingen, 5 of 5");
  await expect(paginationButton(page, "Werkruimte-instellingen")).toHaveAttribute(
    "aria-current",
    "true",
  );

  const settledCard = page.locator('[data-screen-id="settings"]');
  await expect(settledCard).toHaveCSS("opacity", "1");
  expect(
    Number.parseFloat(
      await settledCard.evaluate((card) =>
        getComputedStyle(card).getPropertyValue("--kinetic-focus"),
      ),
    ),
  ).toBeCloseTo(0, 5);
  expect(
    Number.parseFloat(
      await settledCard.evaluate((card) =>
        getComputedStyle(card).getPropertyValue("--contact-shadow"),
      ),
    ),
  ).toBeCloseTo(1, 5);

  await dragSyntheticPointerBy(page, viewport, 250, 0, {
    steps: 3,
    stepDelay: 0,
    eventIntervalMs: 3,
  });
  await expect(viewport).toHaveAttribute("data-target-id", "templates");
  await expectCarouselAt(viewport, "templates");
  await expect(status).toContainText("Projectsjablonen, 1 of 5");
});

test("maximum skip 1, 2, and 5 preserve destination policy", async ({ page }) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const cases = [
    { maximumSkip: 1, target: "project" },
    { maximumSkip: 2, target: "map" },
    { maximumSkip: 5, target: "settings" },
  ] as const;

  for (const scenario of cases) {
    await paginationButton(page, "Projectsjablonen").click();
    await expectCarouselAt(viewport, "templates");
    await setMaximumSkip(page, scenario.maximumSkip);
    await dragSyntheticPointerBy(page, viewport, -250, 0, {
      steps: 3,
      stepDelay: 0,
      eventIntervalMs: 3,
    });
    await expect(viewport).toHaveAttribute("data-target-id", scenario.target);
    await expectCarouselAt(viewport, scenario.target);
  }
});

test("re-grab cancels a pending semantic handoff and preserves continuous ordering", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  await setMaximumSkip(page, 5);
  await paginationButton(page, "Projectsjablonen").click();
  await expectCarouselAt(viewport, "templates");

  await dragSyntheticPointerBy(page, viewport, -250, 0, {
    steps: 3,
    stepDelay: 0,
    eventIntervalMs: 3,
  });
  await expect(viewport).toHaveAttribute("data-target-id", "settings");
  await expect(viewport).toHaveAttribute("data-phase", "settling");

  await dragSyntheticPointerBy(page, viewport, 250, 0, {
    steps: 3,
    stepDelay: 0,
    eventIntervalMs: 40,
    async beforeRelease() {
      await expect(viewport).toHaveAttribute("data-phase", "dragging");
      await expect(viewport).not.toHaveAttribute("data-pending-index", "4");
      const visibleZIndices = await page
        .locator('.coverflow-card[style*="visibility: visible"]')
        .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).zIndex));
      expect(new Set(visibleZIndices).size).toBe(visibleZIndices.length);
    },
  });

  await expect(viewport).not.toHaveAttribute("data-target-id", "settings");
  await expect(viewport).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
});

test("elastic ends remain symmetric and reduced motion settles exactly across stage modes", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  await setMaximumSkip(page, 5);
  await paginationButton(page, "Projectsjablonen").click();
  await expectCarouselAt(viewport, "templates");

  await dragSyntheticPointerBy(page, viewport, 120, 0, {
    steps: 4,
    stepDelay: 0,
    eventIntervalMs: 40,
    async beforeRelease() {
      const elasticPosition = Number(await viewport.getAttribute("data-position"));
      expect(elasticPosition).toBeGreaterThan(0);
      expect(elasticPosition).toBeLessThan(120);
    },
  });
  await expectCarouselAt(viewport, "templates");

  await paginationButton(page, "Werkruimte-instellingen").click();
  await expectCarouselAt(viewport, "settings");
  const endPosition = Number(await viewport.getAttribute("data-position"));
  await dragSyntheticPointerBy(page, viewport, -120, 0, {
    steps: 4,
    stepDelay: 0,
    eventIntervalMs: 40,
    async beforeRelease() {
      const elasticPosition = Number(await viewport.getAttribute("data-position"));
      expect(elasticPosition).toBeLessThan(endPosition);
      expect(endPosition - elasticPosition).toBeLessThan(120);
    },
  });
  await expectCarouselAt(viewport, "settings");

  for (const mode of ["Phone", "Tablet", "Desktop"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(viewport).toBeVisible();
    await expect(page.locator('[data-screen-id="settings"]')).toHaveCSS("opacity", "1");
  }

  await page.getByTestId("reduced-motion-mode").selectOption("reduce");
  await paginationButton(page, "Locatie & planning").click();
  await expectCarouselAt(viewport, "map");
  expect(await maximumCardProperty(page, "--kinetic-focus")).toBeCloseTo(0, 5);
});
