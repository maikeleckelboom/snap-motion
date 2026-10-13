import { expect, test, type Locator, type Page } from "@playwright/test";

import { sharedMediaData } from "../apps/lab/src/playground/studio/media/shared-media-data";
import { dragMouseBy } from "./helpers";
import { scrollY } from "./playgroundHelpers";
import { centreOnScreen, openDialogCount, openStudio } from "./studioHelpers";

/**
 * The item carousel as a visitor meets it: photos shared in a conversation, several in view at once,
 * a tap that opens one, a drag that opens nothing, a keyboard that reaches all of it, and a viewer
 * that is a correct modal.
 *
 * Logic runs under reduced motion so each test costs a page load and a few clicks. What needs real
 * motion (a drag, a catch, an interrupted step) opts in explicitly.
 */

type Role = "reference" | "candidate";

const surface = (page: Page, role: Role = "reference") =>
  page.getByTestId(`studio-${role}-surface`);
const viewer = (page: Page) => page.getByTestId("studio-media-viewer");
const titleOf = (id: string) => sharedMediaData.find((item) => item.id === id)!.title;

interface StripGeometry {
  viewport: { left: number; right: number; width: number };
  items: {
    id: string;
    left: number;
    right: number;
    width: number;
    visible: boolean;
    partial: boolean;
    current: boolean;
  }[];
}

/** Where every item is, relative to the strip's own viewport. */
async function geometry(page: Page, role: Role = "reference"): Promise<StripGeometry> {
  return surface(page, role).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      viewport: { left: box.left, right: box.right, width: box.width },
      items: [...element.querySelectorAll<HTMLElement>("[data-media-id]")].map((item) => {
        const rect = item.getBoundingClientRect();
        const visible = rect.right > box.left + 1 && rect.left < box.right - 1;
        return {
          id: item.dataset.mediaId!,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          visible,
          partial: visible && (rect.left < box.left - 1 || rect.right > box.right + 1),
          current: item.dataset.current === "true",
        };
      }),
    };
  });
}

/** The point on an item that is actually on screen: the centre of what the viewport shows of it. */
async function visiblePoint(page: Page, id: string, role: Role = "reference") {
  // Centred, not merely in view (at an edge it can sit under the sticky navigation), and still.
  await centreOnScreen(page, surface(page, role));
  const strip = await geometry(page, role);
  const item = strip.items.find((candidate) => candidate.id === id)!;
  const box = (await surface(page, role).boundingBox())!;
  const left = Math.max(item.left, strip.viewport.left);
  const right = Math.min(item.right, strip.viewport.right);
  return { x: (left + right) / 2, y: box.y + box.height / 2 };
}

async function expectSelectedCentered(page: Page, role: Role = "reference") {
  await expect
    .poll(async () => {
      const strip = await geometry(page, role);
      const selectedItem = strip.items.find((item) => item.current)!;
      return Math.abs(
        (selectedItem.left + selectedItem.right) / 2 -
          (strip.viewport.left + strip.viewport.right) / 2,
      );
    })
    .toBeLessThanOrEqual(1);
}

async function expectAtRest(page: Page, role: Role = "reference") {
  await expect(surface(page, role)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
}

async function selectedId(page: Page, role: Role = "reference") {
  return (await surface(page, role).getAttribute("data-active-id"))!;
}

function neighbour(strip: StripGeometry, offset: 1 | -1) {
  const index = strip.items.findIndex(({ current }) => current);
  return strip.items[index + offset]!;
}

test.describe("a strip of photos, several in view", () => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`shows several photos of different widths with the next one peeking, at ${width}px`, async ({
      page,
    }) => {
      await openStudio(page, { width, height });
      if (width < 600) await page.getByTestId("studio-view-compare").click();
      await expectAtRest(page);
      const strip = await geometry(page);

      const inView = strip.items.filter((item) => item.visible);
      expect(inView.length).toBeGreaterThanOrEqual(3);
      // The selected photo is in the middle, with a neighbour cut by the edge on each side.
      await expectSelectedCentered(page);
      const cut = strip.items.filter((item) => item.partial);
      expect(cut.length).toBeGreaterThanOrEqual(2);
      // Items really are of different widths, so this is not a row of equal cards.
      const widths = new Set(inView.map((item) => Math.round(item.width)));
      expect(widths.size).toBeGreaterThanOrEqual(2);
      // The collection is the whole conversation, in order.
      expect(strip.items.map(({ id }) => id)).toEqual(sharedMediaData.map(({ id }) => id));
    });
  }

  test("reads as photos in a conversation, not as an abstract rail", async ({ page }) => {
    await openStudio(page);
    const stage = page.getByTestId("studio-preview-reference");
    await expect(stage).toContainText("Ridge Crew");
    await expect(stage).toContainText("Shared media");
    await expect(page.getByTestId("studio-reference-screen")).not.toBeEmpty();
    await expect(stage).toContainText(/Noor|Priya|Tomás|Mei|Jonas/);
    expect((await page.locator("#studio").innerText()).toLowerCase()).not.toContain("rail");
  });

  test("every photo is named, positioned and described for assistive technology", async ({
    page,
  }) => {
    await openStudio(page);
    const slides = surface(page).locator("[aria-roledescription='slide']");
    await expect(slides).toHaveCount(sharedMediaData.length);
    await expect(slides.first()).toHaveAttribute("aria-label", /, from .*, 1 of 11$/);
    await expect(surface(page).locator("[aria-current='true']")).toHaveCount(1);
    // None is inert: a neighbour is something to tap. None is focusable, so focus can never reach an
    // off-screen item and make the browser scroll the clipped strip out from under its transform.
    expect(await surface(page).locator("[inert]").count()).toBe(0);
    expect(
      await surface(page).evaluate(
        (element) =>
          [...element.querySelectorAll("*")].filter((node) => (node as HTMLElement).tabIndex >= 0)
            .length,
      ),
    ).toBe(0);
    await expect(surface(page)).toHaveAttribute("tabindex", "0");
    await expect(surface(page)).toHaveAttribute("aria-roledescription", "carousel");
  });
});

