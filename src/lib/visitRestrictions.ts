import { isDate, normalizeName, todayLima } from "./dates";
import type { VisitRestriction, VisitRestrictionSummary } from "./types";

export function eligibleVisitDate(reportedOn: string) {
  if (!isDate(reportedOn) || +reportedOn.slice(0, 4) > 9998)
    throw new Error("Fecha informada no válida.");
  const [year, month, day] = reportedOn.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
export function validateVisitRestriction(
  address: string,
  reportedOn: string,
  today = todayLima(),
) {
  const reference = address.trim().replace(/\s+/g, " ").normalize("NFC");
  if (reference.length < 3 || reference.length > 500)
    throw new Error("Identifique el domicilio con entre 3 y 500 caracteres.");
  const eligible = eligibleVisitDate(reportedOn);
  if (reportedOn > today)
    throw new Error("La fecha informada no puede ser futura.");
  return {
    address_reference: reference,
    reported_on: reportedOn,
    eligible_on: eligible,
  };
}
export function visitRestrictionState(
  row: VisitRestriction,
  today = todayLima(),
) {
  if (row.deleted_at) return "deleted";
  if (!row.active) return "archived";
  return today < row.eligible_on ? "blocking" : "eligible";
}
export const visitStateLabels = {
  deleted: "En papelera",
  archived: "Archivado",
  blocking: "No visitar",
  eligible: "Plazo cumplido",
};
export function visitSummary(
  rows: VisitRestriction[],
  today = todayLima(),
): VisitRestrictionSummary[] {
  const counts = new Map<string, VisitRestrictionSummary>();
  for (const row of rows) {
    const state = visitRestrictionState(row, today);
    if (state !== "blocking" && state !== "eligible") continue;
    const count = counts.get(row.territory_id) ?? {
      territory_id: row.territory_id,
      blocking_count: 0,
      eligible_count: 0,
    };
    if (state === "blocking") count.blocking_count++;
    else count.eligible_count++;
    counts.set(row.territory_id, count);
  }
  return [...counts.values()];
}
export function sameVisitAddress(a: string, b: string) {
  // Only a search hint; database uniqueness preserves accents and apartment IDs.
  return (
    normalizeName(a.trim().replace(/\s+/g, " ")) ===
    normalizeName(b.trim().replace(/\s+/g, " "))
  );
}
