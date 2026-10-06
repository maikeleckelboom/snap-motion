interface PhysicalSlot {
  readonly itemIndex: number;
  readonly position: number;
}

interface SlotExtent {
  readonly pan: number;
  readonly radius: number;
}

/** Recycle off-screen owners at the edge of a connected physical corridor. */
export function allocateGalleryTrackCorridor(options: {
  readonly slots: readonly PhysicalSlot[];
  readonly presentedPosition: number;
  readonly destination: number;
  readonly intendedIndex: number;
  readonly mechanicalIndex: number;
  readonly visibleIndex: number;
  readonly itemCount: number;
  readonly extent: (itemIndex: number) => SlotExtent;
}): readonly PhysicalSlot[] {
  const { presentedPosition, destination, mechanicalIndex, extent } = options;
  const previousTarget = options.slots.find((slot) => slot.itemIndex === destination);
  const direction =
    Math.sign(destination - options.intendedIndex) ||
    Math.sign((previousTarget?.position ?? presentedPosition) - presentedPosition) ||
    1;
  // These intervals all contain the presented position. Their union is connected, including
  // the mechanical image's actual fitted width, scale and pan. Never move these keyed nodes.
  const slots = options.slots.filter((slot) => {
    const { pan, radius } = extent(slot.itemIndex);
    return Math.abs(slot.position + pan - presentedPosition) <= radius;
  });

  function append(itemIndex: number, side: number) {
    if (
      itemIndex < 0 ||
      itemIndex >= options.itemCount ||
      slots.some((slot) => slot.itemIndex === itemIndex)
    )
      return;
    const { pan, radius } = extent(itemIndex);
    // Keep fitted centers at least one pitch apart. The first new image is just off-screen,
    // and adjacent fitted visibility intervals overlap because each radius exceeds half a pitch.
    // Project onto the requested side so both directions follow the same edge rule.
    const distance = Math.max(
      side * (presentedPosition - pan) + radius,
      ...slots.map((slot) => side * slot.position + 1),
    );
    const position = side * distance;
    slots.push({ itemIndex, position });
  }

  append(destination, direction);
  append(mechanicalIndex, -direction);
  append(options.visibleIndex, -direction);
  append(destination - 1, -1);
  append(destination + 1, 1);
  return slots;
}
