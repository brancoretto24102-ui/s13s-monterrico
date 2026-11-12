begin;

-- PDF export is independent from GeoJSON/KML and from the S-13-S form.
-- Administrators resolve the catalog dynamically. Existing profiles receive
-- no new grants; custom users must be assigned this action explicitly.
insert into public.permission_catalog(key,module,action)
values ('maps.export_pdf','Territorios geográficos','Exportar mapa PDF');

create function private.get_territory_map_pdf(p_download boolean default false,p_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw_map jsonb;payload jsonb;fingerprint text;cutoff text;
begin
 perform private.require_permission('maps.view');
 perform private.require_permission('maps.export_pdf');
 if p_download is null then raise exception 'Indique la operación PDF.';end if;
 if p_download and (p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{32}$') then
  raise exception 'Primero prepare la vista previa del mapa PDF.';
 end if;
 perform pg_advisory_xact_lock(130215);
 cutoff=to_char((now() at time zone 'America/Lima')::date,'YYYY-MM-DD');
 raw_map=private.get_territory_map();
 -- Return only fields needed for the atlas. Never include provenance notes,
 -- user identities, conductors, observations or restricted home references.
 payload=jsonb_build_object(
  'as_of',cutoff,
  'territories',coalesce((select jsonb_agg(jsonb_build_object(
    'id',t->'id','territory_number',t->'territory_number','active',t->'active',
    'last_completed',t->'last_completed','assigned_at',t->'assigned_at') order by t->>'id')
    from jsonb_array_elements(raw_map->'territories') t),'[]'::jsonb),
  'shapes',coalesce((select jsonb_agg(jsonb_build_object(
    'id',g->'id','territory_id',g->'territory_id','geometry',g->'geometry',
    'part_labels',g->'part_labels','review_status',g->'review_status','version',g->'version') order by g->>'id')
    from jsonb_array_elements(raw_map->'shapes') g where g->>'deleted_at' is null),'[]'::jsonb)
 );
 -- This is an optimistic content fingerprint, not an authentication secret.
 -- Dates, status, labels and geometry versions all invalidate a stale preview.
 fingerprint=md5(payload::text);
 if p_download then
  if p_fingerprint<>fingerprint then
   raise exception using errcode='40001',message='El mapa o sus fechas cambiaron. Prepare otra vista previa antes de descargar.';
  end if;
  insert into public.audit_log(actor_id,entity,entity_id,operation,reason,new_data)
  values(auth.uid(),'territory_map_pdf','map','EXPORT','Descarga privada del atlas PDF de territorios',
    jsonb_build_object('fingerprint',fingerprint,'as_of',cutoff,'context_polygons',jsonb_array_length(payload->'shapes')));
  -- No second transfer of all coordinates when revalidating a download.
  return jsonb_build_object('fingerprint',fingerprint,'as_of',cutoff);
 end if;
 -- Preparing/reviewing a preview does not register a completed export.
 return jsonb_build_object('fingerprint',fingerprint,'as_of',cutoff,'context',payload);
end $$;

create function public.get_territory_map_pdf(p_download boolean default false,p_fingerprint text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.get_territory_map_pdf(p_download,p_fingerprint)
$$;
revoke all on function private.get_territory_map_pdf(boolean,text),public.get_territory_map_pdf(boolean,text) from public,anon,authenticated;
grant execute on function private.get_territory_map_pdf(boolean,text),public.get_territory_map_pdf(boolean,text) to authenticated;

commit;
