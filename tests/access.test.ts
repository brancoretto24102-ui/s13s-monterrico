import { describe, it, expect } from "vitest";
import { can, completePermissions } from "../src/lib/permissions";
import type { Profile } from "../src/lib/types";
const user: Profile = {
  id: "synthetic",
  display_name: "Prueba",
  role: "editor",
  active: true,
  version: 1,
  can_export: true,
};
describe("Permisos del cliente y revocaciones", () => {
  it("un acceso personalizado vacío no hereda el rol ni la exportación anteriores", () => {
    expect(can(user, "territories.assign")).toBe(true);
    expect(
      can(
        { ...user, access_mode: "custom", permissions: [] },
        "territories.assign",
      ),
    ).toBe(false);
    expect(
      can(
        { ...user, access_mode: "custom", permissions: [] },
        "reports.export",
      ),
    ).toBe(false);
  });
  it("inactivar o eliminar una cuenta bloquea también al administrador", () => {
    expect(
      can(
        { ...user, role: "administrador", active: false },
        "conductors.create",
      ),
    ).toBe(false);
    expect(
      can(
        { ...user, role: "administrador", deleted_at: "2026-01-01" },
        "territories.view",
      ),
    ).toBe(false);
  });
  it("un permiso puntual no habilita otras acciones del módulo", () => {
    const p = {
      ...user,
      permissions: ["conductors.view", "conductors.create"],
    };
    expect(can(p, "conductors.create")).toBe(true);
    expect(can(p, "conductors.delete")).toBe(false);
  });
  it("los informes requieren consulta y se rechazan claves de módulos no implementados", () => {
    expect(completePermissions(["reports.export", "no.existe"])).toEqual([
      "reports.export",
      "reports.view",
      "territories.view",
    ]);
    expect(can({ ...user, role: "administrador" }, "no.existe")).toBe(false);
  });
});
