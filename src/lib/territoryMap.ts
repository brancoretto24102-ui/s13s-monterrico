import type { Snapshot } from "./types";
import { assignmentDeadline, addDays } from "./assignmentTiming";
import { coveragePriority, latestCompletedDates } from "./territoryCoverage";

export type MapPoint = [number, number]; // GeoJSON longitude, latitude (WGS84).
export interface MapGeometry {
  type: "MultiPolygon";
  coordinates: MapPoint[][][];
}
export interface MapShape {
  id: string;
  territory_id: string;
  geometry: MapGeometry;
  source: string;
  source_hash: string | null;
  review_status: "draft" | "verified";
  reviewed_at: string | null;
  reviewed_by: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface MapTerritory {
  id: string;
  territory_number: number;
  active: boolean;
  description: string | null;
  last_completed: string | null;
  assigned_at: string | null;
}
export interface TerritoryMapContext {
  territories: MapTerritory[];
  shapes: MapShape[];
  revision: string;
}
const EPS = 1e-13;
export const mapColors = {
  green: "#36a158",
  yellow: "#d6a20b",
  orange: "#ed852b",
  red: "#dd5059",
};
export const MAX_MAP_VERTICES = 4096;

function orient(a: MapPoint, b: MapPoint, c: MapPoint) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function intersects(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  if (
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) - EPS ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) - EPS ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) - EPS ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1]) - EPS
  )
    return false;
  const sign = (n: number) => (n > EPS ? 1 : n < -EPS ? -1 : 0);
  return (
    sign(orient(a, b, c)) * sign(orient(a, b, d)) <= 0 &&
    sign(orient(c, d, a)) * sign(orient(c, d, b)) <= 0
  );
}
function inside(point: MapPoint, ring: MapPoint[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function area(ring: MapPoint[]) {
  const [x, y] = ring[0];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++)
    sum +=
      (ring[i][0] - x) * (ring[i + 1][1] - y) -
      (ring[i + 1][0] - x) * (ring[i][1] - y);
  return sum / 2;
}

export function normalizeMapGeometry(value: unknown): MapGeometry {
  if (!value || typeof value !== "object")
    throw new Error("Indica una geometría GeoJSON válida.");
  const input = value as { type?: unknown; coordinates?: unknown };
  if (input.type !== "Polygon" && input.type !== "MultiPolygon")
    throw new Error("Solo se admiten Polygon y MultiPolygon.");
  const polygons =
    input.type === "Polygon" ? [input.coordinates] : input.coordinates;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 64)
    throw new Error("El territorio debe tener entre 1 y 64 partes.");
  let vertices = 0;
  const coordinates: MapPoint[][][] = polygons.map((part) => {
    if (!Array.isArray(part) || part.length !== 1 || !Array.isArray(part[0]))
      throw new Error("Cada parte debe tener un contorno exterior sin huecos.");
    const inputRing = part[0];
    if (inputRing.length < 4 || inputRing.length > 513)
      throw new Error(
        "Cada contorno requiere entre 4 y 513 puntos, incluido el cierre.",
      );
    vertices += inputRing.length;
    if (vertices > MAX_MAP_VERTICES)
      throw new Error("El territorio supera el límite de 4096 puntos.");
    const ring: MapPoint[] = inputRing.map((p: unknown) => {
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n)) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 85
      )
        throw new Error(
          "Usa coordenadas WGS84 [longitud, latitud] válidas, sin altitud.",
        );
      return [p[0], p[1]];
    });
    if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1])
      throw new Error(
        "El primer y último punto deben coincidir para cerrar el contorno.",
      );
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
      if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1])
        throw new Error("Hay puntos consecutivos duplicados.");
      for (let j = i + 1; j < n; j++)
        if (
          j !== i + 1 &&
          !(i === 0 && j === n - 1) &&
          intersects(ring[i], ring[i + 1], ring[j], ring[j + 1])
        )
          throw new Error("El contorno se cruza o se toca a sí mismo.");
    }
    const signed = area(ring);
    if (Math.abs(signed) <= EPS)
      throw new Error("El contorno no tiene un área válida.");
    return [signed < 0 ? ring.reverse() : ring];
  });
  for (let i = 0; i < coordinates.length; i++)
    for (let j = i + 1; j < coordinates.length; j++) {
      const a = coordinates[i][0],
        b = coordinates[j][0];
      if (inside(a[0], b) || inside(b[0], a))
        throw new Error(
          "Las partes del mismo territorio no pueden superponerse.",
        );
      for (let k = 0; k < a.length - 1; k++)
        for (let l = 0; l < b.length - 1; l++)
          if (intersects(a[k], a[k + 1], b[l], b[l + 1]))
            throw new Error(
              "Las partes del mismo territorio deben estar separadas.",
            );
    }
  return { type: "MultiPolygon", coordinates };
}

