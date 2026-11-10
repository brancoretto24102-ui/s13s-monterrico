begin;
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null check(length(trim(display_name)) between 1 and 200),
 role text not null default 'lector' check(role in ('administrador','editor','lector')),
 active boolean not null default false, can_export boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.territories (
 id uuid primary key default gen_random_uuid(), territory_number integer not null unique check(territory_number>0),
 active boolean not null default true, description text check(length(description)<=2000), version integer not null default 1, created_at timestamptz not null default now()
);
insert into public.territories(territory_number) select generate_series(1,82);
create table public.people (
 id uuid primary key default gen_random_uuid(), display_name text not null check(length(trim(display_name)) between 1 and 200),
 normalized_name text not null, active boolean not null default true, created_at timestamptz not null default now()
);
-- Names are not unique identities. A snapshot is preserved on every assignment.
create index people_search on public.people(normalized_name);
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), file_name text not null, file_hash text not null unique check(file_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), record_count integer not null default 0, skipped_count integer not null default 0, report jsonb not null default '{}'
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(), territory_id uuid not null references public.territories(id), person_id uuid references public.people(id),
 assigned_name_snapshot text not null check(length(trim(assigned_name_snapshot)) between 1 and 200),
 assigned_at date not null, completed_at date check(completed_at>=assigned_at),
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
 source_import_batch_id uuid references public.import_batches(id), source_cell_reference text, source_order integer,
 notes text check(length(notes)<=4000), voided_at timestamptz, void_reason text
);
create unique index one_open_assignment on public.assignments(territory_id) where completed_at is null and voided_at is null;
create unique index one_assignment_start on public.assignments(territory_id,assigned_at) where voided_at is null;
create index assignments_history on public.assignments(territory_id,assigned_at,id) where voided_at is null;
create index assignments_cutoff on public.assignments(territory_id,completed_at) where completed_at is not null and voided_at is null;
create table public.audit_log (
 id bigint generated always as identity primary key, actor_id uuid, occurred_at timestamptz not null default now(),
 entity text not null, entity_id text not null, operation text not null, old_data jsonb, new_data jsonb, reason text not null
);
create index audit_entity on public.audit_log(entity,entity_id,occurred_at desc);
-- Prepared extensions; these are not S-13-S assignments.
create table public.territory_observations(id uuid primary key default gen_random_uuid(),territory_id uuid not null references public.territories(id),body text not null,created_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.conductors(id uuid primary key default gen_random_uuid(),person_id uuid not null references public.people(id),active boolean not null default true);
create table public.meeting_schedule(id uuid primary key default gen_random_uuid(),starts_at timestamptz not null,meeting_point text,conductor_id uuid references public.conductors(id),territory_ids uuid[] not null default '{}');

create function private.app_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and active
$$;
create function private.may_export() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select active and (role='administrador' or can_export) from public.profiles where id=auth.uid()),false)
$$;
create function private.require_role(allowed text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.app_role()=any(allowed),false) then raise exception using errcode='42501',message='No tiene permiso para esta operación.'; end if;
end $$;
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),200),''),'Usuario pendiente'));
 return new;
end $$;
create trigger create_inactive_profile after insert on auth.users for each row execute function private.new_profile();

create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'El borrado físico no está permitido; utilice anulación con motivo.';end if;
 insert into public.audit_log(actor_id,entity,entity_id,operation,old_data,new_data,reason)
 values(auth.uid(),tg_table_name,new.id::text,tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),coalesce(nullif(current_setting('app.audit_reason',true),''),'Alta de sistema'));
 return new;
