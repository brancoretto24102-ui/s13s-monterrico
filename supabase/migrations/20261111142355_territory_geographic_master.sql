begin;

insert into public.permission_catalog(key,module,action) values
 ('maps.view','Territorios geográficos','Visualizar mapa y prioridades'),
 ('maps.create','Territorios geográficos','Crear polígonos'),
 ('maps.edit','Territorios geográficos','Editar límites'),
 ('maps.approve','Territorios geográficos','Validar límites revisados'),
 ('maps.delete','Territorios geográficos','Eliminar y restaurar polígonos'),
 ('maps.import','Territorios geográficos','Importar GeoJSON'),
 ('maps.export','Territorios geográficos','Exportar GeoJSON y KML');

-- No new capabilities are assigned to existing users or custom profiles.
create function private.map_reason_ok(p_reason text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select length(btrim(regexp_replace(translate(coalesce(p_reason,''),chr(160),' '),'[[:space:]]+',' ','g'))) between 8 and 2000
 and length(coalesce(p_reason,''))<=2000
$$;

create function private.map_segments_intersect(ax double precision,ay double precision,bx double precision,by_ double precision,cx double precision,cy double precision,dx double precision,dy double precision)
returns boolean language sql immutable security invoker set search_path='' as $$
 select not (greatest(ax,bx)<least(cx,dx)-1e-13 or greatest(cx,dx)<least(ax,bx)-1e-13
 or greatest(ay,by_)<least(cy,dy)-1e-13 or greatest(cy,dy)<least(ay,by_)-1e-13)
 and (case when (bx-ax)*(cy-ay)-(by_-ay)*(cx-ax)>1e-13 then 1 when (bx-ax)*(cy-ay)-(by_-ay)*(cx-ax)<-1e-13 then -1 else 0 end)
   *(case when (bx-ax)*(dy-ay)-(by_-ay)*(dx-ax)>1e-13 then 1 when (bx-ax)*(dy-ay)-(by_-ay)*(dx-ax)<-1e-13 then -1 else 0 end)<=0
 and (case when (dx-cx)*(ay-cy)-(dy-cy)*(ax-cx)>1e-13 then 1 when (dx-cx)*(ay-cy)-(dy-cy)*(ax-cx)<-1e-13 then -1 else 0 end)
   *(case when (dx-cx)*(by_-cy)-(dy-cy)*(bx-cx)>1e-13 then 1 when (dx-cx)*(by_-cy)-(dy-cy)*(bx-cx)<-1e-13 then -1 else 0 end)<=0
$$;

create function private.map_point_inside(p_x double precision,p_y double precision,p_ring jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare i integer;j integer;ax double precision;ay double precision;bx double precision;by_ double precision;hit boolean=false;
begin
 j=jsonb_array_length(p_ring)-2;
 for i in 0..jsonb_array_length(p_ring)-2 loop
  ax=(p_ring->i->>0)::double precision;ay=(p_ring->i->>1)::double precision;
  bx=(p_ring->j->>0)::double precision;by_=(p_ring->j->>1)::double precision;
  if (ay>p_y)<>(by_>p_y) then
   if p_x<(bx-ax)*(p_y-ay)/(by_-ay)+ax then hit=not hit;end if;
  end if;
  j=i;
 end loop;
 return hit;
end $$;

-- Validate GeoJSON on the server too; client-side checks are only assistance.
-- Disjoint parts are supported; holes and intersecting parts require explicit
-- preparation before import. Limits bound both payload size and topology cost.
create function private.validate_territory_geometry(p_geometry jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare parts jsonb;part jsonb;ring jsonb;point jsonb;output jsonb='[]';x double precision[];y double precision[];
 n integer;i integer;j integer;k integer;l integer;a integer;b integer;total integer=0;signed double precision;other jsonb;
begin
 if jsonb_typeof(p_geometry) is distinct from 'object' or length(p_geometry::text)>300000 then raise exception 'Geometría GeoJSON no válida o demasiado grande.';end if;
 if p_geometry->>'type' not in ('Polygon','MultiPolygon') or p_geometry->>'type' is null then raise exception 'Solo se admiten Polygon y MultiPolygon.';end if;
 if jsonb_typeof(p_geometry->'coordinates') is distinct from 'array' then raise exception 'Faltan las coordenadas del polígono.';end if;
 parts=case when p_geometry->>'type'='Polygon' then jsonb_build_array(p_geometry->'coordinates') else p_geometry->'coordinates' end;
 if jsonb_array_length(parts) not between 1 and 64 then raise exception 'El territorio debe tener entre 1 y 64 partes.';end if;
 for part in select value from jsonb_array_elements(parts) loop
  if jsonb_typeof(part) is distinct from 'array' then raise exception 'Parte del polígono no válida.';end if;
  if jsonb_array_length(part)<>1 or jsonb_typeof(part->0) is distinct from 'array' then raise exception 'Cada parte debe tener un contorno exterior sin huecos.';end if;
  ring=part->0;n=jsonb_array_length(ring);total=total+n;
  if n not between 4 and 513 or total>4096 then raise exception 'Contorno fuera del límite de puntos (513 por parte y 4096 por territorio).';end if;
  x='{}';y='{}';
  for point in select value from jsonb_array_elements(ring) loop
   if jsonb_typeof(point) is distinct from 'array' then raise exception 'Coordenada no válida.';end if;
   if jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'Usa pares numéricos WGS84 [longitud, latitud], sin altitud.';end if;
   if (point->>0)::numeric not between -180 and 180 or (point->>1)::numeric not between -85 and 85 then raise exception 'Coordenadas fuera del rango del mapa.';end if;
   x=array_append(x,(point->>0)::double precision);y=array_append(y,(point->>1)::double precision);
  end loop;
  if ring->0 is distinct from ring->(n-1) then raise exception 'El primer y último punto deben coincidir para cerrar el contorno.';end if;
  signed=0;
  for i in 1..n-1 loop
   if x[i]=x[i+1] and y[i]=y[i+1] then raise exception 'Hay puntos consecutivos duplicados.';end if;
   signed=signed+(x[i]-x[1])*(y[i+1]-y[1])-(x[i+1]-x[1])*(y[i]-y[1]);
   for j in i+1..n-1 loop
    if j=i+1 or (i=1 and j=n-1) then continue;end if;
    if private.map_segments_intersect(x[i],y[i],x[i+1],y[i+1],x[j],y[j],x[j+1],y[j+1]) then raise exception 'El contorno se cruza o se toca a sí mismo.';end if;
   end loop;
  end loop;
  if abs(signed)/2<=1e-13 then raise exception 'El contorno no tiene un área válida.';end if;
  if signed<0 then select jsonb_agg(value order by ord desc) into ring from jsonb_array_elements(ring) with ordinality as pts(value,ord);end if;
  output=output||jsonb_build_array(jsonb_build_array(ring));
 end loop;
 for a in 0..jsonb_array_length(output)-1 loop
  ring=output->a->0;
  for b in a+1..jsonb_array_length(output)-1 loop
   other=output->b->0;
   if private.map_point_inside((ring->0->>0)::double precision,(ring->0->>1)::double precision,other)
     or private.map_point_inside((other->0->>0)::double precision,(other->0->>1)::double precision,ring) then raise exception 'Las partes del mismo territorio no pueden superponerse.';end if;
   for k in 0..jsonb_array_length(ring)-2 loop
    for l in 0..jsonb_array_length(other)-2 loop
     if private.map_segments_intersect((ring->k->>0)::double precision,(ring->k->>1)::double precision,(ring->(k+1)->>0)::double precision,(ring->(k+1)->>1)::double precision,
       (other->l->>0)::double precision,(other->l->>1)::double precision,(other->(l+1)->>0)::double precision,(other->(l+1)->>1)::double precision) then raise exception 'Las partes del mismo territorio deben estar separadas.';end if;
    end loop;
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('type','MultiPolygon','coordinates',output);
end $$;
revoke all on function private.map_reason_ok(text),private.map_segments_intersect(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision),private.map_point_inside(double precision,double precision,jsonb),private.validate_territory_geometry(jsonb) from public,anon,authenticated;

create table public.territory_geometries(
 id uuid primary key default gen_random_uuid(),
 territory_id uuid not null unique references public.territories(id),
 geometry jsonb not null check(jsonb_typeof(geometry)='object'),
 source text not null check(length(btrim(source)) between 3 and 1500),
 source_hash text check(source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
 review_status text not null default 'draft' check(review_status in ('draft','verified')),
 reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
 version integer not null default 1 check(version>0),deleted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),
 check((review_status='verified' and reviewed_by is not null and reviewed_at is not null) or (review_status='draft' and reviewed_by is null and reviewed_at is null)),
 check(deleted_at is null or review_status='draft')
);
create index territory_geometry_created_by_idx on public.territory_geometries(created_by);
create index territory_geometry_updated_by_idx on public.territory_geometries(updated_by);
create index territory_geometry_reviewed_by_idx on public.territory_geometries(reviewed_by);
alter table public.territory_geometries enable row level security;
revoke all on public.territory_geometries from public,anon,authenticated;
grant select on public.territory_geometries to authenticated;
create policy authorized_map_read on public.territory_geometries for select to authenticated
 using ((select private.has_permission('maps.view')) and (deleted_at is null or (select private.has_permission('maps.delete'))));

create function private.territory_geometry_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.territory_id is distinct from old.territory_id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by or new.source_hash is distinct from old.source_hash then raise exception 'La identidad y procedencia inicial del polígono son inmutables.';end if;
  new.version=old.version+1;
  if new.geometry is distinct from old.geometry or new.source is distinct from old.source then
   new.geometry=private.validate_territory_geometry(new.geometry);new.review_status='draft';new.reviewed_by=null;new.reviewed_at=null;
  end if;
 else new.version=1;new.created_by=auth.uid();new.geometry=private.validate_territory_geometry(new.geometry);end if;
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;
revoke all on function private.territory_geometry_stamp() from public,anon,authenticated;
create trigger territory_geometry_stamp before insert or update on public.territory_geometries for each row execute function private.territory_geometry_stamp();
create trigger audit_territory_geometries after insert or update or delete on public.territory_geometries for each row execute function private.audit_change();

create function private.manage_territory_geometry(p_id uuid,p_expected_version integer,p_territory_id uuid,p_geometry jsonb,p_source text,p_action text,p_reason text,p_source_hash text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.territory_geometries;normalized jsonb;label text;
begin
 perform private.require_permission('maps.view');
 if p_action is null or p_action not in ('create','update','approve','delete','restore') or p_id is null then raise exception 'Acción de polígono no válida.';end if;
 perform private.require_permission(case p_action when 'create' then 'maps.create' when 'update' then 'maps.edit' when 'approve' then 'maps.approve' else 'maps.delete' end);
 if not private.map_reason_ok(p_reason) then raise exception 'Indique un motivo entre 8 y 2000 caracteres.';end if;
 perform pg_advisory_xact_lock(130215);
 select * into r from public.territory_geometries where id=p_id for update;
 if p_action='create' then
  if p_expected_version is distinct from 0 then raise exception 'Versión inicial no válida.';end if;
 else
  if r.id is null then raise exception 'Polígono no encontrado.';end if;
  if r.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro usuario actualizó este polígono. Actualice el maestro.';end if;
  if p_action='restore' then
   if r.deleted_at is null then raise exception 'El polígono no está en Papelera.';end if;
  elsif r.deleted_at is not null then raise exception 'Restaure el polígono antes de modificarlo.';end if;
  if p_territory_id is distinct from r.territory_id then raise exception 'No se puede trasladar un polígono a otro territorio.';end if;
 end if;
 if p_action in ('create','update') then
  perform 1 from public.territories where id=p_territory_id and (active or id=r.territory_id) for share;
  if not found then raise exception 'Seleccione un territorio disponible.';end if;
  normalized=private.validate_territory_geometry(p_geometry);label=btrim(coalesce(p_source,''));
  if length(label) not between 3 and 1500 then raise exception 'Indique la procedencia de los límites (3 a 1500 caracteres).';end if;
  if p_source_hash is not null and p_source_hash !~ '^[0-9a-f]{64}$' then raise exception 'Huella de procedencia no válida.';end if;
  if p_action='create' and r.id is not null then
   if r.deleted_at is null and r.territory_id=p_territory_id and r.geometry=normalized and r.source=label and r.source_hash is not distinct from p_source_hash then return r.id;end if;
   raise exception using errcode='40001',message='El polígono ya existe o cambió.';
  end if;
 end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='create' then
  insert into public.territory_geometries(id,territory_id,geometry,source,source_hash,created_by,updated_by) values(p_id,p_territory_id,normalized,label,p_source_hash,auth.uid(),auth.uid());
 elsif p_action='update' then
  update public.territory_geometries set geometry=normalized,source=label,review_status='draft',reviewed_by=null,reviewed_at=null where id=p_id;
 elsif p_action='approve' then
  perform private.validate_territory_geometry(r.geometry);
  update public.territory_geometries set review_status='verified',reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
 elsif p_action='delete' then
  update public.territory_geometries set deleted_at=now(),review_status='draft',reviewed_by=null,reviewed_at=null where id=p_id;
 elsif p_action='restore' then
  update public.territory_geometries set deleted_at=null,review_status='draft',reviewed_by=null,reviewed_at=null where id=p_id;
 end if;
 return p_id;
exception when unique_violation then raise exception using errcode='23505',message='Ya existe un polígono para este territorio. Revise el maestro o la Papelera.';
end $$;
create function public.manage_territory_geometry(p_id uuid,p_expected_version integer,p_territory_id uuid,p_geometry jsonb,p_source text,p_action text,p_reason text,p_source_hash text default null)
returns uuid language sql security invoker set search_path='' as $$select private.manage_territory_geometry(p_id,p_expected_version,p_territory_id,p_geometry,p_source,p_action,p_reason,p_source_hash)$$;
revoke all on function private.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text),public.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text) from public,anon,authenticated;
grant execute on function private.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text),public.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text) to authenticated;

