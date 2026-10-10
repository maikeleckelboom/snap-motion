import { describe, expect, it } from "vitest";

import { fullyOccludedRasterPixels, type PileGeometry } from "../e2e/stackedDeckPileGeometry.ts";

describe("opaque pile raster geometry", () => {
  for (const dpr of [1, 2]) {
    it(`matches an independent four-corner cell oracle at DPR ${dpr} and fractional clip origins`, () => {
      const angle = 0.23;
      const a = Math.cos(angle);
      const b = Math.sin(angle);
      const geometry: PileGeometry = {
        cardWidth: 12,
        cardHeight: 8,
        stageWidth: 30,
        stageHeight: 24,
        poses: [],
        dom: [
          {
            layer: 0,
            opacity: 1,
            visible: true,
            width: 12,
            height: 8,
            matrix: { a: 1, b: 0, c: 0, d: 1, e: -6, f: -4 },
          },
          {
            layer: 1,
            opacity: 1,
            visible: true,
            width: 12,
            height: 8,
            matrix: { a, b, c: -b, d: a, e: -6.2, f: -3.8 },
          },
        ],
      };
      const width = 31 * dpr;
      const offset = [0.37, 0.91] as const;
      const pixels = Array.from({ length: width * 25 * dpr }, (_, index) => index);
      const quad = [
        [-6, -4],
        [6, -4],
        [6, 4],
        [-6, 4],
      ].map(([x, y]) => [14.8 + a * x! - b * y!, 12.2 + b * x! + a * y!]);
      const expected = pixels.flatMap((pixel) => {
        const x = (pixel % width) / dpr - offset[0];
        const y = Math.floor(pixel / width) / dpr - offset[1];
        const cell = [
          [x, y],
          [x + 1 / dpr, y],
          [x + 1 / dpr, y + 1 / dpr],
          [x, y + 1 / dpr],
        ];
        const whollyInside = cell.every(([px, py]) =>
          quad.every(([sx, sy], edge) => {
            const [ex, ey] = quad[(edge + 1) % 4]!;
            return (ex! - sx!) * (py! - sy!) - (ey! - sy!) * (px! - sx!) >= 0;
          }),
        );
        return whollyInside ? [[x, y] as const] : [];
      });
      expect(expected.length).toBeGreaterThan(50 * dpr * dpr);
      expect(fullyOccludedRasterPixels(geometry, 0, pixels, width, dpr, offset)).toEqual(expected);
      expect(fullyOccludedRasterPixels(geometry, 0, pixels, width, dpr)).not.toEqual(expected);
    });
  }
});
