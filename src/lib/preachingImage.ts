import {
  preachingDocument,
  preachingFormat as format,
  layoutPreachingDocument,
  type PreachingAudience,
} from "./preachingDocument";
import type { PreachingWeek } from "./preachingSchedule";

export interface PreachingImage {
  blob: Blob;
  extension: "png" | "jpg";
  width: number;
  height: number;
}
export function smallestScheduleImage(png: Blob | null, jpeg: Blob | null) {
  const candidates = [png, jpeg].filter(
    (b): b is Blob =>
      !!b && b.size > 0 && ["image/png", "image/jpeg"].includes(b.type),
  );
  candidates.sort(
    (a, b) => a.size - b.size || (a.type === "image/png" ? -1 : 1),
  );
  if (!candidates.length)
    throw new Error("No se pudo generar la imagen. Inténtalo nuevamente.");
  const blob = candidates[0];
  return {
    blob,
    extension: blob.type === "image/jpeg" ? ("jpg" as const) : ("png" as const),
  };
}
const encode = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === "image/jpeg" ? 0.92 : undefined),
  );
export async function generatePreachingImages(
  week: PreachingWeek,
  audience: PreachingAudience,
): Promise<PreachingImage[]> {
  await document.fonts?.ready;
  const doc = preachingDocument(week, audience),
    scratch = document.createElement("canvas"),
    measure = scratch.getContext("2d");
  if (!measure)
    throw new Error("Este navegador no pudo abrir el generador de imágenes.");
  measure.font = format.font;
  const pages = layoutPreachingDocument(
      doc,
      (text) => measure.measureText(text).width,
    ),
    images: PreachingImage[] = [];
  const width = doc.widths.reduce((a, b) => a + b, 0),
    scale = 2;
  for (const page of pages) {
    const canvas = document.createElement("canvas");
    canvas.width = (width + format.marginX * 2) * scale;
    canvas.height = (page.height + format.marginY * 2) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen del cronograma.");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
    ctx.font = format.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cell = (
      x: number,
      y: number,
      w: number,
      h: number,
      lines: string[],
      color: string,
      header = false,
    ) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = format.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = header ? "#ffffff" : "#000000";
      lines.forEach((text, i) =>
        ctx.fillText(
          text,
          x + w / 2,
          y + h / 2 + (i - (lines.length - 1) / 2) * format.lineHeight,
        ),
      );
    };
    let x = format.marginX,
      y = format.marginY;
    doc.headers.forEach((h, i) => {
      cell(x, y, doc.widths[i], format.headerHeight, [h], format.header, true);
      x += doc.widths[i];
    });
    y += format.headerHeight;
    for (let i = 0; i < page.rows.length;) {
      const day = page.rows[i].day;
      let end = i + 1;
      while (end < page.rows.length && page.rows[end].day === day) end++;
      const color = day % 2 === 0 ? format.gray : "#ffffff",
        height = page.rows.slice(i, end).reduce((sum, r) => sum + r.height, 0);
      let mergedX = format.marginX;
      for (let col = 0; col < 2; col++) {
        cell(
          mergedX,
          y,
          doc.widths[col],
          height,
          page.rows[i].lines[col],
          color,
        );
        mergedX += doc.widths[col];
      }
      for (const row of page.rows.slice(i, end)) {
        let cellX = mergedX;
        for (let col = 2; col < doc.widths.length; col++) {
          cell(cellX, y, doc.widths[col], row.height, row.lines[col], color);
          cellX += doc.widths[col];
        }
        y += row.height;
      }
      i = end;
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = format.border;
    ctx.strokeRect(format.marginX, format.marginY, width, page.height);
    const [png, jpeg] = await Promise.all([
      encode(canvas, "image/png"),
      encode(canvas, "image/jpeg"),
    ]);
    images.push({
      ...smallestScheduleImage(png, jpeg),
      width: canvas.width,
      height: canvas.height,
    });
    canvas.width = 0;
    canvas.height = 0;
  }
  return images;
}
