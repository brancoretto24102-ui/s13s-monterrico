begin;

-- Optional text belongs to one part of the saved MultiPolygon. No map data
-- or private source labels are embedded in this public migration.
alter table public.territory_geometries add column part_labels jsonb not null default '[]'::jsonb
 check(jsonb_typeof(part_labels)='array' and jsonb_array_length(part_labels)<=64);

create function private.normalize_territory_part_labels(p_labels jsonb,p_geometry jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare count_ integer=jsonb_array_length(p_geometry->'coordinates');labels jsonb=coalesce(nullif(p_labels,'null'::jsonb),'[]'::jsonb);item jsonb;value_ text;output jsonb='[]';i integer;
begin
 if jsonb_typeof(labels) is distinct from 'array' then raise exception 'Las etiquetas de manzana deben ser una lista.';end if;
 if jsonb_array_length(labels)>count_ then raise exception 'Hay más etiquetas que partes del territorio.';end if;
 for i in 0..count_-1 loop
  item=labels->i;
  if item is null or item='null'::jsonb then output=output||'[null]'::jsonb;continue;end if;
  if jsonb_typeof(item)<>'string' then raise exception 'Cada etiqueta de manzana debe ser texto o quedar vacía.';end if;
  value_=btrim(regexp_replace(translate(item#>>'{}',chr(160),' '),'[[:space:]]+',' ','g'));
  if length(value_)>40 or value_ ~ '[[:cntrl:]]' then raise exception 'La etiqueta de manzana admite hasta 40 caracteres de texto.';end if;
  output=output||jsonb_build_array(nullif(value_,''));
 end loop;
 return output;
end $$;
revoke all on function private.normalize_territory_part_labels(jsonb,jsonb) from public,anon,authenticated;

create or replace function private.territory_geometry_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.territory_id is distinct from old.territory_id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by or new.source_hash is distinct from old.source_hash then raise exception 'La identidad y procedencia inicial del polígono son inmutables.';end if;
  new.version=old.version+1;
  if new.geometry is distinct from old.geometry or new.source is distinct from old.source or new.part_labels is distinct from old.part_labels then
   new.geometry=private.validate_territory_geometry(new.geometry);new.review_status='draft';new.reviewed_by=null;new.reviewed_at=null;
  end if;
 else new.version=1;new.created_by=auth.uid();new.geometry=private.validate_territory_geometry(new.geometry);end if;
 new.part_labels=private.normalize_territory_part_labels(new.part_labels,new.geometry);
 new.updated_at=now();new.updated_by=auth.uid();return new;
end $$;

create function private.manage_territory_geometry(p_id uuid,p_expected_version integer,p_territory_id uuid,p_geometry jsonb,p_source text,p_action text,p_reason text,p_source_hash text,p_part_labels jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.territory_geometries;normalized jsonb;labels jsonb;label text;
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
  if p_part_labels is null and p_action='update' and jsonb_array_length(normalized->'coordinates')<>jsonb_array_length(r.geometry->'coordinates')
    and exists(select 1 from jsonb_array_elements(r.part_labels) v where v<>'null'::jsonb) then
   raise exception 'Indique las etiquetas de cada parte al agregar o quitar partes. Actualice la aplicación.';
  end if;
  labels=private.normalize_territory_part_labels(case when p_part_labels is not null then p_part_labels when p_action='update' and jsonb_array_length(normalized->'coordinates')=jsonb_array_length(r.geometry->'coordinates') then r.part_labels else null end,normalized);
  if length(label) not between 3 and 1500 then raise exception 'Indique la procedencia de los límites (3 a 1500 caracteres).';end if;
  if p_source_hash is not null and p_source_hash !~ '^[0-9a-f]{64}$' then raise exception 'Huella de procedencia no válida.';end if;
  if p_action='create' and r.id is not null then
   if r.deleted_at is null and r.territory_id=p_territory_id and r.geometry=normalized and r.source=label and r.source_hash is not distinct from p_source_hash and r.part_labels=labels then return r.id;end if;
   raise exception using errcode='40001',message='El polígono ya existe o cambió.';
  end if;
 end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 if p_action='create' then
  insert into public.territory_geometries(id,territory_id,geometry,part_labels,source,source_hash,created_by,updated_by) values(p_id,p_territory_id,normalized,labels,label,p_source_hash,auth.uid(),auth.uid());
 elsif p_action='update' then
  update public.territory_geometries set geometry=normalized,part_labels=labels,source=label,review_status='draft',reviewed_by=null,reviewed_at=null where id=p_id;
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
create function public.manage_territory_geometry(p_id uuid,p_expected_version integer,p_territory_id uuid,p_geometry jsonb,p_source text,p_action text,p_reason text,p_source_hash text,p_part_labels jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.manage_territory_geometry(p_id,p_expected_version,p_territory_id,p_geometry,p_source,p_action,p_reason,p_source_hash,p_part_labels)$$;
revoke all on function private.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text,jsonb),public.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text,jsonb),public.manage_territory_geometry(uuid,integer,uuid,jsonb,text,text,text,text,jsonb) to authenticated;



-- Keep existing eight-argument clients working without erasing labels.
create or replace function private.manage_territory_geometry(p_id uuid,p_expected_version integer,p_territory_id uuid,p_geometry jsonb,p_source text,p_action text,p_reason text,p_source_hash text default null)
returns uuid language sql security invoker set search_path='' as $$select private.manage_territory_geometry(p_id,p_expected_version,p_territory_id,p_geometry,p_source,p_action,p_reason,p_source_hash,null)$$;

create or replace function private.import_territory_geometries(p_features jsonb,p_source text,p_source_hash text,p_reason text) returns integer
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
  perform private.manage_territory_geometry((f->>'id')::uuid,expected,tid,f->'geometry',p_source,case when expected=0 then 'create' else 'update' end,p_reason,p_source_hash,f->'part_labels');
  count_=count_+1;
 end loop;
 return count_;
end $$;

notify pgrst,'reload schema';
commit;
