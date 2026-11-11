import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { displayDate } from "./dates";
import {
  preachingDays,
  preachingWeekDates,
  scheduleTime,
  sortedPreachingRows,
  type PreachingWeek,
} from "./preachingSchedule";

export type PreachingAudience = "conductors" | "publishers";
export const preachingPdfHeaders = (audience: PreachingAudience) =>
  audience === "conductors"
    ? ["Día", "Fecha", "Hora", "Punto de Reunión", "Territorio", "Conductor"]
    : ["Día", "Fecha", "Hora", "Punto de Reunión", "Conductor"];

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
          if (font.widthOfTextAtSize(line + character, size) > width) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function generatePreachingPdf(
  week: PreachingWeek,
  audience: PreachingAudience,
) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const dates = preachingWeekDates(week.week_start),
    headers = preachingPdfHeaders(audience);
  const widths =
    audience === "conductors"
      ? [85, 75, 80, 240, 85, 197]
      : [85, 75, 80, 292, 230];
  const size = 10,
    lineHeight = 14,
    tableWidth = widths.reduce((a, b) => a + b, 0),
    left = 40;
  const rows = sortedPreachingRows(week.rows).map((row) => {
    const texts = [
      preachingDays[row.day],
      displayDate(dates[row.day]),
      scheduleTime(row.time),
      row.meeting_point,
      ...(audience === "conductors"
        ? [(row.territory_numbers ?? []).map((n) => `T: ${n}`).join(" / ")]
        : []),
      (row.conductor_names ?? []).join(" / "),
    ];
    const lines = texts.map((t, i) =>
      wrapText(t, normal, size, widths[i] - 14),
    );
    return {
      day: row.day,
      lines,
      height: Math.max(34, ...lines.map((x) => x.length * lineHeight + 14)),
    };
  });
  const shade = Array.from({ length: 7 }, (_, day) =>
    day % 2 === 0 ? rgb(191 / 255, 191 / 255, 191 / 255) : rgb(1, 1, 1),
  );
  let index = 0,
    pageNumber = 0;
  do {
    const page = doc.addPage([842, 595]);
    pageNumber++;
    page.drawText("CRONOGRAMA DE PREDICACIÓN", {
      x: left,
      y: 551,
      size: 17,
      font: bold,
      color: rgb(0.1, 0.24, 0.19),
    });
    page.drawText(
      `${audience === "conductors" ? "Conductores" : "Publicadores"} - Semana del ${displayDate(dates[0])} al ${displayDate(dates[6])}`,
      { x: left, y: 528, size: 11, font: normal, color: rgb(0.3, 0.36, 0.34) },
    );
    let x = left;
    headers.forEach((h, i) => {
      page.drawRectangle({
        x,
        y: 477,
        width: widths[i],
        height: 32,
        color: rgb(0, 176 / 255, 80 / 255),
      });
      page.drawText(h, {
        x: x + 7,
        y: 489,
        size: 10,
        font: bold,
        color: rgb(1, 1, 1),
      });
      x += widths[i];
    });
    const chunk: typeof rows = [];
    let used = 0;
    while (index < rows.length && 477 - used - rows[index].height >= 45) {
      chunk.push(rows[index]);
      used += rows[index].height;
      index++;
    }
    if (!chunk.length && index < rows.length)
      throw new Error(
        "Una salida contiene demasiado texto para una página. Reduce el punto de reunión o la cantidad de conductores.",
      );
    let y = 477;
    for (let i = 0; i < chunk.length;) {
      const day = chunk[i].day;
      let end = i + 1;
      while (end < chunk.length && chunk[end].day === day) end++;
      const height = chunk.slice(i, end).reduce((s, r) => s + r.height, 0);
      let dx = left;
      for (let col = 0; col < 2; col++) {
        page.drawRectangle({
          x: dx,
          y: y - height,
          width: widths[col],
          height,
          color: shade[day],
          borderColor: rgb(0.68, 0.73, 0.7),
          borderWidth: 0.5,
        });
        const lines = chunk[i].lines[col];
        lines.forEach((line, k) =>
          page.drawText(line, {
            x: dx + 7,
            y: y - height / 2 + (lines.length - 1) * 7 - k * lineHeight - 3,
            size,
            font: col === 0 ? bold : normal,
          }),
        );
        dx += widths[col];
      }
      let rowY = y;
      for (const row of chunk.slice(i, end)) {
        let colX = left + widths[0] + widths[1];
        for (let col = 2; col < widths.length; col++) {
          page.drawRectangle({
            x: colX,
            y: rowY - row.height,
            width: widths[col],
            height: row.height,
            color: shade[day],
            borderColor: rgb(0.68, 0.73, 0.7),
            borderWidth: 0.5,
          });
          row.lines[col].forEach((line, k) =>
            page.drawText(line, {
              x: colX + 7,
              y: rowY - 17 - k * lineHeight,
              size,
              font: normal,
            }),
          );
          colX += widths[col];
        }
        rowY -= row.height;
      }
      y -= height;
      i = end;
    }
    if (!rows.length)
      page.drawText("Sin salidas programadas esta semana.", {
        x: left + 10,
        y: 450,
        size: 11,
        font: normal,
      });
    page.drawText(`Monterrico - Página ${pageNumber}`, {
      x: left,
      y: 22,
      size: 9,
      font: normal,
      color: rgb(0.4, 0.45, 0.42),
    });
    if (tableWidth > 762)
      throw new Error("Ancho del cronograma fuera del área imprimible.");
  } while (index < rows.length);
  doc.setTitle(
    `Cronograma de ${audience === "conductors" ? "conductores" : "publicadores"} ${week.week_start}`,
  );
  doc.setSubject(`Semana ${week.week_start}; versión ${week.version}`);
  return doc.save();
}
