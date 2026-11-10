import { normalizeName, parseExcelDate, todayLima } from "./dates";
import { sequenceErrors } from "./report";
import type { ImportPreview, ImportRow } from "./types";
export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(view))),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
const blocks = [
  { number: 2, cols: [4, 6, 8, 10] },
  { number: 14, cols: [16, 18, 20, 22] },
  { number: 25, cols: [27, 29, 31, 33] },
  { number: 36, cols: [38, 40, 42, 44] },
  { number: 47, cols: [49, 51, 53, 55] },
];
const blank = (x: unknown) =>
  x === null || x === undefined || String(x).trim() === "";
function col(n: number): string {
  let s = "";
  while (n) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
export function analyzeWorkbook(
  sheets: { sheet: string; data: unknown[][] }[],
  fileName: string,
  fileHash: string,
  applyApprovedT64 = false,
  today = todayLima(),
): ImportPreview {
  const preview: ImportPreview = {
    fileName,
    fileHash,
    rows: [],
    issues: [],
    sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data.length })),
  };
  const s = sheets.find((s) => s.sheet === "S-13-S");
  if (!s) throw new Error("Falta la hoja S-13-S.");
  const get = (r: number, c: number) => s.data[r - 1]?.[c - 1];
  const seen = new Set<string>();
  for (let t = 1; t <= 82; t++) {
    const r = 9 + 2 * (t - 1);
    const rows: ImportRow[] = [];
    blocks.forEach((b, bi) => {
      if (Number(get(r, b.number)) !== t)
        preview.issues.push({
          severity: "error",
          territory: t,
          cell: `${col(b.number)}${r}`,
          message:
            "El número de territorio no coincide con el mapa de migración.",
        });
      b.cols.forEach((c, slot) => {
        const cell = `S-13-S!${col(c)}${r}/${col(c)}${r + 1}:${col(c + 1)}${r + 1}`;
        const name = get(r, c),
          a = get(r + 1, c),
          z = get(r + 1, c + 1);
        if ([name, a, z].every(blank)) return;
        try {
          if (blank(name) || blank(a))
            throw new Error(
              "Registro parcial: falta nombre o fecha de asignación.",
            );
          const assigned_at = parseExcelDate(a)!,
            completed_at = parseExcelDate(z);
          const display = String(name).trim();
          if (display.length > 200)
            throw new Error("El nombre supera 200 caracteres.");
          if (assigned_at > today || (completed_at && completed_at > today))
            throw new Error("Hay una fecha futura; revise el origen.");
          const row: ImportRow = {
            territory_number: t,
            assigned_name_snapshot: display,
            assigned_at,
            completed_at,
            source_order: bi * 4 + slot,
            source_cell_reference: cell,
          };
          if (
            applyApprovedT64 &&
            t === 64 &&
            assigned_at === "2026-08-29" &&
            !completed_at
          ) {
            row.completed_at = "2026-08-29";
            row.migration_adjustment =
              "Corrección de migración aprobada en la especificación: T64 asignado y completado 29/08/2026.";
            preview.issues.push({
              severity: "info",
              territory: t,
              cell,
              message: row.migration_adjustment,
            });
          }
          const key = `${t}|${assigned_at}|${normalizeName(display)}`;
          if (seen.has(key)) {
            preview.issues.push({
              severity: "error",
              territory: t,
              cell,
              message:
                "Registro duplicado dentro del archivo; revisar antes de importar.",
            });
            return;
          }
          seen.add(key);
          rows.push(row);
        } catch (e) {
          preview.issues.push({
            severity: "error",
            territory: t,
            cell,
            message: (e as Error).message,
          });
        }
      });
    });
    for (const message of sequenceErrors(rows))
      preview.issues.push({ severity: "error", territory: t, message });
    preview.rows.push(
      ...rows.sort(
        (a, b) =>
          a.assigned_at.localeCompare(b.assigned_at) ||
          a.source_order - b.source_order,
      ),
    );
  }
  for (const name of [
    "CONDUCTORES",
    "NO TOCAR",
    "CRONOGRAMA CONDUCTORES",
    "CRONOGRAMA PUBLICADORES",
  ])
    if (!sheets.some((s) => s.sheet === name))
      preview.issues.push({
        severity: "warning",
        message: `No está la hoja complementaria ${name}; no afecta las asignaciones.`,
      });
  return preview;
}
export async function previewExcel(
  file: File,
  approvedCorrection: boolean,
): Promise<ImportPreview> {
  if (file.size > 10 * 1024 * 1024) throw new Error("El Excel supera 10 MB.");
  const { default: readExcelFile } = await import("read-excel-file/browser");
  const buffer = await file.arrayBuffer();
  const sheets = await readExcelFile(buffer, { trim: false });
  return analyzeWorkbook(
    sheets,
    file.name,
    await sha256(buffer),
    approvedCorrection,
  );
}
