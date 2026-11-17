import assert from "node:assert/strict";
import type { Client } from "pg";
export async function testUserReuse({
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
  const equal = (actual: unknown, expected: unknown) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  const scalar = async (c: Client, q: string, args: unknown[] = []) =>
    Object.values((await c.query(q, args)).rows[0])[0] as any;
  const denied = async (
    promise: Promise<unknown>,
    match = /permiso|permission denied/,
  ) => {
    await assert.rejects(promise, match);
    checks++;
  };
  const guestProfile = await scalar(
    root,
    "select id from access_profiles where name='Invitado' and deleted_at is null",
  );
  equal(
    await scalar(root, "select permissions from access_profiles where id=$1", [
      guestProfile,
    ]),
    ["maps.view", "reports.export", "reports.view", "territories.view"],
  );
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  for (const [id, email] of [
    [first, "removed@example.invalid"],
    [second, "alias@example.invalid"],
  ])
    await root.query(
      'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,\'{"display_name":"Prueba de reutilización"}\')',
      [id, email],
    );
  const version = (id: string) =>
    scalar(root, "select version from profiles where id=$1", [id]);
  const change = async (
    id: string,
    action: string,
    alias: string,
    options: { active?: boolean; profiles?: string[]; client?: Client } = {},
  ) =>
    (options.client ?? admin).query(
      "select manage_user($1,$2,$3,$4,'lector',$5,false,'custom',$6,$7,'Prueba sintética de reutilización')",
      [
        id,
        await version(id),
        "Invitado sintético",
        alias,
        options.active ?? true,
        options.profiles ?? [guestProfile],
        action,
      ],
    );
  const lookup = (c: Client, email: string, alias = "reusable.person") =>
    scalar(c, "select get_invitation_target($1,$2)", [email, alias]);
  await denied(lookup(reader, "removed@example.invalid"));
  await denied(lookup(anon, "removed@example.invalid"));
  equal(await lookup(admin, "new@example.invalid"), null);
  await change(first, "update", "reusable.person");
  const identityBefore = await scalar(
    root,
    "select to_jsonb(u) from auth.users u where id=$1",
    [first],
  );
  const localBefore = await scalar(
    root,
    "select to_jsonb(p) from profiles p where id=$1",
    [first],
  );
  await denied(lookup(admin, "removed@example.invalid"), /ya tiene un acceso/);
  await change(first, "update", "reusable.person", { active: false });
  await denied(lookup(admin, "removed@example.invalid"), /ya tiene un acceso/);
  await change(first, "delete", "reusable.person");
  equal(await lookup(admin, " REMOVED@EXAMPLE.INVALID "), {
    id: first,
    version: await version(first),
  });
  await change(second, "update", "REUSABLE.PERSON");
  await denied(
    lookup(admin, "new@example.invalid", "ReUsAbLe.PeRsOn"),
    /alias ya está utilizado/,
  );
  await denied(change(first, "recreate", "reusable.person"), /duplicate key/);
  equal(
    await scalar(
      root,
      "select deleted_at is not null from profiles where id=$1",
      [first],
    ),
    true,
  );
  await change(first, "restore", "reusable.person");
  equal(
    await scalar(
      root,
      "select jsonb_build_object('alias',username,'active',active,'deleted',deleted_at is not null) from profiles where id=$1",
      [first],
    ),
    { alias: null, active: false, deleted: false },
  );
  await change(first, "delete", "");
  await denied(
    change(first, "recreate", "fresh.person", {
      profiles: [crypto.randomUUID()],
    }),
    /perfiles personalizados/,
  );
  equal(
    await scalar(
      root,
      "select deleted_at is not null from profiles where id=$1",
      [first],
    ),
    true,
  );
  const outsider = await connect(first);
  await denied(
    outsider.query(
      "select manage_user($1,$2,'No permitido','fresh.person','lector',true,false,'custom',$3,'recreate','Prueba sin privilegios')",
      [first, await version(first), [guestProfile]],
    ),
  );
  await change(first, "recreate", "fresh.person");
  const localAfter = await scalar(
    root,
    "select to_jsonb(p) from profiles p where id=$1",
    [first],
  );
  equal(
    [localAfter.id, localAfter.code, localAfter.created_at],
    [localBefore.id, localBefore.code, localBefore.created_at],
  );
  equal(
    [localAfter.active, localAfter.deleted_at, localAfter.username],
    [true, null, "fresh.person"],
  );
  equal(
    await scalar(root, "select to_jsonb(u) from auth.users u where id=$1", [
      first,
    ]),
    identityBefore,
  );
  const guest = await connect(first);
  const context = await scalar(guest, "select get_access_context()");
  equal(context.permissions, [
    "maps.view",
    "reports.export",
    "reports.view",
    "territories.view",
  ]);
  equal(context.can_export, true);
  equal(
    Array.isArray((await scalar(guest, "select get_snapshot()")).territories),
    true,
  );
  equal(
    Array.isArray(
      (await scalar(guest, "select get_export_snapshot()")).assignments,
    ),
    true,
  );
  equal(typeof (await scalar(guest, "select get_territory_map()")), "object");
  await denied(guest.query("select get_territory_map_pdf()"));
  await denied(guest.query("select get_users()"));
  await denied(guest.query("select get_access_profiles()"));
  await denied(
    guest.query(
      "select assign_territory((select id from territories limit 1),1,'Sin permiso',current_date)",
    ),
  );
  await denied(
    guest.query(
      "select manage_access_profile(gen_random_uuid(),0,'Escalamiento',array['audit.view'],'create','Prueba sin privilegios')",
    ),
  );
  await denied(
    guest.query("update profiles set role='administrador' where id=$1", [
      first,
    ]),
  );
  await denied(
    change(first, "recreate", "fresh.person"),
    /no está en Papelera/,
  );
  await change(first, "delete", "fresh.person");
  await denied(guest.query("select get_snapshot()"));
  await denied(guest.query("select get_export_snapshot()"), /exportar/);

  // Both requests can pass preflight; the database decides the single alias owner.
  const racers = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of racers) {
    await root.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${id}@example.invalid`,
    ]);
    await change(id, "delete", "");
    equal(
      (await lookup(admin, `${id}@example.invalid`, "parallel.alias")).id,
      id,
    );
  }
  const races = await Promise.allSettled(
    racers.map((id, i) =>
      change(id, "recreate", "parallel.alias", { client: i ? admin2 : admin }),
    ),
  );
  equal(races.filter((r) => r.status === "fulfilled").length, 1);
  equal(
    await scalar(
      root,
      "select count(*)::int from profiles where username='parallel.alias' and deleted_at is null",
    ),
    1,
  );
  equal(
    await scalar(
      root,
      "select count(*)::int from profiles where id=any($1) and deleted_at is not null",
      [racers],
    ),
    1,
  );
  equal(
    (await scalar(
      root,
      "select count(*)::int from audit_log where entity='profiles' and entity_id=$1 and reason='Prueba sintética de reutilización'",
      [first],
    )) > 3,
    true,
  );
  return checks;
}
