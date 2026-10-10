import { describe, expect, it } from "vitest";

import {
  MAX_COMPARISON,
  NOTE_LIMIT,
  createStudioModel,
  type StudioModelOptions,
} from "../src/playground/studio/studio-model";

const ids = ["a", "b", "c", "d", "e", "f", "g"] as const;
type Id = (typeof ids)[number];
const category = (id: Id) => (id <= "c" ? "one" : "two");
const mediaOwner = (mediaId: string): Id | undefined => {
  const owner = mediaId.split("/")[0] as Id;
  return ids.includes(owner) ? owner : undefined;
};

function model(overrides: Partial<StudioModelOptions<Id, string>> = {}) {
  return createStudioModel<Id, string>({
    ids,
    initialActiveId: "c",
    initialComparisonIds: ["c", "e"],
    categoryOf: category,
    ownerOfMedia: mediaOwner,
    mediaIdOf: (id) => `${id}/cover`,
    ...overrides,
  });
}

describe("selection ownership", () => {
  it("starts on the requested study and refuses an empty or duplicated collection", () => {
    expect(model().activeId.value).toBe("c");
    expect(() => createStudioModel({ ids: [] })).toThrow(RangeError);
    expect(() => createStudioModel({ ids: ["a", "a"] })).toThrow(RangeError);
  });

  it("falls back to the middle study when the initial one is unknown", () => {
    expect(model({ initialActiveId: "zzz" as Id }).activeId.value).toBe("d");
  });

  it("reports whether a selection changed anything and refuses unknown IDs", () => {
    const studio = model();
    expect(studio.select("d")).toBe("changed");
    expect(studio.select("d")).toBe("unchanged");
    expect(studio.select("nope" as Id)).toBe("unknown");
    expect(studio.activeId.value).toBe("d");
  });

  it("moves the deck cursor only when the selected study already belongs to the comparison", () => {
    const studio = model();
    expect(studio.deckId.value).toBe("c");
    studio.select("e");
    expect(studio.deckId.value).toBe("e");
    studio.select("a");
    // Outside the comparison: the cursor keeps its own card and nothing is added.
    expect(studio.activeId.value).toBe("a");
    expect(studio.deckId.value).toBe("e");
    expect(studio.comparisonIds.value).toEqual(["c", "e"]);
  });

  it("makes a deck gesture update both the cursor and the active study, but only for members", () => {
    const studio = model();
    expect(studio.selectFromDeck("e")).toBe(true);
    expect(studio.activeId.value).toBe("e");
    expect(studio.deckId.value).toBe("e");
    expect(studio.selectFromDeck("a")).toBe(false);
    expect(studio.activeId.value).toBe("e");
  });
});