end $$;
create function private.audit_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'La auditoría es inmutable.';end $$;
create trigger immutable_audit before update or delete on public.audit_log for each row execute function private.audit_immutable();
create function private.assignment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare prev public.assignments; nxt public.assignments;
begin
 if tg_op='DELETE' then raise exception 'Utilice anulación lógica.';end if;
 if tg_op='UPDATE' and new.territory_id<>old.territory_id then raise exception 'No se puede trasladar un registro a otro territorio.';end if;
 perform 1 from public.territories where id=new.territory_id for update;
 if new.voided_at is null then
  if new.assigned_at>(now() at time zone 'America/Lima')::date or new.completed_at>(now() at time zone 'America/Lima')::date then raise exception 'Las fechas futuras no están permitidas.';end if;
  select * into prev from public.assignments where territory_id=new.territory_id and id<>new.id and voided_at is null and assigned_at<=new.assigned_at order by assigned_at desc,id desc limit 1;
  if found and (prev.completed_at is null or new.assigned_at<=prev.completed_at) then
   raise exception using errcode='P0001',message=format('Conflicto con registro anterior (%s, cierre %s): complete y asigne en una fecha estrictamente posterior.',prev.assigned_at,coalesce(prev.completed_at::text,'pendiente'));
  end if;
  select * into nxt from public.assignments where territory_id=new.territory_id and id<>new.id and voided_at is null and assigned_at>new.assigned_at order by assigned_at,id limit 1;
  if found and (new.completed_at is null or new.completed_at>=nxt.assigned_at) then
   raise exception using errcode='P0001',message=format('El cierre entra en conflicto con la siguiente asignación del %s.',nxt.assigned_at);
  end if;
 end if;
 new.updated_at=now();new.updated_by=auth.uid();
 if tg_op='UPDATE' then new.version=old.version+1;end if;
 update public.territories set version=version+1 where id=new.territory_id;
 return new;
end $$;
create trigger validate_assignment before insert or update or delete on public.assignments for each row execute function private.assignment_guard();
create trigger audit_assignments after insert or update or delete on public.assignments for each row execute function private.audit_change();
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function private.audit_change();
create trigger audit_people after insert or update or delete on public.people for each row execute function private.audit_change();
create trigger audit_territories after insert or update or delete on public.territories for each row execute function private.audit_change();
create trigger audit_imports after insert or update or delete on public.import_batches for each row execute function private.audit_change();
create trigger audit_observations after insert or update or delete on public.territory_observations for each row execute function private.audit_change();

