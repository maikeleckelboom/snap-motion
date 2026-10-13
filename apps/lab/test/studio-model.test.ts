import { describe, expect, it } from "vitest";

import {
  MAX_SHORTLIST,
  REASON_LIMIT,
  createStudioModel,
  type StudioModel,
} from "../src/playground/studio/studio-model";

const ids = ["a", "b", "c", "d", "e", "f"] as const;
type Id = (typeof ids)[number];

function model(initialShortlist: readonly Id[] = []) {
  return createStudioModel<Id>({ ids, initialShortlist });
}

function state(studio: StudioModel<Id>) {
  return {
    shortlist: [...studio.shortlist.value],
    a: studio.referenceId.value,
    b: studio.candidateId.value,
    deck: [...studio.deckIds.value],
  };
}

/** Every way the state breaks a rule that must hold whatever sequence led to it. */
function violations(studio: StudioModel<Id>): string[] {
  const { shortlist, a, b, deck } = state(studio);
  const broken: string[] = [];
  if (new Set(shortlist).size !== shortlist.length) broken.push("the shortlist has a duplicate");
  if (shortlist.length > MAX_SHORTLIST) broken.push("the shortlist is over its bound");
  // A is the pinned reference: a member whenever the shortlist is not empty, undefined only then.
  if (shortlist.length === 0 ? a !== undefined : !shortlist.includes(a as Id)) {
    broken.push(`A is ${String(a)} for a shortlist of ${shortlist.length}`);
  }
  if (JSON.stringify(deck) !== JSON.stringify(shortlist.filter((id) => id !== a))) {
    broken.push("the deck is not the shortlist without A");
  }
  // B is a member other than A, or there is no such member.
  if (deck.length === 0 ? b !== undefined : !deck.includes(b as Id)) {
    broken.push(`B is ${String(b)} for a deck of ${deck.length}`);
  }
  if (a !== undefined && a === b) broken.push("A is compared against itself");
  return broken;
}

function expectInvariants(studio: StudioModel<Id>, context: string) {
  expect(violations(studio).map((message) => `${context}: ${message}`)).toEqual([]);
}

/** A small seeded generator, so a failure names the seed that reproduces it. */
function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

describe("the shortlist", () => {
  it("starts empty by default and names no roles", () => {
    const studio = model();
    expect(studio.compareState.value).toBe("empty");
    expect(studio.referenceId.value).toBeUndefined();
    expect(studio.candidateId.value).toBeUndefined();
    expect(studio.deckState.value).toBe("empty");
  });

  it("makes the first member the reference, the second B, and leaves B alone after that", () => {
    const studio = model();
    expect(studio.addToShortlist("c")).toBe("added");
    expect(studio.compareState.value).toBe("reference-only");
    expect(state(studio)).toMatchObject({ a: "c", b: undefined });
    studio.addToShortlist("e");
    expect(state(studio)).toMatchObject({ a: "c", b: "e" });
    expect(studio.compareState.value).toBe("ready");
    expect(studio.deckState.value).toBe("single");
    studio.addToShortlist("a");
    // Adding never changes a comparison already under way.
    expect(state(studio)).toMatchObject({ a: "c", b: "e", deck: ["e", "a"] });
    expect(studio.deckState.value).toBe("deck");
  });

  it("refuses duplicates, unknown ids and a fifth member without changing anything", () => {
    const studio = model(["a", "b", "c", "d"]);
    const before = state(studio);
    expect(studio.addToShortlist("a")).toBe("duplicate");
    expect(studio.addToShortlist("e")).toBe("full");
    expect(studio.addToShortlist("nope" as Id)).toBe("unknown");
    expect(state(studio)).toEqual(before);
    expect(studio.shortlistFull.value).toBe(true);
    studio.removeFromShortlist("d");
    expect(studio.shortlistFull.value).toBe(false);
    expect(studio.addToShortlist("e")).toBe("added");
  });

  it("deduplicates and bounds an initial shortlist", () => {
    const studio = model(["a", "a", "b", "c", "d", "e", "f"]);
    expect(studio.shortlist.value).toEqual(["a", "b", "c", "d"]);
    expectInvariants(studio, "initial");
  });

  it("toggles membership", () => {
    const studio = model(["a"]);
    expect(studio.toggleShortlist("b")).toBe("added");
    expect(studio.toggleShortlist("b")).toBe("removed");
    expect(studio.toggleShortlist("b")).toBe("added");
  });
});

