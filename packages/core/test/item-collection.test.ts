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
