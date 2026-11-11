import { displayDate, isDate, todayLima } from "./dates";
import type { Assignment } from "./types";

export const TIMING_OVERRIDE_PERMISSION = "territories.override_timing";
export function addDays(date: string, days: number) {
  if (!isDate(date)) throw new Error("Fecha no válida.");
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function assignmentDeadline(start: string) {
  if (!isDate(start)) throw new Error("Fecha de inicio no válida.");
  const [year, month, day] = start.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + 3, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
export function nextAssignmentDate(history: Assignment[]) {
  const last = history
    .filter((a) => !a.voided_at)
    .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0];
  return last?.completed_at ? addDays(last.completed_at, 14) : null;
}
export function assignmentTimingIssues(
  history: Assignment[],
  start: string,
  completed: string | null,
  excludeId?: string,
  today = todayLima(),
  checkStart = true,
) {
  if (!isDate(start) || (completed && !isDate(completed))) return [];
  const rows = history.filter((a) => !a.voided_at && a.id !== excludeId);
  const previous = rows
    .filter((a) => a.assigned_at <= start)
    .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0];
  const next = rows
    .filter((a) => a.assigned_at > start)
    .sort((a, b) => a.assigned_at.localeCompare(b.assigned_at))[0];
  const issues: string[] = [];
  if (
    checkStart &&
    previous?.completed_at &&
    start > previous.completed_at &&
    start < addDays(previous.completed_at, 14)
  )
    issues.push(
      `Inicio anticipado: fecha elegida ${displayDate(start)}; finalización anterior ${displayDate(previous.completed_at)}. Primer inicio permitido: ${displayDate(addDays(previous.completed_at, 14))} (14 días de descanso).`,
    );
  const deadline = assignmentDeadline(start);
  if (completed && completed > deadline)
    issues.push(
      `Cierre fuera de plazo: inicio ${displayDate(start)}, finalización ${displayDate(completed)}. Fecha límite: ${displayDate(deadline)} (3 meses calendario).`,
    );
  if (!completed && today > deadline)
    issues.push(
      `La asignación se inicia ya vencida: inicio ${displayDate(start)}, fecha actual ${displayDate(today)}. Fecha límite: ${displayDate(deadline)} (3 meses calendario).`,
    );
  if (
    completed &&
    next &&
    completed < next.assigned_at &&
    next.assigned_at < addDays(completed, 14)
  )
    issues.push(
      `La corrección acorta el descanso de la siguiente asignación: cierre ${displayDate(completed)}, siguiente inicio ${displayDate(next.assigned_at)}. Primer inicio permitido: ${displayDate(addDays(completed, 14))} (14 días de descanso).`,
    );
  return issues;
}
export function validTimingReason(reason: string) {
  const trimmed = reason.trim();
  return trimmed.length <= 2000 && trimmed.replace(/\s+/g, " ").length >= 8;
}
export function validateTimingException(
  issues: string[],
  allowed: boolean,
  reason: string,
) {
  if (!issues.length) return;
  if (!allowed)
    throw new Error(
      "No tiene permiso para exceptuar los plazos de 14 días y 3 meses. Revise las fechas o solicite la intervención de una persona autorizada.",
    );
  if (!validTimingReason(reason))
    throw new Error(
      "Indique el motivo obligatorio de la excepción (entre 8 y 2000 caracteres).",
    );
}
export function timingObservation(
  event: string,
  issues: string[],
  reason: string,
) {
  return `Excepción de plazos · ${event}\n${issues.join("\n")}\nMotivo: ${reason.trim()}`;
}