create function private.get_territory_map() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb;
begin
 perform private.require_permission('maps.view');
 with latest as (
  select territory_id,max(completed_at) as last_completed from public.assignments
   where voided_at is null and completed_at<=(now() at time zone 'America/Lima')::date group by territory_id
 ), opened as (
  select territory_id,min(assigned_at) as assigned_at from public.assignments
   where voided_at is null and completed_at is null and assigned_at<=(now() at time zone 'America/Lima')::date group by territory_id
 )
 select jsonb_build_object('territories',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'territory_number',t.territory_number,'active',t.active,'description',t.description,'last_completed',l.last_completed,'assigned_at',o.assigned_at) order by t.territory_number)
  from public.territories t left join latest l on l.territory_id=t.id left join opened o on o.territory_id=t.id),'[]'::jsonb),
 'shapes',coalesce((select jsonb_agg(g order by territory_id) from public.territory_geometries g where g.deleted_at is null or private.has_permission('maps.delete')),'[]'::jsonb),
 'revision',statement_timestamp()) into output;
 return output;
end $$;
create function public.get_territory_map() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_territory_map()$$;
revoke all on function private.get_territory_map(),public.get_territory_map() from public,anon,authenticated;
grant execute on function private.get_territory_map(),public.get_territory_map() to authenticated;

