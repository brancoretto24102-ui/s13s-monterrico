import assert from "node:assert/strict";
import type { Client } from "pg";
import { addDays, assignmentDeadline } from "../src/lib/assignmentTiming";
import { mondayOf } from "../src/lib/preachingSchedule";
import { todayLima } from "../src/lib/dates";

export async function testPreachingSchedule({
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
  const scalar = async (c: Client, q: string, args: unknown[] = []) =>
    Object.values((await c.query(q, args)).rows[0])[0] as any;
  const ok = (value: unknown) => {
    assert(value);
    checks++;
  };
  const denied = async (
    p: Promise<unknown>,
    pattern = /permiso|permission denied/,
  ) => {
    await assert.rejects(p, pattern);
    checks++;
  };
  const monday = mondayOf(todayLima()),
    next = addDays(monday, 7);
  const uid = crypto.randomUUID(),
    pid = crypto.randomUUID(),
    conductor = crypto.randomUUID(),
    secondConductor = crypto.randomUUID();
  await admin.query(
    "select manage_conductor($1,0,'Conductor sintético de cronograma','create','Alta sintética de cronograma')",
    [conductor],
  );
  await admin.query(
    "select manage_conductor($1,0,'Segundo conductor sintético','create','Alta sintética de cronograma')",
    [secondConductor],
  );
  const person = await scalar(
    root,
    "select person_id from conductors where id=$1",
    [conductor],
  );
  const adminId = await scalar(admin, "select auth.uid()");
  const tids = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const aids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await root.query("begin");
  try {
    await root.query("select set_config('request.jwt.claim.sub',$1,true)", [
      adminId,
    ]);
    const max = Number(
      await scalar(root, "select max(territory_number) from territories"),
    );
    for (let i = 0; i < tids.length; i++)
      await root.query(
        "insert into territories(id,territory_number,active) values($1,$2,true)",
        [tids[i], max + i + 1],
      );
    for (const [i, start, end] of [
      [0, addDays(monday, -40), addDays(monday, -1)],
      [1, addDays(monday, -1), null],
      [2, addDays(monday, -110), null],
    ] as const)
      await root.query(
        "insert into assignments(id,territory_id,person_id,assigned_name_snapshot,assigned_at,completed_at,created_by,updated_by) values($1,$2,$3,'Conductor sintético de cronograma',$4,$5,$6,$6)",
        [aids[i], tids[i], person, start, end, adminId],
      );
    await root.query("commit");
  } catch (e) {
    await root.query("rollback");
    throw e;
  }
  const rows = (territory: string = tids[0], reason = "", day = 0) => [
    {
      id: crypto.randomUUID(),
      day,
      time: "08:00",
      meeting_point: "Punto sintético de reunión",
      conductor_ids: [conductor],
      territories: territory ? [{ territory_id: territory, reason }] : [],
    },
  ];
  const save = (
    c: Client,
    id: string,
    version: number,
    day: string,
    r: unknown,
  ) =>
    scalar(c, "select save_preaching_schedule($1,$2,$3,$4)", [
      id,
      version,
      day,
      JSON.stringify(r),
    ]);
  const profile = async (permissions: string[], version = 0) =>
    scalar(
      admin,
      "select manage_access_profile($1,$2,'Encargado sintético de cronograma',$3,$4,'Prueba granular de cronograma')",
      [pid, version, permissions, version ? "update" : "create"],
    );
  const fingerprint = () =>
    scalar(
      root,
      "select md5(string_agg(to_jsonb(a)::text,'' order by id)) from assignments a",
    );
  const before = await fingerprint();
  await root.query("begin");
  try {
    await root.query("select set_config('request.jwt.claim.sub',$1,true)", [
      adminId,
    ]);
    await root.query(
      "insert into preaching_template(slots,updated_by) values($1,$2)",
      [JSON.stringify(rows("")), adminId],
    );
    await root.query("commit");
  } catch (e) {
    await root.query("rollback");
    throw e;
  }
  ok(
    (await scalar(
      root,
      "select count(*) from audit_log where entity='preaching_template' and operation='INSERT' and actor_id=$1",
      [adminId],
    )) === "1",
  );
  await denied(anon.query("select * from preaching_template"));
  ok((await scalar(reader, "select count(*) from preaching_template")) === "0");
  await denied(admin.query("update preaching_template set slots='[]'"));
  await denied(root.query("delete from preaching_template"), /borrado físico/);
  await denied(anon.query("select get_preaching_context($1)", [monday]));
  await denied(reader.query("select get_preaching_context($1)", [monday]));
  await denied(editor.query("select get_preaching_context($1)", [monday]));
  await denied(anon.query("select * from preaching_schedules"));
  ok(
    (await scalar(reader, "select count(*) from preaching_schedules")) === "0",
  );
  await denied(
    reader.query("insert into preaching_schedules(week_start) values($1)", [
      monday,
    ]),
  );
  ok(
    (await scalar(
      root,
      "select has_function_privilege('authenticated','private.normalize_preaching_rows(date,jsonb)','execute')",
    )) === false,
  );
  ok(
    (await scalar(
      root,
      "select has_function_privilege('anon','public.save_preaching_schedule(uuid,integer,date,jsonb)','execute')",
    )) === false,
  );
  await profile(["schedules.create", "schedules.edit", "schedules.export"]);
  await root.query(
    "insert into auth.users(id,raw_user_meta_data,email) values($1,'{\"display_name\":\"Cuenta sintética de cronograma\"}','cronograma@example.invalid')",
    [uid],
  );
  await admin.query(
    "select manage_user($1,1,'Cuenta sintética de cronograma',null,'lector',true,false,'custom',$2,'update','Acceso sintético de cronograma')",
    [uid, [pid]],
  );
  const custom = await connect(uid),
    custom2 = await connect(uid);
  const access = await scalar(custom, "select get_access_context()");
  ok(
    access.permissions.includes("schedules.view") &&
      !access.permissions.includes("territories.view"),
  );
  ok((await scalar(custom, "select get_snapshot()")).assignments.length === 0);
  const auditBeforePreview = await scalar(
    root,
    "select count(*) from audit_log where entity='preaching_schedules' and operation='EXPORT'",
  );
  const data = await scalar(custom, "select get_preaching_context($1)", [
    monday,
  ]);
  ok(
    (await scalar(
      root,
      "select count(*) from audit_log where entity='preaching_schedules' and operation='EXPORT'",
    )) === auditBeforePreview,
  );
  ok(data.territories.some((t: any) => t.id === tids[0]));
  ok(data.conductors.some((c: any) => c.id === conductor));
  ok(
    data.template.length === 1 &&
      data.template[0].conductor_ids[0] === conductor,
  );
  ok(
    data.assignments.every(
      (a: any) => !Object.hasOwn(a, "assigned_name_snapshot"),
    ),
  );
  await denied(custom.query("select get_conductors()"));
  ok(
    (await scalar(custom, "select count(*) from assignments where id=$1", [
      aids[0],
    ])) === "0",
  );
  const weekId = crypto.randomUUID();
  for (const reason of [
    "",
    "     ",
    "\t\n".repeat(8),
    "\u00a0".repeat(10),
    "A       B",
    "corto",
    "x".repeat(2001),
  ])
    await denied(
      save(custom, weekId, 0, monday, rows(tids[0], reason)),
      /motivo/,
    );
  ok(
    (await scalar(
      root,
      "select count(*) from preaching_schedules where id=$1",
      [weekId],
    )) === "0",
  );
  const r = rows(
    tids[0],
    "Necesidad de predicación antes de cumplir el descanso.",
  );
  (r[0] as any).conductor_names = ["Nombre manipulado"];
  (r[0].territories[0] as any).policy = { kind: "available" };
  const saved = await save(custom, weekId, 0, monday, r);
  ok(
    saved.version === 1 && saved.rows[0].territories[0].policy.kind === "rest",
  );
  ok(saved.rows[0].conductor_names[0] === "Conductor sintético de cronograma");
  const observation = (
    await root.query(
      "select * from territory_observations where schedule_id=$1",
      [weekId],
    )
  ).rows[0];
  ok(
    observation.kind === "schedule_exception" &&
      observation.assignment_id === null &&
      observation.schedule_entry_id === r[0].id &&
      observation.body.includes(r[0].territories[0].reason),
  );
  ok(
    (await scalar(
      root,
      "select count(*) from audit_log where entity='preaching_schedules' and entity_id=$1 and operation='INSERT'",
      [weekId],
    )) === "1",
  );
  await save(custom, weekId, 1, monday, r);
  ok(
    (await scalar(
      root,
      "select count(*) from territory_observations where schedule_id=$1",
      [weekId],
    )) === "1",
  );
  await denied(save(custom, weekId, 1, monday, r), /guardó|actualiza/i);
  await denied(
    save(custom, weekId, null as any, monday, r),
    /versión|actualiza/i,
  );
  await denied(
    save(custom, crypto.randomUUID(), 0, addDays(monday, 1), r),
    /lunes/,
  );
  await denied(
    save(
      custom,
      weekId,
      2,
      monday,
      rows(tids[2], "El administrador tampoco puede omitir el cierre."),
    ),
    /cerrarse/,
  );
  const openRows = rows(tids[1]);
  const twoRows = [...r, { ...rows("", "", 2)[0], time: "19:20" }];
  const withWednesday = await save(custom, weekId, 2, monday, twoRows);
  ok(withWednesday.rows.length === 2);
  await save(custom, weekId, 3, monday, r);
  ok(
    (await scalar(
      root,
      "select exists(select 1 from audit_log where entity='preaching_schedules' and entity_id=$1 and jsonb_array_length(old_data->'rows')=2 and jsonb_array_length(new_data->'rows')=1)",
      [weekId],
    )) === true,
  );
  const duplicate = [rows("", "", 0)[0], rows("", "", 0)[0]];
  await denied(save(custom, weekId, 4, monday, duplicate), /dos salidas/);
  const tduplicate = [
    rows(tids[3])[0],
    { ...rows(tids[3])[0], conductor_ids: [secondConductor] },
  ];
  await denied(save(custom, weekId, 4, monday, tduplicate), /se repite/);
  await denied(
    save(custom, weekId, 4, monday, [
      { ...r[0], conductor_ids: [crypto.randomUUID()] },
    ]),
    /conductor/,
  );
  await denied(
    save(custom, weekId, 4, monday, [
      {
        ...r[0],
        territories: [{ territory_id: crypto.randomUUID(), reason: "" }],
      },
    ]),
    /Territorio/,
  );
  await denied(
    save(custom, weekId, 4, monday, [{ ...r[0], time: "25:00" }]),
    /hora/,
  );
  await denied(
    save(custom, weekId, 4, monday, [{ ...r[0], meeting_point: "   " }]),
    /punto/,
  );
  await denied(
    save(custom, weekId, 4, monday, [{ ...r[0], conductor_ids: [] }]),
    /conductores/,
  );
  await denied(
    save(
      custom,
      weekId,
      4,
      monday,
      Array.from({ length: 101 }, () => rows("")[0]),
    ),
    /100/,
  );
  const race = await Promise.allSettled([
    save(custom, weekId, 4, monday, r),
    save(custom2, weekId, 4, monday, r),
  ]);
  ok(
    race.filter((x) => x.status === "fulfilled").length === 1 &&
      race.filter((x) => x.status === "rejected" && x.reason.code === "40001")
        .length === 1,
  );
  const future = await save(custom, crypto.randomUUID(), 0, next, openRows);
  ok(future.rows[0].territories[0].policy.kind === "continuation");
  const exported = await scalar(
    custom,
    "select export_preaching_schedule($1,$2)",
    [future.id, future.version],
  );
  ok(
    exported.rows[0].conductor_names[0] === "Conductor sintético de cronograma",
  );
  await denied(
    custom.query("select export_preaching_schedule($1,0)", [future.id]),
    /cambió/,
  );
  await denied(
    reader.query("select export_preaching_schedule($1,1)", [future.id]),
  );
  ok(
    (await scalar(admin, "select backup_data()")).preaching_schedules.some(
      (w: any) => w.id === weekId,
    ),
  );
  const unchanged = await fingerprint();
  ok(unchanged === before);
  const start = addDays(monday, -110),
    deadline = assignmentDeadline(start);
  ok(
    (
      await scalar(root, "select private.preaching_territory_status($1,$2)", [
        tids[2],
        deadline,
      ])
    ).kind === "continuation",
  );
  ok(
    (
      await scalar(root, "select private.preaching_territory_status($1,$2)", [
        tids[2],
        addDays(deadline, 1),
      ])
    ).kind === "blocked",
  );
  const av = await scalar(root, "select version from assignments where id=$1", [
      aids[2],
    ]),
    tv = await scalar(root, "select version from territories where id=$1", [
      tids[2],
    ]);
  await admin.query(
    "select complete_assignment_with_reason($1,$2,$3,$4,'Cierre fuera de plazo para prueba sintética')",
    [aids[2], av, tv, monday],
  );
  ok(
    (
      await scalar(root, "select private.preaching_territory_status($1,$2)", [
        tids[2],
        monday,
      ])
    ).kind === "rest",
  );
  await denied(
    save(custom, future.id, 1, next, rows(tids[2], "", 0)),
    /motivo/,
  );
  const eligible = await save(
    custom,
    crypto.randomUUID(),
    0,
    addDays(monday, 14),
    rows(tids[2], "", 0),
  );
  ok(eligible.rows[0].territories[0].policy.kind === "available");
  const createRace = await Promise.allSettled([
    save(admin, crypto.randomUUID(), 0, addDays(monday, 28), []),
    save(admin2, crypto.randomUUID(), 0, addDays(monday, 28), []),
  ]);
  ok(
    createRace.filter((x) => x.status === "fulfilled").length === 1 &&
      createRace.filter(
        (x) => x.status === "rejected" && x.reason.code === "40001",
      ).length === 1,
  );
  // Closing a previously scheduled open territory changes its rest date.
  const aVersion = await scalar(
      root,
      "select version from assignments where id=$1",
      [aids[1]],
    ),
    tVersion = await scalar(
      root,
      "select version from territories where id=$1",
      [tids[1]],
    );
  await admin.query("select complete_assignment($1,$2,$3,$4)", [
    aids[1],
    aVersion,
    tVersion,
    monday,
  ]);
  await denied(
    custom.query("select export_preaching_schedule($1,1)", [future.id]),
    /descanso/,
  );
  await profile(
    ["schedules.create"],
    Number(
      await scalar(root, "select version from access_profiles where id=$1", [
        pid,
      ]),
    ),
  );
  await denied(save(custom, weekId, 5, monday, r));
  await denied(
    custom.query("select export_preaching_schedule($1,1)", [future.id]),
  );
  await profile(
    ["schedules.view", "schedules.export"],
    Number(
      await scalar(root, "select version from access_profiles where id=$1", [
        pid,
      ]),
    ),
  );
  await denied(save(custom, crypto.randomUUID(), 0, addDays(monday, 21), []));
  await profile(
    [],
    Number(
      await scalar(root, "select version from access_profiles where id=$1", [
        pid,
      ]),
    ),
  );
  await denied(custom.query("select get_preaching_context($1)", [monday]));
  ok(
    (await scalar(custom, "select count(*) from preaching_schedules")) === "0",
  );
  await denied(
    root.query("delete from preaching_schedules where id=$1", [weekId]),
    /borrado físico|foreign key/,
  );
  return checks;
}
