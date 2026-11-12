import type { MapPoint } from "./territoryMap";

export type XY = [number, number];
export type Bounds = [number, number, number, number];
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MapLabel {
  text: string;
  x: number;
  y: number;
  angle: number;
  size: number;
  width: number;
  height: number;
  rect: Rect;
  kind: "territory" | "block" | "street";
  origin: XY;
}

export function projectMapPoint([lng, lat]: MapPoint): XY {
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 85
  )
    throw new Error("Coordenadas cartográficas no válidas.");
  return [
    (lng * 20037508.342789244) / 180,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 6378137,
  ];
}
export function pointBounds(points: XY[]): Bounds {
  if (!points.length) throw new Error("El mapa no contiene puntos.");
  return points.reduce<Bounds>(
    (b, [x, y]) => [
      Math.min(b[0], x),
      Math.min(b[1], y),
      Math.max(b[2], x),
      Math.max(b[3], y),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}
export function boundsIntersect(a: Bounds, b: Bounds) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
export function insideBounds([x, y]: XY, b: Bounds, padding = 0) {
  return (
    x >= b[0] + padding &&
    x <= b[2] - padding &&
    y >= b[1] + padding &&
    y <= b[3] - padding
  );
}
export function expandBounds(b: Bounds, fraction: number): Bounds {
  const dx = Math.max(30, (b[2] - b[0]) * fraction),
    dy = Math.max(30, (b[3] - b[1]) * fraction);
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}
export function atlasRegions(bounds: Bounds, details: boolean) {
  const regions = [
    { title: "Mapa general", bounds: expandBounds(bounds, 0.04) },
  ];
  if (!details) return regions;
  const [left, bottom, right, top] = bounds,
    mx = (left + right) / 2,
    my = (bottom + top) / 2;
  return regions.concat([
    {
      title: "Sector noroeste",
      bounds: expandBounds([left, my, mx, top], 0.08),
    },
    {
      title: "Sector noreste",
      bounds: expandBounds([mx, my, right, top], 0.08),
    },
    {
      title: "Sector suroeste",
      bounds: expandBounds([left, bottom, mx, my], 0.08),
    },
    {
      title: "Sector sureste",
      bounds: expandBounds([mx, bottom, right, my], 0.08),
    },
  ]);
}
export function mapTransform(region: Bounds, frame: Rect) {
  const scale = Math.min(
    frame.width / Math.max(1, region[2] - region[0]),
    frame.height / Math.max(1, region[3] - region[1]),
  );
  const x = (region[0] + region[2]) / 2 - frame.width / scale / 2;
  const y = (region[1] + region[3]) / 2 - frame.height / scale / 2;
  return {
    scale,
    bounds: [x, y, x + frame.width / scale, y + frame.height / scale] as Bounds,
    point: ([px, py]: XY): XY => [
      frame.x + (px - x) * scale,
      frame.y + (py - y) * scale,
    ],
  };
}
export function rectanglesOverlap(a: Rect, b: Rect, gap = 1.5) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
export function rotatedLabelRect(
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0,
): Rect {
  const r = (angle * Math.PI) / 180,
    w = Math.abs(Math.cos(r)) * width + Math.abs(Math.sin(r)) * height,
    h = Math.abs(Math.sin(r)) * width + Math.abs(Math.cos(r)) * height;
  return { x: x - w / 2, y: y - h / 2, width: w, height: h };
}
export function placeMapLabel(
  text: string,
  origin: XY,
  width: number,
  size: number,
  frame: Rect,
  occupied: Rect[],
  kind: MapLabel["kind"],
  candidates: XY[] = [[0, 0]],
  angle = 0,
): MapLabel | null {
  const height = size + 6,
    totalWidth = width + 8;
  for (const [dx, dy] of candidates) {
    const x = origin[0] + dx,
      y = origin[1] + dy,
      rect = rotatedLabelRect(x, y, totalWidth, height, angle);
    if (
      rect.x < frame.x + 3 ||
      rect.y < frame.y + 3 ||
      rect.x + rect.width > frame.x + frame.width - 3 ||
      rect.y + rect.height > frame.y + frame.height - 3 ||
      occupied.some((r) => rectanglesOverlap(rect, r))
    )
      continue;
    occupied.push(rect);
    return {
      text,
      origin,
      x,
      y,
      angle,
      size,
      width: totalWidth,
      height,
      rect,
      kind,
    };
  }
  return null;
}
export const labelOffsets: XY[] = [
  [0, 0],
  [0, 20],
  [0, -20],
  [23, 0],
  [-23, 0],
  [23, 23],
  [-23, -23],
  [38, 0],
  [-38, 0],
  [0, 38],
  [0, -38],
  [38, 30],
  [-38, -30],
];

export function lineLength(points: XY[]) {
  return points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
      0,
    );
}
export function linePoint(points: XY[], distance: number): XY {
  let left = distance;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= length && length)
      return [
        a[0] + ((b[0] - a[0]) * left) / length,
        a[1] + ((b[1] - a[1]) * left) / length,
      ];
    left -= length;
  }
  return points.at(-1)!;
}
// Join public OSM ways with exactly shared endpoints, preserving street names.
export function mergeStreetLines(lines: XY[][]) {
  const result = lines.map((line) => [...line]);
  const same = (a: XY, b: XY) =>
    Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02;
  for (let i = 0; i < result.length; i++) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = i + 1; j < result.length; j++) {
        let a = result[i],
          b = result[j];
        if (same(a[0], b[0])) a = [...a].reverse();
        else if (same(a.at(-1)!, b.at(-1)!)) b = [...b].reverse();
        if (same(a.at(-1)!, b[0])) result[i] = [...a, ...b.slice(1)];
        else if (same(b.at(-1)!, a[0])) result[i] = [...b, ...a.slice(1)];
        else continue;
        result.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

export function clipMapLine(points: XY[], b: Bounds): XY[][] {
  const result: XY[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      z = points[i],
      dx = z[0] - a[0],
      dy = z[1] - a[1];
    let low = 0,
      high = 1,
      visible = true;
    const p = [-dx, dx, -dy, dy],
      q = [a[0] - b[0], b[2] - a[0], a[1] - b[1], b[3] - a[1]];
    for (let k = 0; k < 4; k++) {
      if (!p[k]) {
        if (q[k] < 0) visible = false;
      } else if (p[k] < 0) low = Math.max(low, q[k] / p[k]);
      else high = Math.min(high, q[k] / p[k]);
    }
    if (!visible || low > high) continue;
    const start: XY = [a[0] + dx * low, a[1] + dy * low],
      end: XY = [a[0] + dx * high, a[1] + dy * high];
    const last = result.at(-1),
      previous = last?.at(-1);
    if (
      previous &&
      Math.hypot(previous[0] - start[0], previous[1] - start[1]) < 0.001
    )
      last!.push(end);
    else result.push([start, end]);
  }
  return result;
}
