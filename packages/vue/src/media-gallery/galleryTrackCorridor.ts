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
  const slots = options.slots
    .filter((slot) => {
      const { pan, radius } = extent(slot.itemIndex);
      return Math.abs(slot.position + pan - presentedPosition) <= radius;
    })
    .map(({ itemIndex, position }) => ({ itemIndex, position }));

  function append(itemIndex: number, side: number) {
    if (
      itemIndex < 0 ||
      itemIndex >= options.itemCount ||
      slots.some((slot) => slot.itemIndex === itemIndex)
    )
      return;
    const { pan, radius } = extent(itemIndex);
    const fitted = slots.filter((slot) => slot.itemIndex !== mechanicalIndex);
    // Keep fitted centers at least one pitch apart. The first new image is just off-screen,
    // and adjacent fitted visibility intervals overlap because each radius exceeds half a pitch.
    const fittedEdge =
      fitted.length > 0
        ? side > 0
          ? Math.max(...fitted.map((slot) => slot.position))
          : Math.min(...fitted.map((slot) => slot.position))
        : undefined;
    let position = presentedPosition + side * radius - pan;
    if (fittedEdge !== undefined) {
      position = side > 0 ? Math.max(position, fittedEdge + 1) : Math.min(position, fittedEdge - 1);
    } else if (slots.length > 0) {
      const edge = slots.reduce((best, slot) => {
        const bounds = extent(slot.itemIndex);
        const end = slot.position + bounds.pan + side * bounds.radius;
        return side > 0 ? Math.max(best, end) : Math.min(best, end);
      }, presentedPosition);
      position = edge + side * (radius - 1) - pan;
      position =
        side > 0
          ? Math.max(position, presentedPosition + radius - pan)
          : Math.min(position, presentedPosition - radius - pan);
    }
    // Only the transformed mechanical coordinate can collide with a fitted edge. Its extent
    // bridges the skipped coordinate, so moving one pitch outward remains covered.
    while (slots.some((slot) => Math.abs(slot.position - position) < 1e-9)) position += side;
    slots.push({ itemIndex, position });
  }

  append(destination, direction);
  append(mechanicalIndex, -direction);
  append(options.visibleIndex, -direction);
  append(destination - 1, -1);
  append(destination + 1, 1);
  return slots;
}
