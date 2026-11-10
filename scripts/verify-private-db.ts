import { Client } from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { bootstrapTestDb } from "./bootstrap-test-db";
import { reportRows, reportSummary } from "../src/lib/report";
import { servicePeriod, currentPeriod, customPeriod } from "../src/lib/dates";
import type { Snapshot, ImportPreview } from "../src/lib/types";
const path = process.argv[2];
if (!path || !process.env.TEST_DATABASE_URL)
  throw new Error(
    "Ejecute contra una base VACÍA de pruebas e indique preview.json privado.",
  );
const preview: ImportPreview = JSON.parse(await readFile(path, "utf8"));
assert.equal(preview.rows.length, 820);
assert(!preview.issues.some((x) => x.severity === "error"));
const root = new Client({ connectionString: process.env.TEST_DATABASE_URL });
const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
try {
  await root.connect();
  await bootstrapTestDb(root);
  const uid = "10000000-0000-0000-0000-000000000001";
  await root.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,\'{"display_name":"Administrador de prueba"}\')',
    [uid],
  );
  await root.query(
    "update profiles set active=true,role='administrador',can_export=true where id=$1",
    [uid],
  );
  await admin.connect();
  await admin.query("set role authenticated");
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [
    uid,
  ]);
  const {
    rows: [{ result }],
  } = await admin.query("select import_history($1,$2,$3,$4) as result", [
    preview.fileName,
    preview.fileHash,
    JSON.stringify(preview.rows),
    JSON.stringify({ issues: preview.issues }),
  ]);
  assert.equal(result.inserted, 820);
  const repeated = await admin.query(
    "select import_history($1,$2,$3) as result",
    [preview.fileName, preview.fileHash, JSON.stringify(preview.rows)],
  );
  assert.equal(repeated.rows[0].result.already_imported, true);
  const {
    rows: [{ snap }],
  } = await admin.query("select get_export_snapshot() as snap");
  const snapshot = snap as Snapshot;
  assert.equal(snapshot.assignments.length, 820);
  assert.equal(snapshot.territories.length, 82);
  const actual = snapshot.assignments.map((a) => ({
    territory_number: snapshot.territories.find((t) => t.id === a.territory_id)!
      .territory_number,
    assigned_name_snapshot: a.assigned_name_snapshot,
    assigned_at: a.assigned_at,
    completed_at: a.completed_at,
    source_cell_reference: a.source_cell_reference,
  }));
  const canonical = (rows: any[]) =>
    rows
      .map((r) =>
        JSON.stringify([
          r.territory_number,
          r.assigned_name_snapshot,
          r.assigned_at,
          r.completed_at,
          r.source_cell_reference,
        ]),
      )
      .sort();
  assert.deepEqual(canonical(actual), canonical(preview.rows));
  const now = new Date("2026-11-09T18:00:00Z");
  const cases = [
    { p: customPeriod("2025-07-02", "2026-08-31", now), n: [739, 217, 11] },
    { p: servicePeriod(2025, now), n: [580, 179, 9] },
    { p: servicePeriod(2026, now), n: [81, 82, 5] },
    { p: currentPeriod("2026-06", now), n: [250, 101, 6] },
  ];
  for (const { p, n } of cases) {
    const s = reportSummary(
      reportRows(snapshot.territories, snapshot.assignments, p),
    );
    assert.deepEqual([s.assignments, s.rows, s.pages], n);
  }
  const adjusted = await admin.query(
    "select count(*) as n from audit_log where entity='assignments' and reason like 'Corrección de migración aprobada%'",
  );
  assert.equal(adjusted.rows[0].n, "1");
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        imported: 820,
        records_compared_field_by_field: 820,
        reimport_duplicates: 0,
        baseline_cases: 4,
        approved_adjustment_audit_entries: 1,
      },
      null,
      2,
    ),
  );
} finally {
  await admin.end().catch(() => {});
  await root.end().catch(() => {});
}
