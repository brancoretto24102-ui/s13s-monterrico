import { displayDate, isDate, todayLima } from "./dates";
import {
  addDays,
  assignmentDeadline,
  validTimingReason,
} from "./assignmentTiming";
import type { Assignment, Conductor, Territory } from "./types";

export const preachingDays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export type PlanningAssignment = Pick<
  Assignment,
  | "id"
  | "territory_id"
  | "person_id"
  | "assigned_at"
  | "completed_at"
  | "voided_at"
>;
export interface PlannedTerritory {
  territory_id: string;
  reason: string;
  policy?: PlanStatus;
}
export interface PreachingRow {
  id: string;
  day: number;
  time: string;
  meeting_point: string;
  conductor_ids: string[];
  conductor_names?: string[];
  territory_numbers?: number[];
  territories: PlannedTerritory[];
}
export interface PreachingWeek {
  id: string;
  week_start: string;
  rows: PreachingRow[];
  version: number;
  updated_at?: string;
}
export interface PreachingContext {
  schedule: PreachingWeek | null;
  previous: PreachingWeek | null;
  template: PreachingRow[];
  territories: Territory[];
  conductors: Conductor[];
  assignments: PlanningAssignment[];
  revision: string;
}
export interface PlanStatus {
  kind: "available" | "continuation" | "rest" | "blocked";
  message: string;
  earliest?: string;
  deadline?: string;
  assignment_id?: string;
}
export function weekdayIndex(date: string) {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}
export function mondayOf(date = todayLima()) {
  if (!isDate(date)) throw new Error("Elige una fecha válida.");
  return addDays(date, -weekdayIndex(date));
}
export function preachingWeekDates(monday: string) {
  if (!isDate(monday) || weekdayIndex(monday) !== 0 || monday > "9998-12-24")
    throw new Error("Elige el lunes de la semana.");
  return preachingDays.map((_, i) => addDays(monday, i));
}
export function newPreachingRow(day: number, time = "08:00"): PreachingRow {
  return {
    id: crypto.randomUUID(),
    day,
    time,
    meeting_point: "",
    conductor_ids: [],
    territories: [],
  };
}
export function territoryPlanStatus(
  assignments: readonly PlanningAssignment[],
  territoryId: string,
  date: string,
): PlanStatus {
  const history = assignments.filter(
    (a) => a.territory_id === territoryId && !a.voided_at,
  );
  const current = history.find(
    (a) => a.assigned_at <= date && (!a.completed_at || a.completed_at > date),
  );
  if (current) {
    const deadline = assignmentDeadline(current.assigned_at);
    return date > deadline
      ? {
          kind: "blocked",
          deadline,
          assignment_id: current.id,
          message: `Sigue abierto desde ${displayDate(current.assigned_at)} y vence el ${displayDate(deadline)}. Debe cerrarse antes de volver a programarlo; después se revisarán los 14 días.`,
        }
      : {
          kind: "continuation",
          deadline,
          assignment_id: current.id,
          message: `Continuación de la asignación abierta. Cierre hasta ${displayDate(deadline)}.`,
        };
  }
  const completed = history
    .filter((a) => a.completed_at && a.completed_at <= date)
    .map((a) => a.completed_at!)
    .sort()
    .at(-1);
  const earliest = completed ? addDays(completed, 14) : undefined;
  return earliest && date < earliest
    ? {
        kind: "rest",
        earliest,
        message: `Descanso incompleto: último cierre ${displayDate(completed)}, primer inicio habitual ${displayDate(earliest)}. Se puede programar con motivo obligatorio.`,
      }
    : { kind: "available", earliest, message: "Disponible para programar." };
}
export function scheduleDefaults(context: PreachingContext, monday: string) {
  const dates = preachingWeekDates(monday);
  const source = context.previous?.rows ?? context.template;
  const active = new Set(
    context.conductors
      .filter((c) => c.active && !c.deleted_at)
      .map((c) => c.id),
  );
  const rows = source.map((row) => ({
    ...row,
    conductor_ids: row.conductor_ids.filter((id) => active.has(id)),
    territories: row.territories
      .filter((t) =>
        ["continuation", "blocked"].includes(
          territoryPlanStatus(
            context.assignments,
            t.territory_id,
            dates[row.day],
          ).kind,
        ),
      )
      .map((t) => ({ territory_id: t.territory_id, reason: "" })),
  }));
  const already = new Set(
    rows.flatMap((row) => row.territories.map((t) => t.territory_id)),
  );
  const unplaced: PlanningAssignment[] = [];
  for (const a of context.assignments.filter(
    (a) => !a.voided_at && !a.completed_at,
  )) {
    if (already.has(a.territory_id) || a.assigned_at > dates[6]) continue;
    const conductor = context.conductors.find(
      (c) => c.person_id === a.person_id,
    );
    const candidates = rows.filter(
      (r) =>
        r.day === weekdayIndex(a.assigned_at) &&
        conductor &&
        r.conductor_ids.includes(conductor.id),
    );
    if (candidates.length === 1) {
      candidates[0].territories.push({
        territory_id: a.territory_id,
        reason: "",
      });
      already.add(a.territory_id);
    } else unplaced.push(a);
  }
  return { rows, unplaced };
}
export function scheduleErrors(
  rows: readonly PreachingRow[],
  context: Pick<PreachingContext, "territories" | "conductors" | "assignments">,
  monday: string,
) {
  let dates: string[];
  try {
    dates = preachingWeekDates(monday);
  } catch (e) {
    return [(e as Error).message];
  }
  const errors: string[] = [];
  const ids = new Set<string>(),
    booked = new Set<string>(),
    territories = new Set<string>();
  if (rows.length > 100) errors.push("La semana admite hasta 100 salidas.");
  for (const r of rows) {
    if (!Number.isInteger(r.day) || r.day < 0 || r.day > 6) {
      errors.push("Día de salida no válido.");
      continue;
    }
    const label = `${preachingDays[r.day]} ${r.time}`;
    if (ids.has(r.id)) errors.push(`${label}: salida duplicada.`);
    ids.add(r.id);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.time))
      errors.push(`${label}: indica una hora válida.`);
    if (!r.meeting_point.trim() || r.meeting_point.length > 300)
      errors.push(
        `${label}: indica el punto de reunión (máximo 300 caracteres).`,
      );
    if (!r.conductor_ids.length || r.conductor_ids.length > 8)
      errors.push(`${label}: selecciona entre 1 y 8 conductores.`);
    for (const id of r.conductor_ids) {
      if (
        !context.conductors.some(
          (c) => c.id === id && c.active && !c.deleted_at,
        )
      )
        errors.push(`${label}: el conductor ya no está activo en el maestro.`);
      const key = `${r.day}|${r.time}|${id}`;
      if (booked.has(key))
        errors.push(
          `${label}: un conductor tiene dos salidas a la misma hora.`,
        );
      booked.add(key);
    }
    if (r.territories.length > 64)
      errors.push(`${label}: demasiados territorios en una salida.`);
    for (const t of r.territories) {
      const target = context.territories.find((x) => x.id === t.territory_id);
      if (!target?.active) {
        errors.push(`${label}: territorio no disponible.`);
        continue;
      }
      const key = `${r.day}|${r.time}|${t.territory_id}`;
      if (territories.has(key))
        errors.push(
          `${label}: el territorio ${target.territory_number} se repite a la misma hora.`,
        );
      territories.add(key);
      const status = territoryPlanStatus(
        context.assignments,
        t.territory_id,
        dates[r.day],
      );
      if (status.kind === "blocked")
        errors.push(
          `${label}, territorio ${target.territory_number}: ${status.message}`,
        );
      if (status.kind === "rest" && !validTimingReason(t.reason))
        errors.push(
          `${label}, territorio ${target.territory_number}: escribe el motivo para programarlo antes de los 14 días (8 a 2000 caracteres).`,
        );
    }
  }
  return [...new Set(errors)];
}
export function scheduleTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}
export function sortedPreachingRows(rows: readonly PreachingRow[]) {
  return [...rows].sort(
    (a, b) =>
      a.day - b.day ||
      a.time.localeCompare(b.time) ||
      a.meeting_point.localeCompare(b.meeting_point) ||
      a.id.localeCompare(b.id),
  );
}
export function unplannedTerritories(
  territories: readonly Territory[],
  rows: readonly PreachingRow[],
) {
  const included = new Set(
    rows.flatMap((r) => r.territories.map((t) => t.territory_id)),
  );
  return territories.filter((t) => !included.has(t.id));
}
export function scheduleExceptionBody(
  monday: string,
  row: PreachingRow,
  t: PlannedTerritory,
  status: PlanStatus,
) {
  return `Excepción de cronograma · ${displayDate(addDays(monday, row.day))} ${row.time}\n${status.message}\nMotivo: ${t.reason.trim()}`;
}
