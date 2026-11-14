import { describe, expect, it } from "vitest";
import {
  assignableConductors,
  requireAssignableConductor,
  requireCorrectionConductor,
} from "../src/lib/conductors";
import { demoSnapshot } from "../src/lib/demo";

describe("selección obligatoria del maestro", () => {
  const rows = demoSnapshot().conductors!;
  it("rechaza el texto libre y las personas ajenas al maestro", () => {
    expect(() => requireAssignableConductor(rows, "")).toThrow(/maestro/);
    expect(() => requireAssignableConductor(rows, "nombre escrito")).toThrow(
      /maestro/,
    );
  });
  it("excluye inactivos y eliminados aunque conserven una identidad", () => {
    const changed = rows.map((row, i) => ({
      ...row,
      active: i !== 0,
      deleted_at: i === 1 ? "2026-01-01" : null,
    }));
    expect(assignableConductors(changed)).toHaveLength(rows.length - 2);
    for (const row of changed.slice(0, 2))
      expect(() => requireAssignableConductor(changed, row.person_id)).toThrow(
        /maestro/,
      );
  });
  it("busca nombres y códigos sin fusionar homónimos", () => {
    const homonyms = rows
      .slice(0, 2)
      .map((row) => ({ ...row, display_name: "Conductor sintético Á" }));
    expect(assignableConductors(homonyms, "sintetico a")).toHaveLength(2);
    expect(assignableConductors(homonyms, "C-0002")).toEqual([homonyms[1]]);
    expect(requireAssignableConductor(homonyms, homonyms[1].person_id)).toBe(
      homonyms[1],
    );
  });
  it("permite inactivos solo para corrección y conserva las identidades de homónimos", () => {
    const changed = rows
      .slice(0, 3)
      .map((c, i) => ({
        ...c,
        display_name: "Conductor homónimo",
        active: i === 0,
        deleted_at: i === 2 ? "2026-01-01" : null,
      }));
    expect(assignableConductors(changed)).toEqual([changed[0]]);
    expect(assignableConductors(changed, "homonimo", true)).toEqual(
      changed.slice(0, 2),
    );
    expect(requireCorrectionConductor(changed, changed[1].person_id)).toBe(
      changed[1],
    );
    expect(() =>
      requireAssignableConductor(changed, changed[1].person_id),
    ).toThrow();
    expect(() =>
      requireCorrectionConductor(changed, changed[2].person_id),
    ).toThrow();
    expect(() => requireCorrectionConductor(changed, "nombre libre")).toThrow();
  });
});
