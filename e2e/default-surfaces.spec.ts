import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { dragMouseBy, openLabDemo } from "./helpers";

const DECK = '[data-testid="defaults-deck"]';
const RAIL = '[data-testid="defaults-rail"]';

async function expectNoAxeViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    })),
    context,
  ).toEqual([]);
}

function cardHints(page: Page) {
  return page
    .locator(`${DECK} .snap-motion-stacked-deck-card-motion`)
    .evaluateAll((elements) =>
      elements.map((element) => globalThis.getComputedStyle(element).willChange),
    );
}

test.describe("zero-configuration surfaces", () => {
  test("publishes an accessible structure at rest, disabled, and mid-navigation", async ({
    page,
  }) => {
    await openLabDemo(page, "defaults");
    await expectNoAxeViolations(page, "default surfaces at rest");

    const structure = await page.locator(DECK).evaluate((deck) => {
      const cards = [...deck.querySelectorAll<HTMLElement>(".snap-motion-stacked-deck-card")];
      return {
        role: deck.getAttribute("role"),
        roleDescription: deck.getAttribute("aria-roledescription"),
        label: deck.getAttribute("aria-label"),
        cards: cards.map((card) => ({
          role: card.getAttribute("role"),
          roleDescription: card.getAttribute("aria-roledescription"),
          hidden: card.getAttribute("aria-hidden") === "true",
          inert: card.hasAttribute("inert"),
        })),
      };
    });

    expect(structure.role).toBe("group");
    expect(structure.roleDescription).toBe("carousel");
    expect(structure.label).toBe("Default stacked deck");
    expect(structure.cards).not.toHaveLength(0);
    for (const card of structure.cards) {
      expect(card.role).toBe("group");
      expect(card.roleDescription).toBe("slide");
      // Hidden from assistive technology and reachable by keyboard is the contradiction.
      expect(card.inert).toBe(card.hidden);
    }

    await expect(page.locator(RAIL)).toHaveAttribute("role", "group");
    await expect(page.locator(RAIL)).toHaveAttribute("aria-roledescription", "carousel");

    await page.locator(DECK).focus();
    await page.keyboard.press("ArrowRight");
    await expectNoAxeViolations(page, "default surfaces after keyboard navigation");

    await page.getByTestId("defaults-cover").check();
    await expectNoAxeViolations(page, "default surfaces while covered");
  });

  test("exchanges exactly one screen however far a gesture travels", async ({ page }) => {
    await openLabDemo(page, "defaults");
    const deck = page.locator(DECK);
    await expect(deck).toHaveAttribute("data-active-id", "map");

    // Far past the adjacent anchor: the surface resists rather than chaining a second exchange.
    await dragMouseBy(page, deck, -900, 0, {
      beforeRelease: async () => {
        // The browser may deliver capture loss before this hook when a mouse leaves its viewport,
        // so this cross-browser fixture asserts projection here and semantic acceptance below.
        await expect(deck).toHaveAttribute("data-visual-id", "team");
      },
    });
    await expect(deck).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await expect(deck).toHaveAttribute("data-settled-id", "team");
    await expect(page.getByTestId("defaults-deck-id")).toHaveText("team");
  });

  test("hints the compositor only while a surface is moving", async ({ page }) => {
    await openLabDemo(page, "defaults", "no-preference");
    await expect(page.locator(DECK)).toHaveAttribute("data-phase", "idle");
    expect(new Set(await cardHints(page)), "idle deck").toEqual(new Set(["auto"]));

    let hintedDuringDrag: string[] = [];
    await dragMouseBy(page, page.locator(DECK), -200, 0, {
      beforeRelease: async () => {
        hintedDuringDrag = await cardHints(page);
      },
    });
    expect(hintedDuringDrag, "manipulated deck").toContain("transform");

    await expect(page.locator(DECK)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    expect(new Set(await cardHints(page)), "settled deck").toEqual(new Set(["auto"]));
  });

  test("keeps a consumer's own controls inside a card usable", async ({ page }) => {
    await openLabDemo(page, "defaults");
    const activations = page.getByTestId("defaults-activations");
    await expect(activations).toHaveText("0");

    const liveCard = page.locator(`${DECK} .snap-motion-stacked-deck-card:not([inert])`);
    await liveCard.getByTestId("defaults-card-button").click();
    await expect(activations).toHaveText("1");
    await liveCard.getByTestId("defaults-card-link").click();
    await expect(activations).toHaveText("2");

    const input = liveCard.getByTestId("defaults-card-input");
    await input.fill("typed");
    await expect(input).toHaveValue("typed");
    // Arrow keys inside a text field belong to the field, not to the surface.
    await input.press("ArrowRight");
    await expect(page.locator(DECK)).toHaveAttribute("data-settled-id", "map");

    // A gesture over the card is a gesture, not an activation.
    await dragMouseBy(page, page.locator(DECK), -400, 0);
    await expect(page.locator(DECK)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await expect(activations).toHaveText("2");
  });

  test("reports what actually moved the surface", async ({ page }) => {
    await openLabDemo(page, "defaults");
    const reason = page.getByTestId("defaults-deck-reason");
    await expect(reason).toHaveText("none");

    await page.locator(DECK).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(DECK)).toHaveAttribute("data-settled-id", "team");
    await expect(reason).toHaveText("keyboard");

    await dragMouseBy(page, page.locator(DECK), 400, 0);
    await expect(page.locator(DECK)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    await expect(reason).toHaveText("drag");
  });

  test("lets a route take over selection even while the surface refuses input", async ({
    page,
  }) => {
    await openLabDemo(page, "defaults");
    const deck = page.locator(DECK);
    await page.getByTestId("defaults-cover").check();
    await expect(deck).toHaveAttribute("data-owned", "false");

    await page.getByTestId("defaults-route-last").click();
    await expect(page.getByTestId("defaults-deck-id")).toHaveText("settings");
    await expect(deck).toHaveAttribute("data-settled-id", "settings");
    await expect(page.locator(RAIL)).toHaveAttribute("data-active-id", "settings");

    await page.getByTestId("defaults-route-first").click();
    await expect(deck).toHaveAttribute("data-settled-id", "templates");

    // Controlled state is not a user request, so it is never echoed back as one.
    await expect(page.getByTestId("defaults-deck-reason")).toHaveText("none");
    await expect(page.getByTestId("defaults-rail-reason")).toHaveText("none");
  });
});
