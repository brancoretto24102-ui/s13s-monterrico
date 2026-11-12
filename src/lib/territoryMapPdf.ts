import {
  PDFDocument,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { displayDate } from "./dates";
import {
  mapColors,
  mapStatusLegend,
  mapTerritoryAppearance,
  mapTerritoryStatus,
  partLabelPoint,
  type MapColorMode,
  type MapShape,
  type MapTerritory,
  type MapPoint,
} from "./territoryMap";
import {
  atlasRegions,
  boundsIntersect,
  clipMapLine,
  insideBounds,
  labelOffsets,
  lineLength,
  linePoint,
  mapTransform,
  mergeStreetLines,
  placeMapLabel,
  pointBounds,
  projectMapPoint,
  type Bounds,
  type MapLabel,
  type Rect,
  type XY,
} from "./mapPdfLayout";

export interface MapPdfContext {
  territories: MapTerritory[];
  shapes: MapShape[];
}
export interface PublicMapFeature {
  kind: "road" | "waterway" | "building" | "water" | "green";
  road?: string;
  name?: string;
  points: MapPoint[];
}
export interface PublicBasemap {
  version: number;
  captured_at: string;
  attribution: string;
  license: string;
  features: PublicMapFeature[];
}
export interface MapPdfOptions {
  colorMode: MapColorMode;
  territoryIds: string[];
  includeDetails: boolean;
  includeBlocks: boolean;
}
export interface MapPdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}
export async function loadMapPdfFonts(
  signal?: AbortSignal,
): Promise<MapPdfFonts> {
  const load = async (name: string) => {
    const response = await fetch(
      `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/${name}`,
      { signal },
    );
    if (!response.ok)
      throw new Error(
        "No se pudieron cargar las fuentes del mapa PDF. Inténtalo de nuevo.",
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 512000)
      throw new Error("La fuente del mapa no es válida.");
    return bytes;
  };
  const [regular, bold] = await Promise.all([
    load("LiberationSans-Regular.ttf"),
    load("LiberationSans-Bold.ttf"),
  ]);
  return { regular, bold };
}
export interface MapPdfResult {
  bytes: Uint8Array;
  pages: number;
  territories: number;
  blocks: number;
  basemapDate: string;
  streetNames: number;
  labels: MapLabel[][];
}
type ProjectedFeature = PublicMapFeature & { xy: XY[]; bounds: Bounds };
const roadOrder: Record<string, number> = {
  motorway: 0,
  trunk: 0,
  primary: 1,
  secondary: 2,
  tertiary: 3,
  residential: 4,
  unclassified: 4,
  living_street: 4,
  service: 5,
  pedestrian: 5,
  footway: 6,
  path: 6,
  steps: 6,
  cycleway: 6,
};
const roadMeters: Record<string, number> = {
  motorway: 25,
  trunk: 24,
  primary: 21,
  secondary: 17,
  tertiary: 13,
  residential: 8,
  unclassified: 8,
  living_street: 7,
  service: 4.5,
  pedestrian: 4,
  footway: 2.5,
  path: 2.5,
  steps: 2.5,
  cycleway: 2.5,
};
const roadKind = (road?: string) => (road ?? "service").replace(/_link$/, "");
const roadRank = (road?: string) => roadOrder[roadKind(road)] ?? 5;
const ink = rgb(0.12, 0.23, 0.27),
  muted = rgb(0.38, 0.46, 0.49),
  white = rgb(1, 1, 1);
