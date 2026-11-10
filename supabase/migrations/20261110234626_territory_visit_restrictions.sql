begin;

create table public.visit_restrictions(
 id uuid primary key default gen_random_uuid(),
 code integer generated always as identity unique,
 territory_id uuid not null references public.territories(id),
 address_reference text not null check(length(btrim(address_reference)) between 3 and 500),
 address_key text generated always as (lower(translate(normalize(btrim(regexp_replace(address_reference,'[[:space:]]+',' ','g'))),'ÁÉÍÓÚÜÑ','áéíóúüñ'))) stored,
 reported_on date not null check(reported_on between date '1900-01-01' and date '9998-12-31'),
 eligible_on date generated always as ((reported_on+interval '1 year')::date) stored,
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
 source_hash text check(source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
 source_reference text,
 check(deleted_at is null or not active),
 unique(source_hash,source_reference)
);
create unique index visit_restrictions_address_unique on public.visit_restrictions(territory_id,address_key) where deleted_at is null;
create index visit_restrictions_territory_idx on public.visit_restrictions(territory_id);
create index visit_restrictions_due_idx on public.visit_restrictions(eligible_on,territory_id) where active and deleted_at is null;
create index visit_restrictions_created_by_idx on public.visit_restrictions(created_by);
create index visit_restrictions_updated_by_idx on public.visit_restrictions(updated_by);
revoke all on sequence public.visit_restrictions_code_seq from public,anon,authenticated;

insert into public.permission_catalog(key,module,action) values
 ('visits.view','Domicilios que no desean visitas','Visualizar'),
 ('visits.create','Domicilios que no desean visitas','Registrar'),
 ('visits.edit','Domicilios que no desean visitas','Editar y renovar'),
 ('visits.state','Domicilios que no desean visitas','Archivar y activar'),
 ('visits.delete','Domicilios que no desean visitas','Eliminar y restaurar');

-- Existing roles and access profiles keep their current permissions.
-- The administrator already has all registered module capabilities; other
-- accounts need an explicitly assigned custom profile for address access.

create function private.visit_restriction_stamp() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.code is distinct from old.code
   or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by
   or new.source_hash is distinct from old.source_hash or new.source_reference is distinct from old.source_reference then
   raise exception 'La identidad y procedencia del domicilio son inmutables.';
  end if;
  new.version=old.version+1;
 else new.version=1;new.created_by=auth.uid();end if;
 new.address_reference=normalize(btrim(regexp_replace(new.address_reference,'[[:space:]]+',' ','g')));
 if new.reported_on>(now() at time zone 'America/Lima')::date then raise exception 'La fecha informada no puede ser futura.';end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;
revoke all on function private.visit_restriction_stamp() from public,anon,authenticated;
create trigger stamp_visit_restriction before insert or update on public.visit_restrictions for each row execute function private.visit_restriction_stamp();
create trigger audit_visit_restrictions after insert or update or delete on public.visit_restrictions for each row execute function private.audit_change();

create function private.manage_visit_restriction(p_id uuid,p_expected_version integer,p_territory_id uuid,p_address text,p_reported_on date,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.visit_restrictions; reference text;
begin
 perform private.require_permission(case p_action when 'create' then 'visits.create' when 'update' then 'visits.edit' when 'renew' then 'visits.edit' when 'archive' then 'visits.state' when 'activate' then 'visits.state' else 'visits.delete' end);
 if p_id is null or p_action is null or p_action not in ('create','update','renew','archive','activate','delete','restore') then raise exception 'Acción de domicilio no válida.';end if;
 if length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then raise exception 'Indique un motivo entre 8 y 2000 caracteres.';end if;
 reference=normalize(btrim(regexp_replace(coalesce(p_address,''),'[[:space:]]+',' ','g')));
 if p_action in ('create','update') and (length(reference) not between 3 and 500 or p_reported_on is null) then raise exception 'Indique el domicilio y la fecha informada.';end if;
 perform pg_advisory_xact_lock(130213);
 select * into r from public.visit_restrictions where id=p_id for update;
 if p_action='create' then
  if p_expected_version is distinct from 0 then raise exception 'Versión inicial no válida.';end if;
  if found then
   if r.deleted_at is null and r.territory_id=p_territory_id and r.address_reference=reference and r.reported_on=p_reported_on then return r.id;end if;
   raise exception using errcode='40001',message='El domicilio ya existe o cambió. Revise el maestro.';
  end if;
 else
  if r.id is null then raise exception 'Domicilio no encontrado.';end if;
  if r.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro usuario actualizó este domicilio. Revise el registro.';end if;
  if p_action='restore' then
   if r.deleted_at is null then raise exception 'El domicilio no está en Papelera.';end if;
  elsif r.deleted_at is not null then raise exception 'Restaure el domicilio antes de modificarlo.';end if;
 end if;
 if p_action in ('create','update') then
  perform 1 from public.territories where id=p_territory_id and (active or id=r.territory_id) for share;
  if not found then raise exception 'Seleccione un territorio disponible.';end if;
 end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='create' then
  insert into public.visit_restrictions(id,territory_id,address_reference,reported_on) values(p_id,p_territory_id,reference,p_reported_on);
 elsif p_action='update' then
  update public.visit_restrictions set territory_id=p_territory_id,address_reference=reference,reported_on=p_reported_on where id=p_id;
 elsif p_action='renew' then
  if p_reported_on is null or p_reported_on<=r.reported_on then raise exception 'El nuevo aviso debe ser posterior a la fecha informada anterior.';end if;
  update public.visit_restrictions set reported_on=p_reported_on,active=true where id=p_id;
 elsif p_action='archive' then
  if (now() at time zone 'America/Lima')::date<r.eligible_on then raise exception 'No se puede archivar antes de cumplir un año desde la fecha informada.';end if;
  update public.visit_restrictions set active=false where id=p_id;
 elsif p_action='activate' then update public.visit_restrictions set active=true where id=p_id;
 elsif p_action='delete' then update public.visit_restrictions set active=false,deleted_at=now() where id=p_id;
 elsif p_action='restore' then update public.visit_restrictions set active=true,deleted_at=null where id=p_id;end if;
 return p_id;
exception when unique_violation then
 raise exception using errcode='23505',message='Ya existe un domicilio con esa referencia en el territorio. Revise el maestro o la Papelera.';
end $$;
create function public.manage_visit_restriction(p_id uuid,p_expected_version integer,p_territory_id uuid,p_address text,p_reported_on date,p_action text,p_reason text)
returns uuid language sql security invoker set search_path='' as $$select private.manage_visit_restriction(p_id,p_expected_version,p_territory_id,p_address,p_reported_on,p_action,p_reason)$$;
revoke all on function private.manage_visit_restriction(uuid,integer,uuid,text,date,text,text),public.manage_visit_restriction(uuid,integer,uuid,text,date,text,text) from public,anon,authenticated;
grant execute on function private.manage_visit_restriction(uuid,integer,uuid,text,date,text,text),public.manage_visit_restriction(uuid,integer,uuid,text,date,text,text) to authenticated;

alter table public.visit_restrictions enable row level security;
revoke all on public.visit_restrictions from public,anon,authenticated;
grant select on public.visit_restrictions to authenticated;
create policy authorized_visit_read on public.visit_restrictions for select to authenticated using ((select private.has_permission('visits.view')));

create or replace function private.get_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare read_territories boolean; read_people boolean; read_visits boolean;
begin
 perform private.require_role(array['administrador','editor','lector']);
 read_territories=private.has_permission('territories.view');
 read_people=private.has_permission('territories.assign') or private.has_permission('conductors.view');
 read_visits=private.has_permission('visits.view');
 return jsonb_build_object(
  'territories',case when read_territories then coalesce((select jsonb_agg(t order by territory_number) from public.territories t),'[]'::jsonb) else '[]'::jsonb end,
  'assignments',case when read_territories then coalesce((select jsonb_agg(a order by territory_id,assigned_at,id) from public.assignments a where voided_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'people',case when read_people then coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name) order by display_name) from public.people where active),'[]'::jsonb) else '[]'::jsonb end,
  'conductors',case when read_people then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'person_id',c.person_id,'display_name',p.display_name,'active',c.active,'deleted_at',c.deleted_at,'version',c.version) order by p.display_name,c.code)
   from public.conductors c join public.people p on p.id=c.person_id where c.active and c.deleted_at is null and p.active),'[]'::jsonb) else '[]'::jsonb end,
  'visit_restrictions',case when read_visits then coalesce((select jsonb_agg(v order by v.code) from public.visit_restrictions v),'[]'::jsonb) else '[]'::jsonb end,
  'visit_territories',case when read_visits then coalesce((select jsonb_agg(jsonb_build_object('id',id,'territory_number',territory_number,'active',active) order by territory_number) from public.territories),'[]'::jsonb) else '[]'::jsonb end,
  'visit_restriction_summary',case when read_territories or read_visits then coalesce((select jsonb_agg(s) from (
   select territory_id,count(*) filter(where eligible_on>(now() at time zone 'America/Lima')::date) as blocking_count,
   count(*) filter(where eligible_on<=(now() at time zone 'America/Lima')::date) as eligible_count
   from public.visit_restrictions where active and deleted_at is null group by territory_id
  ) s),'[]'::jsonb) else '[]'::jsonb end,
  'revision',statement_timestamp());
end $$;

do $$ declare d text;begin
 select pg_get_functiondef('private.backup_data()'::regprocedure) into d;
 d=replace(d,'''schema_version'',1','''schema_version'',1,''visit_restrictions'',coalesce((select jsonb_agg(v) from public.visit_restrictions v),''[]''::jsonb)');
 execute d;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='visit_restrictions') then
  alter publication supabase_realtime add table public.visit_restrictions;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
