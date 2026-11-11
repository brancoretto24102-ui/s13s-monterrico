import assert from "node:assert/strict";
import type { Client } from "pg";
import { addDays } from "../src/lib/assignmentTiming";

export async function testAssignmentTiming({
  root,
  admin,
  admin2,
  editor,
  reader,
  anon,
  connect,
}: {
  root: Client;
  admin: Client;
  admin2: Client;
  editor: Client;
  reader: Client;
  anon: Client;
  connect: (uid: string) => Promise<Client>;
}) {
  let checks = 0;
  const scalar = async (c: Client, sql: string, args: unknown[] = []) =>
    Object.values((await c.query(sql, args)).rows[0])[0] as any;
  const equal = (a: unknown, b: unknown) => {
    assert.deepEqual(a, b);
    checks++;
  };
  const deny = async (
    p: Promise<unknown>,
    pattern = /permiso|permission denied/,
  ) => {
    await assert.rejects(p, pattern);
    checks++;
  };
  const today = await scalar(
    root,
    "select to_char((now() at time zone 'America/Lima')::date,'YYYY-MM-DD')",
  );
  const day = (ago: number) => addDays(today, -ago);
  const territory = (n: number) =>
    scalar(root, "select id from territories where territory_number=$1", [n]);
  const tv = (id: string) =>
    scalar(root, "select version from territories where id=$1", [id]);
  const assignment = async (id: string) =>
    (
      await root.query(
        "select to_jsonb(a) as record from assignments a where id=$1",
        [id],
      )
    ).rows[0].record;
  const seed = async (n: number, start: string, end: string | null) => {
    const tid = await territory(n),
      id = crypto.randomUUID();
    const actor = await scalar(admin, "select auth.uid()");
    await root.query("begin");
    try {
      await root.query("select set_config('request.jwt.claim.sub',$1,true)", [
        actor,
      ]);
      await root.query(
        "insert into assignments(id,territory_id,assigned_name_snapshot,assigned_at,completed_at,created_by,updated_by) values($1,$2,'Registro previo sintético',$3,$4,$5,$5)",
        [id, tid, start, end, actor],
      );
      await root.query("commit");
    } catch (e) {
      await root.query("rollback");
      throw e;
    }
    return { id, tid };
  };
  const conductor = crypto.randomUUID();
  await admin.query(
    "select manage_conductor($1,0,'Conductor sintético de plazos','create','Alta sintética para comprobar plazos')",
    [conductor],
  );
  const person = await scalar(
    root,
    "select person_id from conductors where id=$1",
    [conductor],
  );
  const assign = async (
    c: Client,
    tid: string,
    date: string,
    reason: string | null = null,
    version?: number,
  ) =>
    scalar(
      c,
      "select assign_territory_with_reason($1,$2,'Conductor sintético de plazos',$3,$4,$5)",
      [tid, version ?? (await tv(tid)), date, person, reason],
    );
  const close = async (
    c: Client,
    id: string,
    date: string,
    reason: string | null = null,
  ) => {
    const a = await assignment(id);
    return c.query("select complete_assignment_with_reason($1,$2,$3,$4,$5)", [
      id,
      a.version,
      await tv(a.territory_id),
      date,
      reason,
    ]);
  };
  const correct = async (
    c: Client,
    id: string,
    start: string,
    end: string | null,
    name = "Registro corregido sintético",
    reason = "Corrección sintética de las fechas",
  ) => {
    const a = await assignment(id);
    return c.query("select correct_assignment($1,$2,$3,$4,$5,$6,$7)", [
      id,
      a.version,
      await tv(a.territory_id),
      name,
      start,
      end,
      reason,
    ]);
  };
  const notes = (tid: string) =>
    scalar(
      root,
      "select count(*) from territory_observations where territory_id=$1 and kind='timing_exception'",
      [tid],
    );
  const rest = await seed(20, day(40), day(20));
  const baselineVersion = await tv(rest.tid);
  await deny(
    assign(editor, rest.tid, day(7), "Motivo escrito sin autorización"),
  );
  await deny(
    scalar(
      admin,
      "select assign_territory($1,$2,'Conductor sintético de plazos',$3,$4)",
      [rest.tid, baselineVersion, day(7), person],
    ),
    /motivo obligatorio/,
  );
  for (const reason of [
    null,
    "   ",
    "\t\n".repeat(8),
    "\u00a0".repeat(8),
    "A       B",
    "corto",
    "x".repeat(2001),
  ])
    await deny(assign(admin, rest.tid, day(7), reason), /motivo obligatorio/);
  equal(await tv(rest.tid), baselineVersion);
  equal(await notes(rest.tid), "0");
  // Old and new entry points enforce the same policy; day 14 is valid.
  const normal = await scalar(
    editor,
    "select assign_territory($1,$2,'Conductor sintético de plazos',$3,$4)",
    [rest.tid, baselineVersion, day(6), person],
  );
  equal((await assignment(normal)).assigned_at, day(6));
  equal(await notes(rest.tid), "0");
  await close(editor, normal, today);
  checks++;

  const exact = await seed(21, "2024-01-31", null);
  await close(editor, exact.id, "2024-04-30");
  checks++;
  equal(await notes(exact.tid), "0");
  const late = await seed(22, "2024-01-31", null);
  await deny(
    close(editor, late.id, "2024-05-01", "Un motivo no otorga el permiso"),
  );
  await deny(close(admin, late.id, "2024-05-01"), /motivo obligatorio/);
  await deny(
    scalar(admin, "select complete_assignment($1,1,$2,'2024-05-01')", [
      late.id,
      await tv(late.tid),
    ]),
    /motivo obligatorio/,
  );
  equal((await assignment(late.id)).version, 1);
  equal(await notes(late.tid), "0");
  const reason = "Cierre tardío por una circunstancia sintética documentada";
  await close(admin, late.id, "2024-05-01", reason);
  const note = (
    await root.query(
      "select * from territory_observations where assignment_id=$1",
      [late.id],
    )
  ).rows[0];
  equal(
    [
      note.kind,
      !!note.created_by,
      note.body.includes(reason),
      note.body.includes("30/04/2024"),
    ],
    ["timing_exception", true, true, true],
  );
  equal(
    await scalar(
      root,
      "select reason from audit_log where entity='assignments' and entity_id=$1 order by id desc limit 1",
      [late.id],
    ),
    `Excepción de plazos al cerrar: ${reason}`,
  );
  equal(
    await scalar(
      root,
      "select count(*) from audit_log where entity='territory_observations' and entity_id=$1 and actor_id is not null",
      [note.id],
    ),
    "1",
  );
  const long = await seed(23, "2024-01-31", null);
  await close(admin, long.id, "2024-05-01", "x".repeat(2000));
  equal(
    (
      await scalar(
        root,
        "select body from territory_observations where assignment_id=$1",
        [long.id],
      )
    ).endsWith("x".repeat(2000)),
    true,
  );

  const early = await seed(24, day(30), day(2));
  const earlyId = await assign(
    admin,
    early.tid,
    today,
    "Actividad especial sintética que requiere iniciar antes",
  );
  equal(await notes(early.tid), "1");
  // Closing normally does not require repeating an already approved early start.
  await close(editor, earlyId, today);
  equal(await notes(early.tid), "1");
  const race = await seed(25, day(30), day(2));
  const raceVersion = await tv(race.tid);
  const results = await Promise.allSettled([
    assign(
      admin,
      race.tid,
      today,
      "Excepción sintética concurrente uno",
      raceVersion,
    ),
    assign(
      admin2,
      race.tid,
      today,
      "Excepción sintética concurrente dos",
      raceVersion,
    ),
  ]);
  equal(results.filter((r) => r.status === "fulfilled").length, 1);
  equal(
    results.filter((r) => r.status === "rejected" && r.reason.code === "40001")
      .length,
    1,
  );
  equal(await notes(race.tid), "1");
  const structural = await seed(26, day(30), day(2));
  const structuralVersion = await tv(structural.tid);
  await deny(
    assign(
      admin,
      structural.tid,
      day(2),
      "El motivo no autoriza solapar fechas",
    ),
    /Conflicto/,
  );
  await deny(
    assign(
      admin,
      structural.tid,
      addDays(today, 1),
      "El motivo no autoriza una fecha futura",
    ),
    /futuras/,
  );
  equal(await notes(structural.tid), "0");
  equal(await tv(structural.tid), structuralVersion);
  await deny(
    assign(reader, await territory(27), today, "Un lector no puede asignar"),
  );
  await deny(
    assign(anon, await territory(27), today, "Acceso anónimo de prueba"),
  );
  await deny(
    editor.query("select private.assignment_timing_issues($1,$2,null,null)", [
      await territory(27),
      today,
    ]),
  );

  // A custom profile must grant both the operation and its timing exception.
  const profileId = crypto.randomUUID(),
    userId = crypto.randomUUID();
  await root.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
    [userId, { role: "administrador", override_timing: true }],
  );
  await admin.query(
    "select manage_access_profile($1,0,'Operador sintético de plazos',$2,'create','Prueba de permisos de excepción')",
    [
      profileId,
      ["territories.assign", "territories.complete", "territories.correct"],
    ],
  );
  await admin.query(
    "select manage_user($1,1,'Usuario sintético de plazos',null,'lector',true,false,'custom',$2,'update','Alta sintética para validar excepciones')",
    [userId, [profileId]],
  );
  const custom = await connect(userId);
  const customCase = await seed(27, day(30), day(2));
  await deny(
    assign(
      custom,
      customCase.tid,
      today,
      "Los metadatos editables no autorizan una excepción",
    ),
  );
  const correctionCase = await seed(28, "2024-01-31", null);
  await deny(correct(custom, correctionCase.id, "2024-01-31", "2024-05-01"));
  await deny(
    custom.query(
      "select correct_assignment($1,1,$2,'Registro corregido sintético','2024-01-31','2024-05-01','El valor nulo no debe desactivar la regla',null)",
      [correctionCase.id, await tv(correctionCase.tid)],
    ),
  );
  equal(await notes(correctionCase.tid), "0");
  const changeProfile = async (permissions: string[]) => {
    const version = await scalar(
      root,
      "select version from access_profiles where id=$1",
      [profileId],
    );
    await admin.query(
      "select manage_access_profile($1,$2,'Operador sintético de plazos',$3,'update','Cambio sintético de permiso explícito')",
      [profileId, version, permissions],
    );
  };
  const allowed = [
    "territories.assign",
    "territories.complete",
    "territories.correct",
    "territories.override_timing",
  ];
  await changeProfile(allowed);
  await deny(assign(custom, customCase.tid, today), /motivo obligatorio/);
  const customAssignment = await assign(
    custom,
    customCase.tid,
    today,
    "Excepción sintética aprobada por perfil explícito",
  );
  equal(!!customAssignment, true);
  equal(await notes(customCase.tid), "1");
  await correct(custom, correctionCase.id, "2024-01-31", "2024-05-01");
  equal(await notes(correctionCase.tid), "1");
  await changeProfile(["territories.override_timing"]);
  await deny(
    assign(
      custom,
      await territory(29),
      today,
      "El permiso de excepción no concede asignación",
    ),
  );
  await changeProfile([
    "territories.assign",
    "territories.complete",
    "territories.correct",
  ]);
  const revoked = await seed(29, day(30), day(2));
  await deny(
    assign(
      custom,
      revoked.tid,
      today,
      "Permiso revocado sin refrescar la sesión",
    ),
  );
  equal(await notes(revoked.tid), "0");

  const previous = await seed(30, day(60), day(40));
  await seed(30, day(20), day(18));
  await deny(correct(custom, previous.id, day(60), day(30)));
  equal(await notes(previous.tid), "0");
  await correct(admin, previous.id, day(60), day(30));
  equal(await notes(previous.tid), "1");
  // Name-only corrections do not reclassify unchanged historical dates.
  const historical = await seed(31, "2024-01-31", "2024-05-01");
  await correct(
    custom,
    historical.id,
    "2024-01-31",
    "2024-05-01",
    "Nombre histórico sintético corregido",
  );
  equal(await notes(historical.tid), "0");
  const backdated = await territory(32);
  await deny(
    assign(
      editor,
      backdated,
      "2024-01-31",
      "No se puede crear ya vencido sin autorización",
    ),
  );
  await deny(assign(admin, backdated, "2024-01-31"), /motivo obligatorio/);
  const backdatedId = await assign(
    admin,
    backdated,
    "2024-01-31",
    "Registro retroactivo sintético autorizado con motivo",
  );
  equal(await notes(backdated), "1");
  equal((await assignment(backdatedId)).completed_at, null);
  const dateCheck = await territory(33);
  equal(
    (
      await scalar(
        root,
        "select private.assignment_timing_issues($1,'2023-11-30','2024-02-29',null)",
        [dateCheck],
      )
    ).length,
    0,
  );
  equal(
    (
      await scalar(
        root,
        "select private.assignment_timing_issues($1,'2023-11-30','2024-03-01',null)",
        [dateCheck],
      )
    ).length,
    1,
  );
  const backup = await scalar(admin, "select backup_data()");
  equal(
    backup.territory_observations.some(
      (n: any) =>
        n.id === note.id &&
        n.kind === "timing_exception" &&
        n.assignment_id === late.id,
    ),
    true,
  );
  return checks;
}
