import readExcelFile from "read-excel-file/node";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { analyzeWorkbook, sha256 } from "../src/lib/importer";
import { servicePeriod, currentPeriod, customPeriod } from "../src/lib/dates";
import { reportRows, reportSummary } from "../src/lib/report";
import { generateS13 } from "../src/lib/pdf";
import type { Snapshot } from "../src/lib/types";
const [excelPath, templatePath, outputDir] = process.argv.slice(2);
if (!outputDir)
  throw new Error(
    "Uso: npm run verify:private -- /ruta/historial.xlsx /ruta/plantilla.pdf /ruta/salida-privada",
  );
const input = await readFile(excelPath);
const sheets = await readExcelFile(input, { trim: false });
const preview = analyzeWorkbook(
  sheets,
  excelPath.split("/").at(-1)!,
  await sha256(input),
  true,
  "2026-11-09",
);
assert.equal(
  preview.issues.filter((x) => x.severity === "error").length,
  0,
  JSON.stringify(preview.issues),
);
assert.equal(preview.rows.length, 820);
assert.equal(preview.issues.filter((x) => x.severity === "info").length, 1);
const territories = Array.from({ length: 82 }, (_, i) => ({
  id: `t${i + 1}`,
  territory_number: i + 1,
  active: true,
  description: null,
  version: 1,
}));
const snapshot: Snapshot = {
  territories,
  assignments: preview.rows.map((r, i) => ({
    ...r,
    id: `a${String(i).padStart(4, "0")}`,
    territory_id: `t${r.territory_number}`,
    version: 1,
  })),
  people: [],
  revision: "2026-11-09T12:00:00Z",
};
const now = new Date("2026-11-09T18:00:00Z");
const cases = [
  {
    period: customPeriod("2025-07-02", "2026-08-31", now),
    expected: [739, 80, 217, 11],
  },
  { period: servicePeriod(2025, now), expected: [580, 80, 179, 9] },
  { period: servicePeriod(2026, now), expected: [81, 52, 82, 5] },
  { period: currentPeriod("2026-06", now), expected: [250, 77, 101, 6] },
];
const results = cases.map(({ period, expected }) => {
  const s = reportSummary(
    reportRows(territories, snapshot.assignments, period),
  );
  assert.deepEqual([s.assignments, s.territories, s.rows, s.pages], expected);
  return { period, summary: s };
});
const current = cases[3].period;
const rs = reportRows(territories, snapshot.assignments, current);
assert.deepEqual(reportSummary(rs).withoutNew, [5, 10, 11, 19, 20]);
assert.deepEqual(
  rs.flatMap((r) =>
    r.assignments.filter((a) => !a.completed_at).map(() => r.territory_number),
  ),
  [9, 23, 26, 27, 28, 60, 66],
);
assert.equal(rs.find((r) => r.territory_number === 10)!.lastCompleted, null);
await mkdir(outputDir, { recursive: true });
const pdf = await generateS13(await readFile(templatePath), snapshot, current);
assert.equal(pdf.placements.filter((x) => x.kind === "name").length, 250);
assert.equal(pdf.placements.filter((x) => x.kind === "period").length, 6);
await writeFile(`${outputDir}/S13S-validacion-privada.pdf`, pdf.bytes);
await writeFile(
  `${outputDir}/expected-placements.json`,
  JSON.stringify(pdf.placements, null, 2),
);
await writeFile(
  `${outputDir}/snapshot.json`,
  JSON.stringify(snapshot, null, 2),
);
await writeFile(`${outputDir}/preview.json`, JSON.stringify(preview, null, 2));
await writeFile(
  `${outputDir}/baselines.json`,
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify(
    {
      status: "PASS",
      records: preview.rows.length,
      migrationAdjustments: 1,
      baselineCases: results.map((r) => ({
        start: r.period.start,
        end: r.period.end,
        assignments: r.summary.assignments,
        rows: r.summary.rows,
        pages: r.summary.pages,
      })),
      pdfPages: pdf.summary.pages,
      minimumFontSize: Math.min(...pdf.placements.map((x) => x.fontSize)),
    },
    null,
    2,
  ),
);
