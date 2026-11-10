import type { PDFFont, PDFPage } from "pdf-lib";
import { displayDate } from "./dates";
import { sha256 } from "./importer";
import { reportRows, reportSummary } from "./report";
import type { Period, Snapshot } from "./types";
export const TEMPLATE_SHA256 =
  "ce5e73842993004875b2e1dc4caff121f3d9c9e1a3c8fbf65617bc6f73cde3de";
// Measured from filled vector rectangles in the original PDF (top-left points).
// Each row has [name-top, name-bottom, date-top, date-bottom].
export const ROW_BOUNDS = [
  [146.54, 161.18, 161.66, 176.3],
  [177.86, 192.5, 192.98, 207.62],
  [209.18, 223.7, 224.18, 238.94],
  [240.5, 255.02, 255.506, 270.29],
  [271.85, 286.37, 286.85, 301.49],
  [303.05, 317.69, 318.17, 332.81],
  [334.37, 349.01, 349.49, 364.13],
  [365.69, 380.33, 380.81, 395.45],
  [397.01, 411.53, 412.01, 426.77],
  [428.33, 442.85, 443.326, 457.99],
  [459.55, 474.19, 474.67, 489.31],
  [490.87, 505.51, 505.99, 520.63],
  [522.19, 536.83, 537.31, 551.95],
  [553.51, 568.03, 568.51, 583.27],
  [584.83, 599.35, 599.83, 614.59],
  [616.15, 630.67, 631.156, 645.82],
  [647.38, 662.02, 662.5, 677.14],
  [678.7, 693.34, 693.82, 708.46],
  [710.02, 724.66, 725.14, 739.78],
  [741.336, 755.856, 756.336, 771.096],
] as const;
export const BLOCK_BOUNDS = [
  [136.7, 188.45, 188.93, 241.25],
  [242.69, 295.15, 295.63, 348.07],
  [349.51, 401.86, 402.34, 454.78],
  [456.22, 508.68, 509.16, 560.76],
] as const;
export interface Placement {
  page: number;
  kind: "territory" | "last" | "name" | "assigned" | "completed" | "period";
  text: string;
  x: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
}
// drawText uses Tj: standard-font kerning is not applied. Sum glyph advances
// rather than widthOfTextAtSize(text), which includes kerning pairs.
function textWidth(font: PDFFont, text: string, size: number): number {
  return Array.from(text).reduce(
    (n, c) => n + font.widthOfTextAtSize(c, size),
    0,
  );
}
function put(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  right: number,
  top: number,
  bottom: number,
  size: number,
  pageIndex: number,
  kind: Placement["kind"],
  placements: Placement[],
) {
  if (!text) return;
  let units: number;
  try {
    units = textWidth(font, text, 1);
  } catch {
    throw new Error(
      `El formulario contiene caracteres no compatibles con la fuente original. Revise: ${text}`,
    );
  }
  const fitted = Math.min(size, (right - x - 4) / units);
  if (fitted < 6.2)
    throw new Error(
      `El nombre no cabe de forma legible en el formulario: ${text}. Revise su presentación antes de exportar.`,
    );
  const height = 1.374 * fitted;
  const width = units * fitted;
  const left = x + (right - x - width) / 2;
  const baseline = page.getHeight() - (top + bottom) / 2 - 0.388 * fitted;
  page.drawText(text, { x: left, y: baseline, font, size: fitted });
  placements.push({
    page: pageIndex,
    kind,
    text,
    x: left,
    top: page.getHeight() - baseline - 1.075 * fitted,
    width,
    height,
    fontSize: fitted,
  });
}
export async function generateS13(
  template: Uint8Array,
  snapshot: Snapshot,
  period: Period,
) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  if ((await sha256(template)) !== TEMPLATE_SHA256)
    throw new Error(
      "La plantilla no coincide con el PDF oficial validado. Cargue S-13_S(1).pdf original.",
    );
  const original = await PDFDocument.load(template);
  if (original.getPageCount() !== 1)
    throw new Error("La plantilla oficial debe tener una página.");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const rows = reportRows(snapshot.territories, snapshot.assignments, period);
  const summary = reportSummary(rows);
  const placements: Placement[] = [];
  for (let pi = 0; pi < summary.pages; pi++) {
    const [page] = await pdf.copyPages(original, [0]);
    pdf.addPage(page);
    const hx = 136.54,
      safeRight = 560.76;
    const fontSize = Math.min(
      12,
      (safeRight - hx - 4) / textWidth(font, period.label, 1),
    );
    if (fontSize < 8)
      throw new Error(
        "El encabezado supera el espacio seguro de la plantilla.",
      );
    page.drawRectangle({
      x: 134.2,
      y: page.getHeight() - 97.7,
      width: 56.6,
      height: 1.7,
      color: rgb(1, 1, 1),
    });
    page.drawText(period.label, {
      x: hx,
      y: page.getHeight() - 94.4,
      font,
      size: fontSize,
      color: rgb(0, 0, 0),
    });
    const hw = textWidth(font, period.label, fontSize);
    page.drawLine({
      start: { x: 134.54, y: page.getHeight() - 96.86 },
      end: { x: hx + hw + 2, y: page.getHeight() - 96.86 },
      thickness: 0.96,
      color: rgb(0, 0, 0),
    });
    placements.push({
      page: pi,
      kind: "period",
      text: period.label,
      x: hx,
      top: 94.4 - fontSize,
      width: hw,
      height: fontSize,
      fontSize,
    });
    rows.slice(pi * 20, pi * 20 + 20).forEach((row, i) => {
      const [nt, nb, dt, db] = ROW_BOUNDS[i];
      put(
        page,
        font,
        String(row.territory_number),
        37.44,
        71.18,
        nt,
        db,
        9.4,
        pi,
        "territory",
        placements,
      );
      if (row.lastCompleted)
        put(
          page,
          font,
          displayDate(row.lastCompleted),
          71.664,
          133.7,
          nt,
          db,
          8.3,
          pi,
          "last",
          placements,
        );
      row.assignments.forEach((a, j) => {
        const [left, mid, rightStart, right] = BLOCK_BOUNDS[j];
        put(
          page,
          font,
          a.assigned_name_snapshot,
          left,
          right,
          nt,
          nb,
          9.4,
          pi,
          "name",
          placements,
        );
        put(
          page,
          font,
          displayDate(a.assigned_at),
          left,
          mid,
          dt,
          db,
          8.1,
          pi,
          "assigned",
          placements,
        );
        if (a.completed_at)
          put(
            page,
            font,
            displayDate(a.completed_at),
            rightStart,
            right,
            dt,
            db,
            8.1,
            pi,
            "completed",
            placements,
          );
      });
    });
  }
  const metadata = {
    schema: "S13S/1",
    period,
    summary,
    templateSha256: TEMPLATE_SHA256,
    snapshotRevision: snapshot.revision,
  };
  pdf.setTitle(`S-13-S · ${period.label}`);
  pdf.setSubject(JSON.stringify(metadata));
  pdf.setCreator("Registro de territorios Monterrico");
  pdf.setCreationDate(new Date(`${period.generatedOn}T12:00:00Z`));
  pdf.setModificationDate(new Date(`${period.generatedOn}T12:00:00Z`));
  return { bytes: await pdf.save(), summary, placements, metadata };
}
