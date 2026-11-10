import assert from "node:assert/strict";
import type { Client } from "pg";
export async function testVisitRestrictions({
  root,
  admin,
  admin2,
  editor,
  reader,
  inactive,
  anon,
  connect,
}: {
  root: Client;
  admin: Client;
  admin2: Client;
  editor: Client;
  reader: Client;
  inactive: Client;
  anon: Client;
  connect: (id: string) => Promise<Client>;
}) {
  let checks = 0;
  const scalar = async (c: Client, sql: string, args: unknown[] = []) =>
    Object.values((await c.query(sql, args)).rows[0])[0] as any;
  const equal = (a: unknown, b: unknown) => {
    assert.deepEqual(a, b);
    checks++;
  };
  const deny = async (
    promise: Promise<unknown>,
    pattern = /permiso|permission denied/,
  ) => {
    await assert.rejects(promise, pattern);
    checks++;
  };
  const mutate = (
    c: Client,
    id: string,
    version: number | null,
    territory: string | null,
    address: string,
    date: string | null,
    action: string,
    reason = "Comprobación sintética de domicilios",
  ) =>
    scalar(c, "select manage_visit_restriction($1,$2,$3,$4,$5,$6,$7)", [
      id,
      version,
      territory,
      address,
      date,
      action,
      reason,
    ]);
  const get = async (id: string) =>
    await scalar(
      root,
      "select to_jsonb(v) from visit_restrictions v where id=$1",
      [id],
    );
  const historyBefore = await scalar(
    root,
    "select md5(string_agg(to_jsonb(a)::text,'' order by id)) from assignments a",
  );
  const territory = await scalar(
    root,
    "select id from territories where territory_number=8",
  );
  const secondTerritory = await scalar(
    root,
    "select id from territories where territory_number=9",
  );
  const first = crypto.randomUUID(),
    second = crypto.randomUUID(),
    leap = crypto.randomUUID(),
    due = crypto.randomUUID();
  const today = await scalar(
    root,
    "select to_char((now() at time zone 'America/Lima')::date,'YYYY-MM-DD')",
  );
  const tomorrow = await scalar(
    root,
    "select to_char((now() at time zone 'America/Lima')::date+1,'YYYY-MM-DD')",
  );
  const anniversary = await scalar(
    root,
    "select to_char((now() at time zone 'America/Lima')::date-interval '1 year','YYYY-MM-DD')",
  );
  await deny(anon.query("select * from visit_restrictions"));
  await deny(anon.query("select last_value from visit_restrictions_code_seq"));
  await deny(
    mutate(
      anon,
      first,
      0,
      territory,
      "Domicilio de ejemplo",
      "2026-01-01",
      "create",
    ),
  );
  await deny(
    mutate(
      inactive,
      first,
      0,
      territory,
      "Domicilio de ejemplo",
      "2026-01-01",
      "create",
    ),
  );
  for (const c of [reader, editor])
    await deny(
      mutate(
        c,
        first,
        0,
        territory,
        "Domicilio de ejemplo",
        "2026-01-01",
        "create",
      ),
    );
  equal(
    await mutate(
      admin,
      first,
      0,
      territory,
      "  Domicilio\t sintético A  ",
      "2026-01-01",
      "create",
    ),
    first,
  );
  equal(
    [(await get(first)).address_reference, (await get(first)).eligible_on],
    ["Domicilio sintético A", "2027-01-01"],
  );
  await mutate(
    admin,
    first,
    0,
    territory,
    "Domicilio sintético A",
    "2026-01-01",
    "create",
  );
  equal(
    await scalar(root, "select count(*) from visit_restrictions where id=$1", [
      first,
    ]),
    "1",
  );
  equal((await get(first)).version, 1);
  await deny(
    mutate(
      admin,
      crypto.randomUUID(),
      0,
      territory,
      "DOMICILIO   SINTÉTICO A",
      "2026-01-01",
      "create",
    ),
    /Ya existe/,
  );
  await deny(
    mutate(admin, second, 0, territory, "Casa de ejemplo", tomorrow, "create"),
    /futura/,
  );
  await deny(
    mutate(admin, second, 0, territory, "", "2026-01-01", "create"),
    /domicilio/,
  );
  await deny(
    mutate(
      admin,
      second,
      0,
      crypto.randomUUID(),
      "Casa de ejemplo",
      "2026-01-01",
      "create",
    ),
    /territorio/,
  );
  await deny(
    mutate(
      admin,
      second,
      0,
      territory,
      "Casa de ejemplo",
      "2026-01-01",
      "create",
      "corto",
    ),
    /motivo/,
  );
  await mutate(
    admin,
    second,
    0,
    secondTerritory,
    "Domicilio sintético A",
    "2026-01-01",
    "create",
  );
  checks++;
  await mutate(
    admin,
    leap,
    0,
    territory,
    "Domicilio sintético bisiesto",
    "2024-02-29",
    "create",
  );
  equal((await get(leap)).eligible_on, "2025-02-28");
  await mutate(
    admin,
    due,
    0,
    territory,
    "Domicilio sintético aniversario",
    anniversary,
    "create",
  );
  equal((await get(due)).eligible_on, today);
  const snapshot = await scalar(admin, "select get_snapshot()");
  equal(snapshot.visit_restrictions.length, 4);
  equal((await scalar(reader, "select get_snapshot()")).visit_restrictions, []);
  equal(await scalar(reader, "select count(*) from visit_restrictions"), "0");
  equal(
    snapshot.visit_restriction_summary.find(
      (r: any) => r.territory_id === territory,
    ).eligible_count,
    2,
  );
  equal(await scalar(inactive, "select count(*) from visit_restrictions"), "0");
  await deny(reader.query("update visit_restrictions set active=false"));
  await deny(admin.query("delete from visit_restrictions"));
  await deny(
    root.query("delete from visit_restrictions where id=$1", [first]),
    /borrado físico/,
  );
  await assert.rejects(
    root.query(
      "update visit_restrictions set eligible_on='2026-01-02' where id=$1",
      [first],
    ),
    { code: "428C9" },
  );
  checks++;
  await deny(
    root.query(
      "update visit_restrictions set source_reference='Origen alterado' where id=$1",
      [first],
    ),
    /inmutables/,
  );
  await deny(
    mutate(
      admin,
      first,
      null,
      territory,
      "Casa corregida",
      "2026-01-01",
      "update",
    ),
    /actualizó/,
  );
  await deny(
    mutate(admin, first, 1, territory, "", "2026-01-01", "archive"),
    /antes de cumplir un año/,
  );
  const race = await Promise.allSettled([
    mutate(
      admin,
      first,
      1,
      territory,
      "Domicilio sintético corrección A",
      "2026-01-01",
      "update",
    ),
    mutate(
      admin2,
      first,
      1,
      territory,
      "Domicilio sintético corrección B",
      "2026-01-01",
      "update",
    ),
  ]);
  equal(race.filter((r) => r.status === "fulfilled").length, 1);
  equal(
    race.filter((r) => r.status === "rejected" && r.reason.code === "40001")
      .length,
    1,
  );
  await deny(
    mutate(admin, first, 2, territory, "", "2025-12-31", "renew"),
    /posterior/,
  );
  await mutate(admin, first, 2, territory, "", "2026-02-01", "renew");
  equal(
    [(await get(first)).reported_on, (await get(first)).eligible_on],
    ["2026-02-01", "2027-02-01"],
  );
  const audit = (
    await root.query(
      "select old_data,new_data,actor_id,reason from audit_log where entity='visit_restrictions' and entity_id=$1 order by id desc limit 1",
      [first],
    )
  ).rows[0];
  equal(
    [
      audit.old_data.eligible_on,
      audit.new_data.eligible_on,
      !!audit.actor_id,
      !!audit.reason,
    ],
    ["2027-01-01", "2027-02-01", true, true],
  );
  await mutate(admin, due, 1, null, "", null, "archive");
  equal((await get(due)).active, false);
  await mutate(admin, due, 2, null, "", null, "activate");
  equal((await get(due)).active, true);
  await mutate(admin, first, 3, null, "", null, "delete");
  equal(
    [!!(await get(first)).deleted_at, (await get(first)).active],
    [true, false],
  );
  equal(
    (await scalar(admin, "select backup_data()")).visit_restrictions.some(
      (r: any) => r.id === first && r.deleted_at,
    ),
    true,
  );
  await mutate(admin, first, 4, null, "", null, "restore");
  equal(
    [(await get(first)).deleted_at, (await get(first)).active],
    [null, true],
  );
  const duplicateRace = await Promise.allSettled([
    mutate(
      admin,
      crypto.randomUUID(),
      0,
      territory,
      "Domicilio sintético simultáneo",
      "2026-01-01",
      "create",
    ),
    mutate(
      admin2,
      crypto.randomUUID(),
      0,
      territory,
      "Domicilio sintético simultáneo",
      "2026-01-01",
      "create",
    ),
  ]);
  equal(duplicateRace.filter((r) => r.status === "fulfilled").length, 1);
  equal(
    duplicateRace.filter(
      (r) => r.status === "rejected" && r.reason.code === "23505",
    ).length,
    1,
  );
  // A custom scope sees only the new module and its minimal territory picker.
  const accessId = crypto.randomUUID(),
    userId = crypto.randomUUID();
  await root.query("insert into auth.users(id) values($1)", [userId]);
  await root.query(
    "update profiles set active=true,access_mode='custom' where id=$1",
    [userId],
  );
  await admin.query(
    "select manage_access_profile($1,0,'Domicilios sintéticos puntuales',array['visits.create'],'create','Comprobación de alcance del maestro')",
    [accessId],
  );
  await root.query(
    "insert into user_access_profiles(user_id,access_profile_id) values($1,$2)",
    [userId, accessId],
  );
  const custom = await connect(userId);
  const scoped = await scalar(custom, "select get_snapshot()");
  equal(
    [
      scoped.territories.length,
      scoped.assignments.length,
      scoped.conductors.length,
    ],
    [0, 0, 0],
  );
  equal(
    scoped.visit_territories.length > 0 && scoped.visit_restrictions.length > 0,
    true,
  );
  const customRow = crypto.randomUUID();
  await mutate(
    custom,
    customRow,
    0,
    territory,
    "Domicilio sintético con perfil",
    "2026-01-01",
    "create",
  );
  checks++;
  await deny(
    mutate(
      custom,
      customRow,
      1,
      territory,
      "Cambio sin permiso",
      "2026-01-01",
      "update",
    ),
  );
  await admin.query(
    "select manage_access_profile($1,1,'Domicilios sintéticos puntuales',array['territories.view'],'update','Revocación sintética de domicilios')",
    [accessId],
  );
  const limited = await scalar(custom, "select get_snapshot()");
  equal(limited.visit_restrictions, []);
  equal(limited.visit_territories, []);
  equal(limited.visit_restriction_summary.length > 0, true);
  equal(await scalar(custom, "select count(*) from visit_restrictions"), "0");
  await deny(
    mutate(
      custom,
      crypto.randomUUID(),
      0,
      territory,
      "No autorizado",
      "2026-01-01",
      "create",
    ),
  );
  await admin.query(
    "select manage_access_profile($1,2,'',array[]::text[],'deactivate','Revocación sintética del perfil')",
    [accessId],
  );
  equal(
    (await scalar(custom, "select get_snapshot()")).visit_restriction_summary,
    [],
  );
  equal(
    await scalar(
      root,
      "select md5(string_agg(to_jsonb(a)::text,'' order by id)) from assignments a",
    ),
    historyBefore,
  );
  return checks;
}
