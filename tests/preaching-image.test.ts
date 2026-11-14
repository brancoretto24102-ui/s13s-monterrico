import { describe, expect, it } from "vitest";
import {
  preachingDocument,
  preachingColumnWidths,
  layoutPreachingDocument,
  scheduleDocumentTime,
  scheduleShortDate,
  scheduleDisplayName,
  wrapScheduleText,
} from "../src/lib/preachingDocument";
import { smallestScheduleImage } from "../src/lib/preachingImage";
import { type PreachingWeek } from "../src/lib/preachingSchedule";

const week: PreachingWeek = {
  id: "synthetic",
  week_start: "2026-11-09",
  version: 1,
  rows: [
    {
      id: "a",
      day: 0,
      time: "08:00",
      meeting_point: "Punto sintético A",
      conductor_ids: ["c1", "c2"],
      conductor_names: ["CONDUCTOR SINTÉTICO A", "CONDUCTOR SINTÉTICO B"],
      territory_numbers: [73, 74],
      territories: [
        {
          territory_id: "private-id",
          reason: "Justificación privada que no se debe imprimir",
        },
      ],
    },
    {
      id: "b",
      day: 0,
      time: "19:20",
      meeting_point: "Punto sintético B",
      conductor_ids: ["c1"],
      conductor_names: ["Conductor sintético"],
      territories: [],
    },
    {
      id: "c",
      day: 3,
      time: "18:00",
      meeting_point: "Reunión virtual",
      conductor_ids: ["c1"],
      conductor_names: ["Conductor sintético"],
      territories: [],
    },
  ],
};
const measure = (text: string) => Array.from(text).length * 8;
describe("Imagen del cronograma", () => {
  it("exporta el campo del conductor vacío sin incluir advertencias para ambas audiencias", () => {
    const emptyWeek = {
      ...week,
      rows: [{ ...week.rows[0], conductor_ids: [], conductor_names: [] }],
    };
    for (const audience of ["conductors", "publishers"] as const) {
      const doc = preachingDocument(emptyWeek, audience, measure);
      expect(doc.rows[0].values.at(-1)).toBe("");
      expect(JSON.stringify(doc)).not.toMatch(
        /sin conductor|advertencia|pendiente/i,
      );
    }
  });
  it("calcula cada ancho con el texto visualmente más ancho, aunque tenga menos letras", () => {
    const proportional = (text: string) =>
      [...text].reduce((w, c) => w + (c === "W" ? 15 : c === "i" ? 1 : 4), 0);
    const base = preachingDocument(week, "conductors", proportional);
    const doc = preachingDocument(
      {
        ...week,
        rows: [
          { ...week.rows[0], meeting_point: "W".repeat(20) },
          { ...week.rows[1], meeting_point: "i".repeat(40) },
          week.rows[2],
        ],
      },
      "conductors",
      proportional,
    );
    expect(doc.widths[3]).toBe(316);
    expect(doc.widths[3]).toBeGreaterThan(base.widths[3]);
    expect(doc.widths.slice(0, 3)).toEqual(base.widths.slice(0, 3));
    expect(
      preachingColumnWidths(
        ["Campo"],
        [["Corto\nW".repeat(2)]],
        proportional,
      )[0],
    ).toBe(51);
  });
  it("reduce espacios vacíos al acortar el contenido y considera también los encabezados", () => {
    const full = preachingDocument(week, "conductors", measure);
    const short = preachingDocument(
      {
        ...week,
        rows: week.rows.map((r) => ({
          ...r,
          conductor_names: ["A"],
          meeting_point: "B",
        })),
      },
      "conductors",
      measure,
    );
    expect(short.widths[5]).toBe(measure("Conductor") + 16);
    expect(short.widths[5]).toBeLessThan(full.widths[5]);
    expect(short.widths[3]).toBe(measure("Punto de Reunión") + 16);
  });
  it("acota entradas extremas al límite seguro sin perder el texto al distribuirlo", () => {
    const doc = preachingDocument(
      {
        ...week,
        rows: [
          {
            ...week.rows[0],
            meeting_point: "WW ".repeat(800),
            conductor_names: ["Nombre ".repeat(400)],
          },
        ],
      },
      "conductors",
      measure,
    );
    expect(doc.widths.reduce((a, b) => a + b)).toBeLessThanOrEqual(4096);
    expect(doc.widths.every((w, i) => w >= measure(doc.headers[i]) + 16)).toBe(
      true,
    );
    const row = layoutPreachingDocument(doc, measure)[0].rows[0];
    expect(row.lines[3].join(" ").replace(/\s+/g, " ").trim()).toBe(
      doc.rows[0].values[3].trim(),
    );
  });
  it("deriva ambas versiones de las mismas salidas y omite territorios y motivos en publicadores", () => {
    const c = preachingDocument(week, "conductors", measure),
      p = preachingDocument(week, "publishers", measure);
    expect(c.headers).toEqual([
      "Día",
      "Fecha",
      "Hora",
      "Punto de Reunión",
      "Territorio",
      "Conductor",
    ]);
    expect(p.headers).toEqual([
      "Día",
      "Fecha",
      "Hora",
      "Punto de Reunión",
      "Conductor",
    ]);
    expect(c.rows.map((r) => r.id)).toEqual(p.rows.map((r) => r.id));
    expect(c.rows[0].values.slice(0, 5)).toEqual([
      "Lunes",
      "9 Nov",
      "8:00 a.m",
      "Punto sintético A",
      "T: 73 y 74",
    ]);
    expect(c.rows[0].values[5]).toBe(
      "Conductor Sintético A y Conductor Sintético B",
    );
    expect(c.rows[2].values[1]).toBe("12 Nov");
    expect(c.rows.some((r) => r.day === 2)).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/private-id|Justificación|T: 73/);
    expect(c.widths.every((w, i) => w >= measure(c.headers[i]) + 16)).toBe(
      true,
    );
    expect(p.widths).toHaveLength(5);
  });
  it("formatea fechas y horas del modelo con cambio de año, sin cambiar el registro", () => {
    expect(scheduleShortDate("2027-01-03")).toBe("3 Ene");
    expect(scheduleDocumentTime("19:20")).toBe("7:20 p.m");
    expect(scheduleDocumentTime("00:05")).toBe("12:05 a.m");
    expect(scheduleDocumentTime("12:00")).toBe("12:00 p.m");
    expect(scheduleDisplayName("ÁLVARO NÚÑEZ")).toBe("Álvaro Núñez");
    expect(scheduleDisplayName("S. EJEMPLO Y P. PRUEBA")).toBe(
      "S. Ejemplo Y P. Prueba",
    );
    expect(scheduleDisplayName("Nombre ya Formateado")).toBe(
      "Nombre ya Formateado",
    );
    expect(week.rows[0].conductor_names?.[0]).toBe("CONDUCTOR SINTÉTICO A");
  });
  it("ajusta texto largo, acentos, palabras sin espacios y saltos de línea sin recortarlos", () => {
    const text = "Ñ".repeat(40),
      lines = wrapScheduleText(text, 48, measure);
    expect(lines.join("")).toBe(text);
    expect(lines.every((line) => measure(line) <= 48)).toBe(true);
    expect(wrapScheduleText("Una línea\nOtra línea", 500, measure)).toEqual([
      "Una línea",
      "Otra línea",
    ]);
  });
  it("mantiene todo el contenido en imágenes sucesivas y repite espacio de encabezado", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ...week.rows[0],
      id: `row-${i}`,
      day: i % 7,
      meeting_point: "Punto de reunión sintético extenso ".repeat(8),
    }));
    const doc = preachingDocument({ ...week, rows }, "conductors", measure),
      pages = layoutPreachingDocument(doc, measure, 500);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.rows.map((r) => r.id))).toEqual(
      doc.rows.map((r) => r.id),
    );
    expect(pages.every((p) => p.height <= 500)).toBe(true);
    expect(
      pages
        .flatMap((p) => p.rows)
        .every((r) =>
          r.lines.every((ls, col) =>
            ls.every((line) => measure(line) <= doc.widths[col] - 8),
          ),
        ),
    ).toBe(true);
  });
  it("avisa si una sola salida no cabe antes de omitir contenido", () => {
    const doc = preachingDocument(
      {
        ...week,
        rows: [{ ...week.rows[0], meeting_point: "Palabra ".repeat(3000) }],
      },
      "conductors",
      measure,
    );
    expect(() => layoutPreachingDocument(doc, measure, 500)).toThrow(
      /demasiado texto/,
    );
  });
  it("elige PNG cuando ocupa menos, y JPG cuando ocupa menos, con extensión y MIME correctos", () => {
    const png = new Blob([new Uint8Array(40)], { type: "image/png" }),
      jpeg = new Blob([new Uint8Array(80)], { type: "image/jpeg" });
    expect(smallestScheduleImage(png, jpeg)).toEqual({
      blob: png,
      extension: "png",
    });
    const smallJpg = new Blob([new Uint8Array(20)], { type: "image/jpeg" });
    expect(smallestScheduleImage(png, smallJpg)).toEqual({
      blob: smallJpg,
      extension: "jpg",
    });
  });
  it("conserva PNG en un empate y reconoce la devolución PNG si JPEG no está soportado", () => {
    const png = new Blob(["a"], { type: "image/png" }),
      jpeg = new Blob(["a"], { type: "image/jpeg" });
    expect(smallestScheduleImage(png, jpeg).extension).toBe("png");
    expect(smallestScheduleImage(null, png).extension).toBe("png");
    expect(() =>
      smallestScheduleImage(null, new Blob(["a"], { type: "image/webp" })),
    ).toThrow(/generar/);
    expect(() =>
      smallestScheduleImage(new Blob([], { type: "image/png" }), null),
    ).toThrow(/generar/);
  });
});
