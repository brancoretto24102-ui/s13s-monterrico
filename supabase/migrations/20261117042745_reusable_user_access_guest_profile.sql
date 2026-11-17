begin;
-- Deleted aliases are available for a new local access, while inactive users retain theirs.
drop index public.profiles_username_unique;
create unique index profiles_username_unique on public.profiles(lower(username))
 where username is not null and deleted_at is null;

create or replace function private.manage_user(p_id uuid,p_expected_version integer,p_name text,p_username text,p_role text,p_active boolean,p_can_export boolean,p_access_mode text,p_profile_ids uuid[],p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.profiles; selected_ids uuid[]; nm text; un text;
begin
 perform pg_advisory_xact_lock(130013);perform private.require_role(array['administrador']);
 if p_action is null or p_action not in ('update','delete','restore','recreate') then raise exception 'Acción de usuario no válida.';end if;
 if length(btrim(coalesce(p_reason,''))) not between 8 and 2000 then raise exception 'Indique el motivo del cambio de acceso (8 a 2000 caracteres).';end if;
 select * into target from public.profiles where id=p_id for update;
 if not found then raise exception 'Usuario no encontrado.';end if;
 if target.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro administrador actualizó el usuario. Revise la lista.';end if;
 if p_action in ('restore','recreate') then
  if target.deleted_at is null then raise exception 'El usuario no está en Papelera.';end if;
 elsif target.deleted_at is not null then raise exception 'Restaure al usuario antes de modificarlo.';end if;
 if target.active and target.role='administrador' and (p_action='delete' or not coalesce(p_active,false) or p_role is distinct from 'administrador')
  and (select count(*) from public.profiles where active and role='administrador' and deleted_at is null)<=1 then raise exception 'Debe permanecer al menos un administrador activo.';end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='delete' then update public.profiles set active=false,deleted_at=now(),version=version+1 where id=p_id;return;
 elsif p_action='restore' then
  update public.profiles set active=false,deleted_at=null,
   username=case when exists(select 1 from public.profiles other where other.id<>p_id and other.deleted_at is null and lower(other.username)=lower(target.username)) then null else target.username end,
   version=version+1 where id=p_id;
  return;
 end if;
 nm=normalize(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')));un=nullif(lower(btrim(p_username)),'');
 if length(nm) not between 1 and 200 or p_role is null or p_role not in ('administrador','editor','lector') or p_active is null or p_can_export is null
  or p_access_mode is null or p_access_mode not in ('base','custom') then raise exception 'Revise los datos del usuario.';end if;
 if p_role='administrador' and p_access_mode<>'base' then raise exception 'El administrador utiliza el perfil protegido del sistema.';end if;
 if p_access_mode='custom' then
  select coalesce(array_agg(distinct v),'{}') into selected_ids from unnest(p_profile_ids) v;
  if cardinality(selected_ids) not between 1 and 50 or (select count(*) from public.access_profiles where id=any(selected_ids) and active and deleted_at is null and system_key is null)<>cardinality(selected_ids) then raise exception 'Seleccione perfiles personalizados activos y vigentes.';end if;
 else selected_ids='{}';end if;
 update public.profiles set display_name=nm,username=un,role=case when p_access_mode='custom' then 'lector' else p_role end,
  active=p_active,deleted_at=null,can_export=case when p_access_mode='custom' then false else p_can_export end,access_mode=p_access_mode,version=version+1 where id=p_id;
 update public.user_access_profiles set active=(access_profile_id=any(selected_ids)),updated_at=now(),granted_by=auth.uid()
  where user_id=p_id and active is distinct from (access_profile_id=any(selected_ids));
 insert into public.user_access_profiles(user_id,access_profile_id,granted_by)
  select p_id,v,auth.uid() from unnest(selected_ids) v where not exists(select 1 from public.user_access_profiles x where x.user_id=p_id and x.access_profile_id=v);
end $$;


-- Only administrators can resolve a shared identity for an explicit new local access.
create function private.get_invitation_target(p_email text,p_username text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account_id uuid; matches integer; target public.profiles; un text;
begin
 perform private.require_role(array['administrador']);
 if length(btrim(coalesce(p_email,''))) not between 3 and 254 then raise exception 'Correo no válido.';end if;
 un=nullif(lower(btrim(p_username)),'');
 select count(*),min(id::text)::uuid into matches,account_id from auth.users where lower(email)=lower(btrim(p_email));
 if matches>1 then raise exception 'La identidad existe, pero su acceso de Territorios requiere revisión administrativa.';end if;
 if un is not null and exists(select 1 from public.profiles p where p.deleted_at is null and lower(p.username)=un and p.id is distinct from account_id) then
  raise exception 'El alias ya está utilizado por otro acceso vigente.';
 end if;
 if account_id is null then return null;end if;
 select * into target from public.profiles where id=account_id;
 if not found then raise exception 'La identidad existe, pero su acceso de Territorios requiere revisión administrativa.';end if;
 if target.deleted_at is null then raise exception 'El correo ya tiene un acceso de Territorios. Búscalo en Usuarios para editarlo o activarlo.';end if;
 return jsonb_build_object('id',target.id,'version',target.version);
end $$;
create function public.get_invitation_target(p_email text,p_username text) returns jsonb
language sql stable security invoker set search_path='' as $$select private.get_invitation_target(p_email,p_username)$$;
revoke all on function private.get_invitation_target(text,text),public.get_invitation_target(text,text) from public,anon;
grant execute on function private.get_invitation_target(text,text),public.get_invitation_target(text,text) to authenticated;

-- This named profile remains editable through the normal administrator workflow.
-- Authentication credentials are never seeded in repository migrations.
select set_config('app.audit_reason','Alta del perfil Invitado solicitada por el administrador',true);
insert into public.access_profiles(name,permissions)
 select 'Invitado',array['maps.view','reports.export','reports.view','territories.view']
 where not exists(select 1 from public.access_profiles where lower(name)='invitado' and deleted_at is null);
commit;
