import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProfilePermissions from "../src/components/ProfilePermissions";
import {
  completePermissions,
  permissionKeys,
  can,
} from "../src/lib/permissions";
import { TIMING_OVERRIDE_PERMISSION } from "../src/lib/assignmentTiming";
import type { Profile } from "../src/lib/types";

const profile: Profile = {
  id: "synthetic",
  display_name: "Prueba",
  active: true,
  role: "lector",
  version: 1,
  can_export: false,
};
const render = (selected: string[] = []) =>
  renderToStaticMarkup(
    createElement(ProfilePermissions, { selected, onToggle: () => {} }),
  );

describe("Editor de accesos de perfiles", () => {
  it("ofrece una casilla por cada permiso del catálogo, incluido el cronograma y la excepción", () => {
    const html = render();
    const rendered = [...html.matchAll(/<input\b[^>]*value="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(rendered.sort()).toEqual([...permissionKeys].sort());
    expect(html).toContain("PREDICACIÓN");
    expect(html).toContain("Cronograma semanal");
    expect(html).toContain("Crear semanas");
    expect(html).toContain("Editar salidas y días");
    expect(html).toContain("Descargar cronogramas");
  });
  it("muestra la excepción independiente, su selección y el motivo obligatorio", () => {
    const html = render(completePermissions([TIMING_OVERRIDE_PERMISSION]));
    expect(html).toContain("Excepciones de plazos");
    const checkbox = html.match(
      /<input\b[^>]*value="territories.override_timing"[^>]*>/,
    )?.[0];
    expect(checkbox).toContain('checked=""');
    expect(html).toContain("Cada excepción exige un motivo");
    expect(html).toContain("Quitar Registro de asignaciones");
    expect(html).toContain("debe cerrarse antes de programarlo");
  });
  it("crear cronogramas no concede edición, exportación ni excepciones del registro", () => {
    const permissions = completePermissions(["schedules.create"]);
    const custom = { ...profile, permissions };
    expect(permissions).toEqual(["schedules.create", "schedules.view"]);
    expect(can(custom, "schedules.create")).toBe(true);
    expect(can(custom, "schedules.edit")).toBe(false);
    expect(can(custom, "schedules.export")).toBe(false);
    expect(can(custom, TIMING_OVERRIDE_PERMISSION)).toBe(false);
  });
  it("la excepción exige concesión expresa y no añade operaciones de asignación", () => {
    expect(
      can({ ...profile, role: "editor" }, TIMING_OVERRIDE_PERMISSION),
    ).toBe(false);
    expect(
      can({ ...profile, role: "administrador" }, TIMING_OVERRIDE_PERMISSION),
    ).toBe(true);
    const custom = {
      ...profile,
      permissions: completePermissions([TIMING_OVERRIDE_PERMISSION]),
    };
    expect(can(custom, TIMING_OVERRIDE_PERMISSION)).toBe(true);
    expect(can(custom, "territories.assign")).toBe(false);
    expect(
      can({ ...custom, permissions: [] }, TIMING_OVERRIDE_PERMISSION),
    ).toBe(false);
  });
});