describe("removing candidates", () => {
  it("removing B moves B to the card that took its place, else the new last", () => {
    const studio = model(["a", "b", "c", "d"]);
    studio.setCandidate("c");
    studio.removeFromShortlist("c");
    expect(state(studio)).toMatchObject({ a: "a", b: "d", deck: ["b", "d"] });
    studio.removeFromShortlist("d");
    expect(state(studio)).toMatchObject({ a: "a", b: "b", deck: ["b"] });
  });

  it("removing the pinned reference promotes B, so the comparison stays meaningful", () => {
    const studio = model(["a", "b", "c"]);
    expect(state(studio)).toMatchObject({ a: "a", b: "b" });
    expect(studio.removeFromShortlist("a")).toBe("removed");
    expect(state(studio)).toMatchObject({ a: "b", b: "c", deck: ["c"] });
    studio.removeFromShortlist("b");
    expect(state(studio)).toMatchObject({ a: "c", b: undefined, deck: [] });
    expect(studio.compareState.value).toBe("reference-only");
    studio.removeFromShortlist("c");
    expect(studio.compareState.value).toBe("empty");
    expect(studio.referenceId.value).toBeUndefined();
  });

  it("removing a member behind B changes neither role", () => {
    const studio = model(["a", "b", "c", "d"]);
    studio.removeFromShortlist("d");
    expect(state(studio)).toMatchObject({ a: "a", b: "b" });
  });

  it("closes the detail of a candidate that is no longer on the shortlist", () => {
    const studio = model(["a", "b"]);
    studio.inspect("b");
    studio.removeFromShortlist("b");
    expect(studio.inspectedId.value).toBeUndefined();
    studio.inspect("a");
    studio.removeFromShortlist("c");
    expect(studio.inspectedId.value).toBe("a");
  });

  it("reports a missing member and changes nothing", () => {
    const studio = model(["a", "b"]);
    const before = state(studio);
    expect(studio.removeFromShortlist("f")).toBe("missing");
    expect(state(studio)).toEqual(before);
  });
});

describe("roles", () => {
  it("pins a member as A; the old A joins the deck and B is kept", () => {
    const studio = model(["a", "b", "c"]);
    expect(studio.pinReference("c")).toBe("pinned");
    expect(state(studio)).toMatchObject({ a: "c", b: "b", deck: ["a", "b"] });
  });

  it("pinning B swaps the pair rather than comparing a card with itself", () => {
    const studio = model(["a", "b", "c"]);
    studio.pinReference("b");
    expect(state(studio)).toMatchObject({ a: "b", b: "a" });
  });

  it("pins a candidate that is not yet on the shortlist, adding it when there is room", () => {
    const studio = model(["a", "b"]);
    expect(studio.pinReference("e")).toBe("pinned");
    expect(studio.shortlist.value).toEqual(["a", "b", "e"]);
    expect(studio.referenceId.value).toBe("e");
    const full = model(["a", "b", "c", "d"]);
    expect(full.pinReference("e")).toBe("full");
    expect(full.referenceId.value).toBe("a");
  });

  it("pinning the reference again is a no-op", () => {
    const studio = model(["a", "b"]);
    expect(studio.pinReference("a")).toBe("unchanged");
  });

  it("changing B never changes A, and refuses A itself", () => {
    const studio = model(["a", "b", "c"]);
    expect(studio.setCandidate("c")).toBe("changed");
    expect(state(studio)).toMatchObject({ a: "a", b: "c" });
    expect(studio.setCandidate("c")).toBe("unchanged");
    expect(studio.setCandidate("a")).toBe("is-reference");
    expect(state(studio)).toMatchObject({ a: "a", b: "c" });
  });

  it("shortlists a candidate chosen as B when there is room, and refuses when full", () => {
    const studio = model(["a", "b"]);
    expect(studio.setCandidate("e")).toBe("changed");
    expect(state(studio)).toMatchObject({ a: "a", b: "e", deck: ["b", "e"] });
    const full = model(["a", "b", "c", "d"]);
    expect(full.setCandidate("e")).toBe("full");
    expect(full.candidateId.value).toBe("b");
  });

  it("swaps roles only when there is a B", () => {
    const studio = model(["a"]);
    expect(studio.swapRoles()).toBe(false);
    studio.addToShortlist("b");
    expect(studio.swapRoles()).toBe(true);
    expect(state(studio)).toMatchObject({ a: "b", b: "a" });
  });

  it("never lets the same sequence leave A and B equal", () => {
    const studio = model(["a", "b"]);
    studio.swapRoles();
    studio.pinReference("a");
    studio.swapRoles();
    expect(studio.referenceId.value).not.toBe(studio.candidateId.value);
  });
});

