import type { Snapshot, VisitRestrictionSummary } from "./types";
import { visitSummary } from "./visitRestrictions";
import { assignmentDeadline, addDays } from "./assignmentTiming";
import { coveragePriority, latestCompletedDates } from "./territoryCoverage";
import { displayDate } from "./dates";

export type MapPoint = [number, number]; // GeoJSON longitude, latitude (WGS84).
export interface MapGeometry {
  type: "MultiPolygon";
  coordinates: MapPoint[][][];
}
export interface MapShape {
  id: string;
  territory_id: string;
  geometry: MapGeometry;
  part_labels?: (string | null)[];
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
  visit_restriction_summary?: VisitRestrictionSummary[];
}
const EPS = 1e-13;
export const mapColors = {
  green: "#36a158",
  yellow: "#d6a20b",
  orange: "#ed852b",
  red: "#dd5059",
};
export type MapColorMode = "assignment" | "coverage";
export const mapStatusLegend = [
  {
    key: "available",
    label: "Disponible",
    description: "Sin asignación abierta ni descanso",
    color: "#36a158",
    rank: 4,
  },
  {
    key: "rest",
    label: "En descanso",
    description: "14 días desde la última finalización",
    color: "#7c5aa6",
    rank: 3,
  },
  {
    key: "assigned",
    label: "Abierto",
    description: "Faltan más de 14 días para el límite",
    color: "#2b76b7",
    rank: 2,
  },
  {
    key: "closing-soon",
    label: "Por vencer",
    description: "Faltan entre 1 y 14 días para el límite",
    color: "#d49b13",
    rank: 1,
  },
  {
    key: "limit",
    label: "Límite alcanzado",
    description: "Vence hoy o superó los 3 meses",
    color: "#d74958",
    rank: 0,
  },
  {
    key: "inactive",
    label: "Inactivo",
    description: "Territorio inactivo",
    color: "#81939c",
    rank: 5,
  },
] as const;
export type MapStatusKey = (typeof mapStatusLegend)[number]["key"];
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
export const MAX_MAP_VERTICES = 4096;

export function normalizePartLabels(
  value: unknown,
  parts: number,
): (string | null)[] {
  if (value == null) return Array.from({ length: parts }, () => null);
  if (!Array.isArray(value) || value.length > parts)
    throw new Error(
      "Indica una etiqueta opcional por cada parte del territorio.",
    );
  return Array.from({ length: parts }, (_, index) => {
    const item = value[index];
    if (item == null) return null;
    if (typeof item !== "string")
      throw new Error("La etiqueta de manzana debe ser texto.");
    const text = item.replace(/\s+/gu, " ").trim();
    if (Array.from(text).length > 40 || /[\u0000-\u001f\u007f]/u.test(text))
      throw new Error(
        "La etiqueta de manzana admite hasta 40 caracteres de texto.",
      );
    return text || null;
  });
}

// Keep labels inside concave parts instead of falling back to a boundary vertex.
export function partLabelPoint(ring: MapPoint[]): MapPoint {
  const center = geometryCenter({
    type: "MultiPolygon",
    coordinates: [[ring]],
  });
  if (center !== ring[0] && inside(center, ring)) return center;
  const ys = ring.map((p) => p[1]),
    min = Math.min(...ys),
    max = Math.max(...ys);
  let best: { width: number; point: MapPoint } | undefined;
  for (const fraction of [0.5, 0.25, 0.75, 0.125, 0.875]) {
    const y = min + (max - min) * fraction,
      xs: number[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i],
        b = ring[i + 1];
      if (a[1] > y !== b[1] > y)
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i];
      if (!best || width > best.width)
        best = { width, point: [(xs[i] + xs[i + 1]) / 2, y] };
    }
  }
  return best?.point ?? center;
}

