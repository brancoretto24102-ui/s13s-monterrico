import { describe, expect, it } from "vitest";
import {
  addDays,
  assignmentDeadline,
  assignmentTimingIssues,
  nextAssignmentDate,
  timingObservation,
  validateTimingException,
  TIMING_OVERRIDE_PERMISSION,
} from "../src/lib/assignmentTiming";
import { can } from "../src/lib/permissions";
import type { Assignment, Profile } from "../src/lib/types";
const record = (
  id: string,
  start: string,
  completed: string | null,
): Assignment => ({
  id,
  territory_id: "synthetic",
  assigned_at: start,
  completed_at: completed,
  assigned_name_snapshot: "Conductor sintético",
  version: 1,
});
describe("Descanso de territorios y máximo de tres meses", () => {
  it("suma 14 días exactos al cierre, incluso entre años", () => {
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(nextAssignmentDate([record("a", "2026-09-01", "2026-10-01")])).toBe(
      "2026-10-15",
    );
  });
  it("calcula meses calendario con sus finales de mes y años bisiestos", () => {
    expect(assignmentDeadline("2026-01-31")).toBe("2026-04-30");
    expect(assignmentDeadline("2023-11-30")).toBe("2024-02-29");
    expect(assignmentDeadline("2026-11-30")).toBe("2027-02-28");
  });
  it("bloquea el día 13 y permite el día 14 del descanso", () => {
    const history = [record("a", "2026-09-01", "2026-10-01")];
    expect(
      assignmentTimingIssues(
        history,
        "2026-10-14",
        null,
        undefined,
        "2026-10-15",
      ),
    ).toHaveLength(1);
    expect(
      assignmentTimingIssues(
        history,
        "2026-10-15",
        null,
        undefined,
        "2026-10-15",
      ),
    ).toEqual([]);
  });
  it("permite cerrar el día límite y exige excepción desde el siguiente", () => {
    expect(assignmentTimingIssues([], "2026-01-31", "2026-04-30")).toEqual([]);
    expect(assignmentTimingIssues([], "2026-01-31", "2026-05-01")).toHaveLength(
      1,
    );
  });
  it("no permite crear una asignación que ya esté vencida sin excepción", () => {
    expect(
      assignmentTimingIssues([], "2026-01-01", null, undefined, "2026-04-01"),
    ).toEqual([]);
    expect(
      assignmentTimingIssues([], "2026-01-01", null, undefined, "2026-04-02"),
    ).toHaveLength(1);
  });
  it("comprueba también el descanso de la siguiente asignación al corregir fechas", () => {
    const history = [
      record("a", "2026-09-01", "2026-09-20"),
      record("b", "2026-10-10", null),
    ];
    expect(
      assignmentTimingIssues(
        history,
        "2026-09-01",
        "2026-10-01",
        "a",
        "2026-11-10",
        false,
      ),
    ).toHaveLength(1);
    expect(
      assignmentTimingIssues(
        history,
        "2026-09-01",
        "2026-09-26",
        "a",
        "2026-11-10",
        false,
      ),
    ).toEqual([]);
  });
  it("un cierre normal no vuelve a autorizar un inicio anticipado ya registrado", () => {
    const history = [record("a", "2026-09-01", "2026-10-01")];
    expect(
      assignmentTimingIssues(
        history,
        "2026-10-03",
        "2026-10-04",
        undefined,
        "2026-10-10",
        false,
      ),
    ).toEqual([]);
  });
  it("excluye anulaciones y conserva las restricciones cronológicas por separado", () => {
    expect(
      nextAssignmentDate([
        { ...record("a", "2026-10-01", "2026-10-02"), voided_at: "2026-10-03" },
      ]),
    ).toBeNull();
    expect(
      assignmentTimingIssues(
        [record("a", "2026-10-01", "2026-10-03")],
        "2026-10-03",
        null,
        undefined,
        "2026-10-03",
      ),
    ).toEqual([]);
  });
  it("el permiso de excepción es explícito y el motivo es obligatorio incluso para administradores", () => {
    const user: Profile = {
      id: "synthetic",
      display_name: "Prueba",
      role: "editor",
      active: true,
      can_export: false,
      version: 1,
    };
    expect(can(user, TIMING_OVERRIDE_PERMISSION)).toBe(false);
    expect(
      can({ ...user, role: "administrador" }, TIMING_OVERRIDE_PERMISSION),
    ).toBe(true);
    expect(
      can(
        { ...user, permissions: [TIMING_OVERRIDE_PERMISSION] },
        TIMING_OVERRIDE_PERMISSION,
      ),
    ).toBe(true);
    expect(() =>
      validateTimingException(
        ["Fuera de plazo"],
        false,
        "Motivo válido de ejemplo",
      ),
    ).toThrow(/permiso/);
    for (const reason of [
      "",
      "    ",
      "\t\n".repeat(8),
      "\u00a0".repeat(8),
      "A       B",
      "corto",
      "a".repeat(2001),
    ])
      expect(() =>
        validateTimingException(["Fuera de plazo"], true, reason),
      ).toThrow(/motivo/);
    expect(() =>
      validateTimingException(
        ["Fuera de plazo"],
        true,
        "Motivo válido de ejemplo",
      ),
    ).not.toThrow();
    expect(
      timingObservation(
        "Inicio de asignación",
        ["Inicio anticipado"],
        "  Motivo de ejemplo  ",
      ),
    ).toContain("Motivo: Motivo de ejemplo");
  });
});
