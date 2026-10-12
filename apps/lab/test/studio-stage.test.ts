import { describe, expect, it } from "vitest";

import {
  carryOverScreen,
  middleScreenId,
  stagesLevel,
} from "../src/playground/studio/studio-stage";

const home = "middle";

describe("middleScreenId", () => {
  it("is the middle of an odd and of an even sample", () => {
    expect(middleScreenId([{ id: "a" }, { id: "b" }, { id: "c" }])).toBe("b");
    expect(middleScreenId([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }])).toBe("c");
  });
});

describe("carryOverScreen", () => {
  it("lands a new B level with the A that stayed", () => {
    expect(
      carryOverScreen({ a: "x", b: "y" }, { a: "x", b: "z" }, { a: "four", b: "two" }, home),
    ).toBe("four");
  });

  it("lands a new A level with the B that stayed", () => {
    expect(
      carryOverScreen({ a: "x", b: "y" }, { a: "z", b: "y" }, { a: "four", b: "two" }, home),
    ).toBe("two");
  });

  it("carries the reference's screen over a swap, where neither stage was kept", () => {
    expect(
      carryOverScreen({ a: "x", b: "y" }, { a: "y", b: "x" }, { a: "four", b: "two" }, home),
    ).toBe("four");
  });

  it("lands a B that appears beside an A that stayed on A's screen", () => {
    expect(
      carryOverScreen(
        { a: "x", b: undefined },
        { a: "x", b: "y" },
        { a: "four", b: undefined },
        home,
      ),
    ).toBe("four");
  });

  it("carries the old reference's screen when removing A promotes B and changes both roles", () => {
    expect(
      carryOverScreen({ a: "x", b: "y" }, { a: "y", b: "z" }, { a: "four", b: "two" }, home),
    ).toBe("four");
    expect(
      carryOverScreen(
        { a: undefined, b: "y" },
        { a: "q", b: "y" },
        { a: undefined, b: "two" },
        home,
      ),
    ).toBe("two");
  });

  it("falls back to the defined start when nothing is mounted to carry over", () => {
    expect(
      carryOverScreen(
        { a: undefined, b: undefined },
        { a: "x", b: "y" },
        { a: undefined, b: undefined },
        home,
      ),
    ).toBe(home);
  });
});

describe("stagesLevel", () => {
  it("is level on the same screen, and apart on different ones", () => {
    expect(stagesLevel({ a: "x", b: "x" })).toBe(true);
    expect(stagesLevel({ a: "x", b: "y" })).toBe(false);
  });

  it("cannot be apart when a stage is missing", () => {
    expect(stagesLevel({ a: "x", b: undefined })).toBe(true);
    expect(stagesLevel({ a: undefined, b: undefined })).toBe(true);
  });
});
