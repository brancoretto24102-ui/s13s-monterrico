begin;
-- Account records and named permission sets are different entities.
alter table public.profiles
 add column code integer generated always as identity unique,
 add column username text,
 add column access_mode text not null default 'base' check(access_mode in ('base','custom')),
 add column deleted_at timestamptz,
 add constraint username_format check(username is null or username ~ '^[a-zA-Z0-9_.-]{3,60}$'),
 add constraint deleted_user_inactive check(deleted_at is null or not active);
create unique index profiles_username_unique on public.profiles(lower(username)) where username is not null;

create table public.permission_catalog(key text primary key, module text not null, action text not null);
insert into public.permission_catalog(key,module,action) values
 ('territories.view','Territorios','Visualizar'),('territories.assign','Territorios','Asignar'),
 ('territories.complete','Territorios','Completar'),('territories.correct','Territorios','Corregir'),
 ('territories.void','Territorios','Anular'),('territories.observe','Territorios','Observaciones'),
 ('territories.create','Territorios','Crear territorio'),('territories.edit','Territorios','Editar territorio'),
 ('conductors.view','Conductores','Visualizar'),('conductors.create','Conductores','Registrar'),
 ('conductors.edit','Conductores','Editar'),('conductors.state','Conductores','Cambiar estado'),
 ('conductors.delete','Conductores','Eliminar y restaurar'),('conductors.export','Conductores','Exportar'),
 ('reports.view','Formulario S-13-S','Visualizar'),('reports.export','Formulario S-13-S','Generar y descargar'),
 ('imports.view','Importación','Previsualizar'),('imports.execute','Importación','Importar'),
 ('audit.view','Auditoría','Visualizar');
create table public.access_profiles(
 id uuid primary key default gen_random_uuid(), code integer generated always as identity unique,
 name text not null check(length(btrim(name)) between 3 and 120),
 system_key text unique check(system_key in ('administrador','editor','lector')),
 permissions text[] not null default '{}', active boolean not null default true,
 deleted_at timestamptz, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
 check(deleted_at is null or not active)
);
create unique index access_profile_name_unique on public.access_profiles(lower(translate(name,'ÁÉÍÓÚÜÑ','áéíóúüñ'))) where deleted_at is null;
create index access_profiles_created_by_idx on public.access_profiles(created_by);
create index access_profiles_updated_by_idx on public.access_profiles(updated_by);
create table public.user_access_profiles(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 access_profile_id uuid not null references public.access_profiles(id), active boolean not null default true,
 granted_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
 unique(user_id,access_profile_id)
);
create index user_access_profile_profile_idx on public.user_access_profiles(access_profile_id,user_id);
create index user_access_profile_granted_by_idx on public.user_access_profiles(granted_by);
insert into public.access_profiles(name,system_key,permissions) values
 ('Administrador','administrador',(select array_agg(key order by key) from public.permission_catalog)),
 ('Editor','editor',array['reports.view','territories.assign','territories.complete','territories.observe','territories.view']),
 ('Lector','lector',array['reports.view','territories.view']);

create or replace function private.app_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and active and deleted_at is null
$$;
create function private.has_permission(p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.permission_catalog where key=p_permission) and coalesce((select p.active and p.deleted_at is null and (
  p.role='administrador' or
  (p.access_mode='custom' and exists(select 1 from public.user_access_profiles u join public.access_profiles a on a.id=u.access_profile_id
   where u.user_id=p.id and u.active and a.active and a.deleted_at is null and p_permission=any(a.permissions))) or
  (p.access_mode='base' and (
   p_permission in ('territories.view','reports.view') or
   (p.role='editor' and p_permission in ('territories.assign','territories.complete','territories.observe')) or
   (p.can_export and p_permission='reports.export')
  ))
 ) from public.profiles p where p.id=auth.uid()),false)
$$;
create function private.require_permission(p_permission text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_permission(p_permission) then raise exception using errcode='42501',message='No tiene permiso para esta operación.';end if;
end $$;
create or replace function private.may_export() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_permission('reports.export') and private.has_permission('territories.view')
$$;

create function private.access_profile_stamp() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.system_key is not null then raise exception 'Los perfiles del sistema están protegidos. Duplique el perfil para personalizarlo.';end if;
  if new.id is distinct from old.id or new.code is distinct from old.code or new.system_key is distinct from old.system_key
   or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then raise exception 'La identidad del perfil es inmutable.';end if;
  new.version=old.version+1;
 else new.version=1;new.created_by=auth.uid();end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;
create trigger access_profile_stamp before insert or update on public.access_profiles for each row execute function private.access_profile_stamp();
create trigger audit_access_profiles after insert or update or delete on public.access_profiles for each row execute function private.audit_change();
create trigger audit_user_access_profiles after insert or update or delete on public.user_access_profiles for each row execute function private.audit_change();
create function private.account_identity_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.code is distinct from old.code or new.created_at is distinct from old.created_at then raise exception 'La identidad del usuario es inmutable.';end if;
 return new;
end $$;
create trigger account_identity_guard before update on public.profiles for each row execute function private.account_identity_guard();

create function private.get_access_context() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p) || jsonb_build_object('permissions',coalesce((select jsonb_agg(key order by key) from public.permission_catalog where private.has_permission(key)),'[]'::jsonb), 'can_export',private.may_export())
 from public.profiles p where p.id=auth.uid()
