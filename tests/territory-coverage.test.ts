import { describe, expect, it } from "vitest";
import { can, completePermissions } from "../src/lib/permissions";
import {
  requireAssignmentAction,
  type AssignmentActionKind,
} from "../src/lib/assignmentActions";
import {
  coveragePriority,
  coverageRangeError,
  emptyCoverageOptions,
  filterCoverageTerritories,
  latestCompletedDates,
} from "../src/lib/territoryCoverage";
import type { Assignment, Profile, Territory } from "../src/lib/types";

const row = (
  territory: string,
  start: string,
  end: string | null,
  extra: Partial<Assignment> = {},
): Assignment => ({
  id: `${territory}-${start}`,
  territory_id: territory,
  assigned_at: start,
  completed_at: end,
  assigned_name_snapshot: "Persona sintética",
  version: 1,
  ...extra,
});
const territory = (number: number): Territory => ({
  id: `t${number}`,
  territory_number: number,
  active: true,
  description: null,
  version: 1,
});
const today = "2026-11-10";
describe("Última predicación y semáforo", () => {
  it("recupera el máximo cierre de todo el historial aunque exista un inicio posterior abierto", () => {
    const records = [
      row("t1", "2024-01-01", "2024-01-02"),
      row("t1", "2026-01-01", "2026-01-03"),
      row("t1", "2026-11-01", null),
      row("t2", "2026-05-01", "2026-05-02"),
    ];
    expect([...latestCompletedDates(records, today)]).toEqual([
      ["t1", "2026-01-03"],
      ["t2", "2026-05-02"],
    ]);
    expect(records).toHaveLength(4);
  });
  it("excluye anulados, cierres futuros e inválidos sin usar el inicio como predicación", () => {
    const records = [
      row("t1", "2026-01-01", "2026-01-02"),
      row("t1", "2026-06-01", "2026-06-02", { voided_at: "2026-06-03" }),
      row("t1", "2026-11-01", "2026-11-11"),
      row("t2", "2026-11-01", null),
      row("t3", "2026-01-01", "2026-02-30"),
    ];
    expect([...latestCompletedDates(records, today)]).toEqual([
      ["t1", "2026-01-02"],
    ]);
  });
  it("mantiene verde hasta el día anterior a los cuatro meses y cambia en el aniversario exacto", () => {
    expect(coveragePriority("2026-07-11", today).color).toBe("green");
    expect(coveragePriority("2026-07-10", today).color).toBe("yellow");
    expect(coveragePriority("2026-03-11", today).color).toBe("yellow");
    expect(coveragePriority("2026-03-10", today).color).toBe("orange");
    expect(coveragePriority("2025-11-11", today).color).toBe("orange");
    expect(coveragePriority("2025-11-10", today).color).toBe("red");
    expect(coveragePriority("2026-11-08", today).color).toBe("green");
  });
  it("usa meses calendario, incluidos finales de mes y años bisiestos", () => {
    expect(coveragePriority("2026-01-31", "2026-05-30").color).toBe("green");
    expect(coveragePriority("2026-01-31", "2026-05-31").color).toBe("yellow");
    expect(coveragePriority("2025-10-31", "2026-02-28").color).toBe("yellow");
    expect(coveragePriority("2024-02-29", "2025-02-28").color).toBe("red");
    expect(coveragePriority("2023-10-31", "2024-02-28").color).toBe("green");
    expect(coveragePriority("2023-10-31", "2024-02-29").color).toBe("yellow");
  });
  it("marca rojo sin registro y no fabrica una fecha", () => {
    expect(coveragePriority(null, today)).toEqual({
      color: "red",
      rank: 0,
      label: "Sin registro",
    });
    expect(coveragePriority("2026-11-11", today).color).toBe("red");
  });
  const territories = [
    territory(5),
    territory(2),
    territory(4),
    territory(1),
    territory(3),
    territory(6),
  ];
  const dates = new Map([
    ["t1", "2026-11-08"],
    ["t2", "2026-07-10"],
    ["t3", "2026-03-10"],
    ["t4", "2025-11-10"],
    ["t6", "2026-11-07"],
  ]);
  it("conserva por defecto el orden numérico sin mutar la lista original", () => {
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        emptyCoverageOptions,
        today,
      ).map((t) => t.territory_number),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(territories[0].territory_number).toBe(5);
  });
  it("ordena rojo, anaranjado, amarillo y verde; dentro de cada color primero el más antiguo", () => {
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, priority: true },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([5, 4, 3, 2, 6, 1]);
    const equalDates = new Map([
      ["t1", "2026-01-01"],
      ["t2", "2026-01-01"],
    ]);
    expect(
      filterCoverageTerritories(
        [territory(2), territory(1)],
        equalDates,
        { ...emptyCoverageOptions, priority: true },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([1, 2]);
  });
  it("filtra fechas inclusivas sobre la última finalización y excluye los sin registro", () => {
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, from: "2026-03-10", to: "2026-07-10" },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([2, 3]);
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, from: "2026-11-08" },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([1]);
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, to: "2025-11-10" },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([4]);
  });
  it("no rescata un cierre antiguo dentro del rango cuando el último cierre está fuera", () => {
    const latest = latestCompletedDates(
      [
        row("t1", "2026-03-01", "2026-03-10"),
        row("t1", "2026-11-01", "2026-11-08"),
      ],
      today,
    );
    expect(
      filterCoverageTerritories(
        [territory(1)],
        latest,
        { ...emptyCoverageOptions, from: "2026-03-01", to: "2026-03-31" },
        today,
      ),
    ).toHaveLength(0);
  });
  it("combina color, rango y orden y permite consultar solo los sin registro", () => {
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, color: "red" },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([4, 5]);
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        {
          ...emptyCoverageOptions,
          color: "red",
          from: "2025-01-01",
          priority: true,
        },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([4]);
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, color: "unrecorded" },
        today,
      ).map((t) => t.territory_number),
    ).toEqual([5]);
  });
  it("rechaza rangos invertidos o fechas inválidas en vez de mostrar resultados engañosos", () => {
    expect(coverageRangeError("2026-11-10", "2026-11-01")).toMatch(/Desde/);
    expect(coverageRangeError("2026-02-30", "")).toMatch(/válidas/);
    expect(
      filterCoverageTerritories(
        territories,
        dates,
        { ...emptyCoverageOptions, from: "2026-11-10", to: "2026-11-01" },
        today,
      ),
    ).toHaveLength(0);
  });
});

