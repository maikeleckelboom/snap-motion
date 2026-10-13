import { expect, test, type Locator, type Page } from "@playwright/test";

import { MOTION_PRESETS } from "../packages/core/src/index";
import { dragMouseBy, setNumericInput } from "./helpers";
import { openPlayground, section, tuningState } from "./playgroundHelpers";
import {
  openStudio,
  roles,
  shortlist,
  shortlistCandidate,
  startNameTrace,
  stopNameTrace,
  studio,
} from "./studioHelpers";

/**
 * Configuring B and reading what it did: the editor under the stages, the copy a reference becomes,
 * the Playground's tuning that is only ever copied from, the Shortlist's own Deck, and what the
 * comparison says about two behaviours whose layouts differ.
 *
 * Logic runs under reduced motion. A test about motion itself (a settle that really takes longer, a
 * step interrupted by another) opts in and compares durations by a margin no frame jitter can close.
 */

const collectedErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  collectedErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || /\[Vue warn\]/.test(message.text()))
      errors.push(`${message.type()}: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(collectedErrors.get(page) ?? []).toEqual([]);
});

const tune = (page: Page) => page.getByTestId("studio-tune");
const surface = (page: Page, role: "reference" | "candidate") =>
  page.getByTestId(`studio-${role}-surface`);
const stage = (page: Page, role: "reference" | "candidate") =>
  page.getByTestId(`studio-preview-${role}`);
const bShape = (page: Page) => page.getByTestId("studio-b-shape");
const badge = (page: Page) => page.getByTestId("studio-tune-badge");

async function openFineTune(page: Page) {
  const fine = page.getByTestId("studio-tune-fine");
  if ((await fine.getAttribute("open")) === null) await fine.locator(":scope > summary").click();
  await expect(fine).toHaveAttribute("open", "");
}

const field = (page: Page, name: string): Locator =>
  tune(page).getByRole("spinbutton", { name, exact: true });

async function openAdvanced(page: Page) {
  const advanced = page.getByTestId("studio-advanced");
  if ((await advanced.getAttribute("open")) === null)
    await advanced.locator(":scope > summary").click();
}

async function row(page: Page, key: string) {
  await openAdvanced(page);
  return page.getByTestId("studio-diff-table").locator(`[data-row='${key}']`);
}

test.describe("configuring B", () => {
  test("is an obvious editor under the stages, with every choice the brief names", async ({
    page,
  }) => {
    await openStudio(page);
    await expect(tune(page)).toBeVisible();
    // Near the previews: after the stages and their driver, before the differences.
    const boxes = await page.evaluate(() => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, so it cannot be hoisted out of this callback
      const top = (id: string) =>
        document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top;
      return {
        stageB: top("studio-preview-candidate"),
        driver: top("studio-driver-status"),
        tune: top("studio-tune"),
        differences: top("studio-differences"),
      };
    });
    expect(boxes.stageB).toBeLessThan(boxes.tune);
    expect(boxes.driver).toBeLessThan(boxes.tune);
    expect(boxes.tune).toBeLessThan(boxes.differences);

    await expect(tune(page).getByRole("group", { name: "Layout" })).toBeVisible();
    await expect(tune(page).getByRole("group", { name: "Exchange" })).toBeVisible();
    await expect(tune(page).getByRole("group", { name: "Motion preset" })).toBeVisible();
    for (const label of ["Item carousel", "Stacked deck", "Shuffle", "Direct"]) {
      await expect(tune(page).getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    for (const label of ["Tight", "Balanced", "Heavy", "Loose"]) {
      await expect(tune(page).getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("studio-tune-fine")).toBeVisible();
  });

  test("a reference is immutable: the first change copies it into Custom and leaves it as it was", async ({
    page,
  }) => {
    await openStudio(page);
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });
    const looseStiffness = MOTION_PRESETS.loose.spring.stiffness;
    await expect(tune(page).getByTestId("studio-tune-note")).toContainText("fixed reference");

    await page.getByTestId("tune-surface-deck").click();
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "custom" });
    await expect(studio.bName(page)).toHaveText("Custom");
    await expect(bShape(page)).toHaveText("Stacked deck, Shuffle, Loose");
    await expect(stage(page, "candidate")).toHaveAttribute("data-surface", "deck");
    await expect(badge(page)).toHaveText("Custom");
    await expect(page.getByTestId("studio-status")).toContainText("Copied into Custom");

    // The reference is still on the shortlist, still a carousel, still Loose.
    expect((await shortlist(page)).map(({ id }) => id)).toEqual([
      "carousel-tight",
      "carousel-loose",
      "custom",
    ]);
    await page.getByTestId("studio-open-carousel-loose").click();
    await expect(page.getByTestId("studio-detail-facts")).toContainText(String(looseStiffness));
    await expect(page.getByTestId("studio-detail")).toContainText("Item carousel");
    await expect(page.getByTestId("studio-detail-surface")).toHaveAttribute(
      "class",
      /media-carousel/,
    );
  });

  test("B can be an item carousel or a stacked deck and back, and A is never touched", async ({
    page,
  }) => {
    await openStudio(page);
    await stage(page, "reference").evaluate((node) => {
      (node as unknown as { kept: boolean }).kept = true;
    });
    for (const [layout, expected] of [
      ["deck", "deck"],
      ["carousel", "carousel"],
      ["deck", "deck"],
    ] as const) {
      await page.getByTestId(`tune-surface-${layout}`).click();
      await expect(stage(page, "candidate")).toHaveAttribute("data-surface", expected);
      await expect(stage(page, "reference")).toHaveAttribute("data-surface", "carousel");
    }
    expect(
      await stage(page, "reference").evaluate(
        (node) => (node as unknown as { kept?: boolean }).kept === true,
      ),
    ).toBe(true);
    await expect(studio.aName(page)).toHaveText("Tight carousel");
    // Switching layout is not a role change: B stays Custom, and the shortlist is not rebuilt.
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "custom" });
  });

  test("B keeps the photo it was on when it becomes a copy, and a layout change keeps it too", async ({
    page,
  }) => {
    await openStudio(page);
    await surface(page, "candidate").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const photo = (await surface(page, "candidate").getAttribute("data-active-id"))!;
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle");
    const aPhoto = await surface(page, "reference").getAttribute("data-active-id");
    expect(photo).not.toBe(aPhoto);

    await page.getByTestId("tune-preset-tight").click();
    await expect(surface(page, "candidate")).toHaveAttribute("data-active-id", photo);
    await page.getByTestId("tune-surface-deck").click();
    await expect(surface(page, "candidate")).toHaveAttribute("data-active-id", photo);
    await expect(surface(page, "reference")).toHaveAttribute("data-active-id", aPhoto!);
  });

  test("Shuffle and Direct are a stacked deck's choice, and say what each does", async ({
    page,
  }) => {
    await openStudio(page);
    const exchange = tune(page).getByRole("group", { name: "Exchange" });
    // A carousel has no exchange: the control is there, refuses input, and says why.
    await expect(exchange.getByRole("button", { name: "Direct" })).toBeDisabled();
    await expect(tune(page)).toContainText("Stacked deck only.");

    await page.getByTestId("tune-surface-deck").click();
    await expect(exchange.getByRole("button", { name: "Direct" })).toBeEnabled();
    await expect(exchange.getByRole("button", { name: "Shuffle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(tune(page)).toContainText("passes behind the pile");

    await page.getByTestId("tune-exchange-direct").click();
    await expect(exchange.getByRole("button", { name: "Direct" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(bShape(page)).toHaveText("Stacked deck, Direct, Loose");
    await expect(tune(page)).toContainText("stays attached to the point you grab");
    await expect(page.getByTestId("studio-status")).toContainText("Stacked deck, Direct, Loose");

    // The implementation says the same thing the stage runs.
    await page.getByTestId("studio-choose-b").click();
    await page.getByTestId("studio-open-implementation").click();
    await expect(page.getByTestId("studio-snippet")).toContainText('exchange="direct"');
    await page.keyboard.press("Escape");

    // Back to a carousel: the exchange stops applying and the shape says so.
    await page.getByTestId("tune-surface-carousel").click();
    await expect(bShape(page)).toHaveText("Item carousel, Loose");
    await expect(exchange.getByRole("button", { name: "Direct" })).toBeDisabled();
  });

  test("Direct really differs from Shuffle on the stage: the card follows a vertical drag", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await page.getByTestId("tune-surface-deck").click();
    const target = surface(page, "candidate");
    await expect(target).toHaveAttribute("data-phase", "idle");
    // Where the photo in front is painted, whatever element carries the transform.
    const frontY = async (id: string) => {
      const box = await target.locator(`img[data-media-image="${id}"]`).boundingBox();
      return box!.y;
    };

    async function liftedBy() {
      // Clicking a control below scrolls the page; the pointer needs the stage where it is aiming.
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const id = (await target.getAttribute("data-active-id"))!;
      const rest = await frontY(id);
      const box = (await target.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 30, y + 70, { steps: 6 });
      const lifted = Math.abs((await frontY(id)) - rest);
      await page.mouse.up();
      await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
      return lifted;
    }

    const shuffle = await liftedBy();
    await page.getByTestId("tune-exchange-direct").click();
    await expect(bShape(page)).toContainText("Direct");
    await expect(target).toHaveAttribute("data-phase", "idle");
    await page.waitForTimeout(500);
    const direct = await liftedBy();
    // Direct keeps the photo attached to the point grabbed: 70 px of pointer is 70 px of photo.
    expect(Math.abs(direct - 70)).toBeLessThanOrEqual(8);
    // Shuffle moves it along its own path instead, so it is not the pointer's.
    expect(Math.abs(shuffle - 70)).toBeGreaterThan(15);
  });
});

test.describe("what B's physics are, and where they live", () => {
  test("editing a number copies B into Custom, names the change, and leaves every preset alone", async ({
    page,
  }) => {
    await openStudio(page);
    await openFineTune(page);
    const looseMass = MOTION_PRESETS.loose.spring.mass;
    await setNumericInput(field(page, "Mass"), looseMass + 1);

    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "custom" });
    await expect(badge(page)).toHaveText("Custom, 1 edited");
    await expect(bShape(page)).toHaveText("Item carousel, Loose, 1 edited");
    await expect((await row(page, "mass")).locator("td").nth(1)).toContainText(
      String(looseMass + 1),
    );
    // A is a preset and did not move.
    await expect((await row(page, "mass")).locator("td").first()).toContainText(
      String(MOTION_PRESETS.tight.spring.mass),
    );
    // The reference B was copied from still has its own number.
    await page.getByTestId("studio-open-carousel-loose").click();
    await expect(page.getByTestId("studio-detail-facts")).toContainText(
      `${MOTION_PRESETS.loose.spring.stiffness} / ${MOTION_PRESETS.loose.spring.damping} / ${looseMass}`,
    );
  });

  test("a preset replaces edits, and Reset puts the numbers back to the base", async ({ page }) => {
    await openStudio(page);
    await openFineTune(page);
    await setNumericInput(field(page, "Stiffness"), 321);
    await setNumericInput(field(page, "Damping"), 17);
    await expect(badge(page)).toHaveText("Custom, 2 edited");
    await expect(tune(page)).toContainText("2 settings changed from Loose");

    await page.getByTestId("tune-reset").click();
    await expect(badge(page)).toHaveText("Custom");
    await expect(field(page, "Stiffness")).toHaveValue(
      String(MOTION_PRESETS.loose.spring.stiffness),
    );

    await setNumericInput(field(page, "Stiffness"), 321);
    await page.getByTestId("tune-preset-heavy").click();
    await expect(badge(page)).toHaveText("Custom");
    await expect(field(page, "Stiffness")).toHaveValue(
      String(MOTION_PRESETS.heavy.spring.stiffness),
    );
    await expect(bShape(page)).toHaveText("Item carousel, Heavy");
  });

  test("a stacked deck's fixed skip is shown as fixed, not offered as a setting", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("tune-surface-deck").click();
    await openFineTune(page);
    await expect(field(page, "Maximum skip")).toBeDisabled();
  });

  test("calculated values are shown beside the settings and are never an input", async ({
    page,
  }) => {
    await openStudio(page);
    await openFineTune(page);
    const calculated = page.getByTestId("studio-tune-calculated");
    await expect(calculated).toContainText("calculated, not editable");
    await expect(calculated).toContainText("not a measurement");
    await expect(calculated.locator("input, textarea, select, [contenteditable]")).toHaveCount(0);
    const names = await tune(page)
      .getByRole("spinbutton")
      .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label") ?? ""));
    expect(names.join(" ")).not.toMatch(/settle|overshoot/i);
    // And they follow the settings the visitor changes.
    const before = await calculated.innerText();
    await setNumericInput(field(page, "Stiffness"), 800);
    expect(await calculated.innerText()).not.toBe(before);
  });

  test("an edit while B is at rest never moves it", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle");
    await openFineTune(page);
    const transform = () =>
      surface(page, "candidate")
        .locator(".media-track")
        .evaluate((track) => getComputedStyle(track).transform);
    const before = await transform();
    await setNumericInput(field(page, "Stiffness"), 700);
    await setNumericInput(field(page, "Mass"), 3);
    await page.waitForTimeout(300);
    expect(await transform()).toBe(before);
    await expect(surface(page, "candidate")).toHaveAttribute("data-phase", "idle");
  });

  test("the numbers reach the live surface: a heavier, softer B takes visibly longer to settle", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await openFineTune(page);
    await setNumericInput(field(page, "Stiffness"), 60);
    await setNumericInput(field(page, "Damping"), 4);
    await setNumericInput(field(page, "Mass"), 3);

    async function settleTime(role: "reference" | "candidate") {
      const target = surface(page, role);
      await expect(target).toHaveAttribute("data-phase", "idle");
      const started = Date.now();
      await page.getByTestId(`studio-${role}-next`).click();
      await expect(target).not.toHaveAttribute("data-phase", "idle");
      await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 15_000 });
      return Date.now() - started;
    }

    const tight = await settleTime("reference");
    const soft = await settleTime("candidate");
    expect(soft).toBeGreaterThan(tight + 700);
  });

  test("the Playground's tuning is never written by B, and is copied only when asked", async ({
    page,
  }) => {
    await openStudio(page);
    // Set the section's own tuning to Heavy: it belongs to the page, and B has not copied it.
    await section(page, "studio").getByTestId("preset-heavy").click();
    await expect(tuningState(page, "studio")).toContainText("Preset");
    await openFineTune(page);
    await expect(field(page, "Stiffness")).toHaveValue(
      String(MOTION_PRESETS.loose.spring.stiffness),
    );
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });

    // Editing B changes B alone.
    await setNumericInput(field(page, "Stiffness"), 333);
    await expect(tuningState(page, "studio")).toHaveText("Preset");
    await expect(tuningState(page, "coverflow")).toHaveText("Preset");
    await expect(section(page, "studio").getByTestId("preset-heavy")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // One explicit copy, the other way round: B takes the page's tuning once.
    await page.getByTestId("tune-copy-tuning").click();
    await expect(field(page, "Stiffness")).toHaveValue(
      String(MOTION_PRESETS.heavy.spring.stiffness),
    );
    await expect(bShape(page)).toHaveText("Item carousel, Heavy");
    await expect(page.getByTestId("studio-status")).toContainText("Copied the Playground's");

    // After the copy the two are independent again: B moves, the page does not; the page moves, B does not.
    await setNumericInput(field(page, "Mass"), 2);
    await expect(tuningState(page, "studio")).toHaveText("Preset");
    await section(page, "studio").getByTestId("preset-tight").click();
    await expect(field(page, "Mass")).toHaveValue("2");
  });

  test("the Playground tuning's own changes move no candidate on their own", async ({ page }) => {
    await openStudio(page);
    const before = await (await row(page, "stiffness")).innerText();
    await section(page, "studio").getByTestId("preset-heavy").click();
    expect(await (await row(page, "stiffness")).innerText()).toBe(before);
    await section(page, "studio").getByTestId("preset-loose").click();
    expect(await (await row(page, "stiffness")).innerText()).toBe(before);
  });
});

test.describe("when Custom is already the reference", () => {
  test("B cannot be copied into it, says why, and the way out works", async ({ page }) => {
    await openStudio(page);
    await shortlistCandidate(page, "custom");
    await page.getByTestId("studio-pin-custom").click();
    expect(await roles(page)).toEqual({ a: "custom", b: "carousel-loose" });

    await expect(page.getByTestId("studio-tune-blocked")).toContainText(
      "Custom is the reference A",
    );
    await expect(page.getByTestId("tune-surface-deck")).toBeDisabled();
    await expect(page.getByTestId("tune-copy-tuning")).toBeDisabled();

    await page.getByRole("button", { name: "Swap A and B" }).first().click();
    expect(await roles(page)).toEqual({ a: "carousel-loose", b: "custom" });
    await expect(page.getByTestId("studio-tune-blocked")).toHaveCount(0);
    await expect(page.getByTestId("tune-surface-deck")).toBeEnabled();
  });
});

test.describe("reading the difference", () => {
  test("leads with what you will notice, keeps the technical record behind Advanced details", async ({
    page,
  }) => {
    await openStudio(page);
    const differences = page.getByTestId("studio-differences");
    await expect(differences.getByRole("heading", { name: "What you will notice" })).toBeVisible();
    // The record is a disclosure, closed until asked for, and holds the table and the chart.
    await expect(page.getByTestId("studio-advanced")).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("studio-diff-table")).not.toBeVisible();
    await expect(page.getByTestId("studio-chart")).not.toBeVisible();
    // The most meaningful differences are cards in front of it, each saying what it means.
    const items = page.getByTestId("studio-notable").locator("li");
    expect(await items.count()).toBeGreaterThan(0);
    await expect(items.first()).toContainText(/Settling|Overshoot|Flick travel|Release|Edge/);
    await expect(page.getByTestId("studio-unchanged")).toContainText("Same in both");
    await page.getByTestId("studio-advanced").locator(":scope > summary").click();
    await expect(page.getByTestId("studio-diff-table")).toBeVisible();
    await expect(page.getByTestId("studio-chart")).toBeVisible();
  });

  test("a different layout comes first and is called out, because equal springs would not feel equal", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("tune-surface-deck").click();
    const differences = page.getByTestId("studio-differences");
    await expect(differences).toHaveAttribute("data-layout-differs", "true");
    await expect(page.getByTestId("studio-notable").locator("li").first()).toHaveAttribute(
      "data-key",
      "layout",
    );
    await expect(page.getByTestId("studio-caveat")).toContainText("different layouts");
    await expect(page.getByTestId("studio-summary-text")).toContainText(
      "an item carousel and B is a stacked deck",
    );
  });

  test("identical springs on different layouts are called out as a layout difference alone", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("tune-surface-deck").click();
    await page.getByTestId("tune-preset-tight").click();
    await expect(page.getByTestId("studio-caveat")).toContainText("springs are identical");
    await expect(page.getByTestId("studio-caveat")).toContainText("layout, not the physics");
  });

  test("never calls a calculated figure a measurement", async ({ page }) => {
    await openStudio(page);
    await openAdvanced(page);
    const text = (await page.getByTestId("studio-differences").innerText()).toLowerCase();
    expect(text).toContain("calculated");
    expect(text).not.toMatch(/\bmeasured\b(?! \w+ page)/);
    await expect(page.getByTestId("studio-differences")).toContainText(
      "not a measurement of this page",
    );
    await expect((await row(page, "settle")).locator("th")).toContainText("calculated");
    await expect(page.getByTestId("studio-chart").locator("title")).toContainText("Calculated");
  });

  test("two identical configurations say so instead of inventing a difference", async ({
    page,
  }) => {
    await openStudio(page);
    await page.getByTestId("tune-preset-tight").click();
    await expect(page.getByTestId("studio-summary-text")).toContainText("configured the same");
    await expect(page.getByTestId("studio-notable")).toHaveCount(0);
  });

  test("changing B changes what you read at once", async ({ page }) => {
    await openStudio(page);
    const before = await page.getByTestId("studio-summary-text").innerText();
    await page.getByTestId("tune-surface-deck").click();
    expect(await page.getByTestId("studio-summary-text").innerText()).not.toBe(before);
  });
});

test.describe("the Shortlist's own Deck", () => {
  test("turns its cards with Shuffle or Direct, and says it is not the behaviour compared", async ({
    page,
  }) => {
    await openStudio(page);
    await shortlistCandidate(page, "carousel-balanced");
    const turn = page.getByTestId("studio-shortlist-turn");
    await expect(turn).toContainText("does not change how A or B behaves");
    await expect(turn.getByRole("button", { name: "Shuffle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const before = {
      roles: await roles(page),
      shape: await bShape(page).innerText(),
      surface: await stage(page, "candidate").getAttribute("data-surface"),
      summary: await page.getByTestId("studio-summary-text").innerText(),
    };

    await page.getByTestId("studio-shortlist-turn-direct").click();
    await expect(turn.getByRole("button", { name: "Direct" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("studio-status")).toContainText("Direct");
    // Nothing about A or B changed: this setting belongs to the list.
    expect({
      roles: await roles(page),
      shape: await bShape(page).innerText(),
      surface: await stage(page, "candidate").getAttribute("data-surface"),
      summary: await page.getByTestId("studio-summary-text").innerText(),
    }).toEqual(before);
    // And it does not touch B's configuration: B's own exchange is a different control.
    await page.getByTestId("tune-surface-deck").click();
    await expect(
      tune(page).getByRole("group", { name: "Exchange" }).getByRole("button", { name: "Shuffle" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("with Direct, turning the list still chooses B and every name follows the card in front", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    await shortlistCandidate(page, "carousel-balanced");
    await page.getByTestId("studio-shortlist-turn-direct").click();
    await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle");
    await startNameTrace(page);
    for (const control of ["studio-deck-next", "studio-deck-previous"]) {
      await page.getByTestId(control).click();
      await expect(studio.deck(page)).not.toHaveAttribute("data-phase", "idle");
      await expect(studio.deck(page)).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    }
    const frames = await stopNameTrace(page);
    for (const [index, frame] of frames.entries()) {
      if (frame.visual === null) continue;
      expect(frame.b, `frame ${index} B`).toBe(frame.caption);
      expect(frame.stage, `frame ${index} stage`).toBe(frame.visual);
    }
    expect(frames.some((frame) => frame.visual !== frame.settled)).toBe(true);
  });

  test("with Direct, the shortlist can still gain and lose cards", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-shortlist-turn-direct").click();
    await shortlistCandidate(page, "carousel-balanced");
    await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
    await shortlistCandidate(page, "deck-shuffle");
    await page.getByTestId("studio-remove-carousel-balanced").click();
    await expect(studio.deck(page)).toHaveAttribute("data-deck-state", "deck");
    expect((await shortlist(page)).map(({ id }) => id)).toEqual([
      "carousel-tight",
      "carousel-loose",
      "deck-shuffle",
    ]);
  });

  test("is not the candidate: switching it never edits or copies B", async ({ page }) => {
    await openStudio(page);
    await page.getByTestId("studio-shortlist-turn-direct").click();
    expect(await roles(page)).toEqual({ a: "carousel-tight", b: "carousel-loose" });
    await expect(tune(page).getByTestId("studio-tune-note")).toContainText("fixed reference");
  });
});

test.describe("interrupted motion and reduced motion", () => {
  test("a second step during the first retargets from where the strip is, with no queue", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const target = surface(page, "candidate");
    await expect(target).toHaveAttribute("data-phase", "idle");
    const start = (await target.getAttribute("data-active-id"))!;
    const ids = await target
      .locator("[data-media-id]")
      .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.mediaId!));
    const index = ids.indexOf(start);

    await page.getByTestId("studio-candidate-next").click();
    await expect(target).not.toHaveAttribute("data-phase", "idle");
    await page.getByTestId("studio-candidate-next").click();
    await page.getByTestId("studio-candidate-previous").click();
    await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    // Next, Next, Previous: one photo on, whatever the strip was doing when each press arrived.
    expect(await target.getAttribute("data-active-id")).toBe(ids[index + 1]);
    await expect(target).toHaveAttribute("data-settled-id", ids[index + 1]!);
  });

  test("grabbing a strip that is still settling takes hold of it and lets it go cleanly", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const target = surface(page, "candidate");
    await page.getByTestId("studio-candidate-next").click();
    await expect(target).not.toHaveAttribute("data-phase", "idle");
    await dragMouseBy(page, target, 40, 0, { steps: 4 });
    await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 8_000 });
    // Wherever it ended, it ended centred on a photo, not between two.
    await expect
      .poll(async () =>
        target.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const current = element.querySelector<HTMLElement>("[data-current='true']")!;
          const rect = current.getBoundingClientRect();
          return Math.abs((rect.left + rect.right) / 2 - (box.left + box.right) / 2);
        }),
      )
      .toBeLessThanOrEqual(1);
  });

  test("under reduced motion a step lands at once, centred, and the selection is already there", async ({
    page,
  }) => {
    await openStudio(page, { reducedMotion: "reduce" });
    const target = surface(page, "candidate");
    await expect(target).toHaveAttribute("data-reduced-motion", "true");
    const before = (await target.getAttribute("data-active-id"))!;
    await page.getByTestId("studio-candidate-next").click();
    await expect(target).not.toHaveAttribute("data-active-id", before);
    // No spring: it is at rest and centred within a frame or two, not after a settle.
    await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 400 });
    await expect
      .poll(
        async () =>
          target.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const current = element.querySelector<HTMLElement>("[data-current='true']")!;
            const rect = current.getBoundingClientRect();
            return Math.abs((rect.left + rect.right) / 2 - (box.left + box.right) / 2);
          }),
        { timeout: 400 },
      )
      .toBeLessThanOrEqual(1);
  });

  test("under reduced motion a stacked deck also adopts a step at once", async ({ page }) => {
    await openStudio(page, { reducedMotion: "reduce" });
    await page.getByTestId("tune-surface-deck").click();
    const target = surface(page, "candidate");
    const before = (await target.getAttribute("data-active-id"))!;
    await page.getByTestId("studio-candidate-next").click();
    await expect(target).not.toHaveAttribute("data-active-id", before);
    await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 400 });
  });

  test("a preference that changes mid-settle completes the same photo", async ({ page }) => {
    await openStudio(page, { reducedMotion: "no-preference" });
    const target = surface(page, "candidate");
    const ids = await target
      .locator("[data-media-id]")
      .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.mediaId!));
    const start = (await target.getAttribute("data-active-id"))!;
    await page.getByTestId("studio-candidate-next").click();
    await expect(target).not.toHaveAttribute("data-phase", "idle");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(target).toHaveAttribute("data-phase", "idle", { timeout: 2_000 });
    expect(await target.getAttribute("data-active-id")).toBe(ids[ids.indexOf(start) + 1]);
  });
});

// A hole in the harness would make these vacuous, so name what they rely on.
test("the Studio opens with the editor and both stages present", async ({ page }) => {
  await openPlayground(page);
  await page.getByTestId("studio-activate").click();
  await expect(tune(page)).toBeVisible();
  await expect(stage(page, "reference")).toBeVisible();
  await expect(stage(page, "candidate")).toBeVisible();
});