$$;
create function private.get_access_profiles() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador']);
 return (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('users_count',
  case when a.system_key is not null then (select count(*) from public.profiles p where p.role=a.system_key and p.access_mode='base' and p.deleted_at is null)
  else (select count(*) from public.user_access_profiles u join public.profiles p on p.id=u.user_id where u.access_profile_id=a.id and u.active and p.access_mode='custom' and p.deleted_at is null) end
 ) order by a.code),'[]'::jsonb) from public.access_profiles a);
end $$;
create function private.manage_access_profile(p_id uuid,p_expected_version integer,p_name text,p_permissions text[],p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.access_profiles; nm text; ps text[];
begin
 perform pg_advisory_xact_lock(130013);perform private.require_role(array['administrador']);
 if p_id is null or p_action is null or p_action not in ('create','update','activate','deactivate','delete','restore') then raise exception 'Acción de perfil no válida.';end if;
 if length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then raise exception 'Indique un motivo entre 8 y 2000 caracteres.';end if;
 nm=normalize(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')));
 if p_action in ('create','update') then
  if length(nm) not between 3 and 120 then raise exception 'La descripción debe tener entre 3 y 120 caracteres.';end if;
  if p_permissions is null or cardinality(p_permissions)>100 or exists(select 1 from unnest(p_permissions) k where k is null or not exists(select 1 from public.permission_catalog c where c.key=k)) then raise exception 'Permisos desconocidos o no válidos.';end if;
  select coalesce(array_agg(distinct k order by k),'{}') into ps from (
   select unnest(p_permissions) k union select split_part(k,'.',1)||'.view' from unnest(p_permissions) k
   union select 'territories.view' where exists(select 1 from unnest(p_permissions) k where k like 'reports.%' or k like 'imports.%')
  ) x;
 end if;
 select * into a from public.access_profiles where id=p_id for update;
 if p_action='create' then
  if p_expected_version is distinct from 0 then raise exception 'Versión inicial no válida.';end if;
  if found then
   if a.deleted_at is null and a.name=nm and a.permissions=ps then return a.id;end if;
   raise exception using errcode='40001',message='El perfil ya existe o cambió.';
  end if;
  perform set_config('app.audit_reason',btrim(p_reason),true);
  insert into public.access_profiles(id,name,permissions) values(p_id,nm,ps);return p_id;
 end if;
 if a.id is null then raise exception 'Perfil no encontrado.';end if;
 if a.system_key is not null then raise exception 'Los perfiles del sistema están protegidos. Duplique el perfil para personalizarlo.';end if;
 if a.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro administrador actualizó el perfil. Revise la lista.';end if;
 if p_action='restore' then
  if a.deleted_at is null then raise exception 'El perfil no está en Papelera.';end if;
 elsif a.deleted_at is not null then raise exception 'Restaure el perfil antes de modificarlo.';end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='update' then update public.access_profiles set name=nm,permissions=ps where id=p_id;
 elsif p_action='activate' then update public.access_profiles set active=true where id=p_id;
 elsif p_action='deactivate' then update public.access_profiles set active=false where id=p_id;
 elsif p_action='delete' then update public.access_profiles set active=false,deleted_at=now() where id=p_id;
 elsif p_action='restore' then update public.access_profiles set active=false,deleted_at=null where id=p_id;end if;
 return p_id;
end $$;

create function private.get_users() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador']);
 return (select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('email',u.email,'last_sign_in_at',u.last_sign_in_at,
  'access_profile_ids',coalesce((select jsonb_agg(x.access_profile_id order by x.access_profile_id) from public.user_access_profiles x where x.user_id=p.id and x.active),'[]'::jsonb)) order by p.code),'[]'::jsonb)
 from public.profiles p join auth.users u on u.id=p.id);
