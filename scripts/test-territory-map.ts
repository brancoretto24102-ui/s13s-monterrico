import assert from "node:assert/strict";
import type { Client } from "pg";
import { permissionKeys } from "../src/lib/permissions";

export async function testTerritoryMap({
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
  const adminId = await scalar(admin, "select auth.uid()"),
    uid = crypto.randomUUID(),
    pid = crypto.randomUUID();
  const historyBefore = await scalar(
    root,
    "select md5(coalesce(jsonb_agg(a order by id)::text,'')) from assignments a",
  );
  const tids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const max = Number(
    await scalar(root, "select max(territory_number) from territories"),
  );
  await root.query("select set_config('request.jwt.claim.sub',$1,false)", [
    adminId,
  ]);
  for (let i = 0; i < tids.length; i++)
    await root.query(
      "insert into territories(id,territory_number,active) values($1,$2,true)",
      [tids[i], max + i + 1],
    );
  const square = (x = -80.64, y = -5.19) => [
    [x, y],
    [x + 0.001, y],
    [x + 0.001, y + 0.001],
    [x, y + 0.001],
    [x, y],
  ];
  const geometry = {
    type: "MultiPolygon",
    coordinates: [[square()], [square(-80.63)]],
  };
  const polygon = { type: "Polygon", coordinates: [square()] };
  const id = crypto.randomUUID(),
    second = crypto.randomUUID(),
    third = crypto.randomUUID();
  const source = "Contornos sintéticos de pruebas",
    reason = "Revisión sintética de límites",
    hash = "a".repeat(64);
  const version = async (sid = id) =>
    Number(
      await scalar(
        root,
        "select version from territory_geometries where id=$1",
        [sid],
      ),
    );
  const manage = (
    c: Client,
    action: string,
    v: number | null,
    sid = id,
    tid = tids[0],
    g: unknown = geometry,
    motive = reason,
    label = source,
  ) =>
    scalar(c, "select manage_territory_geometry($1,$2,$3,$4,$5,$6,$7,$8)", [
      sid,
      v,
      tid,
      g,
      label,
      action,
      motive,
      hash,
    ]);
  const profile = async (permissions: string[]) => {
    const v = Number(
      await scalar(
        root,
        "select coalesce((select version from access_profiles where id=$1),0)",
        [pid],
      ),
    );
    await admin.query(
      "select manage_access_profile($1,$2,'Geografía sintética',$3,$4,'Ajuste sintético de accesos')",
      [pid, v, permissions, v ? "update" : "create"],
    );
  };
  await profile(["maps.view"]);
  await root.query("insert into auth.users(id) values($1)", [uid]);
  const uv = await scalar(root, "select version from profiles where id=$1", [
    uid,
  ]);
  await admin.query(
    "select manage_user($1,$2,'Usuario sintético de mapa','mapa.prueba','lector',true,false,'custom',$3,'update','Alta sintética de consulta')",
    [uid, uv, [pid]],
  );
  const custom = await connect(uid);
  for (const c of [anon, reader, editor, inactive]) {
    await denied(c.query("select get_territory_map()"));
    await denied(manage(c, "create", 0));
    await denied(c.query("select export_territory_geometries('{}')"));
  }
  await denied(
    custom.query("select private.validate_territory_geometry($1)", [geometry]),
  );
  await denied(
    custom.query("insert into territory_geometries(id) values($1)", [id]),
  );
  await denied(
    custom.query("update territory_geometries set source='Escalamiento'"),
  );
  await denied(custom.query("delete from territory_geometries"));
  ok(
    (await scalar(reader, "select count(*) from territory_geometries")) === "0",
  );
  await denied(manage(custom, "create", 0));
  const snapshot = await scalar(custom, "select get_snapshot()");
  ok(
    snapshot.assignments.length === 0 &&
      snapshot.people.length === 0 &&
      snapshot.territories.length === 0,
  );
  const currentDate = await scalar(
    root,
    "select to_char((now() at time zone 'America/Lima')::date,'YYYY-MM-DD')",
  );
  const anniversary = await scalar(
    root,
    "select to_char((now() at time zone 'America/Lima')::date-interval '1 year','YYYY-MM-DD')",
  );
  const visitIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  for (let i = 0; i < visitIds.length; i++)
    await admin.query(
      "select manage_visit_restriction($1,0,$2,$3,$4,'create','Alta sintética de aviso geográfico')",
      [
        visitIds[i],
        tids[i === 4 ? 1 : 0],
        `UI_PRIVATE_ADDRESS_${i}`,
        i === 1 || i === 2 ? anniversary : currentDate,
      ],
    );
  await admin.query(
    "select manage_visit_restriction($1,1,null,'',null,'archive','Archivo sintético de domicilio')",
    [visitIds[2]],
  );
  await admin.query(
    "select manage_visit_restriction($1,1,null,'',null,'delete','Papelera sintética de domicilio')",
    [visitIds[3]],
  );
  const initial = await scalar(custom, "select get_territory_map()");
  const visits = initial.visit_restriction_summary;
  ok(
    visits.find((row: any) => row.territory_id === tids[0]).blocking_count ===
      1,
  );
  ok(
    visits.find((row: any) => row.territory_id === tids[0]).eligible_count ===
      1,
  );
  ok(
    visits.find((row: any) => row.territory_id === tids[1]).blocking_count ===
      1,
  );
  ok(
    visits.find((row: any) => row.territory_id === tids[1]).eligible_count ===
      0,
  );
  ok(
    visits.every(
      (row: any) =>
        Object.keys(row).sort().join("|") ===
        ["territory_id", "blocking_count", "eligible_count"].sort().join("|"),
    ),
  );
  ok(!JSON.stringify(initial).includes("UI_PRIVATE_ADDRESS_"));
  ok((await scalar(custom, "select count(*) from visit_restrictions")) === "0");
  ok(
    !JSON.stringify(await scalar(custom, "select get_snapshot()")).includes(
      "UI_PRIVATE_ADDRESS_",
    ),
  );
  ok(initial.territories.length > 0 && initial.shapes.length === 0);
  for (const t of initial.territories)
    ok(
      Object.keys(t).sort().join("|") ===
        [
          "active",
          "assigned_at",
          "description",
          "id",
          "last_completed",
          "territory_number",
        ]
          .sort()
          .join("|"),
    );
  const privateNames = (
    await root.query(
      "select distinct assigned_name_snapshot as name from assignments where length(assigned_name_snapshot)>5",
    )
  ).rows.map((r) => r.name);
  ok(privateNames.every((name) => !JSON.stringify(initial).includes(name)));
  const profiles = await scalar(admin, "select get_access_profiles()");
  ok(
    profiles
      .find((p: any) => p.system_key === "administrador")
      .permissions.join("|") === [...permissionKeys].sort().join("|"),
  );
  ok(
    !profiles
      .find((p: any) => p.system_key === "editor")
      .permissions.includes("maps.view"),
  );
  await denied(manage(admin, "create", null), /Versión/);
  await denied(
    manage(admin, "create", 0, id, tids[0], geometry, " \n \t "),
    /motivo/,
  );
  for (const invalid of [
    null,
    { type: "Point", coordinates: [0, 0] },
    { type: "Polygon", coordinates: [] },
    {
      type: "Polygon",
      coordinates: [
        [
          [181, 0],
          [182, 0],
          [182, 1],
          [181, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [0, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 0],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    },
    { type: "Polygon", coordinates: [square(), square()] },
    { type: "MultiPolygon", coordinates: [[square()], [square()]] },
  ])
    await denied(
      manage(admin, "create", 0, id, tids[0], invalid),
      /válid|admiten|contorno|rango|cruza|duplicados|área|coincidir|huecos|superponerse/,
    );
  await manage(admin, "create", 0);
  ok((await version()) === 1);
  await manage(admin, "create", 0);
  ok((await version()) === 1);
  ok(
    (
      await scalar(
        root,
        "select geometry from territory_geometries where id=$1",
        [id],
      )
    ).coordinates.length === 2,
  );
  await denied(manage(admin, "create", 0, crypto.randomUUID()), /Ya existe/);
  await denied(manage(admin, "update", null), /Otro usuario/);
  await denied(manage(admin, "update", 999), /Otro usuario/);
  await denied(manage(admin, "update", 1, id, tids[1]), /trasladar/);
  await denied(manage(custom, "update", 1));
  await denied(manage(custom, "approve", 1));
  await denied(manage(custom, "delete", 1));
  await profile(["maps.approve"]);
  await manage(custom, "approve", 1);
  const approved = await scalar(
    root,
    "select to_jsonb(g) from territory_geometries g where id=$1",
    [id],
  );
  ok(
    approved.review_status === "verified" &&
      approved.reviewed_by === uid &&
      approved.reviewed_at,
  );
  await denied(manage(custom, "update", 2));
  await profile(["maps.edit"]);
  await denied(manage(custom, "approve", 2));
  const requests = await Promise.allSettled([
    manage(admin, "update", 2, id, tids[0], polygon),
    manage(admin2, "update", 2, id, tids[0], polygon),
  ]);
  ok(requests.filter((r) => r.status === "fulfilled").length === 1);
  ok(
    requests.filter(
      (r) => r.status === "rejected" && (r.reason as any).code === "40001",
    ).length === 1,
  );
  const edited = await scalar(
    root,
    "select to_jsonb(g) from territory_geometries g where id=$1",
    [id],
  );
  ok(
    edited.version === 3 &&
      edited.review_status === "draft" &&
      edited.reviewed_by === null &&
      edited.reviewed_at === null,
  );
  await denied(
    root.query("update territory_geometries set source_hash=$2 where id=$1", [
      id,
      "b".repeat(64),
    ]),
    /inmutables/,
  );
  await denied(
    root.query("delete from territory_geometries where id=$1", [id]),
    /borrado físico/,
  );
  await profile(["maps.delete"]);
  await manage(custom, "delete", 3);
  ok((await version()) === 4);
  ok((await scalar(custom, "select get_territory_map()")).shapes.length === 1);
  await denied(manage(admin, "update", 4), /Restaure/);
  await profile(["maps.view"]);
  ok((await scalar(custom, "select get_territory_map()")).shapes.length === 0);
  ok(
    (await scalar(custom, "select count(*) from territory_geometries")) === "0",
  );
  await denied(manage(custom, "restore", 4));
  await manage(admin, "restore", 4);
  ok(
    (await scalar(
      root,
      "select review_status from territory_geometries where id=$1",
      [id],
    )) === "draft",
  );
  const batch = (rows: unknown[], c = admin) =>
    scalar(c, "select import_territory_geometries($1,$2,$3,$4)", [
      JSON.stringify(rows),
      source,
      hash,
      reason,
    ]);
  const row = (n: number, sid: string, g: unknown = geometry, v = 0) => ({
    id: sid,
    territory_number: n,
    geometry: g,
    expected_version: v,
  });
  await denied(batch([row(max + 2, second)], custom));
  await profile(["maps.import"]);
  await denied(batch([row(max + 2, second)], custom));
  await profile(["maps.import", "maps.create"]);
  await denied(
    batch(
      [row(max + 2, second), row(max + 3, third, { type: "Point" })],
      custom,
    ),
    /admiten/,
  );
  ok(
    (await scalar(
      root,
      "select count(*) from territory_geometries where id=$1",
      [second],
    )) === "0",
  );
  await denied(
    batch([row(max + 2, second), row(max + 2, second)], custom),
    /duplicado/,
  );
  await denied(
    batch([row(max + 2, second), row(999999, third)], custom),
    /inexistente/,
  );
  ok(
    (await scalar(
      root,
      "select count(*) from territory_geometries where id=$1",
      [second],
    )) === "0",
  );
  ok((await batch([row(max + 2, second), row(max + 3, third)], custom)) === 2);
  await denied(batch([row(max + 2, second, polygon, 1)], custom));
  await profile(["maps.import", "maps.edit"]);
  ok((await batch([row(max + 2, second, polygon, 1)], custom)) === 1);
  await denied(
    batch([row(max + 2, second, geometry, 1)], custom),
    /Otro usuario/,
  );
  const versions = Object.fromEntries(
    (
      await root.query(
        "select id,version from territory_geometries where deleted_at is null",
      )
    ).rows.map((r) => [r.id, r.version]),
  );
  const exportMap = (c: Client, v: unknown = versions) =>
    scalar(c, "select export_territory_geometries($1)", [v]);
  await denied(exportMap(custom));
  await profile(["maps.export"]);
  await denied(exportMap(custom, {}), /cambiaron/);
  await denied(exportMap(custom, { ...versions, [id]: 999 }), /cambiaron/);
  await denied(
    exportMap(custom, { ...versions, [crypto.randomUUID()]: 1 }),
    /cambiaron/,
  );
  ok((await exportMap(custom)).shapes.length === 3);
  ok(
    Number(
      await scalar(
        root,
        "select count(*) from audit_log where entity='territory_geometries' and operation='EXPORT' and actor_id=$1",
        [uid],
      ),
    ) === 1,
  );
  const backup = await scalar(admin, "select backup_data()");
  ok(
    backup.territory_geometries.length === 3 &&
      backup.territory_geometries[0].source_hash === hash,
  );
  ok(
    (await scalar(
      root,
      "select md5(coalesce(jsonb_agg(a order by id)::text,'')) from assignments a",
    )) === historyBefore,
  );
  ok(
    Number(
      await scalar(
        root,
        "select count(*) from audit_log where entity='territory_geometries' and operation='UPDATE' and reason=$1",
        [reason],
      ),
    ) >= 5,
  );
  // Concurrent creation for a single territory is unique even with different ids.
  const fourth = crypto.randomUUID();
  await root.query(
    "insert into territories(id,territory_number,active) values($1,$2,true)",
    [fourth, max + 4],
  );
  const simultaneous = await Promise.allSettled([
    manage(admin, "create", 0, crypto.randomUUID(), fourth),
    manage(admin2, "create", 0, crypto.randomUUID(), fourth),
  ]);
  ok(simultaneous.filter((r) => r.status === "fulfilled").length === 1);
  ok(
    simultaneous.filter(
      (r) => r.status === "rejected" && (r.reason as any).code === "23505",
    ).length === 1,
  );
  await profile(["conductors.view"]);
  await denied(custom.query("select get_territory_map()"));
  ok(
    (await scalar(custom, "select count(*) from territory_geometries")) === "0",
  );
  return checks;
}