create function private.import_territory_geometries(p_features jsonb,p_source text,p_source_hash text,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare f jsonb;tid uuid;seen integer[]='{}';number integer;count_ integer=0;expected integer;
begin
 perform private.require_permission('maps.view');perform private.require_permission('maps.import');
 if not private.map_reason_ok(p_reason) then raise exception 'Indique un motivo entre 8 y 2000 caracteres.';end if;
 if jsonb_typeof(p_features) is distinct from 'array' or length(p_features::text)>2000000 then raise exception 'Lote de polígonos no válido o mayor a 2 MB.';end if;
 if jsonb_array_length(p_features) not between 1 and 500 then raise exception 'Importe entre 1 y 500 territorios.';end if;
 perform pg_advisory_xact_lock(130215);
 for f in select value from jsonb_array_elements(p_features) order by (value->>'territory_number')::integer loop
  if jsonb_typeof(f->'territory_number') is distinct from 'number' or (f->>'territory_number') !~ '^[1-9][0-9]*$' then raise exception 'Número de territorio no válido.';end if;
  number=(f->>'territory_number')::integer;
  if number=any(seen) then raise exception 'Territorio duplicado en el lote.';end if;
  seen=array_append(seen,number);
  select id into tid from public.territories where territory_number=number and active;
  if tid is null then raise exception 'Territorio % inexistente o inactivo.',number;end if;
  if (f->>'expected_version') !~ '^[0-9]+$' or f->>'expected_version' is null then raise exception 'Indique la versión de cada polígono.';end if;
  expected=(f->>'expected_version')::integer;
  perform private.manage_territory_geometry((f->>'id')::uuid,expected,tid,f->'geometry',p_source,case when expected=0 then 'create' else 'update' end,p_reason,p_source_hash);
  count_=count_+1;
 end loop;
 return count_;
end $$;
create function public.import_territory_geometries(p_features jsonb,p_source text,p_source_hash text,p_reason text) returns integer
language sql security invoker set search_path='' as $$select private.import_territory_geometries(p_features,p_source,p_source_hash,p_reason)$$;
revoke all on function private.import_territory_geometries(jsonb,text,text,text),public.import_territory_geometries(jsonb,text,text,text) from public,anon,authenticated;
grant execute on function private.import_territory_geometries(jsonb,text,text,text),public.import_territory_geometries(jsonb,text,text,text) to authenticated;

create function private.export_territory_geometries(p_versions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb;
begin
 perform private.require_permission('maps.view');perform private.require_permission('maps.export');
 if jsonb_typeof(p_versions) is distinct from 'object' then raise exception 'Indique las versiones que se van a exportar.';end if;
 perform pg_advisory_xact_lock(130215);
 if exists(select 1 from jsonb_each_text(p_versions) v left join public.territory_geometries g on g.id::text=v.key and g.deleted_at is null where g.id is null or g.version::text<>v.value)
  or exists(select 1 from public.territory_geometries g where deleted_at is null and (p_versions->>g.id::text) is distinct from g.version::text) then raise exception using errcode='40001',message='Los límites cambiaron. Actualice el mapa antes de exportar.';end if;
 select private.get_territory_map() into output;
 insert into public.audit_log(actor_id,entity,entity_id,operation,reason) values(auth.uid(),'territory_geometries','map','EXPORT','Exportación privada de límites geográficos');
 return output;
end $$;
create function public.export_territory_geometries(p_versions jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.export_territory_geometries(p_versions)$$;
revoke all on function private.export_territory_geometries(jsonb),public.export_territory_geometries(jsonb) from public,anon,authenticated;
grant execute on function private.export_territory_geometries(jsonb),public.export_territory_geometries(jsonb) to authenticated;

-- A protected administrator profile represents the current catalog, including
-- new modules. This changes its displayed/duplicated actions, not role grants.
create or replace function private.get_access_profiles() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['administrador']);
 return (select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('permissions',
  case when a.system_key='administrador' then (select jsonb_agg(key order by key) from public.permission_catalog) else to_jsonb(a.permissions) end,
  'users_count',case when a.system_key is not null then (select count(*) from public.profiles p where p.role=a.system_key and p.access_mode='base' and p.deleted_at is null)
  else (select count(*) from public.user_access_profiles u join public.profiles p on p.id=u.user_id where u.access_profile_id=a.id and u.active and p.access_mode='custom' and p.deleted_at is null) end
 ) order by a.code),'[]'::jsonb) from public.access_profiles a);
end $$;

do $$ declare d text;begin
 select pg_get_functiondef('private.backup_data()'::regprocedure) into d;
 if position('''territory_geometries''' in d)=0 then
  d=replace(d,'''schema_version'',1','''schema_version'',1,''territory_geometries'',coalesce((select jsonb_agg(g) from public.territory_geometries g),''[]''::jsonb)');
  if position('''territory_geometries''' in d)=0 then raise exception 'No se pudo ampliar el respaldo geográfico.';end if;
  execute d;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='territory_geometries') then alter publication supabase_realtime add table public.territory_geometries;end if;
end $$;
notify pgrst,'reload schema';
commit;
