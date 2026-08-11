import { expect, test } from "@playwright/test";

test("in-flight uncontrolled state remains the unavailable controlled fallback", async ({
  page,
}) => {
  await page.goto("./?demo=authority-epoch");
  const rail = page.getByTestId("authority-rail");
  const deck = page.getByTestId("authority-deck");
  const railStatus = rail.getByRole("status");
  const deckStatus = deck.getByRole("status");
  const requests = page.getByTestId("authority-requests");
  const settlements = page.getByTestId("authority-settlements");

  await page.getByTestId("authority-run").click();
  await expect(page.getByTestId("authority-controlled")).toHaveText("future");
  await expect(page.getByTestId("authority-rail-active")).toHaveText("future");
  await expect(page.getByTestId("authority-deck-active")).toHaveText("future");
  await expect(page.getByTestId("authority-rail-settled")).toHaveText("b");
  await expect(page.getByTestId("authority-deck-settled")).toHaveText("b");
  await expect(settlements).not.toContainText("coverflow:b:programmatic");
  await expect(settlements).not.toContainText("deck:b:programmatic");
  await expect(railStatus).not.toContainText("B");
  await expect(deckStatus).not.toContainText("B");

  await page.getByTestId("authority-reject-c").click();
  await expect(page.getByTestId("authority-rail-settled")).toHaveText("b");
  await expect(page.getByTestId("authority-deck-settled")).toHaveText("b");
  await expect(settlements).not.toContainText("coverflow:c:programmatic");
  await expect(settlements).not.toContainText("deck:c:programmatic");
  await expect(railStatus).not.toContainText("C");
  await expect(deckStatus).not.toContainText("C");

  const requestsBeforeFuture = await requests.textContent();
  await page.getByTestId("authority-reveal-future").click();
  await expect(page.getByTestId("authority-rail-settled")).toHaveText("future");
  await expect(page.getByTestId("authority-deck-settled")).toHaveText("future");
  await expect(requests).toHaveText(requestsBeforeFuture ?? "");
  await expect(railStatus).not.toContainText("Future");
  await expect(deckStatus).not.toContainText("Future");

  await page.getByTestId("authority-release").click();
  await expect(page.getByTestId("authority-controlled")).toHaveText("uncontrolled");
  await expect(page.getByTestId("authority-rail-active")).toHaveText("future");
  await expect(page.getByTestId("authority-deck-active")).toHaveText("future");
});
