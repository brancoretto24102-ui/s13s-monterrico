import { fixtureDate } from "./fixture-date";
import assert from "node:assert/strict";
import type { Client } from "pg";

export async function testConductors(clients: {
  root: Client;
  admin: Client;
  admin2: Client;
  editor: Client;
  reader: Client;
  inactive: Client;
  anon: Client;
}) {
  const { root, admin, admin2, editor, reader, inactive, anon } = clients;
  let checks = 0;
  const first = "55000000-0000-4000-8000-000000000001";
  const second = "55000000-0000-4000-8000-000000000002";
  const scalar = async (client: Client, sql: string, params: unknown[] = []) =>
    Object.values((await client.query(sql, params)).rows[0])[0] as any;
  const check = (actual: unknown, expected: unknown) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  const deny = async (
    client: Client,
    sql: string,
    params: unknown[],
    message: RegExp,
  ) => {
    await assert.rejects(client.query(sql, params), message);
    checks++;
  };
  const mutate = (
    client: Client,
    id: string,
    version: number | null,
    name: string,
    action: string,
  ) =>
    scalar(
      client,
      "select manage_conductor($1,$2,$3,$4,'Comprobación del maestro de conductores')",
      [id, version, name, action],
    );
  const get = async (id: string) =>
    (await scalar(admin, "select get_conductors()")).find(
      (c: any) => c.id === id,
    );
  const beforePeople = Number(
    await scalar(root, "select count(*) from people"),
  );
  check(
    await mutate(admin, first, 0, "  Conductor\t ficticio Uno  ", "create"),
    first,
  );
  const original = await get(first);
  check(
    [
      original.display_name,
      original.active,
      original.version,
      original.assignments_count,
    ],
    ["Conductor ficticio Uno", true, 1, 0],
  );
  check(original.code > 0, true);
  // The client keeps the creation UUID on a retry; only one person is created.
  await mutate(admin, first, 0, "Conductor ficticio Uno", "create");
  check(
    Number(await scalar(root, "select count(*) from people")),
    beforePeople + 1,
  );
  await deny(
    admin,
    "select manage_conductor($1,0,'Otra identidad','create','Reintento de prueba distinto')",
    [first],
    /existe o cambió/,
  );
  await deny(
    admin,
    "select manage_conductor($1,0,'   ','create','Alta de prueba inválida')",
    [second],
    /nombre/,
  );
  await deny(
    admin,
    "select manage_conductor($1,1,'Nombre','update','corto')",
    [first],
    /motivo/,
  );
  const active = (await scalar(editor, "select get_snapshot()")).conductors;
  check(
    active.some((c: any) => c.id === first),
    true,
  );
  const territory = await scalar(
    root,
    "select id from territories where territory_number=6",
  );
  const another = await scalar(
    root,
    "select id from territories where territory_number=7",
  );
  const territoryVersion = await scalar(
    root,
    "select version from territories where id=$1",
    [territory],
  );
  const anotherVersion = await scalar(
    root,
    "select version from territories where id=$1",
    [another],
  );
  const noCatalogPerson = crypto.randomUUID();
  await root.query(
    "insert into people(id,display_name,normalized_name) values($1,'Persona sin ficha','persona sin ficha')",
    [noCatalogPerson],
  );
  for (const personId of [null, crypto.randomUUID(), noCatalogPerson]) {
    await deny(
      editor,
      `select assign_territory($1,$2,'Persona sin ficha','${fixtureDate(20)}',$3)`,
      [another, anotherVersion, personId],
      /conductor activo del maestro/,
    );
  }
  await deny(
    editor,
    `select assign_territory($1,$2,'Nombre libre','${fixtureDate(20)}')`,
    [another, anotherVersion],
    /conductor activo del maestro/,
  );
  check(
    await scalar(
      root,
      "select count(*) from assignments where territory_id=$1",
      [another],
    ),
    "0",
  );
  await deny(
    editor,
    `select assign_territory($1,$2,'Nombre de otra persona','${fixtureDate(20)}',$3)`,
    [another, anotherVersion, original.person_id],
    /nombre.*cambió/,
  );
  const assignment = await scalar(
    editor,
    `select assign_territory($1,$2,$3,'${fixtureDate(20)}',$4)`,
    [territory, territoryVersion, original.display_name, original.person_id],
  );
  check(
    await scalar(root, "select person_id from assignments where id=$1", [
      assignment,
    ]),
    original.person_id,
  );
  await mutate(admin, first, 1, "Conductor ficticio Actualizado", "update");
  check(
    await scalar(
      root,
      "select assigned_name_snapshot from assignments where id=$1",
      [assignment],
    ),
    original.display_name,
  );
  const auditRename = (
    await root.query(
      "select old_data->>'display_name' as old_name,new_data->>'display_name' as new_name from audit_log where entity='people' and entity_id=$1 order by id desc limit 1",
      [original.person_id],
    )
  ).rows[0];
  check(
    [auditRename.old_name, auditRename.new_name],
    [original.display_name, "Conductor ficticio Actualizado"],
  );
  // Two independent administrator connections contend for the same version.
  const concurrent = await Promise.allSettled([
    mutate(admin, first, 2, "", "deactivate"),
    mutate(admin2, first, 2, "", "deactivate"),
  ]);
  check(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  check(
    concurrent.filter(
      (r) => r.status === "rejected" && r.reason.code === "40001",
    ).length,
    1,
  );
  const inactiveRecord = await get(first);
  check(
    [
      inactiveRecord.version,
      inactiveRecord.active,
      inactiveRecord.open_assignments,
    ],
    [3, false, 1],
  );
  check(
    (await scalar(editor, "select get_snapshot()")).conductors.some(
      (c: any) => c.id === first,
    ),
    false,
  );
  await deny(
    editor,
    `select assign_territory($1,$2,'Conductor ficticio Actualizado','${fixtureDate(20)}',$3)`,
    [another, anotherVersion, original.person_id],
    /inactivo o eliminado/,
  );
  // Deactivation never prevents finishing an already recorded assignment.
  await editor.query(
    `select complete_assignment($1,1,$2,'${fixtureDate(20)}')`,
    [assignment, territoryVersion + 1],
  );
  check((await get(first)).open_assignments, 0);
  await admin.query(
    `select correct_assignment($1,2,$2,$3,'${fixtureDate(20)}','${fixtureDate(20)}','Revisión de fechas del registro')`,
    [assignment, territoryVersion + 2, original.display_name],
  );
  check(
    await scalar(root, "select person_id from assignments where id=$1", [
      assignment,
    ]),
    original.person_id,
  );
  await mutate(admin, first, 3, "", "activate");
  check((await get(first)).active, true);
  await mutate(admin, first, 4, "", "delete");
  const deleted = await get(first);
  check(
    [deleted.active, !!deleted.deleted_at, deleted.version],
    [false, true, 5],
  );
  await deny(
    editor,
    `select assign_territory($1,$2,$3,'${fixtureDate(20)}',$4)`,
    [another, anotherVersion, deleted.display_name, deleted.person_id],
    /inactivo o eliminado/,
  );
  check(
    await scalar(
      root,
      "select assigned_name_snapshot from assignments where id=$1",
      [assignment],
    ),
    original.display_name,
  );
  await deny(
    admin,
    "select manage_conductor($1,5,'Nombre','update','Cambio de prueba inválido')",
    [first],
    /papelera/,
  );
  await mutate(admin, first, 5, "", "restore");
  const restored = await get(first);
  check(
    [
      restored.active,
      restored.deleted_at,
      restored.version,
      restored.person_id,
    ],
    [false, null, 6, original.person_id],
  );
  await mutate(admin, first, 6, "", "activate");
  await deny(
    admin,
    "select manage_conductor($1,null,'Nombre','update','Versión ausente en prueba')",
    [first],
    /actualizó/,
  );
  // Homonyms are separate people, never merged by a name comparison.
  await mutate(admin, second, 0, "Conductor ficticio Actualizado", "create");
  const homonym = await get(second);
  check(homonym.display_name, restored.display_name);
  check(
    homonym.person_id !== original.person_id && homonym.code !== original.code,
    true,
  );
  await editor.query(
    `select assign_territory($1,$2,$3,'${fixtureDate(20)}',$4)`,
    [another, anotherVersion, homonym.display_name, homonym.person_id],
  );
  check((await get(second)).assignments_count, 1);
  const manualCorrection = await scalar(
    root,
    "select id from assignments where territory_id=$1",
    [another],
  );
  await admin.query(
    `select correct_assignment($1,1,$2,'Responsable manual corregido','${fixtureDate(20)}',null,'Corrección manual del responsable')`,
    [manualCorrection, anotherVersion + 1],
  );
  check(
    await scalar(root, "select person_id from assignments where id=$1", [
      manualCorrection,
    ]),
    null,
  );
  check((await get(second)).assignments_count, 0);
  // Deletion also preserves future-module foreign keys and private backups.
  await root.query(
    "insert into meeting_schedule(starts_at,conductor_id) values('2026-04-02T12:00Z',$1)",
    [first],
  );
  await mutate(admin, first, 7, "", "delete");
  check(
    await scalar(
      root,
      "select count(*) from meeting_schedule where conductor_id=$1",
      [first],
    ),
    "1",
  );
  const backup = await scalar(admin, "select backup_data()");
  check(
    backup.conductors.some((c: any) => c.id === first && !!c.deleted_at),
    true,
  );
  check(
    backup.people.some(
      (p: any) =>
        p.id === original.person_id && p.display_name === restored.display_name,
    ),
    true,
  );
  check(
    backup.audit_log.some(
      (a: any) =>
        a.entity === "conductors" &&
        a.entity_id === first &&
        a.actor_id &&
        a.old_data &&
        a.new_data &&
        a.reason,
    ),
    true,
  );
  for (const client of [editor, reader, inactive]) {
    await deny(client, "select get_conductors()", [], /permiso/);
    await deny(
      client,
      "select manage_conductor($1,1,'No autorizado','update','Cambio de prueba prohibido')",
      [second],
      /permiso/,
    );
  }
  await deny(anon, "select get_conductors()", [], /permission denied/);
  await deny(
    anon,
    "select manage_conductor($1,1,'No autorizado','delete','Cambio de prueba prohibido')",
    [second],
    /permission denied/,
  );
  await deny(
    admin,
    "update conductors set active=false",
    [],
    /permission denied/,
  );
  await deny(admin, "delete from conductors", [], /permission denied/);
  await deny(
    root,
    "delete from conductors where id=$1",
    [second],
    /borrado físico/,
  );
  await deny(
    root,
    "update conductors set code=default where id=$1",
    [second],
    /identidad/,
  );
  check((await get(second)).active, true);
  // A concurrent deactivation must finish before an assignment can validate
  // that same conductor. Wait for the observed database lock, not a fixed delay.
  const lockTerritory = (
    await root.query("select * from territories where territory_number=81")
  ).rows[0];
  const editorPid = await scalar(editor, "select pg_backend_pid()");
  await admin.query("begin");
  try {
    await mutate(admin, second, 1, "", "deactivate");
    const waiting = editor.query(
      `select assign_territory($1,$2,$3,'${fixtureDate(20)}',$4)`,
      [
        lockTerritory.id,
        lockTerritory.version,
        homonym.display_name,
        homonym.person_id,
      ],
    );
    const rejection = assert.rejects(waiting, /inactivo o eliminado/);
    let blocked = false;
    for (let attempt = 0; attempt < 50 && !blocked; attempt++) {
      blocked = !!(await scalar(
        root,
        "select cardinality(pg_blocking_pids($1))>0",
        [editorPid],
      ));
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    check(blocked, true);
    await admin.query("commit");
    await rejection;
    checks++;
  } finally {
    await admin.query("rollback");
  }
  check(
    await scalar(
      root,
      "select count(*) from assignments where territory_id=$1",
      [lockTerritory.id],
    ),
    "0",
  );
  return checks;
}