test.describe("tapping a photo", () => {
  test("a tap on the selected photo opens it", async ({ page }) => {
    await openStudio(page);
    const id = await selectedId(page);
    const point = await visiblePoint(page, id);
    await page.mouse.click(point.x, point.y);
    await expect(viewer(page)).toBeVisible();
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(id));
    await expect(page.getByTestId("studio-media-photo")).toBeVisible();
  });

  test("a tap on a partly visible neighbour opens that photo and makes it the selected one", async ({
    page,
  }) => {
    await openStudio(page);
    const strip = await geometry(page);
    const next = neighbour(strip, 1);
    expect(next.partial).toBe(true);
    const point = await visiblePoint(page, next.id);
    await page.mouse.click(point.x, point.y);

    await expect(viewer(page)).toBeVisible();
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(next.id));
    // The selection moved at once: it is the semantic answer, not something that waits to be seen.
    await expect(surface(page)).toHaveAttribute("data-active-id", next.id);
    // The other stage is a different surface, and was not touched.
    await expect(surface(page, "candidate")).not.toHaveAttribute("data-active-id", next.id);

    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    await expectAtRest(page);
    await expectSelectedCentered(page);
    expect(await selectedId(page)).toBe(next.id);
  });

  test("a tap on either side works, and the strip then leads with what was opened", async ({
    page,
  }) => {
    await openStudio(page);
    const previous = neighbour(await geometry(page), -1);
    const point = await visiblePoint(page, previous.id);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(previous.id));
    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    await expectSelectedCentered(page);
    expect(await selectedId(page)).toBe(previous.id);
  });

  test("a tap in either stage opens from that stage and returns focus to it", async ({ page }) => {
    await openStudio(page);
    for (const role of ["reference", "candidate"] as const) {
      const id = await selectedId(page, role);
      const point = await visiblePoint(page, id, role);
      await page.mouse.click(point.x, point.y);
      await expect(viewer(page)).toBeVisible();
      await page.getByRole("button", { name: "Close photo" }).click();
      await expect(viewer(page)).not.toBeVisible();
      await expect(surface(page, role)).toBeFocused();
    }
  });

  test("the Open photo button opens the selected photo, for those who do not point", async ({
    page,
  }) => {
    await openStudio(page);
    const id = await selectedId(page, "candidate");
    const open = page.getByTestId("studio-candidate-open");
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(id));
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
  });
});

test.describe("a drag is not a tap", () => {
  test("dragging across photos moves the strip and opens nothing, even released on a photo", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await expectAtRest(page);
    const before = await selectedId(page);
    await dragMouseBy(page, surface(page), -150, 0, { steps: 10 });
    await expectAtRest(page);
    expect(await selectedId(page)).not.toBe(before);
    expect(await openDialogCount(page)).toBe(0);
    await expectSelectedCentered(page);
  });

  test("a drag that ends where it began still opens nothing", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const point = await visiblePoint(page, await selectedId(page));
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x - 60, point.y, { steps: 6 });
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.mouse.up();
    await expectAtRest(page);
    expect(await openDialogCount(page)).toBe(0);
  });

  test("a press that catches a moving strip stops it and opens nothing", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await expectAtRest(page, "candidate");
    await page.getByTestId("studio-candidate-next").click();
    await expect(surface(page, "candidate")).not.toHaveAttribute("data-phase", "idle");
    const point = await visiblePoint(page, await selectedId(page, "candidate"), "candidate");
    await page.mouse.click(point.x, point.y);
    await expectAtRest(page, "candidate");
    await page.waitForTimeout(250);
    expect(await openDialogCount(page)).toBe(0);
    // And the next, ordinary tap opens as usual.
    const settled = await visiblePoint(page, await selectedId(page, "candidate"), "candidate");
    await page.mouse.click(settled.x, settled.y);
    await expect(viewer(page)).toBeVisible();
  });

  test("a tap on the surface's own gap opens nothing", async ({ page }) => {
    await openStudio(page);
    const box = (await surface(page).boundingBox())!;
    // The strip's padding above the items.
    await page.mouse.click(box.x + box.width / 2, box.y + 3);
    expect(await openDialogCount(page)).toBe(0);
  });
});

