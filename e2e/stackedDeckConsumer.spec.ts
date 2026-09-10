import { expect, test } from "@playwright/test";

import { openLabDemo } from "./helpers";

for (const exchange of ["shuffle", "direct"] as const) {
  test(`ordinary StackedDeck keeps narrow enlarged content usable through resize (${exchange})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openLabDemo(page, "defaults", "reduce");
    await page.getByTestId(`defaults-deck-${exchange}`).click();
    const deck = page.getByTestId("defaults-deck");
    const initialCard = await deck
      .locator('.snap-motion-stacked-deck-card[data-item-id="map"]')
      .elementHandle();
    const liveCard = deck.locator(".snap-motion-stacked-deck-card:not([inert])");
    const content = liveCard.locator(".defaults-card");

    for (const scale of [1, 2, 4]) {
      // Host allocation and text-only enlargement: the package still owns card dimensions.
      await deck.evaluate((element, textScale) => {
        element.style.inlineSize = "280px";
        element.style.fontSize = `${16 * textScale}px`;
      }, scale);
      await expect(deck).toHaveCSS("width", "280px");
      await expect
        .poll(() =>
          content.evaluate((element) => ({
            horizontalOverflow: element.scrollWidth - element.clientWidth,
            canScrollVertically: element.scrollHeight > element.clientHeight,
          })),
        )
        .toEqual({ horizontalOverflow: 0, canScrollVertically: true });

      const input = liveCard.getByTestId("defaults-card-input");
      await input.fill(`Note at ${scale * 100}%`);
      await expect(input).toBeFocused();
      await input.press("ArrowRight");
      await expect(deck).toHaveAttribute("data-active-id", "map");
      await expect(input).toHaveValue(`Note at ${scale * 100}%`);
      await expect
        .poll(() =>
          input.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const contentBounds = element.closest(".defaults-card")!.getBoundingClientRect();
            return bounds.left >= contentBounds.left && bounds.right <= contentBounds.right;
          }),
        )
        .toBe(true);

      await content.evaluate((element) => (element.scrollTop = 0));
      await content.hover();
      await page.mouse.wheel(0, 100);
      await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expect(deck).toHaveAttribute("data-active-id", "map");
      await expect(deck).toHaveAttribute("data-owned", "false");
    }

    await deck.evaluate((element) => {
      element.style.inlineSize = "720px";
      element.style.fontSize = "16px";
    });
    await expect(deck).toHaveCSS("width", "720px");
    expect(
      await deck.evaluate(
        (element, original) =>
          element.querySelector('.snap-motion-stacked-deck-card[data-item-id="map"]') === original,
        initialCard,
      ),
    ).toBe(true);
    await expect(liveCard.getByTestId("defaults-card-input")).toHaveValue("Note at 400%");
    await liveCard.getByTestId("defaults-card-button").click();
    await expect(page.getByTestId("defaults-activations")).toHaveText("1");

    await deck.focus();
    await page.keyboard.press("ArrowRight");
    await expect(deck).toHaveAttribute("data-settled-id", "team");
    await page.keyboard.press("ArrowLeft");
    await expect(deck).toHaveAttribute("data-settled-id", "map");
    await expect(liveCard.getByTestId("defaults-card-input")).toHaveValue("Note at 400%");

    await deck.hover({ position: { x: 10, y: 10 } });
    const pageScrollBefore = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageScrollBefore);
    await expect(deck).toHaveAttribute("data-active-id", "map");
  });

  test(`ordinary StackedDeck follows an omitted system motion preference (${exchange})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLabDemo(page, "defaults", "system");
    await page.getByTestId(`defaults-deck-${exchange}`).click();
    const deck = page.getByTestId("defaults-deck");
    await expect(deck).toHaveAttribute("data-reduced-motion", "true");

    const liveCard = deck.locator(".snap-motion-stacked-deck-card:not([inert])");
    const restingTransform = await liveCard
      .locator(".snap-motion-stacked-deck-card-motion")
      .evaluate((element) => getComputedStyle(element).transform);
    await deck.focus();
    await page.keyboard.press("ArrowRight");
    await expect(deck).toHaveAttribute("data-settled-id", "team");
    await expect(deck).toHaveAttribute("data-phase", "idle");
    await expect(liveCard).toHaveAttribute("data-item-id", "team");
    // Preference telemetry alone cannot prove the ordinary content reached its resting pose.
    await expect(liveCard.locator(".snap-motion-stacked-deck-card-motion")).toHaveCSS(
      "transform",
      restingTransform,
    );
    await liveCard.getByTestId("defaults-card-input").fill("Readable after settlement");
    await expect(liveCard.getByTestId("defaults-card-input")).toHaveValue(
      "Readable after settlement",
    );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(deck).toHaveAttribute("data-reduced-motion", "false");
    await page.getByTestId("reduced-motion-mode").selectOption("reduce");
    await expect(deck).toHaveAttribute("data-reduced-motion", "true");
    await page.getByTestId("reduced-motion-mode").selectOption("no-preference");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(deck).toHaveAttribute("data-reduced-motion", "false");
    await page.getByTestId("reduced-motion-mode").selectOption("system");
    await expect(deck).toHaveAttribute("data-reduced-motion", "true");
  });
}
