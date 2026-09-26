/** Test-only geometry for the opaque, rectangular high-contrast pile fixture. */

export interface PilePoseGeometry {
  readonly layer: number;
  readonly opacity: number;
  readonly rotate: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly visible: boolean;
}

export interface PileDomGeometry {
  readonly layer: number;
  readonly matrix: {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
  };
  readonly opacity: number;
  readonly visible: boolean;
  readonly width: number;
  readonly height: number;
}

export interface PileGeometry {
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly poses: readonly PilePoseGeometry[];
  readonly dom: readonly PileDomGeometry[];
}

type Point = readonly [number, number];
type Polygon = readonly Point[];

function cross(left: Point, right: Point): number {
  return left[0] * right[1] - left[1] * right[0];
}

function subtract(left: Point, right: Point): Point {
  return [left[0] - right[0], left[1] - right[1]];
}

/** Intersect two convex quads; screen coordinates use positive Y downward. */
function intersect(subject: Polygon, clipper: Polygon): Polygon {
  let polygon = subject;
  for (let edgeIndex = 0; edgeIndex < clipper.length; edgeIndex += 1) {
    const start = clipper[edgeIndex]!;
    const edge = subtract(clipper[(edgeIndex + 1) % clipper.length]!, start);
    const next: Point[] = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const from = polygon[index]!;
      const to = polygon[(index + 1) % polygon.length]!;
      const fromSide = cross(edge, subtract(from, start));
      const toSide = cross(edge, subtract(to, start));
      if (fromSide >= 0) next.push(from);
      if (fromSide >= 0 !== toSide >= 0) {
        const route = subtract(to, from);
        const fraction = -fromSide / cross(edge, route);
        next.push([from[0] + fraction * route[0], from[1] + fraction * route[1]]);
      }
    }
    polygon = next;
    if (polygon.length === 0) break;
  }
  return polygon;
}

function area(polygon: Polygon): number {
  if (polygon.length < 3) return 0;
  let doubleArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    doubleArea += cross(polygon[index]!, polygon[(index + 1) % polygon.length]!);
  }
  return Math.abs(doubleArea) / 2;
}

function corners(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  a: number,
  b: number,
  c: number,
  d: number,
): Polygon {
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([x, y]): Point => [centerX + a * x! + c * y!, centerY + b * x! + d * y!]);
}

function modelQuad(geometry: PileGeometry, index: number): Polygon {
  const pose = geometry.poses[index]!;
  const radians = (pose.rotate * Math.PI) / 180;
  const cosine = Math.cos(radians) * pose.scale;
  const sine = Math.sin(radians) * pose.scale;
  return corners(
    geometry.cardWidth,
    geometry.cardHeight,
    geometry.stageWidth / 2 + pose.translateX,
    geometry.stageHeight / 2 + pose.translateY,
    cosine,
    sine,
    -sine,
    cosine,
  );
}

function domQuad(geometry: PileGeometry, index: number): Polygon {
  const shell = geometry.dom[index]!;
  const { a, b, c, d, e, f } = shell.matrix;
  return corners(
    shell.width,
    shell.height,
    geometry.stageWidth / 2 + e + shell.width / 2,
    geometry.stageHeight / 2 + f + shell.height / 2,
    a,
    b,
    c,
    d,
  );
}

function inFront(
  poses: readonly Pick<PilePoseGeometry, "layer" | "visible" | "opacity">[],
  index: number,
) {
  const ownLayer = poses[index]!.layer;
  return poses.flatMap((pose, candidate) =>
    candidate !== index &&
    pose.visible &&
    pose.opacity > 0 &&
    (pose.layer > ownLayer || (pose.layer === ownLayer && candidate > index))
      ? [candidate]
      : [],
  );
}

/** Exact continuous area of a shell outside the union of all opaque bodies in front of it. */
export function exposedModelArea(geometry: PileGeometry, index: number): number {
  const pose = geometry.poses[index]!;
  if (!pose.visible || pose.opacity <= 0) return 0;
  const shell = modelQuad(geometry, index);
  const fronts = inFront(geometry.poses, index).map((candidate) => modelQuad(geometry, candidate));
  let exposed = 0;
  // Only five fixture shells exist. Inclusion-exclusion avoids approximating their overlap on a grid.
  for (let mask = 0; mask < 1 << fronts.length; mask += 1) {
    let polygon = shell;
    let coveredCount = 0;
    for (let candidate = 0; candidate < fronts.length; candidate += 1) {
      if ((mask & (1 << candidate)) === 0) continue;
      polygon = intersect(polygon, fronts[candidate]!);
      coveredCount += 1;
      if (polygon.length === 0) break;
    }
    exposed += (coveredCount % 2 === 0 ? 1 : -1) * area(polygon);
  }
  return exposed;
}

function contains(quad: Polygon, point: Point): boolean {
  for (let index = 0; index < quad.length; index += 1) {
    const start = quad[index]!;
    const edge = subtract(quad[(index + 1) % quad.length]!, start);
    if (cross(edge, subtract(point, start)) < 0) return false;
  }
  return true;
}

/** Raster material may touch a boundary cell, but cannot fill a cell wholly under a front shell. */
export function fullyOccludedRasterPixels(
  geometry: PileGeometry,
  index: number,
  pixels: readonly number[],
  rasterWidth: number,
  devicePixelRatio: number,
): readonly Point[] {
  const fronts = inFront(geometry.dom, index).map((candidate) => domQuad(geometry, candidate));
  const pixelSize = 1 / devicePixelRatio;
  return pixels.flatMap((pixel) => {
    const x = (pixel % rasterWidth) * pixelSize;
    const y = Math.floor(pixel / rasterWidth) * pixelSize;
    const cell: Polygon = [
      [x, y],
      [x + pixelSize, y],
      [x + pixelSize, y + pixelSize],
      [x, y + pixelSize],
    ];
    return fronts.some((front) => cell.every((corner) => contains(front, corner)))
      ? [[x, y] as Point]
      : [];
  });
}
