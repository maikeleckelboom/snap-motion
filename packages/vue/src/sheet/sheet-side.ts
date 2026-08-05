import type { SheetAxis, SheetEdge, SheetSide } from "./sheet-contracts";

export interface SheetSideDescriptor {
  readonly attachedEdge: SheetEdge;
  readonly axis: SheetAxis;
  readonly handleEdge: SheetEdge;
  readonly oppositeEdge: SheetEdge;
  readonly side: SheetSide;
  readonly transformSign: 1 | -1;
}

export const sheetSides = [
  "top",
  "right",
  "bottom",
  "left",
] as const satisfies readonly SheetSide[];

export const sheetSideDescriptors: Readonly<Record<SheetSide, SheetSideDescriptor>> = {
  top: {
    attachedEdge: "top",
    axis: "y",
    handleEdge: "bottom",
    oppositeEdge: "bottom",
    side: "top",
    transformSign: -1,
  },
  right: {
    attachedEdge: "right",
    axis: "x",
    handleEdge: "left",
    oppositeEdge: "left",
    side: "right",
    transformSign: 1,
  },
  bottom: {
    attachedEdge: "bottom",
    axis: "y",
    handleEdge: "top",
    oppositeEdge: "top",
    side: "bottom",
    transformSign: 1,
  },
  left: {
    attachedEdge: "left",
    axis: "x",
    handleEdge: "right",
    oppositeEdge: "right",
    side: "left",
    transformSign: -1,
  },
};

export function getSheetSideDescriptor(side: SheetSide): SheetSideDescriptor {
  return sheetSideDescriptors[side];
}

export function toCanonicalSheetDelta(side: SheetSide, physicalDelta: number) {
  return physicalDelta * getSheetSideDescriptor(side).transformSign;
}

export function toPhysicalSheetPosition(side: SheetSide, canonicalPosition: number) {
  return canonicalPosition * getSheetSideDescriptor(side).transformSign;
}

export function sheetTransform(side: SheetSide, canonicalPosition: number) {
  const physicalPosition = toPhysicalSheetPosition(side, canonicalPosition);
  return getSheetSideDescriptor(side).axis === "x"
    ? `translate3d(${physicalPosition}px, 0, 0)`
    : `translate3d(0, ${physicalPosition}px, 0)`;
}
