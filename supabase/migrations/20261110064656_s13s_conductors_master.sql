begin;

alter table public.conductors
 add column code integer generated always as identity unique,
 add column version integer not null default 1 check(version>0),
 add column created_at timestamptz not null default now(),
 add column updated_at timestamptz not null default now(),
 add column created_by uuid references public.profiles(id),
 add column updated_by uuid references public.profiles(id),
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id),
 add constraint conductors_one_person unique(person_id),
 add constraint conductors_deleted_inactive check(deleted_at is null or not active);
create index conductors_created_by_idx on public.conductors(created_by);
create index conductors_updated_by_idx on public.conductors(updated_by);
create index conductors_deleted_by_idx on public.conductors(deleted_by);
-- The unique person index also covers this foreign key.
drop index public.conductors_person_id_idx;

create function private.conductor_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.person_id is distinct from old.person_id
   or new.code is distinct from old.code or new.created_at is distinct from old.created_at
   or new.created_by is distinct from old.created_by then
   raise exception 'La identidad y procedencia del conductor no se pueden modificar.';
  end if;
  new.version=old.version+1;
 else
  new.version=1;
  new.created_by=auth.uid();
 end if;
 new.updated_at=now();
 new.updated_by=auth.uid();
 return new;
end $$;
revoke all on function private.conductor_stamp() from public,anon,authenticated;
create trigger stamp_conductor before insert or update on public.conductors
 for each row execute function private.conductor_stamp();
create trigger audit_conductors after insert or update or delete on public.conductors
 for each row execute function private.audit_change();

create function private.get_conductors() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador']);
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'code',c.code,'person_id',c.person_id,'display_name',p.display_name,
  'active',c.active,'deleted_at',c.deleted_at,'version',c.version,
  'created_at',c.created_at,'updated_at',c.updated_at,
  'assignments_count',s.assignments_count,'open_assignments',s.open_assignments
 ) order by c.code),'[]'::jsonb)
 from public.conductors c join public.people p on p.id=c.person_id
 cross join lateral (
  select count(*) as assignments_count,
   count(*) filter(where a.completed_at is null) as open_assignments
  from public.assignments a where a.person_id=c.person_id and a.voided_at is null
 ) s);
end $$;

create function private.manage_conductor(p_id uuid,p_expected_version integer,p_name text,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.conductors; nm text; pid uuid;
begin
 perform private.require_role(array['administrador']);
 if p_id is null or p_action is null or p_action not in ('create','update','activate','deactivate','delete','restore') then
  raise exception 'Indique una acción válida para el conductor.';
 end if;
 if length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then
  raise exception 'Describa el motivo con entre 8 y 2000 caracteres.';
 end if;
 nm=normalize(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')));
 if p_action in ('create','update') and length(nm) not between 1 and 200 then
  raise exception 'El nombre debe tener entre 1 y 200 caracteres.';
 end if;
 -- Catalog writes are small and serialized; the expected version prevents lost updates.
 perform pg_advisory_xact_lock(130113);
 select * into c from public.conductors where id=p_id for update;
 if p_action='create' then
  if p_expected_version is distinct from 0 then raise exception 'Versión inicial no válida.';end if;
  if found then
   if c.deleted_at is null and (select display_name from public.people where id=c.person_id)=nm then return c.id;end if;
   raise exception using errcode='40001',message='El conductor ya existe o cambió. Revise el maestro.';
  end if;
  perform set_config('app.audit_reason',btrim(p_reason),true);
  -- Names are not identities: homonyms retain independent people and codes.
  insert into public.people(display_name,normalized_name,active)
   values(nm,lower(nm),true) returning id into pid;
  insert into public.conductors(id,person_id,active) values(p_id,pid,true);
  return p_id;
 end if;
 if c.id is null then raise exception 'Conductor no encontrado.';end if;
 if c.version is distinct from p_expected_version then
  raise exception using errcode='40001',message='Otro administrador actualizó este conductor. Revise la lista.';
 end if;
 if p_action='restore' then
  if c.deleted_at is null then raise exception 'El conductor no está en la papelera.';end if;
 elsif c.deleted_at is not null then
  raise exception 'El conductor está en la papelera. Restáurelo antes de modificarlo.';
 end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='update' then
  update public.people set display_name=nm,normalized_name=lower(nm) where id=c.person_id;
  update public.conductors set active=active where id=c.id;
 elsif p_action='activate' then
  update public.conductors set active=true where id=c.id;
 elsif p_action='deactivate' then
  update public.conductors set active=false where id=c.id;
 elsif p_action='delete' then
  update public.conductors set active=false,deleted_at=now(),deleted_by=auth.uid() where id=c.id;
 elsif p_action='restore' then
  update public.conductors set active=false,deleted_at=null,deleted_by=null where id=c.id;
 end if;
 update public.people p set active=c2.active and c2.deleted_at is null
  from public.conductors c2 where p.id=c2.person_id and c2.id=c.id
   and p.active is distinct from (c2.active and c2.deleted_at is null);
 return c.id;
end $$;

create function public.get_conductors() returns jsonb language sql stable security invoker set search_path=''
 as $$select private.get_conductors()$$;
create function public.manage_conductor(p_id uuid,p_expected_version integer,p_name text,p_action text,p_reason text)
returns uuid language sql security invoker set search_path=''
 as $$select private.manage_conductor(p_id,p_expected_version,p_name,p_action,p_reason)$$;
revoke all on function private.get_conductors(),private.manage_conductor(uuid,integer,text,text,text),
 public.get_conductors(),public.manage_conductor(uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function private.get_conductors(),private.manage_conductor(uuid,integer,text,text,text),
 public.get_conductors(),public.manage_conductor(uuid,integer,text,text,text) to authenticated;

create or replace function private.get_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador','editor','lector']);
 return (select jsonb_build_object(
  'territories',coalesce((select jsonb_agg(t order by territory_number) from public.territories t),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg(a order by territory_id,assigned_at,id) from public.assignments a where voided_at is null),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name) order by display_name) from public.people where active),'[]'::jsonb),
  'conductors',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'code',c.code,'person_id',c.person_id,'display_name',p.display_name,
   'active',c.active,'deleted_at',c.deleted_at,'version',c.version) order by p.display_name,c.code)
   from public.conductors c join public.people p on p.id=c.person_id
   where c.active and c.deleted_at is null and p.active),'[]'::jsonb),
  'revision',statement_timestamp()));
