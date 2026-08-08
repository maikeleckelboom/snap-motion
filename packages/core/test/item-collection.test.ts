import { describe, expect, it } from "vitest";

import { OrderedIdCollection, resolvePreservedIndex } from "../src/item-collection";

type Id = "a" | "b" | "c";

describe("ordered id collection", () => {
  it("answers position questions without ever inventing an item", () => {
    const items = new OrderedIdCollection<Id>(["a", "b", "c"]);
    expect(items.size).toBe(3);
    expect(items.indexOf("b")).toBe(1);
    expect(items.indexOf("z" as Id)).toBe(-1);
    expect(items.at(2)).toBe("c");
    expect(items.at(3)).toBeUndefined();
    expect(items.at(-1)).toBeUndefined();
    expect(items.contains(-1)).toBe(false);
    expect(items.contains(2.5)).toBe(false);
    expect(items.contains(3)).toBe(false);
  });

  it("rejects duplicate and empty semantic IDs on the same terms as the geometry", () => {
    expect(() => new OrderedIdCollection(["a", "a"])).toThrow(RangeError);
    expect(() => new OrderedIdCollection([""])).toThrow(TypeError);
    const items = new OrderedIdCollection<Id>(["a", "b"]);
    expect(() => items.replace(["c", "c"])).toThrow(RangeError);
    // A rejected reconfiguration leaves the collection exactly as it was.
    expect(items.ids).toEqual(["a", "b"]);
  });

  it("takes a copy, so a caller's later mutation cannot rewrite the collection", () => {
    const source: Id[] = ["a", "b"];
    const items = new OrderedIdCollection<Id>(source);
    source.push("c");
    expect(items.ids).toEqual(["a", "b"]);
    expect(items.size).toBe(2);
    expect(items.indexOf("c")).toBe(-1);

    // The same has to hold for a reconfiguration, not only for construction.
    const replacement: Id[] = ["c", "a"];
    items.replace(replacement);
    replacement.length = 0;
    expect(items.ids).toEqual(["c", "a"]);
    expect(items.indexOf("a")).toBe(1);
  });

  it("refuses to let the owned ordering be mutated through the getter", () => {
    const items = new OrderedIdCollection<Id>(["a", "b", "c"]);
    // `readonly` is erased at runtime, so the guarantee has to exist in JavaScript too: the ID
    // array and the index map are two views of one ordering and cannot be allowed to disagree.
    const owned = items.ids as Id[];
    expect(Object.isFrozen(owned)).toBe(true);
    expect(() => owned.push("a")).toThrow(TypeError);
    expect(() => owned.reverse()).toThrow(TypeError);
    expect(() => {
      owned[0] = "c";
    }).toThrow(TypeError);

    expect(items.ids).toEqual(["a", "b", "c"]);
    expect(items.indexOf("c")).toBe(2);
    expect(items.at(0)).toBe("a");
  });
});

describe("preserved index across reconfiguration", () => {
  it("follows the semantic item wherever it moved to", () => {
    const items = new OrderedIdCollection<Id>(["c", "b", "a"]);
    expect(resolvePreservedIndex(items, "a", 0)).toBe(2);
  });

  it("holds its ordinal place when the item is gone, clamped to what is left", () => {
    const items = new OrderedIdCollection<Id>(["a", "b"]);
    expect(resolvePreservedIndex(items, "c", 2)).toBe(1);
    expect(resolvePreservedIndex(items, "c", 0)).toBe(0);
  });

  it("names nothing at all once the collection is empty", () => {
    expect(resolvePreservedIndex(new OrderedIdCollection<Id>([]), "a", 1)).toBe(-1);
  });
});
