import { Client } from "pg";
import { readFile, readdir } from "node:fs/promises";
export async function bootstrapTestDb(root: Client) {
  const { rows } = await root.query(
    "select count(*) as n from information_schema.tables where table_schema='public'",
  );
  if (rows[0].n !== "0")
    throw new Error("Se rechazó la prueba: la base de datos no está vacía.");
  await root.query(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',email text,last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update on storage.objects to anon,authenticated;create publication supabase_realtime;`);
  for (const file of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await root.query(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
}