end $$;

create or replace function private.assign_territory(p_territory_id uuid,p_expected_version integer,p_name text,p_assigned_at date,p_person_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.territories; a_id uuid; last_start date; c public.conductors; p public.people; nm text;
begin
 perform private.require_role(array['administrador','editor']);
 select * into t from public.territories where id=p_territory_id for update;
 if not found or not t.active then raise exception 'Territorio no disponible.';end if;
 if t.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Revise el registro.';end if;
 select max(assigned_at) into last_start from public.assignments where territory_id=t.id and voided_at is null;
 if last_start is not null and p_assigned_at<=last_start then raise exception 'Use corrección administrativa para un alta retroactiva.';end if;
 nm=btrim(p_name);
 if p_person_id is not null then
  -- Match catalog lock order; SHARE lets simultaneous assignments coexist while
  -- preventing a deactivation or rename between checking and writing the snapshot.
  select * into c from public.conductors where person_id=p_person_id for share;
  if found and (not c.active or c.deleted_at is not null) then raise exception 'El conductor está inactivo o eliminado.';end if;
  select * into p from public.people where id=p_person_id for share;
  if not found or not p.active then raise exception 'El responsable ya no está disponible.';end if;
  if nm is not null and nm<>p.display_name then raise exception using errcode='40001',message='El nombre del conductor cambió. Revise la selección.';end if;
  nm=p.display_name;
 end if;
 perform set_config('app.audit_reason','Asignación de territorio',true);
 insert into public.assignments(territory_id,person_id,assigned_name_snapshot,assigned_at,created_by,updated_by)
 values(t.id,p_person_id,nm,p_assigned_at,auth.uid(),auth.uid()) returning id into a_id;
 return a_id;
end $$;

-- A manual correction of the responsible name is not an identity lookup.
-- Date-only corrections preserve the link; a different manual name detaches it.
create or replace function private.correct_assignment(p_id uuid,p_expected_version integer,p_territory_version integer,p_name text,p_assigned_at date,p_completed_at date,p_reason text,p_void boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments; t public.territories; tid uuid;
begin
 perform private.require_role(array['administrador']);
 if length(btrim(coalesce(p_reason,'')))<8 then raise exception 'Describa el motivo de la corrección (mínimo 8 caracteres).';end if;
 select territory_id into tid from public.assignments where id=p_id;
 select * into t from public.territories where id=tid for update;
 select * into a from public.assignments where id=p_id for update;
 if a.id is null or a.voided_at is not null then raise exception 'Registro no disponible.';end if;
 if a.version is distinct from p_expected_version or t.version is distinct from p_territory_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla.';end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 update public.assignments set assigned_name_snapshot=btrim(p_name),assigned_at=p_assigned_at,completed_at=p_completed_at,
  person_id=case when btrim(p_name) is distinct from a.assigned_name_snapshot then null else a.person_id end,
  voided_at=case when p_void then now() end,void_reason=case when p_void then btrim(p_reason) end where id=p_id;
end $$;

-- Only catalog invalidations, without names. Each subscriber is checked by RLS.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conductors') then
  alter publication supabase_realtime add table public.conductors;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
