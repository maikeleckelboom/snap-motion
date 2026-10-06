import { describe, expect, it } from "vitest";

import { allocateGalleryTrackCorridor } from "../src/media-gallery/galleryTrackCorridor";

type Slot = { readonly itemIndex: number; readonly position: number };
type Bounds = { readonly pan: number; readonly radius: number };
const fittedExtent = () => ({ pan: 0, radius: 1 });

function coverage(slots: readonly Slot[], extent: (index: number) => Bounds) {
  return slots
    .map((slot) => {
      const { pan, radius } = extent(slot.itemIndex);
      return { start: slot.position + pan - radius, end: slot.position + pan + radius };
    })
    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 package types; this mapped array is private to the oracle.
    .sort((a, b) => a.start - b.start);
}

function assertCorridor(
  slots: readonly Slot[],
  position: number,
  extent: (index: number) => Bounds,
) {
  const intervals = coverage(slots, extent);
  let end = intervals[0]?.end ?? -Infinity;
  for (const interval of intervals.slice(1)) {
    if (interval.start >= end - 1e-9)
      throw new Error(`Uncovered corridor: ${JSON.stringify({ slots, position, intervals })}`);
    end = Math.max(end, interval.end);
  }
  const start = intervals[0]?.start ?? Infinity;
  if (
    start >= Math.min(position, ...slots.map((slot) => slot.position)) ||
    end <= Math.max(position, ...slots.map((slot) => slot.position))
  ) {
    throw new Error("Coverage must include all reachable offsets, including both physical edges");
  }
}

describe("physical gallery corridor", () => {
  it("rejects the immutable beta.13 sparse witness and reconnects it without moving presented nodes", () => {
    const slots = [
      { itemIndex: 0, position: 0 },
      { itemIndex: 1, position: 3 },
    ];
    const extent = fittedExtent;
    expect(() => assertCorridor(slots, 1.5, extent)).toThrow("Uncovered corridor");
    const connected = allocateGalleryTrackCorridor({
      slots,
      presentedPosition: 2.7,
      destination: 0,
      intendedIndex: 1,
      mechanicalIndex: 0,
      visibleIndex: 1,
      itemCount: 6,
      extent,
    });
    expect(connected.find((slot) => slot.itemIndex === 1)?.position).toBe(3);
    assertCorridor(connected, 2.7, extent);
  });

  for (const count of [2, 3, 6]) {
    for (const shape of ["fit", "narrow", "zoom-left", "zoom-right"] as const) {
      it(`exhausts four operations for ${count} items under ${shape}`, () => {
        let allocations = 0;
        let maximum = 0;
        interface State {
          slots: readonly Slot[];
          position: number;
          intent: number;
          visible: number;
        }
        const extent = (index: number): Bounds => ({
          radius: index === 0 && shape.startsWith("zoom") ? 2.5 : shape === "narrow" ? 0.625 : 1,
          pan: index === 0 ? (shape === "zoom-left" ? -1.5 : shape === "zoom-right" ? 1.5 : 0) : 0,
        });
        function allocate(state: State, destination: number): State {
          const slots = allocateGalleryTrackCorridor({
            slots: state.slots,
            presentedPosition: state.position,
            destination,
            intendedIndex: state.intent,
            mechanicalIndex: 0,
            visibleIndex: state.visible,
            itemCount: count,
            extent,
          });
          allocations += 1;
          maximum = Math.max(maximum, slots.length);
          if (
            slots.length > 8 ||
            new Set(slots.map((slot) => slot.position)).size !== slots.length ||
            new Set(slots.map((slot) => slot.itemIndex)).size !== slots.length ||
            !slots.some((slot) => slot.itemIndex === destination)
          )
            throw new Error("Invalid slot allocation");
          for (const slot of state.slots) {
            const bounds = extent(slot.itemIndex);
            if (
              Math.abs(slot.position + bounds.pan - state.position) <= bounds.radius &&
              slots.find((retained) => retained.itemIndex === slot.itemIndex)?.position !==
                slot.position
            ) {
              throw new Error("Presented node teleported");
            }
          }
          assertCorridor(slots, state.position, extent);
          return { ...state, slots, intent: destination };
        }
        function move(state: State, position: number): State {
          // The oracle checks the entire continuous span, not just a final sample.
          assertCorridor(state.slots, position, extent);
          let visible = state.visible;
          const previous = state.slots.find((slot) => slot.itemIndex === visible);
          // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 package types; sort only this private copy.
          const nearest = [...state.slots].sort(
            (a, b) => Math.abs(a.position - position) - Math.abs(b.position - position),
          )[0];
          if (
            nearest &&
            (!previous ||
              Math.abs(nearest.position - position) + 0.03 < Math.abs(previous.position - position))
          )
            visible = nearest.itemIndex;
          return { ...state, position, visible };
        }
        function visit(state: State, depth: number) {
          if (depth === 0) return;
          // Commands include next, previous, non-adjacent targets and return to the fixed mechanical anchor.
          for (let destination = 0; destination < count; destination += 1) {
            if (destination !== state.intent) visit(allocate(state, destination), depth - 1);
          }
          for (const fraction of [0.25, 0.75]) {
            const target =
              state.slots.find((slot) => slot.itemIndex === state.intent)?.position ?? 0;
            visit(move(state, state.position + (target - state.position) * fraction), depth - 1);
          }
          // Each swipe takes over, travels, then allocates from the latest intent. Short swipes return.
          for (const delta of [-1, -0.75, -0.05, 0.05, 0.75, 1]) {
            let next = allocate(state, state.intent);
            const start = Math.min(...next.slots.map((slot) => slot.position));
            const end = Math.max(...next.slots.map((slot) => slot.position));
            const requested = state.position + delta;
            const position =
              requested < start
                ? start - Math.min(0.03, (start - requested) * 0.08)
                : requested > end
                  ? end + Math.min(0.03, (requested - end) * 0.08)
                  : requested;
            next = move(next, position);
            if (Math.abs(delta) >= 0.14)
              next = allocate(
                next,
                Math.max(0, Math.min(count - 1, state.intent + Math.sign(delta))),
              );
            visit(next, depth - 1);
          }
        }
        visit(
          {
            slots: [
              { itemIndex: 0, position: 0 },
              { itemIndex: 1, position: 1 },
            ],
            position: 0,
            intent: 0,
            visible: 0,
          },
          4,
        );
        expect(allocations).toBeGreaterThan(5000);
        expect(maximum).toBeLessThanOrEqual(8);
      });
    }
  }
});