export function mapChangeReasonError(reason: string) {
  const normalized = reason.replace(/\s+/gu, " ").trim();
  return Array.from(normalized).length < 8 || Array.from(reason).length > 2000
    ? "Escribe un motivo de entre 8 y 2000 caracteres para guardar el borrador."
    : "";
}

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
  let key: MapStatusKey = "available",
    detail = "Sin asignación abierta ni descanso pendiente.",
    deadline: string | null = null,
    availableOn: string | null = null,
    daysRemaining: number | null = null;
  if (!t.active) {
    key = "inactive";
    detail = "El territorio está inactivo.";
  } else if (t.assigned_at) {
    deadline = assignmentDeadline(t.assigned_at);
    daysRemaining = daysBetween(today, deadline);
    key =
      daysRemaining <= 0
        ? "limit"
        : daysRemaining <= 14
          ? "closing-soon"
          : "assigned";
    detail =
      daysRemaining < 0
        ? `El plazo de 3 meses se superó hace ${-daysRemaining} ${daysRemaining === -1 ? "día" : "días"}. Fecha límite: ${displayDate(deadline)}. Revisa el cierre de la asignación.`
        : daysRemaining === 0
          ? `Hoy, ${displayDate(deadline)}, se cumplen los 3 meses. Revisa el cierre de la asignación.`
          : `Fecha límite: ${displayDate(deadline)}. ${daysRemaining === 1 ? "Falta 1 día" : `Faltan ${daysRemaining} días`} para completar los 3 meses.`;
  } else if (t.last_completed && today < addDays(t.last_completed, 14)) {
    key = "rest";
    availableOn = addDays(t.last_completed, 14);
    daysRemaining = daysBetween(today, availableOn);
    detail = `Descanso de 14 días. Disponible desde el ${displayDate(availableOn)}; ${daysRemaining === 1 ? "falta 1 día" : `faltan ${daysRemaining} días`}.`;
  }
  const legend = mapStatusLegend.find((s) => s.key === key)!;
  const label =
    key === "limit"
      ? daysRemaining === 0
        ? "Vence hoy"
        : "Plazo de 3 meses superado"
      : legend.label;
  return { ...legend, label, detail, deadline, availableOn, daysRemaining };
}
export function mapTerritoryAppearance(
  t: MapTerritory,
  today: string,
  mode: MapColorMode,
) {
  const status = mapTerritoryStatus(t, today);
  if (mode === "assignment" || !t.active) return status;
  const priority = coveragePriority(t.last_completed, today);
  return { ...priority, color: mapColors[priority.color] };
}
export function compareMapTerritories(
  a: MapTerritory,
  b: MapTerritory,
  today: string,
  mode: MapColorMode,
  priority: boolean,
) {
  if (priority) {
    const difference =
      mapTerritoryAppearance(a, today, mode).rank -
      mapTerritoryAppearance(b, today, mode).rank;
    if (difference) return difference;
    const date = (t: MapTerritory) =>
      mode === "assignment"
        ? (mapTerritoryStatus(t, today).deadline ??
          mapTerritoryStatus(t, today).availableOn ??
          t.last_completed ??
          "")
        : (t.last_completed ?? "");
    const older = date(a).localeCompare(date(b));
    if (older) return older;
  }
  return a.territory_number - b.territory_number;
}
export interface MapImportRow {
  id: string;
  territory_number: number;
  expected_version: number;
  geometry: MapGeometry;
  part_labels?: (string | null)[];
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
    const geometry = normalizeMapGeometry(feature.geometry);
    if (
      feature.properties?.part_labels === undefined &&
      existing?.part_labels?.some(Boolean) &&
      JSON.stringify(existing.geometry.coordinates) !==
        JSON.stringify(geometry.coordinates)
    )
      throw new Error(
        `Incluye las etiquetas de cada parte para cambiar los límites del territorio ${n}.`,
      );
    return {
      id: existing?.id ?? crypto.randomUUID(),
      territory_number: n,
      expected_version: existing?.version ?? 0,
      geometry,
      part_labels: normalizePartLabels(
        feature.properties?.part_labels === undefined &&
          existing?.geometry.coordinates.length === geometry.coordinates.length
          ? existing.part_labels
          : feature.properties?.part_labels,
        geometry.coordinates.length,
      ),
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
          part_labels: normalizePartLabels(
            s.part_labels,
            s.geometry.coordinates.length,
          ),
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
          '</description><ExtendedData><Data name="part_labels"><value>' +
          xml(
            JSON.stringify(
              normalizePartLabels(s.part_labels, s.geometry.coordinates.length),
            ),
          ) +
          "</value></Data></ExtendedData><MultiGeometry>" +
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
    visit_restriction_summary: visitSummary(
      snapshot.visit_restrictions ?? [],
      today,
    ),
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
          part_labels: i === 0 ? ["A1"] : [null],
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