test.describe("the keyboard", () => {
  test("arrows move the selection, Enter and Space open it, Escape returns to the strip", async ({
    page,
  }) => {
    await openStudio(page);
    const strip = surface(page);
    await strip.focus();
    const start = await selectedId(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page)).not.toBe(start);
    const moved = await selectedId(page);
    expect(await selectedId(page, "candidate")).toBe(start);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("studio-media-title")).toHaveText(titleOf(moved));
    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    await expect(strip).toBeFocused();

    const y = await scrollY(page);
    await page.keyboard.press("Space");
    await expect(viewer(page)).toBeVisible();
    // Space opens the photo and does not scroll the page under it.
    expect(await scrollY(page)).toBe(y);
    await page.keyboard.press("Escape");
    await expect(strip).toBeFocused();
  });

  test("Home and End reach the first and last photo and the strip stops there", async ({
    page,
  }) => {
    await openStudio(page);
    await surface(page).focus();
    await page.keyboard.press("End");
    await expect.poll(() => selectedId(page)).toBe(sharedMediaData.at(-1)!.id);
    await page.keyboard.press("ArrowRight");
    expect(await selectedId(page)).toBe(sharedMediaData.at(-1)!.id);
    await expect(page.getByTestId("studio-reference-next")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.keyboard.press("Home");
    await expect.poll(() => selectedId(page)).toBe(sharedMediaData[0]!.id);
    await expect(page.getByTestId("studio-reference-previous")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("Previous and Next step one photo, and keep focus when they reach an end", async ({
    page,
  }) => {
    await openStudio(page);
    const next = page.getByTestId("studio-reference-next");
    await surface(page).focus();
    await page.keyboard.press("End");
    await expect.poll(() => selectedId(page)).toBe(sharedMediaData.at(-1)!.id);
    const before = await selectedId(page);
    await next.focus();
    await page.keyboard.press("Enter");
    expect(await selectedId(page)).toBe(before);
    await expect(next).toBeFocused();
    await page.getByTestId("studio-reference-previous").click();
    await expect.poll(() => selectedId(page)).toBe(sharedMediaData.at(-2)!.id);
  });
});

test.describe("the viewer is a correct modal", () => {
  async function open(page: Page) {
    const opener: Locator = page.getByTestId("studio-reference-open");
    await opener.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const before = await scrollY(page);
    await opener.click();
    await expect(viewer(page)).toBeVisible();
    return { opener, before };
  }

  test("owns focus and scroll while it is open, and gives both back", async ({ page }) => {
    await openStudio(page);
    const { before, opener } = await open(page);
    expect(await openDialogCount(page)).toBe(1);
    await expect(page.getByRole("button", { name: "Close photo" })).toBeFocused();

    // Tab stays inside it, wherever the visitor presses it.
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement?.closest("dialog[open]") !== null),
      ).toBe(true);
    }
    // The page behind does not scroll, and nothing shifts sideways.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.mouse.wheel(0, 600);
    expect(await scrollY(page)).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    expect(await openDialogCount(page)).toBe(0);
    // Focus goes back to the control the visitor used.
    await expect(opener).toBeFocused();
    expect(await scrollY(page)).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    // Nothing is left locked: the page scrolls again.
    await page.mouse.wheel(0, 300);
    await expect.poll(() => scrollY(page)).not.toBe(before);
  });

  test("closes from its button and its backdrop, and is the only modal", async ({ page }) => {
    await openStudio(page);
    await open(page);
    // The implementation sheet cannot open over it: nothing behind a native modal can be reached.
    await expect(page.getByTestId("studio-sheet")).not.toBeVisible();
    await page.getByRole("button", { name: "Close photo" }).click();
    await expect(viewer(page)).not.toBeVisible();

    await open(page);
    await page.mouse.click(4, 4);
    await expect(viewer(page)).not.toBeVisible();
    expect(await openDialogCount(page)).toBe(0);
  });

  test("shows the whole photo with who sent it, when, and what they said", async ({ page }) => {
    await openStudio(page);
    const id = await selectedId(page);
    const item = sharedMediaData.find((candidate) => candidate.id === id)!;
    await open(page);
    await expect(viewer(page)).toContainText(item.sender);
    await expect(viewer(page)).toContainText(item.sentAt);
    await expect(viewer(page)).toContainText(item.message);
    await expect(page.getByTestId("studio-media-photo")).toHaveAttribute("alt", item.alt);
  });

  test("opening it from a stage does not replace the other stage or the shortlist", async ({
    page,
  }) => {
    await openStudio(page);
    const bBefore = await selectedId(page, "candidate");
    const roles = await page.getByTestId("studio-summary").innerText();
    await open(page);
    await page.keyboard.press("Escape");
    await expect(viewer(page)).not.toBeVisible();
    expect(await selectedId(page, "candidate")).toBe(bBefore);
    expect(await page.getByTestId("studio-summary").innerText()).toBe(roles);
  });
});
