import { displayDate } from "./dates";
import {
  preachingWeekDates,
  sortedPreachingRows,
  type PreachingContext,
  type PreachingRow,
} from "./preachingSchedule";
import type { VisitRestriction } from "./types";
import { visitRestrictionState } from "./visitRestrictions";

export const noTouchHeading = "*_Casas No Tocar_*";
export const noTouchEmpty = "No tenemos en el cronograma de esta semana.";

export function preachingVisitMessage(
  monday: string,
  rows: readonly PreachingRow[],
  context: Pick<PreachingContext, "territories" | "conductors">,
  restrictions: readonly VisitRestriction[],
) {
  const dates = preachingWeekDates(monday);
  const lines: string[] = [];
  const included = new Set<string>();
  for (const row of sortedPreachingRows(rows)) {
    const date = dates[row.day];
    if (!date) continue;
    const names = row.conductor_ids
      .map(
        (id, index) =>
          context.conductors.find((c) => c.id === id)?.display_name ??
          row.conductor_names?.[index] ??
          "",
      )
      .map((name) => name.trim())
      .filter(Boolean);
    const territories = row.territories
      .map((t) =>
        context.territories.find(
          (territory) => territory.id === t.territory_id,
        ),
      )
      .filter((t) => t !== undefined)
      .sort((a, b) => a.territory_number - b.territory_number);
    for (const territory of territories) {
      const notices = restrictions
        .filter(
          (r) =>
            r.territory_id === territory.id &&
            r.reported_on <= date &&
            visitRestrictionState(r, date) === "blocking",
        )
        .sort((a, b) => a.code - b.code || a.id.localeCompare(b.id))
        .map((r) => r.address_reference.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (!notices.length) continue;
      // Times are not printed: avoid repeating identical date/territory/group
      // lines when the same group visits twice in one day.
      const key = JSON.stringify([
        date,
        territory.id,
        [...row.conductor_ids].sort(),
      ]);
      if (included.has(key)) continue;
      included.add(key);
      lines.push(
        `- ${displayDate(date)} - Territorio ${territory.territory_number}${names.length ? ` - ${names.join(" y ")}` : ""}: ${notices.join("; ")}`,
      );
    }
  }
  return `${noTouchHeading}\n\n${lines.length ? lines.join("\n") : noTouchEmpty}`;
}
