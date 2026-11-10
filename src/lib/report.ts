import type { Assignment, Period, Territory } from "./types";
export interface ReportRow {
  territory_number: number;
  lastCompleted: string | null;
  provenance: "en_periodo" | "historico" | "sin_historial";
  continuation: boolean;
  assignments: Assignment[];
}
export function reportRows(
  territories: Territory[],
  history: Assignment[],
  period: Period,
): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const t of [...territories].sort(
    (a, b) => a.territory_number - b.territory_number,
  )) {
    const all = history
      .filter((a) => a.territory_id === t.id && !a.voided_at)
      .sort(
        (a, b) =>
          a.assigned_at.localeCompare(b.assigned_at) ||
          (a.source_order ?? 0) - (b.source_order ?? 0) ||
          a.id.localeCompare(b.id),
      );
    const selected = all
      .filter(
        (a) => a.assigned_at >= period.start && a.assigned_at <= period.end,
      )
      .map((a) => ({
        ...a,
        completed_at:
          a.completed_at && a.completed_at <= period.end
            ? a.completed_at
            : null,
      }));
    const last =
      all
        .map((a) => a.completed_at)
        .filter((d): d is string => !!d && d <= period.end)
        .sort()
        .at(-1) ?? null;
    for (let k = 0; k < Math.max(1, Math.ceil(selected.length / 4)); k++)
      rows.push({
        territory_number: t.territory_number,
        lastCompleted: k ? null : last,
        provenance: last
          ? last >= period.start
            ? "en_periodo"
            : "historico"
          : "sin_historial",
        continuation: k > 0,
        assignments: selected.slice(k * 4, k * 4 + 4),
      });
  }
  return rows;
}
export function reportSummary(rows: ReportRow[]) {
  return {
    assignments: rows.reduce((n, r) => n + r.assignments.length, 0),
    territories: rows.filter((r) => !r.continuation && r.assignments.length)
      .length,
    rows: rows.length,
    pages: Math.ceil(rows.length / 20),
    withoutNew: rows
      .filter((r) => !r.continuation && !r.assignments.length)
      .map((r) => r.territory_number),
    historical: rows.filter(
      (r) => !r.continuation && r.provenance === "historico",
    ).length,
    open: rows.flatMap((r) => r.assignments).filter((a) => !a.completed_at)
      .length,
  };
}
export function sequenceErrors(
  history: { assigned_at: string; completed_at: string | null }[],
): string[] {
  const errors: string[] = [];
  const sorted = [...history].sort((a, b) =>
    a.assigned_at.localeCompare(b.assigned_at),
  );
  sorted.forEach((a, i) => {
    if (a.completed_at && a.completed_at < a.assigned_at)
      errors.push("El cierre es anterior a la asignación.");
    const prev = sorted[i - 1];
    if (prev && (!prev.completed_at || a.assigned_at <= prev.completed_at))
      errors.push(
        `La asignación ${a.assigned_at} requiere un cierre previo estrictamente anterior.`,
      );
  });
  return errors;
}
