import assert from "node:assert/strict";
import type { Client } from "pg";
export async function testEcosystemIsolation({
  root,
  admin,
  connect,
}: {
  root: Client;
  admin: Client;
  connect: (uid: string) => Promise<Client>;
}) {
  let checks = 0;
  const id = crypto.randomUUID();
  await root.query(
    "create schema isolation_fixture;create table isolation_fixture.s21_users(subject uuid primary key references auth.users(id) on delete cascade,active boolean not null)",
  );
  await root.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'shared-fixture@example.invalid','{\"display_name\":\"Cuenta compartida sintética\"}')",
    [id],
  );
  const account = await connect(id);
  const scalar = async (client: Client, sql: string, args: unknown[] = []) =>
    Object.values((await client.query(sql, args)).rows[0])[0] as any;
  const version = () =>
    scalar(root, "select version from profiles where id=$1", [id]);
  const change = async (action: string, active = true) =>
    admin.query(
      "select manage_user($1,$2,'Cuenta compartida sintética',null,'lector',$3,false,'base','{}',$4,'Comprobación sintética de independencia')",
      [id, await version(), active, action],
    );
  await change("update");
  await root.query("insert into isolation_fixture.s21_users values($1,true)", [
    id,
  ]);
  const authExists = () =>
    scalar(root, "select exists(select 1 from auth.users where id=$1)", [id]);
  const s21Active = () =>
    scalar(
      root,
      "select active from isolation_fixture.s21_users where subject=$1",
      [id],
    );
  const ok = (condition: unknown) => {
    assert(condition);
    checks++;
  };
  await change("delete");
  ok(await authExists());
  ok(await s21Active());
  let context = await scalar(account, "select get_access_context()");
  ok(!context.active && context.deleted_at && context.permissions.length === 0);
  await assert.rejects(account.query("select get_snapshot()"), /permiso/);
  checks++;
  await change("restore");
  context = await scalar(account, "select get_access_context()");
  ok(!context.active && !context.deleted_at);
  ok(await s21Active());
  await change("update");
  ok((await scalar(account, "select get_access_context()")).active);
  // S-21 removes its own authorization, preserving the shared Auth identity.
  await root.query("delete from isolation_fixture.s21_users where subject=$1", [
    id,
  ]);
  ok(await authExists());
  ok((await scalar(account, "select get_access_context()")).active);
  ok((await account.query("select get_snapshot()")).rowCount === 1);
  await root.query("insert into isolation_fixture.s21_users values($1,false)", [
    id,
  ]);
  ok((await scalar(account, "select get_access_context()")).active);
  ok(!(await s21Active()));
  await root.query(
    "update isolation_fixture.s21_users set active=true where subject=$1",
    [id],
  );
  await change("update", false);
  ok(!(await scalar(account, "select get_access_context()")).active);
  ok(await s21Active());
  ok(await authExists());
  return checks;
}
