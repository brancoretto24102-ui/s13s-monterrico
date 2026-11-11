import {
  preachingDays,
  preachingWeekDates,
  sortedPreachingRows,
  type PreachingWeek,
} from "./preachingSchedule";

export type PreachingAudience = "conductors" | "publishers";
export const preachingFormat = {
  font: "16px Calibri, Arial, sans-serif",
  fontSize: 16,
  lineHeight: 20,
  rowHeight: 24,
  headerHeight: 26,
  marginX: 28,
  marginY: 24,
  header: "#00b050",
  gray: "#bfbfbf",
  border: "#000000",
};
export function scheduleShortDate(date: string) {
  return `${Number(date.slice(8))} ${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][Number(date.slice(5, 7)) - 1]}`;
}
export function scheduleDocumentTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m" : "p.m"}`;
}
export function scheduleDisplayName(name: string) {
  // Case is presentation only; the canonical master/saved name is unchanged.
  return name === name.toLocaleUpperCase("es")
    ? name
        .toLocaleLowerCase("es")
        .replace(
          /(^|[\s.\-])(\p{L})/gu,
          (_, prefix, letter) => prefix + letter.toLocaleUpperCase("es"),
        )
    : name;
}
function joined(values: readonly (string | number)[]) {
  if (values.length < 3) return values.join(" y ");
  return `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}
export function preachingDocument(
  week: PreachingWeek,
  audience: PreachingAudience,
) {
  const dates = preachingWeekDates(week.week_start);
  const conductors = audience === "conductors";
  return {
    headers: [
      "Día",
      "Fecha",
      "Hora",
      "Punto de Reunión",
      ...(conductors ? ["Territorio"] : []),
      "Conductor",
    ],
    widths: conductors ? [86, 64, 80, 261, 142, 235] : [86, 64, 80, 332, 306],
    rows: sortedPreachingRows(week.rows).map((r) => ({
      id: r.id,
      day: r.day,
      values: [
        preachingDays[r.day],
        scheduleShortDate(dates[r.day]),
        scheduleDocumentTime(r.time),
        r.meeting_point,
        ...(conductors
          ? [
              r.territory_numbers?.length
                ? `T: ${joined(r.territory_numbers)}`
                : "",
            ]
          : []),
        joined((r.conductor_names ?? []).map(scheduleDisplayName)),
      ],
    })),
  };
}
export type PreachingDocument = ReturnType<typeof preachingDocument>;
export type MeasuredRow = PreachingDocument["rows"][number] & {
  lines: string[][];
  height: number;
};
export function wrapScheduleText(
  text: string,
  width: number,
  measure: (value: string) => number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of word) {
        if (line && measure(line + character) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}
export function layoutPreachingDocument(
  doc: PreachingDocument,
  measure: (text: string) => number,
  maxTableHeight = 3500,
) {
  const pages: { rows: MeasuredRow[]; height: number }[] = [];
  let page = {
    rows: [] as MeasuredRow[],
    height: preachingFormat.headerHeight,
  };
  for (const r of doc.rows) {
    const lines = r.values.map((value, col) =>
      wrapScheduleText(value, doc.widths[col] - 8, measure),
    );
    const height = Math.max(
      preachingFormat.rowHeight,
      ...lines.map((ls) => ls.length * preachingFormat.lineHeight + 4),
    );
    if (height + preachingFormat.headerHeight > maxTableHeight)
      throw new Error(
        "Una salida contiene demasiado texto para una imagen legible. Divide sus conductores en más salidas.",
      );
    if (page.rows.length && page.height + height > maxTableHeight) {
      pages.push(page);
      page = { rows: [], height: preachingFormat.headerHeight };
    }
    page.rows.push({ ...r, lines, height });
    page.height += height;
  }
  if (page.rows.length || !pages.length) pages.push(page);
  return pages;
}
