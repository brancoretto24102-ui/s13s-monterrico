import assert from "node:assert/strict";
import type { Client } from "pg";
export async function testTemporaryPassword({
  root,
  admin,
  reader,
  anon,
}: {
  root: Client;
  admin: Client;
  reader: Client;
  anon: Client;
}) {
  let checks = 0;
  const adminId = "10000000-0000-0000-0000-000000000001",
    target = "10000000-0000-0000-0000-000000000003";
  for (const client of [admin, reader, anon]) {
    await assert.rejects(
      client.query("select * from temporary_password_setups"),
      /permission denied/,
    );
    checks++;
    await assert.rejects(
      client.query(
        "insert into temporary_password_setups(user_id,token_hash,expires_at,created_by,reason) values($1,$2,now()+interval '1 hour',$3,'Intento sintético')",
        [target, "a".repeat(64), adminId],
      ),
      /permission denied/,
    );
    checks++;
  }
  await root.query(
    "insert into temporary_password_setups(user_id,token_hash,expires_at,created_by,reason) values($1,$2,now()+interval '1 hour',$3,'Generación sintética autorizada')",
    [target, "a".repeat(64), adminId],
  );
  checks++;
  const [audit] = (
    await root.query(
      "select * from audit_log where entity='password_setup' and entity_id=$1",
      [target],
    )
  ).rows;
  assert.equal(audit.operation, "GENERATE");
  assert(!JSON.stringify(audit).includes("a".repeat(64)));
  checks += 2;
  await root.query(
    "update temporary_password_setups set state='claimed',challenge_hash=$2,challenge_expires_at=now()+interval '10 minutes' where user_id=$1",
    [target, "b".repeat(64)],
  );
  const version = Number(
    (
      await root.query(
        "select version from temporary_password_setups where user_id=$1",
        [target],
      )
    ).rows[0].version,
  );
  const first = await root.query(
    "update temporary_password_setups set state='applying' where user_id=$1 and version=$2 returning version",
    [target, version],
  );
  const second = await root.query(
    "update temporary_password_setups set state='applying' where user_id=$1 and version=$2 returning version",
    [target, version],
  );
  assert.equal(first.rowCount, 1);
  assert.equal(second.rowCount, 0);
  checks += 2;
  await assert.rejects(
    root.query(
      "update temporary_password_setups set generation=gen_random_uuid(),state='pending' where user_id=$1",
      [target],
    ),
    /en curso/,
  );
  checks++;
  await root.query(
    "update temporary_password_setups set state='used',token_hash=null,challenge_hash=null,challenge_expires_at=null where user_id=$1",
    [target],
  );
  const [completed] = (
    await root.query(
      "select * from audit_log where entity='password_setup' and entity_id=$1 order by id desc limit 1",
      [target],
    )
  ).rows;
  assert.equal(completed.operation, "COMPLETE");
  assert(!JSON.stringify(completed).includes("b".repeat(64)));
  checks += 2;
  const [grants] = (
    await root.query(
      "select has_table_privilege('service_role','public.temporary_password_setups','SELECT,INSERT,UPDATE') as allowed, has_table_privilege('authenticated','public.temporary_password_setups','SELECT') as exposed",
    )
  ).rows;
  assert(grants.allowed && !grants.exposed);
  checks++;
  return checks;
}
