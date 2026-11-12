begin;
-- Older clients and files must not move or reorder labeled parts silently.
create or replace function private.manage_territory_geometry(p_id uuid,p_expected_version integer,p_territory_id uuid,p_geometry jsonb,p_source text,p_action text,p_reason text,p_source_hash text,p_part_labels jsonb)
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
  if p_part_labels is null and p_action='update' and normalized is distinct from r.geometry
    and exists(select 1 from jsonb_array_elements(r.part_labels) v where v<>'null'::jsonb) then
   raise exception 'Indique las etiquetas de cada parte al cambiar los límites. Actualice la aplicación.';
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

notify pgrst,'reload schema';
commit;
