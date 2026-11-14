import assert from "node:assert/strict";
import type { Client } from "pg";
import { fixtureDate } from "./fixture-date";

export async function testHistoricalCorrections({
  root,
  admin,
  admin2,
  reader,
  editor,
  anon,
  connect,
}: {
  root: Client;
  admin: Client;
  admin2: Client;
  reader: Client;
  editor: Client;
  anon: Client;
  connect: (uid: string) => Promise<Client>;
}) {
  let checks = 0;
  const scalar = async (c: Client, sql: string, args: unknown[] = []) =>
    Object.values((await c.query(sql, args)).rows[0])[0] as any;
  const ok = (value: unknown) => {
    assert(value);
    checks++;
  };
  const denied = async (
    promise: Promise<unknown>,
    pattern = /permiso|permission denied/,
  ) => {
    await assert.rejects(promise, pattern);
    checks++;
  };
  const tid = crypto.randomUUID(),
    aid = crypto.randomUUID(),
    cid = crypto.randomUUID();
  const uid = crypto.randomUUID(),
    profile = crypto.randomUUID();
  const adminId = await scalar(admin, "select auth.uid()");
  const start = fixtureDate(40),
    end = fixtureDate(39);
  await admin.query(
    "select manage_conductor($1,0,'Conductor histórico sintético','create','Alta de prueba histórica')",
    [cid],
  );
  const person = await scalar(
    root,
    "select person_id from conductors where id=$1",
    [cid],
  );
  await admin.query(
    "select manage_conductor($1,1,'','deactivate','Desactivación sintética histórica')",
    [cid],
  );
  await root.query("begin");
  try {
    await root.query("select set_config('request.jwt.claim.sub',$1,true)", [
      adminId,
    ]);
    await root.query(
      "insert into territories(id,territory_number) select $1,max(territory_number)+1 from territories",
      [tid],
    );
    await root.query(
      "insert into assignments(id,territory_id,assigned_name_snapshot,assigned_at,completed_at,created_by,updated_by) values($1,$2,'Responsable histórico sin vínculo',$3,$4,$5,$5)",
      [aid, tid, start, end, adminId],
    );
    await root.query("commit");
  } catch (e) {
    await root.query("rollback");
    throw e;
  }
  const versions = async () =>
    (
      await root.query(
        "select a.version av,t.version tv from assignments a join territories t on t.id=a.territory_id where a.id=$1",
        [aid],
      )
    ).rows[0];
  const correct = async (
    c: Client,
    personId: string | null,
    name: string,
    version?: { av: number; tv: number },
  ) => {
    const v = version ?? (await versions());
    return c.query(
      "select correct_assignment_with_conductor($1,$2,$3,$4,$5,$6,$7,'Corrección histórica sintética')",
      [aid, v.av, v.tv, name, personId, start, end],
    );
  };
  for (const c of [reader, editor, anon]) {
    await denied(c.query("select get_correction_conductors()"));
    await denied(correct(c, person, "Conductor histórico sintético"));
  }
  const choices = await scalar(admin, "select get_correction_conductors()");
  ok(choices.some((c: any) => c.id === cid && !c.active));
  ok(
    !(await scalar(admin, "select get_snapshot()")).conductors.some(
      (c: any) => c.id === cid,
    ),
  );
  await denied(correct(admin, null, "Texto libre inventado"), /Seleccione/);
  await denied(
    correct(admin, crypto.randomUUID(), "Conductor inexistente"),
    /Seleccione/,
  );
  await denied(correct(admin, person, "Nombre desactualizado"), /cambió/);
  // Unlinked historical snapshots can be retained without inventing an identity.
  await correct(admin, null, "Responsable histórico sin vínculo");
  ok(
    (await root.query("select person_id from assignments where id=$1", [aid]))
      .rows[0].person_id === null,
  );
  await admin.query(
    "select manage_access_profile($1,0,'Correcciones históricas sintéticas',array['territories.correct'],'create','Prueba permiso de corrección')",
    [profile],
  );
  await root.query(
    "insert into auth.users(id,raw_user_meta_data,email) values($1,'{}','historial@example.invalid')",
    [uid],
  );
  await admin.query(
    "select manage_user($1,1,'Corrección sintética',null,'lector',true,false,'custom',$2,'update','Prueba permiso de corrección')",
    [uid, [profile]],
  );
  const custom = await connect(uid);
  ok(
    (await scalar(custom, "select get_correction_conductors()")).some(
      (c: any) => c.id === cid,
    ),
  );
  await denied(custom.query("select get_conductors()"));
  await correct(custom, person, "Conductor histórico sintético");
  const changed = (
    await root.query("select * from assignments where id=$1", [aid])
  ).rows[0];
  ok(
    changed.person_id === person &&
      changed.assigned_name_snapshot === "Conductor histórico sintético",
  );
  ok(
    (await scalar(root, "select active from conductors where id=$1", [cid])) ===
      false,
  );
  ok(
    (await scalar(root, "select active from people where id=$1", [person])) ===
      false,
  );
  const v = await versions();
  const race = await Promise.allSettled([
    correct(admin, person, "Conductor histórico sintético", v),
    correct(admin2, person, "Conductor histórico sintético", v),
  ]);
  ok(
    race.filter((r) => r.status === "fulfilled").length === 1 &&
      race.filter((r) => r.status === "rejected" && r.reason.code === "40001")
        .length === 1,
  );
  ok(
    await scalar(
      root,
      "select exists(select 1 from audit_log where entity='assignments' and entity_id=$1 and new_data->>'person_id'=$2 and reason='Corrección histórica sintética')",
      [aid, person],
    ),
  );
  await admin.query(
    "select manage_conductor($1,2,'','delete','Papelera sintética para validación')",
    [cid],
  );
  ok(
    !(await scalar(admin, "select get_correction_conductors()")).some(
      (c: any) => c.id === cid,
    ),
  );
  await denied(
    correct(admin, person, "Conductor histórico sintético"),
    /restaurarse/,
  );
  await admin.query(
    "select manage_access_profile($1,1,'Correcciones históricas sintéticas',array[]::text[],'update','Revocación sintética de corrección')",
    [profile],
  );
  await denied(custom.query("select get_correction_conductors()"));
  await denied(correct(custom, person, "Conductor histórico sintético"));
  return checks;
}