export function geometryFromParts(parts: readonly MapPoint[][]) {
  return normalizeMapGeometry({
    type: "MultiPolygon",
    coordinates: parts.map((part) => [[...part, part[0]]]),
  });
}
export function geometryCenter(geometry: MapGeometry): MapPoint {
  // Use a point inside the largest part, rather than between distant islands.
  const ring = [...geometry.coordinates].sort(
    (a, b) => Math.abs(area(b[0])) - Math.abs(area(a[0])),
  )[0][0];
  const a = area(ring),
    [originX, originY] = ring[0];
  let x = 0,
    y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i][0] - originX,
      ay = ring[i][1] - originY,
      bx = ring[i + 1][0] - originX,
      by = ring[i + 1][1] - originY;
    const f = ax * by - bx * ay;
    x += (ax + bx) * f;
    y += (ay + by) * f;
  }
  const center: MapPoint = [originX + x / (6 * a), originY + y / (6 * a)];
  return Number.isFinite(center[0]) && inside(center, ring) ? center : ring[0];
}
export function googleMapsUrl(geometry: MapGeometry) {
  const [lng, lat] = geometryCenter(geometry);
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(7)},${lng.toFixed(7)}`;
}
export function mapTerritoryStatus(t: MapTerritory, today: string) {
  if (!t.active) return { key: "inactive", label: "Inactivo" };
  if (t.assigned_at)
    return today > assignmentDeadline(t.assigned_at)
      ? { key: "overdue", label: "Plazo de 3 meses vencido" }
      : { key: "assigned", label: "Asignado" };
  if (t.last_completed && today < addDays(t.last_completed, 14))
    return { key: "rest", label: "En descanso" };
  return { key: "available", label: "Disponible" };
}
export interface MapImportRow {
  id: string;
  territory_number: number;
  expected_version: number;
  geometry: MapGeometry;
}
export function prepareMapImport(
  text: string,
  context: TerritoryMapContext,
): MapImportRow[] {
  if (new TextEncoder().encode(text).length > 2_000_000)
    throw new Error("El archivo supera 2 MB.");
  let input: any;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es JSON válido.");
  }
  if (
    input?.type !== "FeatureCollection" ||
    !Array.isArray(input.features) ||
    !input.features.length ||
    input.features.length > 500
  )
    throw new Error(
      "Importa un FeatureCollection con entre 1 y 500 territorios.",
    );
  const seen = new Set<number>();
  return input.features.map((feature: any) => {
    if (feature?.type !== "Feature")
      throw new Error("Cada elemento debe ser un Feature GeoJSON.");
    const n = feature?.properties?.territory_number;
    if (!Number.isSafeInteger(n) || n < 1 || seen.has(n))
      throw new Error(
        "Cada elemento debe tener territory_number entero y sin duplicados.",
      );
    seen.add(n);
    const territory = context.territories.find(
      (t) => t.territory_number === n && t.active,
    );
    if (!territory)
      throw new Error(`El territorio ${n} no existe o está inactivo.`);
    const existing = context.shapes.find(
      (s) => s.territory_id === territory.id,
    );
    if (existing?.deleted_at)
      throw new Error(`Restaura primero el polígono del territorio ${n}.`);
    return {
      id: existing?.id ?? crypto.randomUUID(),
      territory_number: n,
      expected_version: existing?.version ?? 0,
      geometry: normalizeMapGeometry(feature.geometry),
    };
  });
}
export function mapFeatureCollection(
  shapes: MapShape[],
  territories: MapTerritory[],
) {
  return {
    type: "FeatureCollection",
    features: shapes
      .filter((s) => !s.deleted_at)
      .map((s) => ({
        type: "Feature",
        properties: {
          territory_number: territories.find((t) => t.id === s.territory_id)
            ?.territory_number,
          review_status: s.review_status,
          source: s.source,
        },
        geometry: s.geometry,
      })),
  };
}
export function mapKml(shapes: MapShape[], territories: MapTerritory[]) {
  const xml = (s: string) =>
    s.replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  return (
    '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Territorios</name>' +
    shapes
      .filter((s) => !s.deleted_at)
      .map(
        (s) =>
          "<Placemark><name>Territorio " +
          territories.find((t) => t.id === s.territory_id)?.territory_number +
          "</name><description>" +
          xml(
            s.review_status === "verified"
              ? "Límites revisados"
              : "Borrador: límites pendientes de revisión",
          ) +
          "</description><MultiGeometry>" +
          s.geometry.coordinates
            .map(
              (p) =>
                "<Polygon><outerBoundaryIs><LinearRing><coordinates>" +
                p[0].map(([lng, lat]) => `${lng},${lat},0`).join(" ") +
                "</coordinates></LinearRing></outerBoundaryIs></Polygon>",
            )
            .join("") +
          "</MultiGeometry></Placemark>",
      )
      .join("") +
    "</Document></kml>"
  );
}
export function demoMapContext(
  snapshot: Snapshot,
  today: string,
  shapes?: MapShape[],
): TerritoryMapContext {
  const latest = latestCompletedDates(snapshot.assignments, today),
    now = new Date().toISOString();
  const territories = snapshot.territories.map((t) => ({
    ...t,
    last_completed: latest.get(t.id) ?? null,
    assigned_at:
      snapshot.assignments.find(
        (a) => a.territory_id === t.id && !a.voided_at && !a.completed_at,
      )?.assigned_at ?? null,
  }));
  return {
    territories,
    revision: now,
    shapes:
      shapes ??
      territories.map((t, i) => {
        const x = -80.64 + (i % 10) * 0.001,
          y = -5.205 + Math.floor(i / 10) * 0.001;
        return {
          id: `synthetic-map-${i}`,
          territory_id: t.id,
          geometry: normalizeMapGeometry({
            type: "Polygon",
            coordinates: [
              [
                [x, y],
                [x + 0.0008, y],
                [x + 0.0008, y + 0.0008],
                [x, y + 0.0008],
                [x, y],
              ],
            ],
          }),
          source:
            "Cuadrícula ficticia para probar la interfaz; no procede del PDF",
          source_hash: null,
          review_status: "draft",
          reviewed_at: null,
          reviewed_by: null,
          version: 1,
          deleted_at: null,
          created_at: now,
          updated_at: now,
        };
      }),
  };
}
