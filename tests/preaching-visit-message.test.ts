import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PreachingVisitMessage from "../src/components/PreachingVisitMessage";
import { demoSnapshot } from "../src/lib/demo";
import { preachingVisitMessage } from "../src/lib/preachingVisitMessage";
import type { PreachingRow } from "../src/lib/preachingSchedule";
import type { VisitRestriction } from "../src/lib/types";

const monday = "2026-11-09";
const snapshot = demoSnapshot();
const context = {
  territories: snapshot.territories,
  conductors: snapshot.conductors!,
};
const base = snapshot.visit_restrictions![0];
const notices: VisitRestriction[] = [
  {
    ...base,
    territory_id: "demo-t1",
    address_reference: "Referencia sintética A",
    reported_on: "2026-01-01",
    eligible_on: "2027-01-01",
    code: 1,
  },
  {
    ...base,
    id: "second",
    territory_id: "demo-t1",
    address_reference: "Referencia sintética B",
    reported_on: "2026-01-01",
    eligible_on: "2027-01-01",
    code: 2,
  },
];
const row = (extra: Partial<PreachingRow> = {}): PreachingRow => ({
  id: "outing",
  day: 0,
  time: "08:00",
  meeting_point: "Punto sintético",
  conductor_ids: ["demo-conductor-1"],
  territories: [{ territory_id: "demo-t1", reason: "" }],
  ...extra,
});
const message = (rows: PreachingRow[], entries = notices) =>
  preachingVisitMessage(monday, rows, context, entries);

describe("Mensaje Casas No Tocar del cronograma", () => {
  it("reproduce el título de WhatsApp y agrupa todas las observaciones del territorio", () => {
    expect(message([row()])).toBe(
      "*_Casas No Tocar_*\n\n- 09/11/2026 - Territorio 1 - Conductor de ejemplo 01: Referencia sintética A; Referencia sintética B",
    );
  });
  it("omite completamente el conductor cuando no hay uno, aunque queden nombres antiguos", () => {
    expect(
      message([
        row({ conductor_ids: [], conductor_names: ["Nombre antiguo"] }),
      ]),
    ).toBe(
      "*_Casas No Tocar_*\n\n- 09/11/2026 - Territorio 1: Referencia sintética A; Referencia sintética B",
    );
  });
  it("incluye todos los conductores elegidos y conserva los nombres guardados de identidades históricas", () => {
    expect(
      message([
        row({ conductor_ids: ["demo-conductor-1", "demo-conductor-2"] }),
      ]),
    ).toContain("Conductor de ejemplo 01 y Conductor de ejemplo 02:");
    expect(
      message([
        row({
          conductor_ids: ["historical-id"],
          conductor_names: ["Nombre histórico"],
        }),
      ]),
    ).toContain(" - Nombre histórico:");
  });
  it("usa la fecha de cada salida, ordena cronológicamente y no duplica una misma línea sin hora", () => {
    const mondayRow = row();
    const laterMonday = row({ id: "evening", time: "19:20" });
    const tuesday = row({ id: "tuesday", day: 1 });
    const result = message([tuesday, laterMonday, mondayRow]);
    expect(
      result.split("\n").filter((line) => line.startsWith("- ")),
    ).toHaveLength(2);
    expect(result.indexOf("09/11/2026")).toBeLessThan(
      result.indexOf("10/11/2026"),
    );
    expect(
      message([
        mondayRow,
        row({ id: "other", conductor_ids: ["demo-conductor-2"] }),
      ])
        .split("\n")
        .filter((line) => line.startsWith("- ")),
    ).toHaveLength(2);
  });
  it("incluye solo avisos vigentes en la fecha programada, hasta el día anterior al aniversario", () => {
    const entries = [
      { ...notices[0], eligible_on: "2026-11-10" },
      { ...notices[1], active: false },
      { ...notices[1], id: "deleted", deleted_at: "2026-10-01" },
      { ...notices[1], id: "future", reported_on: "2026-11-12" },
      { ...notices[1], id: "expired", eligible_on: "2026-11-08" },
    ];
    expect(message([row()], entries)).toContain("Referencia sintética A");
    expect(message([row()], entries)).not.toContain("Referencia sintética B");
    expect(message([row({ day: 1 })], entries)).toBe(
      "*_Casas No Tocar_*\n\nNo tenemos en el cronograma de esta semana.",
    );
  });
  it("actualiza el contenido al retirar un territorio o desmarcar sus días", () => {
    expect(message([])).toBe(
      "*_Casas No Tocar_*\n\nNo tenemos en el cronograma de esta semana.",
    );
    expect(message([row({ territories: [] })])).toBe(message([]));
    expect(
      message([
        row({ territories: [{ territory_id: "demo-t2", reason: "" }] }),
      ]),
    ).toBe(message([]));
    expect(message([row()], [])).toBe(message([]));
  });
  it("preserva texto y acentos, mantiene cada observación en su línea y no modifica los registros", () => {
    const entries = [
      { ...notices[0], address_reference: "  Referencia Á\n  puerta azul  " },
    ];
    const before = JSON.stringify(entries);
    expect(message([row()], entries)).toContain(": Referencia Á puerta azul");
    expect(JSON.stringify(entries)).toBe(before);
  });
  it("impide mostrar y copiar direcciones sin permiso, sin afirmar que no hay avisos", () => {
    const html = renderToStaticMarkup(
      createElement(PreachingVisitMessage, {
        weekStart: monday,
        rows: [row()],
        context,
        restrictions: notices,
        canView: false,
        dirty: false,
      }),
    );
    expect(html).not.toContain("Referencia sintética");
    expect(html).not.toContain("No tenemos en el cronograma");
    expect(html).toContain("Necesitas el permiso");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it("distingue los datos pendientes de carga de una semana sin avisos, e identifica los cambios sin guardar", () => {
    const props = {
      weekStart: monday,
      rows: [row()],
      context,
      canView: true,
      dirty: true,
    };
    const waiting = renderToStaticMarkup(
      createElement(PreachingVisitMessage, props),
    );
    expect(waiting).toContain("Cargando avisos");
    expect(waiting).not.toContain("No tenemos en el cronograma");
    const ready = renderToStaticMarkup(
      createElement(PreachingVisitMessage, { ...props, restrictions: [] }),
    );
    expect(ready).toContain("No tenemos en el cronograma de esta semana.");
    expect(ready).toContain("cambios sin guardar");
    expect(ready).toContain("<strong><em>Casas No Tocar</em></strong>");
    expect(ready).toMatch(/readonly=""/i);
  });
});
