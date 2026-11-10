import { bootstrapTestDb } from "./bootstrap-test-db";
import { testConductors } from "./test-conductors";
import { testAccess } from "./test-access";
import assert from "node:assert/strict";
import { Client } from "pg";
const external = process.env.TEST_DATABASE_URL;
if (!external)
  throw new Error(
    "Defina TEST_DATABASE_URL apuntando a una base de pruebas VACÍA, o ejecute npm run test:db:local en Linux x64. Nunca use una base de producción.",
  );
const clients: Client[] = [];
let checks = 0;
const ids = {
  admin: "10000000-0000-0000-0000-000000000001",
  editor: "10000000-0000-0000-0000-000000000002",
  reader: "10000000-0000-0000-0000-000000000003",
  inactive: "10000000-0000-0000-0000-000000000004",
};
async function connection(role = "postgres", uid = "") {
  const c = new Client({ connectionString: external });
  await c.connect();
  clients.push(c);
  await c.query(`set role ${role}`);
  await c.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  return c;
}
async function denied(p: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(p, pattern);
  checks++;
}
async function value(c: Client, q: string, args: any[] = []) {
  const r = await c.query(q, args);
  return Object.values(r.rows[0])[0] as any;
}
try {
  const root = await connection();
  await bootstrapTestDb(root);
  assert.equal(
    await value(
      root,
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
    ),
    "0",
  );
  checks++;
  assert.equal(
    await value(
      root,
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='assign_territory' and p.prosecdef",
    ),
    "1",
  );
  checks++;
  for (const [name, id] of Object.entries(ids))
    await root.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [id, { display_name: `Prueba ${name}` }],
    );
  await root.query(
    "update profiles set active=true,role='administrador',can_export=true where id=$1",
    [ids.admin],
  );
  await root.query(
    "update profiles set active=true,role='editor' where id=$1",
    [ids.editor],
  );
  await root.query("update profiles set active=true where id=$1", [ids.reader]);
  const admin = await connection("authenticated", ids.admin),
    ed1 = await connection("authenticated", ids.editor),
    ed2 = await connection("authenticated", ids.editor),
    reader = await connection("authenticated", ids.reader),
    inactive = await connection("authenticated", ids.inactive),
    anon = await connection("anon");
  const t = await value(
    root,
    "select id from territories where territory_number=1",
  );
  await denied(anon.query("select * from assignments"), /permission denied/);
  await denied(anon.query("select get_snapshot()"), /permission denied/);
  assert.equal(await value(inactive, "select count(*) from territories"), "0");
  checks++;
  await denied(inactive.query("select get_snapshot()"), /permiso/);
  await denied(
    reader.query("insert into territories(territory_number) values(999)"),
    /permission denied/,
  );
  await denied(
    reader.query("select assign_territory($1,1,'Prueba','2026-01-01')", [t]),
    /permiso/,
  );
  await denied(reader.query("select get_export_snapshot()"), /exportar/);
  await denied(
    reader.query("update profiles set role='administrador' where id=$1", [
      ids.reader,
    ]),
    /permission denied/,
  );
  await denied(
    ed1.query(
      "select manage_profile($1,1,'administrador',true,true,'Escalamiento no autorizado')",
      [ids.reader],
    ),
    /permiso/,
  );
  const conductorId = crypto.randomUUID();
  await admin.query(
    "select manage_conductor($1,0,'Conductor sintético de asignaciones','create','Alta para comprobar asignaciones')",
    [conductorId],
  );
  const personId = await value(
    root,
    "select person_id from conductors where id=$1",
    [conductorId],
  );
  // Two independent PostgreSQL connections, competing for the same row lock.
  const requests = await Promise.allSettled([
    ed1.query(
      "select assign_territory($1,1,'Conductor sintético de asignaciones','2026-01-01',$2)",
      [t, personId],
    ),
    ed2.query(
      "select assign_territory($1,1,'Conductor sintético de asignaciones','2026-01-01',$2)",
      [t, personId],
    ),
  ]);
  assert.equal(requests.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    requests.filter(
      (r) => r.status === "rejected" && (r.reason as any).code === "40001",
    ).length,
    1,
  );
  checks += 2;
  const a = (
    await root.query("select * from assignments where territory_id=$1", [t])
  ).rows[0];
  await denied(
    ed1.query(
      "select assign_territory($1,2,'Conductor sintético de asignaciones','2026-01-02',$2)",
      [t, personId],
    ),
    /Conflicto/,
  );
  await denied(
    ed1.query("select complete_assignment($1,1,2,'2025-12-31')", [a.id]),
    /check constraint/,
  );
  await ed1.query("select complete_assignment($1,1,2,'2026-01-01')", [a.id]);
  checks++;
  await denied(
    ed1.query(
      "select assign_territory($1,3,'Conductor sintético de asignaciones','2026-01-01',$2)",
      [t, personId],
    ),
    /retroactiva/,
  );
  const next = await value(
    ed1,
    "select assign_territory($1,3,'Conductor sintético de asignaciones','2026-01-02',$2)",
    [t, personId],
  );
  checks++;
  await denied(
    admin.query(
      "select correct_assignment($1,2,4,'Persona prueba','2026-01-01','2026-01-02','Corrección que solapa')",
      [a.id],
    ),
    /conflicto/,
  );
  await denied(
    admin.query(
      "select correct_assignment($1,2,4,'Persona prueba','2026-01-01','2026-01-01','')",
      [a.id],
    ),
    /motivo/,
  );
  await denied(
    ed1.query("select complete_assignment($1,1,3,'2026-01-03')", [next]),
    /Otro usuario/,
  );
  await denied(
    admin.query("update audit_log set reason=$1", ["Manipulación"]),
    /permission denied/,
  );
  await denied(root.query("delete from audit_log"), /inmutable/);
  assert.equal(await value(reader, "select count(*) from audit_log"), "0");
  checks++;
  await denied(
    admin.query(
      "select manage_profile($1,1,'lector',true,false,'Prueba último admin')",
      [ids.admin],
    ),
    /al menos/,
  );
  // All-or-nothing import and cross-file deduplication.
  const rows = [
    {
      territory_number: 2,
      assigned_name_snapshot: "Persona sintética",
      assigned_at: "2026-01-01",
      completed_at: "2026-01-02",
      source_order: 0,
      source_cell_reference: "S-13-S!D11/D12:E12",
    },
  ];
  const imp = await value(
    admin,
    "select import_history('synthetic.xlsx',$1,$2)",
    ["a".repeat(64), JSON.stringify(rows)],
  );
  assert.equal(imp.inserted, 1);
  checks++;
  const twice = await value(
    admin,
    "select import_history('synthetic.xlsx',$1,$2)",
    ["a".repeat(64), JSON.stringify(rows)],
  );
  assert.equal(twice.already_imported, true);
  checks++;
  const cross = await value(
    admin,
    "select import_history('synthetic-copy.xlsx',$1,$2)",
    ["b".repeat(64), JSON.stringify(rows)],
  );
  assert.equal(cross.skipped, 1);
  checks++;
  const bad = [
    { ...rows[0], territory_number: 3 },
    { ...rows[0], territory_number: 4, completed_at: "2025-01-01" },
  ];
  await denied(
    admin.query("select import_history('bad.xlsx',$1,$2)", [
      "c".repeat(64),
      JSON.stringify(bad),
    ]),
    /check constraint/,
  );
  assert.equal(
    await value(
      root,
      "select count(*) from import_batches where file_hash=$1",
      ["c".repeat(64)],
    ),
    "0",
  );
  assert.equal(
    await value(
      root,
      "select count(*) from assignments a join territories t on t.id=a.territory_id where t.territory_number=3",
    ),
    "0",
  );
  checks += 2;
  // Correction and audit attribution, then logical deletion.
  await admin.query(
    "select correct_assignment($1,1,4,'Persona corregida','2026-01-02','2026-01-03','Motivo de prueba válido')",
    [next],
  );
  checks++;
  assert.equal(
    await value(
      root,
      "select reason from audit_log where entity_id=$1 order by id desc limit 1",
      [next],
    ),
    "Motivo de prueba válido",
  );
  checks++;
  await admin.query(
    "select correct_assignment($1,2,5,'Persona corregida','2026-01-02','2026-01-03','Anulación de prueba válida',true)",
    [next],
  );
  checks++;
  assert.equal(
    (await value(admin, "select get_snapshot()")).assignments.some(
      (x: any) => x.id === next,
    ),
    false,
  );
  checks++;
  await admin.query(
    "select manage_territory(83,0,true,'Nuevo territorio','Crecimiento de prueba')",
  );
  assert.equal(await value(root, "select count(*) from territories"), "83");
  checks++;
  await admin.query(
    "select manage_territory(83,1,false,'Nuevo territorio','Desactivación de prueba')",
  );
  checks++;
  const backup = await value(admin, "select backup_data()");
  assert.equal(backup.schema_version, 1);
  assert(backup.audit_log.length > 0);
  checks++;
  // >1000 rows: RPC snapshot is not truncated by PostgREST's default row cap.
  const many = Array.from({ length: 1005 }, (_, i) => {
    const day = new Date(Date.UTC(2015, 0, 1) + i * 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      ...rows[0],
      territory_number: 5,
      assigned_at: day,
      completed_at: day,
      source_order: i,
    };
  });
  await admin.query("select import_history('large-synthetic.xlsx',$1,$2)", [
    "d".repeat(64),
    JSON.stringify(many),
  ]);
  assert(
    (await value(admin, "select get_snapshot()")).assignments.length > 1000,
  );
  checks++;
  // Private template access is enforced by Storage RLS.
  await admin.query(
    "insert into storage.objects(bucket_id,name) values('s13s-private','template/S-13_S.pdf')",
  );
  assert.equal(
    await value(reader, "select count(*) from storage.objects"),
    "0",
  );
  checks++;
  assert.equal(await value(admin, "select count(*) from storage.objects"), "1");
  checks++;
  await denied(
    reader.query(
      "insert into storage.objects(bucket_id,name) values('s13s-private','template/S-13_S.pdf')",
    ),
    /row-level security/,
  );
  const admin2 = await connection("authenticated", ids.admin);
  checks += await testConductors({
    root,
    admin,
    admin2,
    editor: ed1,
    reader,
    inactive,
    anon,
  });
  checks += await testAccess({
    root,
    admin,
    admin2,
    reader,
    anon,
    connect: (uid) => connection("authenticated", uid),
  });
  // Immediate revocation does not depend on refreshing a JWT claim.
  await root.query("update profiles set active=false where id=$1", [
    ids.editor,
  ]);
  await denied(ed1.query("select get_snapshot()"), /permiso/);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks,
        engine: await value(root, "select version()"),
        concurrency:
          "Two independent live PostgreSQL connections; one commit, one serialization conflict",
        scope:
          "Core migrations + emulated Supabase auth/storage schemas; hosted Auth/Storage/Realtime still require deployment verification",
      },
      null,
      2,
    ),
  );
} finally {
  for (const c of clients) await c.end().catch(() => {});
}
