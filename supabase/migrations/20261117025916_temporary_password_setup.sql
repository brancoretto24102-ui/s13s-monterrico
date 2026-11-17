begin;
create table public.temporary_password_setups (
 user_id uuid primary key references public.profiles(id),
 generation uuid not null default gen_random_uuid(),
 token_hash text unique check(token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
 challenge_hash text unique check(challenge_hash is null or challenge_hash ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','claimed','applying','used')),
 expires_at timestamptz not null,
 challenge_expires_at timestamptz,
 created_by uuid not null references public.profiles(id),
 reason text not null check(length(btrim(reason)) between 8 and 2000),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 check(expires_at <= updated_at + interval '24 hours'),
 check(state <> 'used' or (token_hash is null and challenge_hash is null))
);
create index temporary_password_creator_idx on public.temporary_password_setups(created_by);
alter table public.temporary_password_setups enable row level security;
revoke all on public.temporary_password_setups from public,anon,authenticated;
grant select,insert,update on public.temporary_password_setups to service_role;
-- The setup endpoint checks only identity and active/deleted status.
-- No role, name, alias or other profile data is granted to this service query.
grant select(id,active,deleted_at) on public.profiles to service_role;
-- No public policy: only the trusted Edge Functions can handle credential hashes.
create function private.password_setup_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.state='applying' and new.generation<>old.generation and old.updated_at>now()-interval '5 minutes' then
   raise exception 'Hay un cambio de contraseña en curso. Espere antes de generar otra clave.';
  end if;
  new.version=old.version+1;
 else new.version=1;
 end if;
 new.updated_at=now();
 if not exists(select 1 from public.profiles where id=new.user_id and active and deleted_at is null) then
  raise exception 'El usuario no está activo.';
 end if;
 if tg_op='INSERT' or new.generation is distinct from old.generation then
  if not exists(select 1 from public.profiles where id=new.created_by and active and deleted_at is null and role='administrador') then
   raise exception 'El administrador no está autorizado.';
  end if;
 end if;
 return new;
end $$;
create trigger password_setup_guard before insert or update on public.temporary_password_setups for each row execute function private.password_setup_guard();
create function private.password_setup_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.generation is distinct from old.generation or (new.state='used' and old.state<>'used') then
  insert into public.audit_log(actor_id,entity,entity_id,operation,new_data,reason)
  values(case when new.state='used' then new.user_id else new.created_by end,'password_setup',new.user_id::text,
   case when new.state='used' then 'COMPLETE' else 'GENERATE' end,
   jsonb_build_object('state',new.state,'expires_at',new.expires_at),
   case when new.state='used' then 'Contraseña personal establecida mediante clave temporal.' else new.reason end);
 end if;
 return new;
end $$;
create trigger password_setup_audit after insert or update on public.temporary_password_setups for each row execute function private.password_setup_audit();
revoke all on function private.password_setup_guard(),private.password_setup_audit() from public,anon,authenticated,service_role;
commit;
