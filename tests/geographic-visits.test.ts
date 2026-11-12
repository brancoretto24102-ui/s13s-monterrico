import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/client", () => ({ rpc: vi.fn() }));
import { TerritoryVisitNotice } from "../src/components/VisitRestrictionsPanel";
import { demoMapContext } from "../src/lib/territoryMap";
import { visitSummary } from "../src/lib/visitRestrictions";
import type { VisitRestriction, Snapshot } from "../src/lib/types";
const today = "2026-11-11";
const row: VisitRestriction = {
  id: "v",
  code: 1,
  territory_id: "t",
  address_reference: "PRIVATE_ADDRESS_SENTINEL",
  reported_on: "2026-01-01",
  eligible_on: "2027-01-01",
  active: true,
  deleted_at: null,
  version: 1,
  created_at: "",
  updated_at: "",
};
const render = (canView: boolean, rows = [row]) =>
  renderToStaticMarkup(
    createElement(TerritoryVisitNotice, {
      rows,
      summary: visitSummary(rows, today).find((s) => s.territory_id === "t"),
      territoryId: "t",
      today,
      canView,
    }),
  );
describe("Avisos de domicilios en el mapa", () => {
  it("muestra el aviso agregado sin revelar direcciones a quien no puede consultarlas", () => {
    const html = render(false);
    expect(html).toContain("no visitar");
    expect(html).not.toContain(row.address_reference);
  });
  it("permite consultar la referencia y la fecha solo con el permiso de visualización", () => {
    const html = render(true);
    expect(html).toContain(row.address_reference);
    expect(html).toContain("01/01/2027");
  });
  it("excluye las solicitudes archivadas y en papelera", () => {
    const html = render(true, [
      { ...row, active: false },
      { ...row, id: "deleted", deleted_at: "2026-11-01" },
    ]);
    expect(html).not.toContain(row.address_reference);
    expect(html).toContain("Sin restricciones activas");
  });
  it("conserva el aviso de plazo cumplido", () => {
    const html = render(true, [
      { ...row, reported_on: "2025-01-01", eligible_on: "2026-01-01" },
    ]);
    expect(html).toContain("plazo cumplido");
    expect(html).toContain("01/01/2026");
  });
  it("vincula los avisos a su territorio en la vista de ejemplo", () => {
    const snapshot: Snapshot = {
      territories: [
        {
          id: "t",
          territory_number: 1,
          active: true,
          description: null,
          version: 1,
        },
      ],
      assignments: [],
      people: [],
      visit_restrictions: [row, { ...row, id: "other", territory_id: "other" }],
      revision: "",
    };
    const data = demoMapContext(snapshot, today);
    expect(
      data.visit_restriction_summary?.find((v) => v.territory_id === "t"),
    ).toEqual({ territory_id: "t", blocking_count: 1, eligible_count: 0 });
  });
});