describe("the Deck's states", () => {
  it("counts the Deck's own cards, not the shortlist", () => {
    const studio = model(["a"]);
    expect(studio.deckState.value).toBe("empty");
    studio.addToShortlist("b");
    expect(studio.deckState.value).toBe("single");
    studio.addToShortlist("c");
    expect(studio.deckState.value).toBe("deck");
    studio.pinReference("c");
    expect(studio.deckIds.value).toEqual(["a", "b"]);
    expect(studio.deckState.value).toBe("deck");
  });
});

describe("what is shown is not what is chosen", () => {
  it("shows B until the Deck reports the card in front, then that card", () => {
    const studio = model(["a", "b", "c"]);
    expect(studio.shownCandidateId.value).toBe("b");
    studio.setCandidate("c");
    // The semantic B has changed at once; the Deck is still showing b.
    studio.reportPresented("b");
    expect(studio.candidateId.value).toBe("c");
    expect(studio.shownCandidateId.value).toBe("b");
    studio.reportPresented("c");
    expect(studio.shownCandidateId.value).toBe("c");
  });

  it("ignores a report for a card that has left the Deck", () => {
    const studio = model(["a", "b", "c"]);
    studio.reportPresented("c");
    studio.removeFromShortlist("c");
    expect(studio.shownCandidateId.value).toBe("b");
    studio.reportPresented(undefined);
    expect(studio.shownCandidateId.value).toBe("b");
  });

  it("never lets the presentation become a selection", () => {
    const studio = model(["a", "b", "c"]);
    studio.reportPresented("c");
    expect(studio.candidateId.value).toBe("b");
  });
});

describe("the decision", () => {
  it("is independent of the shortlist and survives the candidate leaving it", () => {
    const studio = model(["a", "b"]);
    expect(studio.decide("b")).toBe(true);
    studio.removeFromShortlist("b");
    expect(studio.decidedId.value).toBe("b");
    expect(studio.decide("nope" as Id)).toBe(false);
    studio.clearDecision();
    expect(studio.decidedId.value).toBeUndefined();
  });

  it("keeps the reason while the choice changes, and bounds it", () => {
    const studio = model(["a", "b"]);
    studio.decide("a");
    expect(studio.setReason("x".repeat(REASON_LIMIT + 50))).toHaveLength(REASON_LIMIT);
    studio.decide("b");
    expect(studio.reason.value).toHaveLength(REASON_LIMIT);
  });
});

describe("the one native modal", () => {
  it("refuses a second overlay and hands modality back only on completion", () => {
    const studio = model(["a", "b"]);
    expect(studio.openSheet("a")).toBe(true);
    expect(studio.openSheet("b")).toBe(false);
    expect(studio.sheetId.value).toBe("a");
    studio.requestClose();
    expect(studio.overlayOpen.value).toBe(false);
    // Closing is a request: modality stays with the dialog until it has really closed.
    expect(studio.overlay.value).toBe("sheet");
    expect(studio.openSheet("b")).toBe(false);
    studio.completeClose();
    expect(studio.overlay.value).toBe("none");
    expect(studio.openSheet("b")).toBe(true);
  });

  it("refuses an unknown candidate", () => {
    expect(model().openSheet("nope" as Id)).toBe(false);
  });
});