end $$;
create function private.manage_user(p_id uuid,p_expected_version integer,p_name text,p_username text,p_role text,p_active boolean,p_can_export boolean,p_access_mode text,p_profile_ids uuid[],p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles; selected_ids uuid[]; nm text; un text;
begin
 perform pg_advisory_xact_lock(130013);perform private.require_role(array['administrador']);
 if p_action is null or p_action not in ('update','delete','restore') then raise exception 'Acción de usuario no válida.';end if;
 if length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then raise exception 'Indique el motivo del cambio de acceso (8 a 2000 caracteres).';end if;
 select * into target from public.profiles where id=p_id for update;
 if not found then raise exception 'Usuario no encontrado.';end if;
 if target.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro administrador actualizó el usuario. Revise la lista.';end if;
 if p_action='restore' then
  if target.deleted_at is null then raise exception 'El usuario no está en Papelera.';end if;
 elsif target.deleted_at is not null then raise exception 'Restaure al usuario antes de modificarlo.';end if;
 if target.active and target.role='administrador' and (p_action='delete' or not coalesce(p_active,false) or p_role is distinct from 'administrador')
  and (select count(*) from public.profiles where active and role='administrador' and deleted_at is null)<=1 then raise exception 'Debe permanecer al menos un administrador activo.';end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='delete' then update public.profiles set active=false,deleted_at=now(),version=version+1 where id=p_id;return;
 elsif p_action='restore' then update public.profiles set active=false,deleted_at=null,version=version+1 where id=p_id;return;end if;
 nm=normalize(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')));un=nullif(lower(btrim(p_username)),'');
 if length(nm) not between 1 and 200 or p_role is null or p_role not in ('administrador','editor','lector') or p_active is null or p_can_export is null
  or p_access_mode is null or p_access_mode not in ('base','custom') then raise exception 'Revise los datos del usuario.';end if;
 if p_role='administrador' and p_access_mode<>'base' then raise exception 'El administrador utiliza el perfil protegido del sistema.';end if;
 if p_access_mode='custom' then
  select coalesce(array_agg(distinct v),'{}') into selected_ids from unnest(p_profile_ids) v;
  if cardinality(selected_ids) not between 1 and 50 or (select count(*) from public.access_profiles where id=any(selected_ids) and active and deleted_at is null and system_key is null)<>cardinality(selected_ids) then raise exception 'Seleccione perfiles personalizados activos y vigentes.';end if;
 else selected_ids='{}';end if;
 update public.profiles set display_name=nm,username=un,role=case when p_access_mode='custom' then 'lector' else p_role end,
  active=p_active,can_export=case when p_access_mode='custom' then false else p_can_export end,access_mode=p_access_mode,version=version+1 where id=p_id;
 update public.user_access_profiles set active=(access_profile_id=any(selected_ids)),updated_at=now(),granted_by=auth.uid()
  where user_id=p_id and active is distinct from (access_profile_id=any(selected_ids));
 insert into public.user_access_profiles(user_id,access_profile_id,granted_by)
  select p_id,v,auth.uid() from unnest(selected_ids) v where not exists(select 1 from public.user_access_profiles x where x.user_id=p_id and x.access_profile_id=v);
end $$;

-- Keep the invitation API compatible, without bypassing logical deletion or versions.
create or replace function private.manage_profile(p_id uuid,p_expected_version integer,p_role text,p_active boolean,p_can_export boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare t public.profiles;
begin
 select * into t from public.profiles where id=p_id;
 perform private.manage_user(p_id,p_expected_version,t.display_name,t.username,p_role,p_active,p_can_export,'base','{}','update',p_reason);
end $$;
create function private.log_access_event(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador']);
 if not exists(select 1 from public.profiles where id=p_id and deleted_at is null) or length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then raise exception 'Evento no válido.';end if;
 insert into public.audit_log(actor_id,entity,entity_id,operation,reason) values(auth.uid(),'profiles',p_id::text,'AUTH_EMAIL',btrim(p_reason));
end $$;

-- Public wrappers preserve the unexposed privileged implementation boundary.
create function public.get_access_context() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_access_context()$$;
create function public.get_access_profiles() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_access_profiles()$$;
create function public.manage_access_profile(p_id uuid,p_expected_version integer,p_name text,p_permissions text[],p_action text,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.manage_access_profile(p_id,p_expected_version,p_name,p_permissions,p_action,p_reason)$$;
create function public.get_users() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_users()$$;
create function public.manage_user(p_id uuid,p_expected_version integer,p_name text,p_username text,p_role text,p_active boolean,p_can_export boolean,p_access_mode text,p_profile_ids uuid[],p_action text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.manage_user(p_id,p_expected_version,p_name,p_username,p_role,p_active,p_can_export,p_access_mode,p_profile_ids,p_action,p_reason)$$;
create function public.log_access_event(p_id uuid,p_reason text) returns void language sql security invoker set search_path='' as $$select private.log_access_event(p_id,p_reason)$$;

-- Replace only the initial authorization guard of these known implementations.
-- Their transactional dates, locks, versions and history rules remain unchanged.
do $$
declare f record; definition text; guard text;
begin
 for f in select * from (values
  ('assign_territory','private.require_permission(''territories.assign'')'),
  ('complete_assignment','private.require_permission(''territories.complete'')'),
  ('correct_assignment','private.require_permission(case when p_void then ''territories.void'' else ''territories.correct'' end)'),
  ('manage_territory','private.require_permission(case when p_expected_version=0 then ''territories.create'' else ''territories.edit'' end)'),
  ('add_observation','private.require_permission(''territories.observe'')'),
  ('import_history','private.require_permission(''imports.execute'')'),
  ('get_conductors','private.require_permission(''conductors.view'')'),
  ('manage_conductor','private.require_permission(case p_action when ''create'' then ''conductors.create'' when ''update'' then ''conductors.edit'' when ''activate'' then ''conductors.state'' when ''deactivate'' then ''conductors.state'' else ''conductors.delete'' end)')
 ) m(name,guard) loop
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=f.name;
  guard=regexp_replace(definition,'perform private.require_role\(array\[[^;]+\]\);','perform '||f.guard||';','i');
  if guard=definition then raise exception 'Expected authorization guard missing: %',f.name;end if;
  guard=replace(guard,'a.version<>p_expected_version or t.version<>p_territory_version','a.version is distinct from p_expected_version or t.version is distinct from p_territory_version');
  guard=replace(guard,'t.version<>p_expected_version','t.version is distinct from p_expected_version');
  guard=replace(guard,'p_expected_version<>0','p_expected_version is distinct from 0');
  execute guard;
 end loop;
end $$;

create or replace function private.get_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare read_territories boolean; read_people boolean;
begin
 perform private.require_role(array['administrador','editor','lector']);
 read_territories=private.has_permission('territories.view');
 read_people=private.has_permission('territories.assign') or private.has_permission('conductors.view');
 return jsonb_build_object(
  'territories',case when read_territories then coalesce((select jsonb_agg(t order by territory_number) from public.territories t),'[]'::jsonb) else '[]'::jsonb end,
  'assignments',case when read_territories then coalesce((select jsonb_agg(a order by territory_id,assigned_at,id) from public.assignments a where voided_at is null),'[]'::jsonb) else '[]'::jsonb end,
  'people',case when read_people then coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name) order by display_name) from public.people where active),'[]'::jsonb) else '[]'::jsonb end,
  'conductors',case when read_people then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'person_id',c.person_id,'display_name',p.display_name,'active',c.active,'deleted_at',c.deleted_at,'version',c.version) order by p.display_name,c.code)
   from public.conductors c join public.people p on p.id=c.person_id where c.active and c.deleted_at is null and p.active),'[]'::jsonb) else '[]'::jsonb end,
  'revision',statement_timestamp());
