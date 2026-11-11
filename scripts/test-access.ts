import { fixtureDate } from "./fixture-date";
import assert from "node:assert/strict";
import type { Client } from "pg";
import { permissionKeys } from "../src/lib/permissions";
export async function testAccess({
  root,
  admin,
  admin2,
  reader,
  anon,
  connect,
}: {
  root: Client;
  admin: Client;
  admin2: Client;
  reader: Client;
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
  const profileId = crypto.randomUUID(),
    second = crypto.randomUUID(),
    userId = crypto.randomUUID();
  const profile = async (
    c: Client,
    id: string,
    version: number,
    name: string,
    permissions: string[],
    action: string,
    reason = "Prueba sintética de acceso",
  ) =>
    scalar(c, "select manage_access_profile($1,$2,$3,$4,$5,$6)", [
      id,
      version,
      name,
      permissions,
      action,
      reason,
    ]);
  const version = async (id: string) =>
    Number(
      await scalar(root, "select version from access_profiles where id=$1", [
        id,
      ]),
    );
  const userVersion = async () =>
    Number(
      await scalar(root, "select version from profiles where id=$1", [userId]),
    );
  const user = async (
    ids: string[],
    mode = "custom",
    action = "update",
    active = true,
    role = "lector",
  ) =>
    admin.query("select manage_user($1,$2,$3,$4,$5,$6,false,$7,$8,$9,$10)", [
      userId,
      await userVersion(),
      "Usuario sintético de permisos",
      "prueba.accesos",
      role,
      active,
      mode,
      ids,
      action,
      "Revisión sintética de accesos",
    ]);
  ok(
    (
      await scalar(
        root,
        "select array_agg(key order by key) from permission_catalog",
      )
    ).join("|") === [...permissionKeys].sort().join("|"),
  );
  await denied(anon.query("select get_access_context()"));
  await denied(reader.query("select get_access_profiles()"));
  await denied(reader.query("select get_users()"));
  await denied(
    reader.query("select log_access_event($1,$2)", [
      userId,
      "Prueba sin permiso",
    ]),
  );
  await denied(
    reader.query("insert into access_profiles(name) values('Escalamiento')"),
  );
  const system = await scalar(
    root,
    "select id from access_profiles where system_key='administrador'",
  );
  await denied(
    profile(admin, system, 1, "Administrador", [], "deactivate"),
    /protegidos/,
  );
  await denied(
    profile(admin, profileId, 0, "Prueba", ["no.existe"], "create"),
    /desconocidos/,
  );
  await denied(
    profile(admin, profileId, 0, "Prueba", [], "create", ""),
    /motivo/,
  );
  await profile(
    admin,
    profileId,
    0,
    "Encargado sintético de conductores",
    ["conductors.create"],
    "create",
  );
  checks++;
  ok(
    (
      await scalar(
        root,
        "select permissions from access_profiles where id=$1",
        [profileId],
      )
    ).includes("conductors.view"),
  );
  await profile(
    admin,
    profileId,
    0,
    "Encargado sintético de conductores",
    ["conductors.create"],
    "create",
  );
  checks++;
  ok(
    Number(
      await scalar(root, "select count(*) from access_profiles where id=$1", [
        profileId,
      ]),
    ) === 1,
  );
  await denied(
    profile(
      admin,
      crypto.randomUUID(),
      0,
      "ENCARGADO SINTÉTICO DE CONDUCTORES",
      [],
      "create",
    ),
    /unique|duplicate/i,
  );
  await denied(
    profile(admin, profileId, null as any, "Prueba", [], "update"),
    /actualizó/,
  );
  await root.query(
    "insert into auth.users(id,raw_user_meta_data,email) values($1,'{\"display_name\":\"Usuario sintético\"}','prueba@example.invalid')",
    [userId],
  );
  await user([profileId]);
  checks++;
  const custom = await connect(userId);
  const context = await scalar(custom, "select get_access_context()");
  ok(
    context.access_mode === "custom" &&
      context.permissions.includes("conductors.create") &&
      !context.permissions.includes("territories.view"),
  );
  ok((await scalar(custom, "select count(*) from territories")) === "0");
  ok((await scalar(custom, "select count(*) from assignments")) === "0");
  ok((await scalar(custom, "select get_snapshot()")).assignments.length === 0);
  await custom.query("select get_conductors()");
  checks++;
  const conductor = crypto.randomUUID();
  await custom.query(
    "select manage_conductor($1,0,'Conductor sintético granular','create','Alta sintética autorizada')",
    [conductor],
  );
  checks++;
  await denied(
    custom.query(
      "select manage_conductor($1,1,'Cambio indebido','update','Prueba de denegación')",
      [conductor],
    ),
  );
  await denied(
    custom.query(
      "select manage_conductor($1,1,'','delete','Prueba de denegación')",
      [conductor],
    ),
  );
  await denied(custom.query("select get_export_snapshot()"), /exportar/);
  await denied(custom.query("select backup_data()"));
  await denied(custom.query("select get_users()"));
  await denied(
    custom.query(`select complete_assignment($1,1,1,'${fixtureDate(40)}')`, [
      crypto.randomUUID(),
    ]),
  );
  await profile(
    admin,
    second,
    0,
    "Asignación sintética",
    ["territories.assign", "reports.export"],
    "create",
  );
  checks++;
  await user([profileId, second]);
  checks++;
  ok((await scalar(custom, "select get_access_context()")).can_export === true);
  ok(
    (await scalar(custom, "select get_export_snapshot()")).assignments.length >
      1000,
  );
  const t = (
    await root.query("select * from territories where territory_number=82")
  ).rows[0];
  const conductorPerson = await scalar(
    root,
    "select person_id from conductors where id=$1",
    [conductor],
  );
  ok(
    (await scalar(custom, "select get_snapshot()")).conductors.some(
      (c: any) => c.person_id === conductorPerson,
    ),
  );
  const assignment = await scalar(
    custom,
    `select assign_territory($1,$2,'Conductor sintético granular','${fixtureDate(40)}',$3)`,
    [t.id, t.version, conductorPerson],
  );
  ok(!!assignment);
  await denied(
    custom.query(`select complete_assignment($1,1,$2,'${fixtureDate(39)}')`, [
      assignment,
      t.version + 1,
    ]),
  );
  await profile(
    admin,
    second,
    await version(second),
    "Asignación sintética",
    ["territories.complete", "reports.export"],
    "update",
  );
  checks++;
  await denied(
    custom.query(
      `select complete_assignment($1,null,null,'${fixtureDate(39)}')`,
      [assignment],
    ),
    /actualizó/,
  );
  await custom.query(
    `select complete_assignment($1,1,$2,'${fixtureDate(39)}')`,
    [assignment, t.version + 1],
  );
  checks++;
  await denied(
    custom.query(
      `select assign_territory($1,$2,'Prueba granular','${fixtureDate(38)}')`,
      [t.id, t.version + 2],
    ),
  );
  await profile(admin, second, await version(second), "", [], "deactivate");
  checks++;
  ok(
    (await scalar(custom, "select get_access_context()")).can_export === false,
  );
  ok((await scalar(custom, "select get_snapshot()")).assignments.length === 0);
  await denied(custom.query("select get_export_snapshot()"), /exportar/);
  await profile(admin, profileId, await version(profileId), "", [], "delete");
  checks++;
  ok(
    (await scalar(custom, "select get_access_context()")).permissions.length ===
      0,
  );
  await denied(custom.query("select get_conductors()"));
  ok(
    (await scalar(admin, "select backup_data()")).access_profiles.some(
      (p: any) => p.id === profileId && p.deleted_at,
    ),
  );
  ok(
    (await scalar(admin, "select backup_data()")).user_access_profiles.some(
      (p: any) => p.user_id === userId,
    ),
  );
  await profile(admin, profileId, await version(profileId), "", [], "restore");
  checks++;
  ok(
    (await scalar(root, "select active from access_profiles where id=$1", [
      profileId,
    ])) === false,
  );
  ok(
    (await scalar(custom, "select get_access_context()")).permissions.length ===
      0,
  );
  await profile(admin, profileId, await version(profileId), "", [], "activate");
  checks++;
  ok(
    (await scalar(custom, "select get_access_context()")).permissions.includes(
      "conductors.view",
    ),
  );
  const pv = await version(profileId);
  const race = await Promise.allSettled([
    profile(admin, profileId, pv, "", [], "deactivate"),
    profile(admin2, profileId, pv, "", [], "deactivate"),
  ]);
  ok(
    race.filter((r) => r.status === "fulfilled").length === 1 &&
      race.filter((r) => r.status === "rejected" && r.reason.code === "40001")
        .length === 1,
  );
  await denied(
    root.query("delete from access_profiles where id=$1", [profileId]),
    /borrado físico|foreign key/,
  );
  await denied(
    custom.query("update profiles set access_mode='base' where id=$1", [
      userId,
    ]),
  );
  await denied(user([system]), /personalizados/);
  await denied(user([profileId]), /personalizados/);
  await user([], "base", "delete", false);
  checks++;
  ok(
    (await scalar(custom, "select get_access_context()")).permissions.length ===
      0,
  );
  await denied(custom.query("select get_snapshot()"));
  await user([], "base", "restore", false);
  checks++;
  ok(
    (await scalar(root, "select active from profiles where id=$1", [
      userId,
    ])) === false,
  );
  await denied(
    admin.query(
      "select manage_territory(82,null,true,'Prueba','Validación de versión nula')",
    ),
    /cambió/,
  );
  const owner = (
    await root.query(
      "select * from profiles where role='administrador' and active limit 1",
    )
  ).rows[0];
  await denied(
    admin.query(
      "select manage_user($1,$2,$3,null,'lector',true,false,'base','{}','update','Prueba del último administrador')",
      [owner.id, owner.version, owner.display_name],
    ),
    /administrador activo/,
  );
  await denied(
    admin.query(
      "select manage_user($1,$2,$3,null,'administrador',false,true,'base','{}','delete','Prueba del último administrador')",
      [owner.id, owner.version, owner.display_name],
    ),
    /administrador activo/,
  );
  const listed = await scalar(admin, "select get_users()");
  ok(
    listed.some(
      (u: any) =>
        u.id === userId &&
        u.email === "prueba@example.invalid" &&
        typeof u.code === "number",
    ),
  );
  ok(
    Number(
      await scalar(
        root,
        "select count(*) from audit_log where entity='access_profiles' and entity_id=$1",
        [profileId],
      ),
    ) >= 5,
  );
  ok(
    Number(
      await scalar(
        root,
        "select count(*) from audit_log where entity='user_access_profiles' and new_data->>'user_id'=$1",
        [userId],
      ),
    ) >= 2,
  );
  await denied(anon.query("select private.has_permission('territories.view')"));
  return checks;
}