describe("adopting a candidate as B", () => {
  it("behaves as choosing B while there is room", () => {
    const studio = model(["a", "b"]);
    expect(studio.adoptCandidate("e")).toBe("changed");
    expect(state(studio)).toMatchObject({ a: "a", b: "e", deck: ["b", "e"] });
    expect(studio.adoptCandidate("e")).toBe("unchanged");
  });

  it("gives B's slot to the newcomer when the shortlist is full, keeping the pile's order", () => {
    const studio = model(["a", "b", "c", "d"]);
    studio.setCandidate("c");
    expect(studio.adoptCandidate("e")).toBe("changed");
    expect(state(studio)).toMatchObject({ a: "a", b: "e", shortlist: ["a", "b", "e", "d"] });
    expectInvariants(studio, "after adopting into a full shortlist");
  });

  it("refuses the reference and an unknown id, and never replaces A", () => {
    const studio = model(["a", "b", "c", "d"]);
    expect(studio.adoptCandidate("a")).toBe("is-reference");
    expect(studio.adoptCandidate("nope" as Id)).toBe("unknown");
    expect(studio.referenceId.value).toBe("a");
  });

  it("works from an empty and a one-member shortlist", () => {
    const one = model(["a"]);
    expect(one.adoptCandidate("b")).toBe("changed");
    expect(state(one)).toMatchObject({ a: "a", b: "b" });
    const none = model();
    expect(none.adoptCandidate("a")).toBe("unchanged");
    expect(none.referenceId.value).toBe("a");
  });
});

describe("the shortlist's own Deck", () => {
  it("turns its cards with Shuffle until told otherwise, as a setting of its own", () => {
    const studio = model(["a", "b", "c"]);
    expect(studio.shortlistExchange.value).toBe("shuffle");
    studio.setShortlistExchange("direct");
    expect(studio.shortlistExchange.value).toBe("direct");
  });

  it("never changes who A and B are, or what is shortlisted", () => {
    const studio = model(["a", "b", "c"]);
    const before = state(studio);
    studio.setShortlistExchange("direct");
    studio.setShortlistExchange("shuffle");
    expect(state(studio)).toEqual(before);
  });
});

describe("the photo viewer", () => {
  it("is the one modal: it refuses while the sheet is open, and the sheet while it is", () => {
    const studio = model(["a", "b"]);
    expect(studio.openMedia("photo-1")).toBe(true);
    expect(studio.overlay.value).toBe("media");
    expect(studio.mediaId.value).toBe("photo-1");
    expect(studio.openSheet("a")).toBe(false);
    expect(studio.openMedia("photo-2")).toBe(false);
    studio.requestClose();
    expect(studio.overlay.value).toBe("media");
    studio.completeClose();
    expect(studio.overlay.value).toBe("none");
    expect(studio.mediaId.value).toBeUndefined();
    expect(studio.openSheet("a")).toBe(true);
    expect(studio.openMedia("photo-1")).toBe(false);
  });
});

describe("invariants over arbitrary sequences", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    it(`holds after every operation (seed ${seed})`, () => {
      const next = random(seed);
      const pick = () => ids[Math.floor(next() * ids.length)]!;
      const studio = model(next() < 0.5 ? ["a", "b"] : []);
      expectInvariants(studio, "start");
      for (let step = 0; step < 150; step += 1) {
        const id = pick();
        const operation = Math.floor(next() * 9);
        const label = `seed ${seed} step ${step} op ${operation} ${id}`;
        if (operation === 0) studio.addToShortlist(id);
        else if (operation === 1) studio.removeFromShortlist(id);
        else if (operation === 2) studio.toggleShortlist(id);
        else if (operation === 3) studio.pinReference(id);
        else if (operation === 4) studio.setCandidate(id);
        else if (operation === 5) studio.swapRoles();
        else if (operation === 6) studio.adoptCandidate(id);
        else if (operation === 7) studio.setShortlistExchange(next() < 0.5 ? "direct" : "shuffle");
        else studio.reportPresented(next() < 0.5 ? id : undefined);
        expectInvariants(studio, label);
        // The shown candidate is always something the visitor could actually see in the Deck.
        const shown = studio.shownCandidateId.value;
        const deck = studio.deckIds.value;
        expect([label, shown === undefined ? deck.length === 0 : deck.includes(shown)]).toEqual([
          label,
          true,
        ]);
      }
    });
  }
});
