import { isDate, todayLima } from "./dates";
import type { Assignment, Territory } from "./types";

export type CoverageColor = "green" | "yellow" | "orange" | "red";
export type CoverageFilter = "all" | CoverageColor | "unrecorded";
export type CoverageDates = ReadonlyMap<string, string>;
export interface CoverageOptions {
  from: string;
  to: string;
  color: CoverageFilter;
  priority: boolean;
}
export const emptyCoverageOptions: CoverageOptions = {
  from: "",
  to: "",
  color: "all",
  priority: false,
};

// Compute from the whole authorized history, before applying any list filters.
export function latestCompletedDates(
  assignments: readonly Assignment[],
  today = todayLima(),
): Map<string, string> {
  const dates = new Map<string, string>();
  for (const a of assignments) {
    if (
      a.voided_at ||
      !a.completed_at ||
      !isDate(a.completed_at) ||
      a.completed_at > today
    )
      continue;
    if (
      !dates.has(a.territory_id) ||
      dates.get(a.territory_id)! < a.completed_at
    )
      dates.set(a.territory_id, a.completed_at);
  }
  return dates;
}

function monthsAfter(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const end = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, end));
  return target.toISOString().slice(0, 10);
}

export function coveragePriority(date: string | null, today = todayLima()) {
  if (!date || !isDate(date) || date > today)
    return { color: "red" as const, rank: 0, label: "Sin registro" };
  if (monthsAfter(date, 12) <= today)
    return { color: "red" as const, rank: 0, label: "12 meses o más" };
  if (monthsAfter(date, 8) <= today)
    return {
      color: "orange" as const,
      rank: 1,
      label: "De 8 a menos de 12 meses",
    };
  if (monthsAfter(date, 4) <= today)
    return {
      color: "yellow" as const,
      rank: 2,
      label: "De 4 a menos de 8 meses",
    };
  return { color: "green" as const, rank: 3, label: "Menos de 4 meses" };
}

export function coverageRangeError(from: string, to: string) {
  if ((from && !isDate(from)) || (to && !isDate(to)))
    return "Indica fechas válidas para filtrar la última predicación.";
  if (from && to && from > to)
    return "La fecha Desde debe ser anterior o igual a Hasta.";
  return "";
}

export function filterCoverageTerritories(
  territories: readonly Territory[],
  dates: CoverageDates,
  options: CoverageOptions,
  today = todayLima(),
) {
  if (coverageRangeError(options.from, options.to)) return [];
  return territories
    .filter((t) => {
      const date = dates.get(t.id) ?? null;
      const priority = coveragePriority(date, today);
      if (options.from && (!date || date < options.from)) return false;
      if (options.to && (!date || date > options.to)) return false;
      return (
        options.color === "all" ||
        (options.color === "unrecorded"
          ? !date
          : priority.color === options.color)
      );
    })
    .sort((a, b) => {
      if (options.priority) {
        const da = dates.get(a.id) ?? null;
        const db = dates.get(b.id) ?? null;
        const difference =
          coveragePriority(da, today).rank - coveragePriority(db, today).rank;
        if (difference) return difference;
        // Within one color show unknown dates first, then the oldest completion.
        const older = (da ?? "").localeCompare(db ?? "");
        if (older) return older;
      }
      return a.territory_number - b.territory_number;
    });
}
