import { expect, type Locator, type Page } from "@playwright/test";

import {
  candidateById,
  type CandidateId,
} from "../apps/lab/src/playground/studio/candidate-definitions";
import { openPlayground } from "./playgroundHelpers";

export type StudioWidth = "wide" | "narrow";

/** The name a candidate is shown under, from the one catalogue the Studio itself reads. */
export function nameOf(id: CandidateId): string {
  return candidateById.get(id)!.name;
}

/** The Studio is behind an activation boundary, so nothing about it exists until this runs. */
export async function openStudio(
  page: Page,
  options: {
    reducedMotion?: "reduce" | "no-preference";
    width?: number;
    height?: number;
  } = {},
): Promise<Locator> {
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 900 });
  await openPlayground(page, options.reducedMotion ?? "reduce");
  await page.getByTestId("studio-activate").click();
  const workspace = page.getByTestId("studio-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace).toBeFocused();
  await expectStudioIdle(page);
  return workspace;
}

/** Every mounted live surface has measured itself and published a settled state. */
export async function expectStudioIdle(page: Page) {
  for (const testid of [
    "studio-reference-surface",
    "studio-candidate-surface",
    "studio-detail-surface",
    "studio-deck",
  ]) {
    const surface = page.getByTestId(testid);
    if ((await surface.count()) > 0) await expect(surface).toHaveAttribute("data-phase", "idle");
  }
}

export const studio = {
  aName: (page: Page) => page.getByTestId("studio-a-name"),
  bName: (page: Page) => page.getByTestId("studio-b-name"),
  compare: (page: Page) => page.getByTestId("studio-compare"),
  deck: (page: Page) => page.getByTestId("studio-deck"),
  detail: (page: Page) => page.getByTestId("studio-detail"),
  member: (page: Page, id: CandidateId) => page.getByTestId(`studio-member-${id}`),
  row: (page: Page, id: CandidateId) => page.getByTestId(`studio-row-${id}`),
  sheet: (page: Page) => page.getByTestId("studio-sheet"),
  status: (page: Page) => page.getByTestId("studio-status"),
  summary: (page: Page) => page.getByTestId("studio-summary"),
};

export type Role = "a" | "b" | "other";

/** The shortlist as the Studio shows it: each member's id and role, in order. */
export async function shortlist(page: Page): Promise<{ id: string; role: Role }[]> {
  return page.locator("[data-testid^='studio-member-']").evaluateAll((members) =>
    members.map((member) => ({
      id: member.getAttribute("data-testid")!.slice("studio-member-".length),
      role: member.getAttribute("data-role") as "a" | "b" | "other",
    })),
  );
}

/** The roles in words, which is what the visitor reads: the reference first, then B. */
export async function roles(page: Page): Promise<{ a?: string; b?: string }> {
  const members = await shortlist(page);
  const a = members.find(({ role }) => role === "a")?.id;
  const b = members.find(({ role }) => role === "b")?.id;
  return { ...(a ? { a } : {}), ...(b ? { b } : {}) };
}

/** Shortlists a candidate from the list, as a visitor does, and waits for the row to say so. */
export async function shortlistCandidate(page: Page, id: CandidateId) {
  const toggle = page.getByTestId(`studio-shortlist-${id}`);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}

export async function unshortlistCandidate(page: Page, id: CandidateId) {
  const toggle = page.getByTestId(`studio-shortlist-${id}`);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
}

/** Which dialogs are open right now: at most one may ever own modality. */
export async function openDialogCount(page: Page): Promise<number> {
  return page.locator("dialog[open]").count();
}

export async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      document.activeElement?.getAttribute("data-testid") ??
      document.activeElement?.tagName ??
      null,
  );
}

export async function expectSheetClosed(page: Page) {
  await expect(studio.sheet(page)).not.toBeVisible();
}

/**
 * Samples, every animation frame, which name each part of the Studio is showing next to the card
 * the Deck is really drawing in front. The invariant it exists for: no text ever names a card
 * before that card is the one in front. It is frame-rate independent, so it holds on every engine.
 */
export async function startNameTrace(page: Page) {
  await page.evaluate(() => {
    const frames: {
      b: string | null;
      caption: string | null;
      summary: string | null;
      stage: string | null;
      visual: string | null;
      settled: string | null;
    }[] = [];
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- This helper must execute in the browser evaluation scope.
    const read = (id: string) =>
      document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
    let running = true;
    const tick = () => {
      if (!running) return;
      const deck = document.querySelector('[data-testid="studio-deck"]');
      frames.push({
        b: read("studio-b-name"),
        caption: read("studio-deck-caption"),
        summary:
          read("studio-summary")
            ?.split("·")
            .pop()
            ?.replace(/^\s*B\s+/, "") ?? null,
        stage:
          document
            .querySelector('[data-testid="studio-preview-candidate"]')
            ?.getAttribute("data-candidate") ?? null,
        visual: deck?.getAttribute("data-visual-id") ?? null,
        settled: deck?.getAttribute("data-settled-id") ?? null,
      });
      requestAnimationFrame(tick);
    };
    (window as unknown as { snapMotionNames: unknown }).snapMotionNames = {
      frames,
      stop: () => {
        running = false;
      },
    };
    requestAnimationFrame(tick);
  });
}

export async function stopNameTrace(page: Page) {
  return page.evaluate(() => {
    const trace = (
      window as unknown as { snapMotionNames: { frames: unknown[]; stop: () => void } }
    ).snapMotionNames;
    trace.stop();
    return trace.frames as {
      b: string | null;
      caption: string | null;
      summary: string | null;
      stage: string | null;
      visual: string | null;
      settled: string | null;
    }[];
  });
}
