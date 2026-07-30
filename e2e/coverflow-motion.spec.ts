import { expect, test, type Page } from "@playwright/test";

import { dragSyntheticPointerBy, expectCarouselAt, openLabDemo, setNumericInput } from "./helpers";

async function setMaximumSkip(page: Page, value: number) {
  await setNumericInput(page.getByRole("spinbutton", { name: "Maximum skip", exact: true }), value);
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

test("fast maximum-skip traversal commits once and retains kinetic material in both directions", async ({
  page,
}) => {
  const viewport = page.getByTestId("coverflow-viewport");
  const status = page.getByTestId("coverflow-status");
  await setMaximumSkip(page, 5);
  await page.getByRole("tab", { name: "Projectsjablonen", exact: true }).click();
  await expectCarouselAt(viewport, "templates");
  const sourceAnnouncement = await status.textContent();

  let sourceAtRelease = "";
  await dragSyntheticPointerBy(page, viewport, -250, 0, {
    steps: 3,
    stepDelay: 0,
    eventIntervalMs: 3,
    async beforeRelease() {
      sourceAtRelease = (await viewport.getAttribute("data-active-id")) ?? "";
      await viewport.evaluate((element) => {
        const values = [element.getAttribute("data-active-id") ?? ""];
        const observer = new MutationObserver(() => {
          values.push(element.getAttribute("data-active-id") ?? "");
        });
        observer.observe(element, { attributes: true, attributeFilter: ["data-active-id"] });
        const motionTrace = {
          contactAtMaximumKinetic: 1,
          frame: 0,
          maximumKinetic: 0,
          stopped: false,
        };
        const sampleMotion = () => {
          if (motionTrace.stopped) {
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

          if (maximumKinetic > motionTrace.maximumKinetic) {
            motionTrace.contactAtMaximumKinetic = maximumContact;
            motionTrace.maximumKinetic = maximumKinetic;
          }

          motionTrace.frame = requestAnimationFrame(sampleMotion);
        };
        motionTrace.frame = requestAnimationFrame(sampleMotion);
        (
          window as typeof window & {
            coverflowCommitTrace?: { observer: MutationObserver; values: string[] };
            coverflowMotionTrace?: typeof motionTrace;
          }
        ).coverflowCommitTrace = { observer, values };
        (
          window as typeof window & {
            coverflowMotionTrace?: typeof motionTrace;
          }
        ).coverflowMotionTrace = motionTrace;
      });
    },
  });

  await expect(viewport).toHaveAttribute("data-target-id", "settings");
  await expect(viewport).toHaveAttribute("data-phase", "settling");
  await expect(viewport).toHaveAttribute("data-active-id", sourceAtRelease);
  await expect(status).toHaveText(sourceAnnouncement ?? "");
  await expectCarouselAt(viewport, "settings");
  const traces = await page.evaluate(() => {
    const commitTrace = (
      window as typeof window & {
        coverflowCommitTrace?: { observer: MutationObserver; values: string[] };
      }
    ).coverflowCommitTrace;
    const motionTrace = (
      window as typeof window & {
        coverflowMotionTrace?: {
          contactAtMaximumKinetic: number;
          frame: number;
          maximumKinetic: number;
          stopped: boolean;
        };
      }
    ).coverflowMotionTrace;
    commitTrace?.observer.disconnect();
    if (motionTrace) {
      motionTrace.stopped = true;
      cancelAnimationFrame(motionTrace.frame);
    }
    return {
      committed: commitTrace?.values ?? [],
      contactAtMaximumKinetic: motionTrace?.contactAtMaximumKinetic ?? 1,
      maximumKinetic: motionTrace?.maximumKinetic ?? 0,
    };
  });
  expect(traces.maximumKinetic).toBeGreaterThan(0.05);
  expect(traces.contactAtMaximumKinetic).toBeLessThan(0.8);
  expect(traces.committed).toContain("settings");
  expect(traces.committed.every((id) => id === sourceAtRelease || id === "settings")).toBe(true);
  await expect(status).toContainText("Werkruimte-instellingen, 5 of 5");
  await expect(
    page.getByRole("tab", { name: "Werkruimte-instellingen", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

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
    await page.getByRole("tab", { name: "Projectsjablonen", exact: true }).click();
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
  await page.getByRole("tab", { name: "Projectsjablonen", exact: true }).click();
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
  await page.getByRole("tab", { name: "Projectsjablonen", exact: true }).click();
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

  await page.getByRole("tab", { name: "Werkruimte-instellingen", exact: true }).click();
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
  await page.getByRole("tab", { name: "Locatie & planning", exact: true }).click();
  await expectCarouselAt(viewport, "map");
  expect(await maximumCardProperty(page, "--kinetic-focus")).toBeCloseTo(0, 5);
});