describe("Acciones de asignación independientes", () => {
  const user: Profile = {
    id: "synthetic",
    display_name: "Prueba",
    role: "lector",
    active: true,
    can_export: false,
    version: 1,
  };
  it("un perfil que solo agrega inicios no puede completar, editar ni eliminar", () => {
    const profile = {
      ...user,
      permissions: completePermissions(["territories.assign"]),
    };
    expect(() => requireAssignmentAction(profile, "assign")).not.toThrow();
    for (const kind of [
      "complete",
      "correct",
      "void",
    ] as AssignmentActionKind[])
      expect(() => requireAssignmentAction(profile, kind)).toThrow(/permiso/);
    expect(can(profile, "territories.view")).toBe(true);
  });
  it("editar y eliminar son permisos separados, sin ampliar acceso al catálogo de territorios", () => {
    for (const granted of ["correct", "void"] as const) {
      const profile = {
        ...user,
        permissions: completePermissions([`territories.${granted}`]),
      };
      expect(() => requireAssignmentAction(profile, granted)).not.toThrow();
      expect(() =>
        requireAssignmentAction(
          profile,
          granted === "void" ? "correct" : "void",
        ),
      ).toThrow(/permiso/);
      expect(can(profile, "territories.edit")).toBe(false);
      expect(can(profile, "territories.create")).toBe(false);
    }
  });
  it("mantiene denegación para lector, cuenta inactiva y permisos revocados", () => {
    for (const profile of [
      user,
      { ...user, role: "administrador" as const, active: false },
      { ...user, permissions: [] },
    ])
      expect(() => requireAssignmentAction(profile, "assign")).toThrow(
        /permiso/,
      );
  });
});