end $$;

-- Reuse the consistent existing backup statement, adding the permission model.
do $$ declare d text;begin
 select pg_get_functiondef('private.backup_data()'::regprocedure) into d;
 d=replace(d,'''schema_version'',1','''schema_version'',1,''access_profiles'',coalesce((select jsonb_agg(ap) from public.access_profiles ap),''[]''::jsonb),''user_access_profiles'',coalesce((select jsonb_agg(up) from public.user_access_profiles up),''[]''::jsonb)');
 execute d;
end $$;

alter table public.permission_catalog enable row level security;
alter table public.access_profiles enable row level security;
alter table public.user_access_profiles enable row level security;
create policy catalog_read on public.permission_catalog for select to authenticated using ((select private.app_role()) is not null);
create policy access_profiles_admin_read on public.access_profiles for select to authenticated using ((select private.app_role())='administrador');
create policy user_access_profiles_admin_read on public.user_access_profiles for select to authenticated using ((select private.app_role())='administrador');
alter policy authenticated_read on public.territories using ((select private.has_permission('territories.view')));
alter policy authenticated_read on public.assignments using ((select private.has_permission('territories.view')));
alter policy authenticated_read on public.territory_observations using ((select private.has_permission('territories.view')));
alter policy authenticated_read on public.people using ((select private.has_permission('conductors.view')) or (select private.has_permission('territories.assign')));
alter policy authenticated_read on public.conductors using ((select private.has_permission('conductors.view')) or (select private.has_permission('territories.assign')));
alter policy authenticated_read on public.meeting_schedule using ((select private.app_role())='administrador');
alter policy admin_read on public.audit_log using ((select private.has_permission('audit.view')));
alter policy admin_read on public.import_batches using ((select private.has_permission('imports.view')));
revoke all on public.permission_catalog,public.access_profiles,public.user_access_profiles from anon,authenticated;
grant select on public.permission_catalog,public.access_profiles,public.user_access_profiles to authenticated;
revoke all on function private.has_permission(text),private.require_permission(text),private.access_profile_stamp(),private.account_identity_guard() from public,anon,authenticated;
grant execute on function private.has_permission(text) to authenticated;
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname in ('get_access_context','get_access_profiles','manage_access_profile','get_users','manage_user','log_access_event') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
