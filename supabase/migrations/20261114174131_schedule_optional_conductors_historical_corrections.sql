begin;

-- A planned outing may deliberately have no conductor. Canonical names are
-- still derived from the catalog, and all date/concurrency guards are retained.
create or replace function private.normalize_preaching_rows(p_monday date,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; t jsonb; cid uuid; tid uuid; c record; n integer; day_number integer; outing_date date; entry_id uuid;
 result jsonb='[]'; row_territories jsonb; conductor_ids jsonb; conductor_names jsonb; territory_numbers jsonb;
 policy jsonb; reason text; seen_rows text[]='{}'; booked text[]='{}'; booked_territories text[]='{}'; k text;
begin
 if p_monday is null or extract(isodow from p_monday)<>1 or p_monday not between date '1900-01-01' and date '9998-12-24' then raise exception 'Elige el lunes de la semana.';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 or octet_length(p_rows::text)>200000 then raise exception 'Cronograma no válido; la semana admite hasta 100 salidas.';end if;
 -- Same lock order as assignment creation: territories first, conductors next.
 for tid in select distinct (x->>'territory_id')::uuid from jsonb_array_elements(p_rows) rr cross join lateral jsonb_array_elements(rr->'territories') x order by 1 loop
  perform 1 from public.territories where id=tid for update;
 end loop;
 for r in select value from jsonb_array_elements(p_rows) loop
  entry_id=(r->>'id')::uuid;day_number=(r->>'day')::integer;
  if entry_id is null or entry_id::text=any(seen_rows) then raise exception 'Salida duplicada o sin identificador.';end if;seen_rows=array_append(seen_rows,entry_id::text);
  if day_number is null or day_number not between 0 and 6 then raise exception 'Día de salida no válido.';end if;outing_date=p_monday+day_number;
  if coalesce(r->>'time','')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Indica una hora válida.';end if;
  if length(btrim(regexp_replace(translate(coalesce(r->>'meeting_point',''),chr(160),' '),'[[:space:]]+',' ','g')))=0 or length(r->>'meeting_point')>300 then raise exception 'Indica el punto de reunión (máximo 300 caracteres).';end if;
  if jsonb_typeof(r->'conductor_ids') is distinct from 'array' or jsonb_array_length(r->'conductor_ids') not between 0 and 8 then raise exception 'Selecciona hasta 8 conductores activos del maestro, o deja la salida sin conductor.';end if;
  if jsonb_typeof(r->'territories') is distinct from 'array' or jsonb_array_length(r->'territories')>64 then raise exception 'Lista de territorios no válida.';end if;
  conductor_ids='[]';conductor_names='[]';territory_numbers='[]';row_territories='[]';
  for cid in select value::uuid from jsonb_array_elements_text(r->'conductor_ids') loop
   select cc.id,cc.active,cc.deleted_at,p.active as person_active,p.display_name into c from public.conductors cc join public.people p on p.id=cc.person_id where cc.id=cid for share of cc,p;
   if not found or not c.active or c.deleted_at is not null or not c.person_active then raise exception 'El conductor ya no está activo en el maestro.';end if;
   k=day_number::text||'|'||(r->>'time')||'|'||cid::text;
   if k=any(booked) then raise exception 'Un conductor tiene dos salidas a la misma hora.';end if;booked=array_append(booked,k);
   conductor_ids=conductor_ids||jsonb_build_array(cid);conductor_names=conductor_names||jsonb_build_array(c.display_name);
  end loop;
  for t in select value from jsonb_array_elements(r->'territories') loop
   tid=(t->>'territory_id')::uuid;
   select territory_number into n from public.territories where id=tid and active;
   if not found then raise exception 'Territorio no disponible.';end if;
   k=day_number::text||'|'||(r->>'time')||'|'||tid::text;
   if k=any(booked_territories) then raise exception 'El territorio % se repite a la misma hora.',n;end if;booked_territories=array_append(booked_territories,k);
   policy=private.preaching_territory_status(tid,outing_date);reason=btrim(coalesce(t->>'reason',''));
   if policy->>'kind'='blocked' then raise exception 'Territorio %: %',n,policy->>'message';end if;
   if policy->>'kind'='rest' and not private.preaching_reason_ok(reason) then raise exception 'Territorio %: indica el motivo para programarlo antes de los 14 días (8 a 2000 caracteres).',n;end if;
   if length(reason)>2000 then raise exception 'El motivo admite hasta 2000 caracteres.';end if;
   row_territories=row_territories||jsonb_build_array(jsonb_build_object('territory_id',tid,'reason',reason,'policy',policy));territory_numbers=territory_numbers||jsonb_build_array(n);
  end loop;
  result=result||jsonb_build_array(jsonb_build_object('id',entry_id,'day',day_number,'time',r->>'time','meeting_point',btrim(r->>'meeting_point'),
   'conductor_ids',conductor_ids,'conductor_names',conductor_names,'territories',row_territories,'territory_numbers',territory_numbers));
 end loop;
 return coalesce((select jsonb_agg(v order by (v->>'day')::int,v->>'time',v->>'meeting_point',v->>'id') from jsonb_array_elements(result) v),'[]');
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Identificador o día de salida no válido.';
end $$;


-- Historical correction alone can list inactive conductors. New assignments
-- and weekly scheduling continue to receive and require active conductors.
create function private.get_correction_conductors() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_permission('territories.correct');
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',c.id,'code',c.code,'person_id',c.person_id,'display_name',p.display_name,
  'active',c.active and p.active,'deleted_at',c.deleted_at,'version',c.version
 ) order by p.display_name,c.code)
 from public.conductors c join public.people p on p.id=c.person_id
 where c.deleted_at is null),'[]'::jsonb);