const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
const clean = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const supported = new WeakMap<PDFFont, Set<number>>();
function width(font: PDFFont, text: string, size: number) {
  try {
    let characters = supported.get(font);
    if (!characters) {
      characters = new Set(font.getCharacterSet());
      supported.set(font, characters);
    }
    if (
      Array.from(clean(text)).some(
        (char) => !characters.has(char.codePointAt(0)!),
      )
    )
      throw new Error("Carácter no disponible");
    return Array.from(clean(text)).reduce(
      (n, c) => n + font.widthOfTextAtSize(c, size),
      0,
    );
  } catch {
    throw new Error(
      `El mapa contiene un carácter no compatible con la fuente PDF. Revisa la referencia: ${text}`,
    );
  }
}
function svgPath(points: XY[], close = false) {
  return (
    points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${(-y).toFixed(2)}`)
      .join(" ") + (close ? " Z" : "")
  );
}
function text(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  maxWidth?: number,
  fill = ink,
) {
  const content = clean(value),
    length = width(font, content, size);
  page.drawText(content, {
    x,
    y,
    size: maxWidth && length > maxWidth ? (size * maxWidth) / length : size,
    font,
    color: fill,
  });
}
function wrap(font: PDFFont, value: string, size: number, limit: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of clean(value).split(" ")) {
    if (width(font, line ? `${line} ${word}` : word, size) <= limit)
      line += (line ? " " : "") + word;
    else {
      if (line) lines.push(line);
      line = "";
      for (const char of word) {
        if (width(font, line + char, size) > limit && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}
export function validatePublicBasemap(input: unknown): PublicBasemap {
  const b = input as PublicBasemap;
  if (
    !b ||
    b.version !== 1 ||
    b.license !== "ODbL-1.0" ||
    !/^\d{4}-\d\d-\d\dT/.test(b.captured_at) ||
    !Array.isArray(b.features) ||
    b.features.length > 10000
  )
    throw new Error("La base local de calles no tiene un formato válido.");
  let points = 0;
  for (const f of b.features) {
    if (
      !["road", "waterway", "building", "water", "green"].includes(f.kind) ||
      !Array.isArray(f.points) ||
      f.points.length < 2 ||
      f.points.length > 10000 ||
      (f.name && (typeof f.name !== "string" || f.name.length > 180))
    )
      throw new Error("Hay elementos no válidos en la base de calles.");
    points += f.points.length;
    if (points > 200000)
      throw new Error("La base de calles supera el tamaño permitido.");
    for (const point of f.points) {
      if (!Array.isArray(point) || point.length !== 2)
        throw new Error("Coordenadas de calle no válidas.");
      projectMapPoint(point);
    }
  }
  return b;
}
export async function loadPublicBasemap(signal?: AbortSignal) {
  const response = await fetch(
    `${import.meta.env.BASE_URL}map-assets/piura-streets-v1.json`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      "No se pudo cargar la base local de calles. Inténtalo de nuevo.",
    );
  const value = await response.text();
  if (value.length > 3_000_000)
    throw new Error("La base local de calles supera el tamaño permitido.");
  return validatePublicBasemap(JSON.parse(value));
}
function drawLabel(
  page: PDFPage,
  label: MapLabel,
  regular: PDFFont,
  bold: PDFFont,
) {
  const r = (label.angle * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r),
    font = label.kind === "territory" ? bold : regular;
  if (
    label.kind !== "street" &&
    Math.hypot(label.x - label.origin[0], label.y - label.origin[1]) > 12
  )
    page.drawLine({
      start: { x: label.origin[0], y: label.origin[1] },
      end: { x: label.x, y: label.y },
      thickness: 0.5,
      color: muted,
    });
  page.drawRectangle({
    x: label.x - (label.width * c) / 2 + (label.height * s) / 2,
    y: label.y - (label.width * s) / 2 - (label.height * c) / 2,
    width: label.width,
    height: label.height,
    rotate: degrees(label.angle),
    color: white,
    opacity: 0.94,
    ...(label.kind === "territory"
      ? { borderWidth: 0.6, borderColor: rgb(0.4, 0.54, 0.46) }
      : {}),
  });
  const tw = width(font, label.text, label.size);
  page.drawText(clean(label.text), {
    x: label.x - (tw * c) / 2 + label.size * 0.32 * s,
    y: label.y - (tw * s) / 2 - label.size * 0.32 * c,
    font,
    size: label.size,
    rotate: degrees(label.angle),
    color: ink,
  });
}
function header(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  title: string,
  today: string,
  count: number,
  demo: boolean,
) {
  const W = page.getWidth(),
    H = page.getHeight();
  page.drawRectangle({
    x: 36,
    y: H - 42,
    width: W - 72,
    height: 4,
    color: color("#36a158"),
  });
  text(page, bold, "Monterrico", 36, H - 82, 29);
  text(page, regular, title, 36, H - 108, 15);
  text(
    page,
    regular,
    `Piura, Perú | Corte: ${displayDate(today)} | ${count} ${count === 1 ? "territorio" : "territorios"}`,
    W - 430,
    H - 76,
    10,
    390,
    muted,
  );
  if (demo)
    text(
      page,
      bold,
      "DATOS FICTICIOS - MAPA DE PRUEBA",
      W - 430,
      H - 98,
      10,
      390,
      color("#a87818"),
    );
}
export async function generateTerritoryMapPdf(
  context: MapPdfContext,
  basemapInput: PublicBasemap,
  options: MapPdfOptions,
  today: string,
  fonts: MapPdfFonts,
  demo = false,
  onProgress?: (message: string) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<MapPdfResult> {
  const basemap = validatePublicBasemap(basemapInput),
    selected = new Set(options.territoryIds);
  if (!selected.size || selected.size > 500)
    throw new Error("Selecciona entre 1 y 500 territorios para el PDF.");
  const territories = context.territories
    .filter((t) => selected.has(t.id))
    .sort((a, b) => a.territory_number - b.territory_number);
  if (territories.length !== selected.size)
    throw new Error(
      "El catálogo cambió. Actualiza el mapa antes de generar el PDF.",
    );
  const shapes = context.shapes.filter(
    (s) => selected.has(s.territory_id) && !s.deleted_at,
  );
  if (!shapes.length)
    throw new Error("No hay polígonos vigentes en la selección.");
  const allPoints = shapes.flatMap((s) =>
    s.geometry.coordinates.flatMap((p) => p[0].map(projectMapPoint)),
  );
  if (allPoints.length > 200000)
    throw new Error("La selección es demasiado grande. Exporta por sectores.");
  const bounds = pointBounds(allPoints),
    regions = atlasRegions(bounds, options.includeDetails);
  const features: ProjectedFeature[] = basemap.features.map((f) => {
    const xy = f.points.map(projectMapPoint);
    return { ...f, xy, bounds: pointBounds(xy) };
  });
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true }),
    bold = await pdf.embedFont(fonts.bold, { subset: true });
  pdf.setTitle("Monterrico - Mapa de territorios y manzanas");
  pdf.setSubject(
    "Atlas vectorial privado de territorios; calles de OpenStreetMap bajo ODbL",
  );
  pdf.setCreator("Territorios - Monterrico");
  const labels: MapLabel[][] = [],
    blockPlaced = new Set<string>(),
    roadPages = new Map<string, Set<number>>();
  const check = () => {
    if (signal?.aborted)
      throw new DOMException("Generación cancelada.", "AbortError");
  };
  const projectedShapes = shapes.map((s) => ({
    shape: s,
    territory: territories.find((t) => t.id === s.territory_id)!,
    parts: s.geometry.coordinates.map((p) => p[0].map(projectMapPoint)),
    bounds: pointBounds(
      s.geometry.coordinates.flatMap((p) => p[0].map(projectMapPoint)),
    ),
  }));
  for (let pageIndex = 0; pageIndex < regions.length; pageIndex++) {
    check();
    await onProgress?.(
      `Preparando ${regions[pageIndex].title.toLocaleLowerCase("es")} (${pageIndex + 1}/${regions.length})…`,
    );
    const general = pageIndex === 0,
      page = pdf.addPage(general ? [2383.94, 1683.78] : [1683.78, 1190.55]);
    const W = page.getWidth(),
      H = page.getHeight(),
      frame = { x: 36, y: 90, width: W - 72, height: H - 285 },
      transform = mapTransform(regions[pageIndex].bounds, frame),
      xy = (p: XY) => transform.point(p);
    header(
      page,
      regular,
      bold,
      regions[pageIndex].title +
        (general && options.includeDetails ? " + sectores ampliados" : ""),
      today,
      territories.length,
      demo,
    );
    const legend =
      options.colorMode === "assignment"
        ? mapStatusLegend.filter(
            (s) => s.key !== "inactive" || territories.some((t) => !t.active),
          )
        : [
            { color: mapColors.green, label: "Menos de 4 meses" },
            { color: mapColors.yellow, label: "4 a menos de 8 meses" },
            { color: mapColors.orange, label: "8 a menos de 12 meses" },
            { color: mapColors.red, label: "12 meses o sin registro" },
          ];
    legend.forEach((item, i) => {
      const x = 36 + (i * (W - 72)) / legend.length;
      page.drawCircle({
        x: x + 5,
        y: H - 143,
        size: 4,
        color: color(item.color),
      });
      text(
        page,
        regular,
        item.label,
        x + 16,
        H - 146,
        10,
        (W - 72) / legend.length - 25,
      );
    });
    text(
      page,
      regular,
      options.colorMode === "assignment"
        ? "Descanso: 14 días. Alerta amarilla: 14 días antes de los 3 meses calendario. Rojo: vence hoy o superó el plazo."
        : "Antigüedad calculada desde la última finalización registrada. Los territorios inactivos se representan en gris.",
      36,
      H - 171,
      9,
      W - 72,
      muted,
    );
    page.drawRectangle({
      ...frame,
      color: color("#f6f5ef"),
      borderColor: color("#d9e1df"),
      borderWidth: 0.6,
    });
    page.pushOperators(
      pushGraphicsState(),
      rectangle(frame.x, frame.y, frame.width, frame.height),
      clip(),
      endPath(),
    );
    const visible = features.filter((f) =>
      boundsIntersect(f.bounds, transform.bounds),
    );
    for (const f of visible.filter(
      (f) => !["road", "waterway"].includes(f.kind),
    )) {
      const fill =
        f.kind === "building"
          ? "#e8e3db"
          : f.kind === "green"
            ? "#dcebd4"
            : "#d4e8f1";
      page.drawSvgPath(svgPath(f.xy.map(xy), true), {
        color: color(fill),
        borderColor: color(f.kind === "building" ? "#d6d0c7" : fill),
        borderWidth: 0.3,
      });
    }
    for (const f of visible.filter((f) => f.kind === "waterway"))
      page.drawSvgPath(svgPath(f.xy.map(xy)), {
        borderColor: color("#bcd8e5"),
        borderWidth: Math.max(1, 5 * transform.scale),
      });
    const roads = visible
      .filter((f) => f.kind === "road")
      .sort((a, b) => roadRank(b.road) - roadRank(a.road));
    for (const f of roads) {
      const path = svgPath(f.xy.map(xy)),
        thickness = Math.max(
          1,
          (roadMeters[roadKind(f.road)] ?? 5) * transform.scale,
        );
      page.drawSvgPath(path, {
        borderColor: color("#d8d3c7"),
        borderWidth: thickness + 1,
      });
      page.drawSvgPath(path, {
        borderColor: roadRank(f.road) <= 2 ? color("#fbe8b2") : white,
        borderWidth: thickness,
      });
    }
    const visibleShapes = projectedShapes.filter((s) =>
      boundsIntersect(s.bounds, transform.bounds),
    );
    for (const row of visibleShapes)
      for (const part of row.parts) {
        const fill = color(
          mapTerritoryAppearance(row.territory, today, options.colorMode).color,
        );
        page.drawSvgPath(svgPath(part.map(xy), true), {
          color: fill,
          opacity: 0.13,
          borderColor: fill,
          borderOpacity: 0.95,
          borderWidth: general ? 1.7 : 2,
          ...(row.shape.review_status === "draft"
            ? { borderDashArray: [5, 3] }
            : {}),
        });
      }
    const occupied: Rect[] = [
        {
          x: frame.x + frame.width - 65,
          y: frame.y + frame.height - 94,
          width: 65,
          height: 94,
        },
        { x: frame.x, y: frame.y, width: 220, height: 52 },
      ],
      pageLabels: MapLabel[] = [];
    for (const row of visibleShapes) {
      // A tag in each visible part retains ownership for separated blocks.
      for (let part = 0; part < row.shape.geometry.coordinates.length; part++) {
        const center = projectMapPoint(
          partLabelPoint(row.shape.geometry.coordinates[part][0]),
        );
        if (!insideBounds(center, transform.bounds)) continue;
        const origin = xy(center),
          number = String(row.territory.territory_number),
          label = placeMapLabel(
            number,
            origin,
            width(bold, number, 13),
            13,
            frame,
            occupied,
            "territory",
            labelOffsets,
          );
        if (label) pageLabels.push(label);
        const block = options.includeBlocks
          ? row.shape.part_labels?.[part]
          : null;
        if (!block) continue;
        const value = `Mz. ${block}`,
          blockLabel = placeMapLabel(
            value,
            origin,
            width(regular, value, general ? 9.5 : 11),
            general ? 9.5 : 11,
            frame,
            occupied,
            "block",
            [[0, -22], [0, 22], [26, 0], [-26, 0], ...labelOffsets],
          );
        if (blockLabel) {
          pageLabels.push(blockLabel);
          blockPlaced.add(`${row.shape.id}/${part}`);
        }
      }
    }
    const groups = new Map<string, { rank: number; lines: XY[][] }>();
    for (const road of roads) {
      if (!road.name) continue;
      const name = clean(road.name),
        item = groups.get(name) ?? { rank: roadRank(road.road), lines: [] };
      item.rank = Math.min(item.rank, roadRank(road.road));
      item.lines.push(...clipMapLine(road.xy, transform.bounds));
      groups.set(name, item);
    }
    for (const [name, group] of [...groups].sort(
      (a, b) => a[1].rank - b[1].rank,
    )) {
      const short = name
          .replace(/^Avenida /i, "Av. ")
          .replace(/^Jir[oó]n /i, "Jr. "),
        size = group.rank <= 2 ? 11 : general ? 8.5 : 9.5;
      const tw = width(regular, short, size);
      let count = 0;
      for (const line of mergeStreetLines(group.lines).sort(
        (a, b) => lineLength(b) - lineLength(a),
      )) {
        const length = lineLength(line),
          required = (tw + 12) / transform.scale;
        if (length < required) continue;
        for (const fraction of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const distance = length * fraction;
          if (Math.min(distance, length - distance) < required / 2) continue;
          const mid = linePoint(line, distance),
            a = linePoint(line, distance - required / 2),
            b = linePoint(line, distance + required / 2);
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < required * 0.87) continue;
          let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
          if (angle > 90) angle -= 180;
          if (angle < -90) angle += 180;
          const label = placeMapLabel(
            short,
            xy(mid),
            tw,
            size,
            frame,
            occupied,
            "street",
            [[0, 0]],
            angle,
          );
          if (!label) continue;
          pageLabels.push(label);
          const pages = roadPages.get(name) ?? new Set<number>();
          pages.add(pageIndex + 1);
          roadPages.set(name, pages);
          count++;
          break;
        }
        if (count >= 2) break;
      }
    }
    for (const label of pageLabels) drawLabel(page, label, regular, bold);
    page.pushOperators(popGraphicsState());
    // North arrow and scale are excluded from label placement.
    const nx = frame.x + frame.width - 30,
      ny = frame.y + frame.height - 50;
    page.drawLine({
      start: { x: nx, y: ny - 20 },
      end: { x: nx, y: ny + 15 },
      thickness: 1.2,
      color: ink,
    });
    page.drawLine({
      start: { x: nx, y: ny + 15 },
      end: { x: nx - 5, y: ny + 5 },
      thickness: 1.2,
      color: ink,
    });
    page.drawLine({
      start: { x: nx, y: ny + 15 },
      end: { x: nx + 5, y: ny + 5 },
      thickness: 1.2,
      color: ink,
    });
    text(page, bold, "N", nx - 4, ny + 23, 10);
    // Ground distance at Piura latitude, rather than uncorrected Mercator metres.
    const latitude = shapes[0].geometry.coordinates[0][0][0][1],
      groundFactor = Math.cos((latitude * Math.PI) / 180);
    const maximum = (170 * groundFactor) / transform.scale,
      metres =
        [20, 50, 100, 200, 500, 1000].filter((m) => m <= maximum).at(-1) ?? 10;
    const sx = frame.x + 15,
      sy = frame.y + 20,
      sw = (metres / groundFactor) * transform.scale;
    page.drawRectangle({
      x: sx - 8,
      y: sy - 9,
      width: sw + 28,
      height: 40,
      color: white,
      opacity: 0.9,
    });
    page.drawLine({
      start: { x: sx, y: sy },
      end: { x: sx + sw, y: sy },
      thickness: 2,
      color: ink,
    });
    for (const x of [sx, sx + sw])
      page.drawLine({
        start: { x, y: sy - 3 },
        end: { x, y: sy + 3 },
        thickness: 1,
        color: ink,
      });
    text(page, regular, "0", sx, sy + 10, 8);
    text(
      page,
      regular,
      `${metres} m`,
      sx + sw - width(regular, `${metres} m`, 8),
      sy + 10,
      8,
    );
    text(
      page,
      regular,
      "© OpenStreetMap contributors | ODbL 1.0 | https://www.openstreetmap.org/copyright",
      36,
      59,
      9,
      W - 72,
      muted,
    );
    text(
      page,
      regular,
      `Calles: instantánea del ${displayDate(basemap.captured_at.slice(0, 10))}. Bordes discontinuos: límites pendientes de revisión.`,
      36,
      42,
      9,
      W - 72,
      muted,
    );
    text(
      page,
      regular,
      "Las referencias completas y fechas se incluyen en el índice. Documento de acceso restringido.",
      36,
      25,
      9,
      W - 95,
      muted,
    );
    labels.push(pageLabels);
  }
  check();
  await onProgress?.("Preparando índice de territorios y manzanas…");
  const indexRows = territories.map((t) => {
    const shape = shapes.find((s) => s.territory_id === t.id),
      status = mapTerritoryStatus(t, today);
    return [
      String(t.territory_number),
      t.last_completed ? displayDate(t.last_completed) : "Sin registro",
      status.label,
      status.deadline
        ? `Límite: ${displayDate(status.deadline)}`
        : status.availableOn
          ? `Disponible: ${displayDate(status.availableOn)}`
          : "-",
      shape
        ? (options.includeBlocks
            ? shape.part_labels
                ?.map((label, i) => (label ? `Parte ${i + 1}: ${label}` : ""))
                .filter(Boolean)
                .join(" / ")
            : "") ||
          `${shape.geometry.coordinates.length} ${shape.geometry.coordinates.length === 1 ? "parte" : "partes"}`
        : "Sin polígono",
    ];
  });
  let page: PDFPage | null = null,
    y = 0;
  const columns = [36, 106, 255, 460, 660],
    widths = [60, 135, 190, 185, 490];
  for (const row of indexRows) {
    const cells = row.map((value, i) =>
        wrap(regular, value, 10, widths[i] - 12),
      ),
      height = Math.max(1, ...cells.map((x) => x.length)) * 14 + 15;
    if (!page || y - height < 70) {
      check();
      page = pdf.addPage([1190.55, 841.89]);
      header(
        page,
        regular,
        bold,
        "Índice de territorios y manzanas",
        today,
        territories.length,
        demo,
      );
      y = page.getHeight() - 150;
      [
        "Territorio",
        "Última predicación",
        "Estado",
        "Fecha operativa",
        "Manzanas / referencias",
      ].forEach((value, i) =>
        text(page!, bold, value, columns[i], y, 10, widths[i]),
      );
      y -= 18;
    }
    cells.forEach((lines, i) =>
      lines.forEach((value, j) =>
        text(
          page!,
          i === 0 ? bold : regular,
          value,
          columns[i],
          y - 12 - j * 14,
          10,
        ),
      ),
    );
    y -= height;
    page.drawLine({
      start: { x: 36, y: y + 3 },
      end: { x: 1154, y: y + 3 },
      thickness: 0.4,
      color: color("#dce5e0"),
    });
  }
  const pageCount = pdf.getPageCount();
  pdf
    .getPages()
    .forEach((p, i) =>
      text(
        p,
        regular,
        `${i + 1} / ${pageCount}`,
        p.getWidth() - 80,
        25,
        9,
        50,
        muted,
      ),
    );
  check();
  await onProgress?.("Terminando el PDF vectorial…");
  const bytes = await pdf.save({ useObjectStreams: true });
  check();
  return {
    bytes,
    pages: pageCount,
    territories: territories.length,
    blocks: options.includeBlocks
      ? shapes.reduce(
          (n, s) => n + (s.part_labels?.filter(Boolean).length ?? 0),
          0,
        )
      : 0,
    basemapDate: basemap.captured_at.slice(0, 10),
    streetNames: roadPages.size,
    labels,
  };
}