describe("comparison membership", () => {
  it("adds in order, keeps the cursor on the study just added when it is active", () => {
    const studio = model({ initialComparisonIds: [] });
    expect(studio.deckState.value).toBe("empty");
    expect(studio.deckId.value).toBeUndefined();
    expect(studio.addToComparison("c")).toBe("added");
    expect(studio.deckState.value).toBe("single");
    expect(studio.deckId.value).toBe("c");
    studio.select("f");
    expect(studio.addToComparison()).toBe("added");
    expect(studio.comparisonIds.value).toEqual(["c", "f"]);
    expect(studio.deckState.value).toBe("deck");
    expect(studio.deckId.value).toBe("f");
  });

  it("does not move the cursor when a study that is not active is added", () => {
    const studio = model();
    expect(studio.addToComparison("a")).toBe("added");
    expect(studio.deckId.value).toBe("c");
  });

  it("prevents duplicates and refuses unknown IDs", () => {
    const studio = model();
    expect(studio.addToComparison("c")).toBe("duplicate");
    expect(studio.addToComparison("zzz" as Id)).toBe("unknown");
    expect(studio.comparisonIds.value).toEqual(["c", "e"]);
  });

  it("stops at the deck's capacity and says so", () => {
    const studio = model({ initialComparisonIds: [] });
    for (const id of ids.slice(0, MAX_COMPARISON)) expect(studio.addToComparison(id)).toBe("added");
    expect(studio.comparisonFull.value).toBe(true);
    expect(studio.addToComparison("g")).toBe("full");
    expect(studio.comparisonIds.value).toHaveLength(MAX_COMPARISON);
    studio.removeFromComparison("a");
    expect(studio.comparisonFull.value).toBe(false);
    expect(studio.addToComparison("g")).toBe("added");
  });

  it("caps and de-duplicates the initial comparison", () => {
    const studio = model({ initialComparisonIds: ["a", "a", "b", "c", "d", "e", "f", "g"] });
    expect(studio.comparisonIds.value).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("falls back to the card that slid into the removed slot, else the new last card", () => {
    const studio = model({ initialComparisonIds: ["a", "b", "c", "d"], initialActiveId: "b" });
    expect(studio.deckId.value).toBe("b");
    expect(studio.removeFromComparison("b")).toBe("removed");
    expect(studio.deckId.value).toBe("c");
    studio.selectFromDeck("d");
    expect(studio.removeFromComparison("d")).toBe("removed");
    expect(studio.deckId.value).toBe("c");
    // Removing the active study from the comparison never changes what is active.
    expect(studio.activeId.value).toBe("d");
  });

  it("keeps the cursor when another member is removed and reports a missing member", () => {
    const studio = model({ initialComparisonIds: ["a", "b", "c"], initialActiveId: "a" });
    expect(studio.removeFromComparison("c")).toBe("removed");
    expect(studio.deckId.value).toBe("a");
    expect(studio.removeFromComparison("g")).toBe("missing");
  });

  it("walks through the one-item and empty states without leaving the cursor dangling", () => {
    const studio = model({ initialComparisonIds: ["a", "b"], initialActiveId: "a" });
    expect(studio.deckState.value).toBe("deck");
    studio.removeFromComparison("a");
    expect(studio.deckState.value).toBe("single");
    expect(studio.deckId.value).toBe("b");
    studio.removeFromComparison("b");
    expect(studio.deckState.value).toBe("empty");
    expect(studio.deckId.value).toBeUndefined();
  });

  it("toggles membership for the active study by default", () => {
    const studio = model();
    expect(studio.toggleComparison()).toBe("removed");
    expect(studio.toggleComparison()).toBe("added");
    expect(studio.comparisonIds.value).toEqual(["e", "c"]);
  });

  it("survives a rapid sequence of selections and edits with a consistent final state", () => {
    const studio = model();
    for (const id of ["a", "d", "e", "b", "c", "e", "g", "c"] as const) studio.select(id);
    expect(studio.activeId.value).toBe("c");
    expect(studio.deckId.value).toBe("c");
    studio.toggleComparison("e");
    studio.toggleComparison("e");
    studio.removeFromComparison("c");
    expect(studio.comparisonIds.value.every((id) => ids.includes(id))).toBe(true);
    expect(studio.deckId.value === undefined || studio.isCompared(studio.deckId.value)).toBe(true);
  });
});

describe("local edits", () => {
  it("stores, trims and clears a note by study without touching other studies", () => {
    const studio = model();
    expect(studio.setNote("c", "Keep the crease.")).toBe("Keep the crease.");
    expect(studio.noteFor("c")).toBe("Keep the crease.");
    expect(studio.hasNote("c")).toBe(true);
    expect(studio.hasNote("d")).toBe(false);
    studio.setNote("c", "   ");
    expect(studio.hasNote("c")).toBe(false);
    expect(studio.noteFor("c")).toBe("");
  });

  it("bounds a note and keeps it across view, filter, density, selection and overlay changes", () => {
    const studio = model();
    expect(studio.setNote("c", "x".repeat(NOTE_LIMIT + 50))).toHaveLength(NOTE_LIMIT);
    studio.setView("compare");
    studio.setFilter("two");
    studio.setDensity("compact");
    studio.select("g");
    studio.openSheet();
    studio.requestClose();
    studio.completeClose();
    expect(studio.noteFor("c")).toHaveLength(NOTE_LIMIT);
  });
});

describe("view and filter state", () => {
  it("filters the visible collection without changing the active study or the comparison", () => {
    const studio = model();
    expect(studio.visibleIds.value).toEqual(ids);
    studio.setFilter("two");
    expect(studio.visibleIds.value).toEqual(["d", "e", "f", "g"]);
    expect(studio.activeId.value).toBe("c");
    expect(studio.comparisonIds.value).toEqual(["c", "e"]);
    studio.setFilter("all");
    expect(studio.visibleIds.value).toEqual(ids);
  });

  it("keeps one workspace view across selection changes", () => {
    const studio = model();
    studio.setView("compare");
    studio.select("a");
    expect(studio.view.value).toBe("compare");
  });
});

describe("overlay ownership", () => {
  it("lets exactly one overlay own modality", () => {
    const studio = model();
    expect(studio.openSheet()).toBe(true);
    expect(studio.openGallery("c/route")).toBe(false);
    expect(studio.openSheet()).toBe(false);
    expect(studio.overlay.value).toBe("sheet");
  });

  it("opens the Gallery on a plate and keeps modality until the dialog has closed", () => {
    const studio = model();
    expect(studio.openGallery()).toBe(true);
    expect(studio.inspectionMediaId.value).toBe("c/cover");
    expect(studio.setInspectionMedia("f/timing")).toBe(true);
    expect(studio.setInspectionMedia("nope/none")).toBe(false);
    expect(studio.requestClose()).toBe("f");
    // The visitor asked to close, but the native dialog still owns the page.
    expect(studio.overlayOpen.value).toBe(false);
    expect(studio.overlay.value).toBe("gallery");
    expect(studio.openSheet()).toBe(false);
    expect(studio.completeClose()).toBeUndefined();
    expect(studio.overlay.value).toBe("none");
    expect(studio.openSheet()).toBe(true);
  });

  it("returns to the study whose plate was showing and keeps the deck consistent", () => {
    const studio = model();
    studio.openGallery("c/cover");
    studio.setInspectionMedia("e/route");
    studio.requestClose("e/route");
    expect(studio.activeId.value).toBe("e");
    expect(studio.deckId.value).toBe("e");
    studio.completeClose();
    studio.openGallery("a/cover");
    studio.requestClose("a/cover");
    expect(studio.activeId.value).toBe("a");
    expect(studio.deckId.value).toBe("e");
  });

  it("ignores a close request when nothing is open", () => {
    const studio = model();
    expect(studio.requestClose()).toBeUndefined();
    expect(studio.overlay.value).toBe("none");
  });

  it("hands a Sheet action off to the Gallery only after the Sheet has closed", () => {
    const studio = model();
    studio.openSheet();
    expect(studio.handOffToGallery("c/route")).toBe(true);
    // Still the Sheet's modal: the Gallery cannot be opened over it.
    expect(studio.overlay.value).toBe("sheet");
    expect(studio.openGallery("c/route")).toBe(false);
    expect(studio.completeClose()).toBe("c/route");
    expect(studio.openGallery("c/route")).toBe(true);
    expect(studio.overlay.value).toBe("gallery");
  });

  it("refuses a handoff without an open Sheet or for an unknown plate", () => {
    const studio = model();
    expect(studio.handOffToGallery("c/route")).toBe(false);
    studio.openSheet();
    expect(studio.handOffToGallery("nope/none")).toBe(false);
    expect(studio.overlayOpen.value).toBe(true);
  });

  it("can be reopened immediately after it finished closing", () => {
    const studio = model();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      expect(studio.openGallery("c/cover")).toBe(true);
      studio.requestClose();
      studio.completeClose();
      expect(studio.openSheet()).toBe(true);
      studio.requestClose();
      studio.completeClose();
    }
    expect(studio.overlay.value).toBe("none");
  });
});
