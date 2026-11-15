import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../src/lib/demo";
import {
  preachingTimes,
  scheduleRowTime,
  scheduleErrors,
  scheduleDefaults,
  sortedPreachingRows,
  type PreachingContext,
  type PreachingRow,
} from "../src/lib/preachingSchedule";
import {
  preachingDocument,
  layoutPreachingDocument,
} from "../src/lib/preachingDocument";
import { preachingVisitMessage } from "../src/lib/preachingVisitMessage";

const snapshot = demoSnapshot();
const monday = "2026-11-16";
const context: PreachingContext = {
  schedule: null,
  previous: null,
  template: [],
  revision: "",
  territories: snapshot.territories,
  conductors: snapshot.conductors!,
  assignments: [],
};
const row = (extra: Partial<PreachingRow> = {}): PreachingRow => ({
  id: "a",
  day: 3,
  time: "18:00",
  additional_times: ["19:10"],
  meeting_point: "Punto sintético",
  conductor_ids: ["demo-conductor-1"],
  conductor_names: ["Conductor sintético"],
  territory_numbers: [1],
  territories: [{ territory_id: "demo-t1", reason: "" }],
  ...extra,
});

describe("Varios horarios en una misma salida", () => {
  it("mantiene compatibles las salidas antiguas y ordena las horas sin modificar el original", () => {
    expect(preachingTimes({ time: "18:00" })).toEqual(["18:00"]);
    const outing = row({ time: "19:10", additional_times: ["18:00"] });
    const before = JSON.stringify(outing);
    expect(preachingTimes(outing)).toEqual(["18:00", "19:10"]);
    expect(scheduleRowTime(outing)).toBe("6:00 p.m. y 7:10 p.m.");
    expect(JSON.stringify(outing)).toBe(before);
    expect(
      sortedPreachingRows([
        row({ id: "earlier", time: "18:30", additional_times: [] }),
        outing,
      ])[0].id,
    ).toBe("a");
  });
  it("admite horarios compartidos y conductores opcionales", () => {
    expect(scheduleErrors([row()], context, monday)).toEqual([]);
    expect(
      scheduleErrors(
        [row({ conductor_ids: [], conductor_names: [] })],
        context,
        monday,
      ),
    ).toEqual([]);
  });
  it("rechaza horarios vacíos, repetidos, inválidos y más de ocho horas en una salida", () => {
    for (const times of [[""], ["25:00"], ["18:00"]])
      expect(
        scheduleErrors([row({ additional_times: times })], context, monday)
          .length,
      ).toBeGreaterThan(0);
    expect(
      scheduleErrors(
        [
          row({
            additional_times: Array.from({ length: 8 }, (_, i) => `0${i}:00`),
          }),
        ],
        context,
        monday,
      ).join(" "),
    ).toMatch(/8 horarios/);
  });
  it("detecta reservas duplicadas en cualquiera de las horas adicionales", () => {
    expect(
      scheduleErrors(
        [
          row(),
          row({
            id: "b",
            time: "19:10",
            additional_times: [],
            territories: [],
          }),
        ],
        context,
        monday,
      ).join(" "),
    ).toMatch(/conductor tiene dos salidas/);
    expect(
      scheduleErrors(
        [
          row(),
          row({
            id: "b",
            time: "20:00",
            additional_times: ["19:10"],
            territories: [],
          }),
        ],
        context,
        monday,
      ).join(" "),
    ).toMatch(/conductor tiene dos salidas/);
    expect(
      scheduleErrors(
        [
          row(),
          row({
            id: "b",
            time: "19:10",
            additional_times: [],
            conductor_ids: ["demo-conductor-2"],
          }),
        ],
        context,
        monday,
      ).join(" "),
    ).toMatch(/territorio 1 se repite/);
    expect(
      scheduleErrors(
        [
          row(),
          row({
            id: "b",
            time: "19:10",
            additional_times: [],
            conductor_ids: ["demo-conductor-2"],
            territories: [{ territory_id: "demo-t2", reason: "" }],
          }),
        ],
        context,
        monday,
      ),
    ).toEqual([]);
  });
  it("muestra ambas horas en una sola celda y conserva una sola referencia de reunión, territorio y conductor", () => {
    for (const audience of ["conductors", "publishers"] as const) {
      const doc = preachingDocument(
        { id: "week", week_start: monday, version: 1, rows: [row()] },
        audience,
        (text) => text.length * 8,
      );
      expect(doc.rows).toHaveLength(1);
      expect(doc.rows[0].values[2]).toBe("6:00 p.m\n7:10 p.m");
      expect(doc.rows[0].values[3]).toBe("Punto sintético");
      expect(doc.rows[0].values.at(-1)).toBe("Conductor sintético");
      const pages = layoutPreachingDocument(doc, (text) => text.length * 8);
      expect(pages[0].rows[0].lines[2]).toEqual(["6:00 p.m", "7:10 p.m"]);
      expect(pages[0].rows[0].height).toBeGreaterThanOrEqual(44);
    }
  });
  it("conserva los horarios al preparar la siguiente semana", () => {
    const initial = row({ territories: [] });
    const defaults = scheduleDefaults(
      {
        ...context,
        previous: {
          id: "previous",
          week_start: "2026-11-09",
          version: 1,
          rows: [initial],
        },
      },
      monday,
    );
    expect(defaults.rows[0].additional_times).toEqual(["19:10"]);
  });
  it("no duplica el mensaje Casas No Tocar por los horarios de una misma salida", () => {
    const notice = {
      ...snapshot.visit_restrictions![0],
      reported_on: "2026-01-01",
      eligible_on: "2027-01-01",
    };
    expect(
      preachingVisitMessage(monday, [row()], context, [notice])
        .split("\n")
        .filter((line) => line.startsWith("- ")),
    ).toEqual([
      "- 19/11/2026 - Territorio 1 - Conductor de ejemplo 01: Domicilio de ejemplo A",
    ]);
  });
});
