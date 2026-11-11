import { describe, expect, it } from "vitest";
import { addDays } from "../src/lib/assignmentTiming";
import { can, completePermissions } from "../src/lib/permissions";
import {
  mondayOf,
  newPreachingRow,
  preachingWeekDates,
  scheduleDefaults,
  scheduleErrors,
  scheduleTime,
  territoryPlanStatus,
  type PreachingContext,
  type PreachingRow,
  type PlanningAssignment,
} from "../src/lib/preachingSchedule";
import type { Profile } from "../src/lib/types";
const monday = "2026-11-09";
const context: PreachingContext = {
  schedule: null,
  previous: null,
  template: [],
  territories: [1, 2, 3].map((i) => ({
    id: `t${i}`,
    territory_number: i,
    active: true,
    description: null,
    version: 1,
  })),
  conductors: [1, 2].map((i) => ({
    id: `c${i}`,
    person_id: `p${i}`,
    code: i,
    display_name: `Conductor sintético ${i}`,
    active: true,
    deleted_at: null,
    version: 1,
  })),
  assignments: [],
  revision: "",
};
const row = (
  day = 0,
  territories: PreachingRow["territories"] = [],
  extra: Partial<PreachingRow> = {},
): PreachingRow => ({
  ...newPreachingRow(day),
  meeting_point: "Punto de ejemplo",
  conductor_ids: ["c1"],
  territories,
  ...extra,
});
const assignment = (
  id: string,
  territory: string,
  start: string,
  completed: string | null,
  person = "p1",
): PlanningAssignment => ({
  id,
  territory_id: territory,
  person_id: person,
  assigned_at: start,
  completed_at: completed,
});
describe("Cronograma semanal de predicación", () => {
  it("calcula lunes a domingo con fechas reales, incluidos cambios de mes y año", () => {
    expect(mondayOf("2026-11-10")).toBe(monday);
    expect(preachingWeekDates(monday)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(preachingWeekDates("2026-12-28").at(-1)).toBe("2027-01-03");
    expect(() => preachingWeekDates("2026-11-10")).toThrow(/lunes/);
  });
  it("advierte hasta el día 13 y admite sin motivo desde el día 14", () => {
    const a = [assignment("a", "t1", "2026-10-01", "2026-11-01")];
    expect(territoryPlanStatus(a, "t1", "2026-11-14").kind).toBe("rest");
    expect(territoryPlanStatus(a, "t1", "2026-11-15").kind).toBe("available");
    expect(
      scheduleErrors(
        [row(0, [{ territory_id: "t1", reason: "" }])],
        { ...context, assignments: a },
        monday,
      ).join(" "),
    ).toMatch(/motivo/);
    expect(
      scheduleErrors(
        [
          row(0, [
            {
              territory_id: "t1",
              reason: "Necesidad de predicación justificada",
            },
          ]),
        ],
        { ...context, assignments: a },
        monday,
      ),
    ).toEqual([]);
  });
  it("permite continuar un abierto hasta tres meses exactos y bloquea el día siguiente", () => {
    const a = [assignment("a", "t1", "2026-08-10", null)];
    expect(territoryPlanStatus(a, "t1", "2026-11-10").kind).toBe(
      "continuation",
    );
    expect(territoryPlanStatus(a, "t1", "2026-11-11").kind).toBe("blocked");
    expect(
      scheduleErrors(
        [
          row(2, [
            {
              territory_id: "t1",
              reason: "Motivo de administrador tampoco exceptúa este bloqueo",
            },
          ]),
        ],
        { ...context, assignments: a },
        monday,
      ).join(" "),
    ).toMatch(/cerrarse/);
  });
  it("aplica tres meses calendario y vuelve a revisar descanso después del cierre", () => {
    const open = [assignment("a", "t1", "2026-01-31", null)];
    expect(territoryPlanStatus(open, "t1", "2026-04-30").kind).toBe(
      "continuation",
    );
    expect(territoryPlanStatus(open, "t1", "2026-05-01").kind).toBe("blocked");
    const closed = [{ ...open[0], completed_at: "2026-11-08" }];
    expect(territoryPlanStatus(closed, "t1", monday).kind).toBe("rest");
    expect(territoryPlanStatus(closed, "t1", "2026-11-22").kind).toBe(
      "available",
    );
  });
  it("evalúa la fecha de la salida y excluye registros anulados", () => {
    const a = [assignment("a", "t1", "2026-08-10", "2026-11-12")];
    expect(territoryPlanStatus(a, "t1", "2026-11-10").kind).toBe(
      "continuation",
    );
    expect(territoryPlanStatus(a, "t1", "2026-11-11").kind).toBe("blocked");
    expect(territoryPlanStatus(a, "t1", "2026-11-12").kind).toBe("rest");
    expect(
      territoryPlanStatus([{ ...a[0], voided_at: "2026-11-13" }], "t1", monday)
        .kind,
    ).toBe("available");
  });
  it("conserva por defecto la salida conocida de un abierto y permite retirarlo sin obligación", () => {
    const r = row(0, [
      { territory_id: "t1", reason: "" },
      { territory_id: "t2", reason: "" },
    ]);
    const c = {
      ...context,
      template: [r],
      assignments: [
        assignment("a", "t1", "2026-11-02", null),
        assignment("b", "t2", "2026-10-01", "2026-11-01"),
      ],
    };
    const result = scheduleDefaults(c, monday);
    expect(result.rows[0].time).toBe("08:00");
    expect(result.rows[0].territories.map((t) => t.territory_id)).toEqual([
      "t1",
    ]);
    expect(
      scheduleErrors([{ ...result.rows[0], territories: [] }], c, monday),
    ).toEqual([]);
    expect(c.template[0].territories).toHaveLength(2);
  });
  it("usa la última semana como base sin imponer sus días o sus territorios cerrados", () => {
    const previous = {
      id: "w",
      week_start: "2026-11-02",
      version: 1,
      rows: [row(0), row(1), row(3)],
    };
    const result = scheduleDefaults({ ...context, previous }, monday);
    expect(result.rows.map((r) => r.day)).toEqual([0, 1, 3]);
    expect(preachingWeekDates(monday)[result.rows[2].day]).toBe("2026-11-12");
    expect(result.rows.some((r) => r.day === 2)).toBe(false);
  });
  it("ubica por conductor y día solo cuando hay un horario inequívoco; no inventa mañana o tarde", () => {
    const a = assignment("a", "t1", "2026-11-02", null);
    const r = row(0);
    expect(
      scheduleDefaults({ ...context, template: [r], assignments: [a] }, monday)
        .rows[0].territories,
    ).toHaveLength(1);
    expect(
      scheduleDefaults(
        {
          ...context,
          template: [r, row(0, [], { time: "19:20" })],
          assignments: [a],
        },
        monday,
      ).unplaced,
    ).toHaveLength(1);
    expect(
      scheduleDefaults(
        { ...context, template: [r], assignments: [{ ...a, person_id: null }] },
        monday,
      ).unplaced,
    ).toHaveLength(1);
  });
  it("admite varias salidas por día, varios conductores y territorios, y reuniones sin territorio", () => {
    const rows = [
      row(
        0,
        [
          { territory_id: "t1", reason: "" },
          { territory_id: "t2", reason: "" },
        ],
        { conductor_ids: ["c1", "c2"] },
      ),
      row(0, [], { time: "19:20", meeting_point: "Videollamada" }),
    ];
    expect(scheduleErrors(rows, context, monday)).toEqual([]);
    expect(scheduleTime("19:20")).toBe("7:20 p.m.");
    expect(scheduleTime("00:05")).toBe("12:05 a.m.");
  });
  it("rechaza doble reserva de conductor o territorio, datos vacíos e identidades inactivas", () => {
    expect(scheduleErrors([row(), row()], context, monday).join(" ")).toMatch(
      /dos salidas/,
    );
    expect(
      scheduleErrors(
        [
          row(0, [{ territory_id: "t1", reason: "" }]),
          row(0, [{ territory_id: "t1", reason: "" }], {
            conductor_ids: ["c2"],
          }),
        ],
        context,
        monday,
      ).join(" "),
    ).toMatch(/se repite/);
    expect(
      scheduleErrors(
        [row(0, [], { conductor_ids: [], meeting_point: "", time: "25:00" })],
        context,
        monday,
      ),
    ).toHaveLength(3);
    expect(
      scheduleErrors(
        [row()],
        {
          ...context,
          conductors: context.conductors.map((c) => ({ ...c, active: false })),
        },
        monday,
      ).join(" "),
    ).toMatch(/activo/);
  });
  it("no concede programación ni exportación a perfiles básicos y mantiene acciones independientes", () => {
    const p: Profile = {
      id: "p",
      display_name: "Sintético",
      role: "editor",
      active: true,
      can_export: true,
      version: 1,
    };
    expect(can(p, "schedules.view")).toBe(false);
    const create = {
      ...p,
      permissions: completePermissions(["schedules.create"]),
    };
    expect(can(create, "schedules.view")).toBe(true);
    expect(can(create, "schedules.create")).toBe(true);
    expect(can(create, "schedules.edit")).toBe(false);
    expect(can(create, "territories.assign")).toBe(false);
    expect(
      can(
        { ...p, permissions: completePermissions(["schedules.export"]) },
        "schedules.export",
      ),
    ).toBe(true);
  });
});