end $$;

create function private.correct_assignment_with_conductor(
 p_id uuid,p_expected_version integer,p_territory_version integer,p_name text,
 p_person_id uuid,p_assigned_at date,p_completed_at date,p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments; t public.territories; tid uuid; c public.conductors;
 p public.people; nm text; pid uuid; issues text[]='{}';
begin
 perform private.require_permission('territories.correct');
 if length(btrim(coalesce(p_reason,'')))<8 or length(btrim(p_reason))>2000 then
  raise exception 'Describa el motivo de la corrección (entre 8 y 2000 caracteres).';
 end if;
 -- Preserve the established territory, assignment, conductor, person lock order.
 select territory_id into tid from public.assignments where id=p_id;
 select * into t from public.territories where id=tid for update;
 select * into a from public.assignments where id=p_id for update;
 if a.id is null or a.voided_at is not null then raise exception 'Registro no disponible.';end if;
 if a.version is distinct from p_expected_version or t.version is distinct from p_territory_version then
  raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla.';
 end if;
 if p_person_id is null then
  -- Date-only corrections can retain an unlinked historical snapshot, but
  -- never create a different free-text responsible person.
  if btrim(p_name) is distinct from a.assigned_name_snapshot then
   raise exception 'Seleccione un conductor del maestro, activo o inactivo.';
  end if;
  nm=a.assigned_name_snapshot;pid=a.person_id;
 else
  select * into c from public.conductors where person_id=p_person_id for share;
  if not found or c.deleted_at is not null then
   raise exception 'Seleccione un conductor del maestro, activo o inactivo. Los eliminados deben restaurarse primero.';
  end if;
  select * into p from public.people where id=c.person_id for share;
  if not found then raise exception 'Conductor no disponible.';end if;
  -- Inactivity is intentionally permitted only for this correction operation.
  if btrim(p_name) is distinct from p.display_name then
   raise exception using errcode='40001',message='El nombre del conductor cambió. Revise la selección.';
  end if;
  nm=p.display_name;pid=c.person_id;
 end if;
 if p_assigned_at is distinct from a.assigned_at or p_completed_at is distinct from a.completed_at then
  issues=private.assignment_timing_issues(tid,p_assigned_at,p_completed_at,p_id,p_assigned_at is distinct from a.assigned_at);
  perform private.require_timing_exception(issues,p_reason);
 end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 update public.assignments set assigned_name_snapshot=nm,person_id=pid,
  assigned_at=p_assigned_at,completed_at=p_completed_at where id=p_id;
 perform private.record_timing_exception(tid,p_id,'Corrección administrativa',issues,p_reason);
end $$;

create function public.get_correction_conductors() returns jsonb
language sql stable security invoker set search_path='' as $$select private.get_correction_conductors()$$;
create function public.correct_assignment_with_conductor(
 p_id uuid,p_expected_version integer,p_territory_version integer,p_name text,
 p_person_id uuid,p_assigned_at date,p_completed_at date,p_reason text
) returns void language sql security invoker set search_path='' as $$
 select private.correct_assignment_with_conductor(p_id,p_expected_version,p_territory_version,p_name,p_person_id,p_assigned_at,p_completed_at,p_reason)
$$;
revoke all on function private.get_correction_conductors(),public.get_correction_conductors(),
 private.correct_assignment_with_conductor(uuid,integer,integer,text,uuid,date,date,text),
 public.correct_assignment_with_conductor(uuid,integer,integer,text,uuid,date,date,text) from public,anon,authenticated;
grant execute on function private.get_correction_conductors(),public.get_correction_conductors(),
 private.correct_assignment_with_conductor(uuid,integer,integer,text,uuid,date,date,text),
 public.correct_assignment_with_conductor(uuid,integer,integer,text,uuid,date,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