-- No direct client writes. All mutation RPCs check the current database role,
-- lock the territory first, check versions, and run atomically.
create function public.assign_territory(p_territory_id uuid,p_expected_version integer,p_name text,p_assigned_at date,p_person_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.territories; a_id uuid; last_start date;
begin
 perform private.require_role(array['administrador','editor']);
 select * into t from public.territories where id=p_territory_id for update;
 if not found or not t.active then raise exception 'Territorio no disponible.';end if;
 if t.version<>p_expected_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla y revise las fechas.';end if;
 select max(assigned_at) into last_start from public.assignments where territory_id=t.id and voided_at is null;
 if last_start is not null and p_assigned_at<=last_start then raise exception 'Use corrección administrativa para un alta retroactiva.';end if;
 perform set_config('app.audit_reason','Asignación de territorio',true);
 insert into public.assignments(territory_id,person_id,assigned_name_snapshot,assigned_at,created_by,updated_by)
 values(t.id,p_person_id,trim(p_name),p_assigned_at,auth.uid(),auth.uid()) returning id into a_id;return a_id;
end $$;
create function public.complete_assignment(p_id uuid,p_expected_version integer,p_territory_version integer,p_completed_at date) returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments;t public.territories;tid uuid;
begin
 perform private.require_role(array['administrador','editor']);
 select territory_id into tid from public.assignments where id=p_id;
 select * into t from public.territories where id=tid for update;
 select * into a from public.assignments where id=p_id for update;
 if a.id is null or a.voided_at is not null then raise exception 'Registro no disponible.';end if;
 if a.version<>p_expected_version or t.version<>p_territory_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla.';end if;
 if a.completed_at is not null then raise exception 'El registro ya está completado; un administrador puede corregirlo con motivo.';end if;
 if p_completed_at is null then raise exception 'Indique la fecha de finalización.';end if;
 perform set_config('app.audit_reason','Finalización de asignación',true);
 update public.assignments set completed_at=p_completed_at where id=p_id;
end $$;
create function public.correct_assignment(p_id uuid,p_expected_version integer,p_territory_version integer,p_name text,p_assigned_at date,p_completed_at date,p_reason text,p_void boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments;t public.territories;tid uuid;
begin
 perform private.require_role(array['administrador']);
 if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Describa el motivo de la corrección (mínimo 8 caracteres).';end if;
 select territory_id into tid from public.assignments where id=p_id;
 select * into t from public.territories where id=tid for update;
 select * into a from public.assignments where id=p_id for update;
 if a.id is null or a.voided_at is not null then raise exception 'Registro no disponible.';end if;
 if a.version<>p_expected_version or t.version<>p_territory_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla.';end if;
 perform set_config('app.audit_reason',trim(p_reason),true);
 update public.assignments set assigned_name_snapshot=trim(p_name),assigned_at=p_assigned_at,completed_at=p_completed_at,
 voided_at=case when p_void then now() end,void_reason=case when p_void then trim(p_reason) end where id=p_id;
end $$;
create function public.manage_profile(p_id uuid,p_expected_version integer,p_role text,p_active boolean,p_can_export boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles;
begin
 perform private.require_role(array['administrador']);
 -- Serialize role changes to prevent two admins demoting each other.
 perform pg_advisory_xact_lock(130013);
 if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Indique el motivo del cambio de acceso.';end if;
 select * into target from public.profiles where id=p_id for update;
 if not found then raise exception 'Usuario no encontrado.';end if;
 if target.version<>p_expected_version then raise exception using errcode='40001',message='El perfil cambió; actualice la lista.';end if;
 if target.active and target.role='administrador' and (not p_active or p_role<>'administrador') and (select count(*) from public.profiles where active and role='administrador')<=1 then raise exception 'Debe permanecer al menos un administrador activo.';end if;
 perform set_config('app.audit_reason',trim(p_reason),true);
 update public.profiles set role=p_role,active=p_active,can_export=p_can_export,version=version+1 where id=p_id;
end $$;
create function public.manage_territory(p_number integer,p_expected_version integer,p_active boolean,p_description text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare t public.territories;
begin
 perform private.require_role(array['administrador']);
 if length(trim(coalesce(p_reason,'')))<8 then raise exception 'Indique un motivo.';end if;
 perform pg_advisory_xact_lock(130082);
 select * into t from public.territories where territory_number=p_number for update;
 perform set_config('app.audit_reason',trim(p_reason),true);
 if t.id is not null then
  if t.version<>p_expected_version then raise exception using errcode='40001',message='El territorio cambió.';end if;
  if not p_active and exists(select 1 from public.assignments where territory_id=t.id and completed_at is null and voided_at is null) then raise exception 'Complete la asignación antes de desactivar el territorio.';end if;
  update public.territories set active=p_active,description=p_description,version=version+1 where id=t.id;
 else
  if p_expected_version<>0 or p_number<=(select coalesce(max(territory_number),0) from public.territories) then raise exception 'Use un número nuevo mayor al último existente; no se reutilizan números.';end if;
  insert into public.territories(territory_number,active,description) values(p_number,p_active,p_description);
 end if;
end $$;
create function public.add_observation(p_territory_id uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador','editor']);
 if length(trim(p_body)) not between 1 and 2000 then raise exception 'La observación debe tener entre 1 y 2000 caracteres.';end if;
 perform set_config('app.audit_reason','Observación de territorio',true);
 insert into public.territory_observations(territory_id,body,created_by) values(p_territory_id,trim(p_body),auth.uid());
end $$;

create function public.import_history(p_file_name text,p_file_hash text,p_rows jsonb,p_report jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare batch uuid; r jsonb;t public.territories;existing public.assignments; inserted integer:=0;skipped integer:=0; nm text;dt date;done date; why text;
begin
 perform private.require_role(array['administrador']);
 perform pg_advisory_xact_lock(130820);
 select id into batch from public.import_batches where file_hash=p_file_hash;
 if found then return jsonb_build_object('already_imported',true,'batch_id',batch,'inserted',0);end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100000 then raise exception 'Lote vacío o demasiado grande.';end if;
 perform set_config('app.audit_reason','Importación de historial con previsualización aprobada',true);
 insert into public.import_batches(file_name,file_hash,created_by,report) values(left(p_file_name,255),p_file_hash,auth.uid(),p_report) returning id into batch;
 -- Stable ordering of locks prevents import/editor deadlocks.
 perform 1 from public.territories order by territory_number for update;
 for r in select value from jsonb_array_elements(p_rows) order by (value->>'territory_number')::integer,(value->>'assigned_at')::date,(value->>'source_order')::integer loop
  select * into t from public.territories where territory_number=(r->>'territory_number')::integer;
  if not found then raise exception 'Territorio desconocido en lote.';end if;
  nm=trim(r->>'assigned_name_snapshot');dt=(r->>'assigned_at')::date;done=(r->>'completed_at')::date;
  select * into existing from public.assignments where territory_id=t.id and assigned_at=dt and voided_at is null;
  if found then
   if existing.assigned_name_snapshot<>nm or existing.completed_at is distinct from done then raise exception 'El territorio % en % ya tiene un registro con datos diferentes. Use corrección administrativa.',t.territory_number,dt;end if;
   skipped=skipped+1;continue;
  end if;
  why=coalesce(nullif(r->>'migration_adjustment',''),'Importación de historial con procedencia Excel');
  perform set_config('app.audit_reason',why,true);
  insert into public.assignments(territory_id,assigned_name_snapshot,assigned_at,completed_at,created_by,updated_by,source_import_batch_id,source_cell_reference,source_order)
  values(t.id,nm,dt,done,auth.uid(),auth.uid(),batch,r->>'source_cell_reference',(r->>'source_order')::integer);
  inserted=inserted+1;
 end loop;
 perform set_config('app.audit_reason','Conciliación final del lote importado',true);
 update public.import_batches set record_count=inserted,skipped_count=skipped where id=batch;
 return jsonb_build_object('already_imported',false,'batch_id',batch,'inserted',inserted,'skipped',skipped);
end $$;

create function public.get_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador','editor','lector']);
 return (select jsonb_build_object(
  'territories',coalesce((select jsonb_agg(t order by territory_number) from public.territories t),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg(a order by territory_id,assigned_at,id) from public.assignments a where voided_at is null),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name) order by display_name) from public.people where active),'[]'::jsonb),
  'revision',statement_timestamp()));
end $$;
create function public.get_export_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.may_export() then raise exception using errcode='42501',message='No tiene permiso para exportar.';end if;
 return public.get_snapshot();
end $$;
create function public.backup_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb;
begin
 perform private.require_role(array['administrador']);
 -- One SQL statement gives all backup tables a consistent MVCC snapshot.
 select jsonb_build_object('schema_version',1,'generated_at',statement_timestamp(),'snapshot',public.get_snapshot(),
 'profiles',coalesce((select jsonb_agg(p) from public.profiles p),'[]'::jsonb),
 'assignments_including_voided',coalesce((select jsonb_agg(a) from public.assignments a),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(p) from public.people p),'[]'::jsonb),
 'audit_log',coalesce((select jsonb_agg(l order by id) from public.audit_log l),'[]'::jsonb),
 'import_batches',coalesce((select jsonb_agg(b) from public.import_batches b),'[]'::jsonb),
 'territory_observations',coalesce((select jsonb_agg(o) from public.territory_observations o),'[]'::jsonb),
 'conductors',coalesce((select jsonb_agg(c) from public.conductors c),'[]'::jsonb),
 'meeting_schedule',coalesce((select jsonb_agg(m) from public.meeting_schedule m),'[]'::jsonb)) into output;
 insert into public.audit_log(actor_id,entity,entity_id,operation,reason) values(auth.uid(),'backup','all','EXPORT','Respaldo privado descargado');
 return output;
end $$;

-- RLS on every public table, including future modules.
alter table public.profiles enable row level security;
create policy profile_self_or_admin on public.profiles for select to authenticated using(id=auth.uid() or private.app_role()='administrador');
do $$ declare name text;begin
 foreach name in array array['territories','people','assignments','territory_observations','conductors','meeting_schedule'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('create policy authenticated_read on public.%I for select to authenticated using (private.app_role() is not null)',name);
 end loop;
 foreach name in array array['audit_log','import_batches'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('create policy admin_read on public.%I for select to authenticated using (private.app_role() = ''administrador'')',name);
 end loop;
end $$;
revoke all on public.profiles,public.territories,public.people,public.assignments,public.audit_log,public.import_batches,public.territory_observations,public.conductors,public.meeting_schedule from anon,authenticated;
grant select on public.profiles,public.territories,public.people,public.assignments,public.audit_log,public.import_batches,public.territory_observations,public.conductors,public.meeting_schedule to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.app_role(),private.may_export() to authenticated;
-- New public functions must be explicitly granted, never PUBLIC-executable.
alter default privileges in schema public revoke execute on functions from public;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('assign_territory','complete_assignment','correct_assignment','manage_profile','manage_territory','add_observation','import_history','get_snapshot','get_export_snapshot','backup_data') loop
  execute format('revoke all on function %s from public,anon',f.sig);
  execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
commit;
