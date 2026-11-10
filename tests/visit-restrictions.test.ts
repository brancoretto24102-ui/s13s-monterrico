import { describe, expect, it } from "vitest";
import {
  eligibleVisitDate,
  validateVisitRestriction,
  visitRestrictionState,
  visitSummary,
} from "../src/lib/visitRestrictions";
import { analyzeVisitSheet } from "../src/lib/visitImport";
import { demoSnapshot } from "../src/lib/demo";
const headers = ["FECHA INFORMADA", "TERRITORIO", "OBSERVACIÓN"];
describe("Domicilios que no desean visitas", () => {
  it("cumple un año en el aniversario, incluido el primer día del año", () => {
    expect(eligibleVisitDate("2026-01-01")).toBe("2027-01-01");
    expect(eligibleVisitDate("2023-03-01")).toBe("2024-03-01");
    expect(eligibleVisitDate("2024-02-29")).toBe("2025-02-28");
  });
  it("cambia de No visitar a Plazo cumplido exactamente en la fecha indicada", () => {
    const row = {
      ...demoSnapshot().visit_restrictions![0],
      eligible_on: "2027-01-01",
    };
    expect(visitRestrictionState(row, "2026-12-31")).toBe("blocking");
    expect(visitRestrictionState(row, "2027-01-01")).toBe("eligible");
    expect(visitRestrictionState(row, "2027-01-02")).toBe("eligible");
  });
  it("excluye archivados y papelera de las alertas sin borrar el registro", () => {
    const rows = demoSnapshot()
      .visit_restrictions!.slice(0, 3)
      .map((row, i) => ({
        ...row,
        territory_id: "t1",
        eligible_on: "2026-01-01",
        active: i !== 1,
        deleted_at: i === 2 ? "2026-01-01" : null,
      }));
    expect(visitSummary(rows, "2026-01-01")).toEqual([
      { territory_id: "t1", blocking_count: 0, eligible_count: 1 },
    ]);
    expect(rows).toHaveLength(3);
  });
  it("rechaza fechas futuras, fechas imposibles y referencias vacías", () => {
    expect(() =>
      validateVisitRestriction(
        "Referencia sintética",
        "2027-01-01",
        "2026-01-01",
      ),
    ).toThrow(/futura/);
    expect(() => eligibleVisitDate("2026-02-29")).toThrow();
    expect(() => validateVisitRestriction("  ", "2026-01-01")).toThrow();
  });
  it("no cuenta el encabezado como un domicilio ni crea registros para filas vacías", () => {
    const rows = analyzeVisitSheet(
      [
        headers,
        ["01/01/2026", 1, "Domicilio sintético A"],
        [null, null, null],
        ["02/01/2026", 2, "Domicilio sintético B"],
        ["03/01/2026", 3, "Domicilio sintético C"],
      ],
      "2026-11-10",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      reported_on: "2026-01-01",
      eligible_on: "2027-01-01",
      source_reference: "NO TOCAR!A2:C2",
    });
  });
  it("detecta duplicados y datos incompletos antes de preparar una importación", () => {
    expect(() =>
      analyzeVisitSheet(
        [
          headers,
          ["01/01/2026", 1, "Casa de ejemplo"],
          ["02/01/2026", 1, "  CASA  DE EJEMPLO "],
        ],
        "2026-11-10",
      ),
    ).toThrow(/repetido/);
    expect(() =>
      analyzeVisitSheet([headers, [null, 1, "Casa de ejemplo"]], "2026-11-10"),
    ).toThrow(/falta/);
    expect(() =>
      analyzeVisitSheet([["OTRO"], ["01/01/2026", 1, "Casa de ejemplo"]]),
    ).toThrow(/column|contener/);
  });
});
