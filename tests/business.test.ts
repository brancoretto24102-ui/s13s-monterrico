import { describe, it, expect } from "vitest";
import {
  customPeriod,
  currentPeriod,
  servicePeriod,
  todayLima,
  parseExcelDate,
  isDate,
} from "../src/lib/dates";
import { reportRows, reportSummary, sequenceErrors } from "../src/lib/report";
import { analyzeWorkbook } from "../src/lib/importer";
import type { Assignment, Territory } from "../src/lib/types";
const now = new Date("2026-11-09T18:00:00Z");
const t: Territory = {
  id: "t1",
  territory_number: 1,
  active: true,
  description: null,
  version: 1,
};
const assignment = (
  start: string,
  complete: string | null,
  id = start,
): Assignment => ({
  id,
  territory_id: "t1",
  assigned_at: start,
  completed_at: complete,
  assigned_name_snapshot: "Persona sintética",
  version: 1,
});
describe("Fechas sin desplazamiento horario", () => {
  it("calcula el día peruano cerca de medianoche UTC", () =>
    expect(todayLima(new Date("2026-11-10T02:00:00Z"))).toBe("2026-11-09"));
  it("convierte serial Excel y texto", () => {
    expect(parseExcelDate(46263)).toBe("2026-08-29");
    expect(parseExcelDate("29/08/2026")).toBe("2026-08-29");
    expect(parseExcelDate(new Date("2026-08-29T00:00:00Z"))).toBe("2026-08-29");
  });
  it("rechaza fechas imposibles, seriales con hora y el falso 29 de febrero de 1900", () => {
    expect(isDate("2026-02-30")).toBe(false);
    expect(() => parseExcelDate("31/02/2026")).toThrow();
    expect(() => parseExcelDate(60)).toThrow();
    expect(() => parseExcelDate(46263.5)).toThrow();
  });
  it("permite cierre el mismo día", () =>
    expect(sequenceErrors([assignment("2026-02-02", "2026-02-02")])).toEqual(
      [],
    ));
  it("rechaza reasignar el mismo día y sin cierre", () => {
    expect(
      sequenceErrors([
        assignment("2026-02-02", "2026-02-03"),
        assignment("2026-02-03", null),
      ]),
    ).toHaveLength(1);
    expect(
      sequenceErrors([
        assignment("2026-02-02", null),
        assignment("2026-02-04", null),
      ]),
    ).toHaveLength(1);
  });
});
describe("Periodos", () => {
  it("año estricto de septiembre a agosto", () => {
    expect(servicePeriod(2025, now)).toMatchObject({
      start: "2025-09-01",
      end: "2026-08-31",
      label: "2025-2026",
    });
    expect(servicePeriod(2026, now).end).toBe("2027-08-31");
  });
  it("congela el rótulo de actualidad", () =>
    expect(currentPeriod("2026-06", now)).toMatchObject({
      start: "2026-06-01",
      end: "2026-11-09",
      label: "Junio 2026-Noviembre 2026 (Actualidad: 09/11/2026)",
    }));
  it("valida rangos y fechas futuras", () => {
    expect(() => customPeriod("2026-06-02", "2026-06-01", now)).toThrow();
    expect(() => currentPeriod("2027-01", now)).toThrow();
    expect(() => customPeriod("2026-10-01", "2026-12-01", now)).toThrow();
  });
});
describe("Distribución y cierres S-13-S", () => {
  const p = customPeriod("2026-06-01", "2026-11-09", now);
  it("un cierre previo actualiza última fecha, sin imprimir otra asignación", () => {
    const rows = reportRows([t], [assignment("2026-05-01", "2026-06-05")], p);
    expect(rows[0]).toMatchObject({
      lastCompleted: "2026-06-05",
      provenance: "en_periodo",
      assignments: [],
    });
  });
  it("recupera todo el historial previo y excluye cierres futuros al corte", () => {
    const rows = reportRows(
      [t],
      [
        assignment("2025-01-01", "2025-01-10"),
        assignment("2026-06-01", "2026-11-10"),
      ],
      p,
    );
    expect(rows[0].lastCompleted).toBe("2025-01-10");
    expect(rows[0].assignments[0].completed_at).toBeNull();
  });
  it("17 asignaciones ocupan cinco filas sin repetir última fecha", () => {
    const history = Array.from({ length: 17 }, (_, i) =>
      assignment(
        `2026-06-${String(i + 1).padStart(2, "0")}`,
        `2026-06-${String(i + 1).padStart(2, "0")}`,
      ),
    );
    const r = reportRows([t], history, p);
    expect(r).toHaveLength(5);
    expect(r.map((r) => r.assignments.length)).toEqual([4, 4, 4, 4, 1]);
    expect(r.filter((r) => r.lastCompleted)).toHaveLength(1);
  });
  it("la continuación cruza página sin repetir última fecha", () => {
    const history = Array.from({ length: 81 }, (_, i) =>
      assignment("2026-06-01", "2026-06-02", String(i)),
    );
    const r = reportRows([t], history, p);
    expect(reportSummary(r)).toMatchObject({
      rows: 21,
      pages: 2,
      assignments: 81,
    });
    expect(r[20]).toMatchObject({
      continuation: true,
      lastCompleted: null,
      territory_number: 1,
    });
  });
  it("incluye 82 territorios aun con cero asignaciones", () => {
    const ts = Array.from({ length: 82 }, (_, i) => ({
      ...t,
      id: `t${i}`,
      territory_number: i + 1,
    }));
    expect(
      reportSummary(reportRows(ts, [], servicePeriod(2029, now))),
    ).toMatchObject({ rows: 82, pages: 5, assignments: 0 });
  });
  it("los extremos del rango son inclusivos", () =>
    expect(
      reportSummary(
        reportRows(
          [t],
          [assignment(p.start, p.start), assignment(p.end, null)],
          p,
        ),
      ).assignments,
    ).toBe(2));
});
describe("Previsualización Excel", () => {
  it("informa parciales y números inconsistentes sin inventar registros", () => {
    const sheets = [
      {
        sheet: "S-13-S",
        data: Array.from({ length: 172 }, () => Array(56).fill(null)),
      },
    ];
    sheets[0].data[8][3] = "Persona sintética";
    const r = analyzeWorkbook(sheets, "synthetic.xlsx", "a".repeat(64));
    expect(r.rows).toHaveLength(0);
    expect(r.issues.some((i) => i.message.includes("parcial"))).toBe(true);
  });
});
