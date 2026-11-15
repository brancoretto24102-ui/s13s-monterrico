begin;
-- Group several times under one outing while keeping the legacy primary time.
-- No stored weeks or permissions are rewritten. Every time participates in
-- conductor and territory conflict checks; all other validations are retained.
create or replace function private.normalize_preaching_rows(p_monday date,p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb; t jsonb; cid uuid; tid uuid; c record; n integer; day_number integer; outing_date date; entry_id uuid;
 result jsonb='[]'; row_territories jsonb; conductor_ids jsonb; conductor_names jsonb; territory_numbers jsonb;
 slot_time text; all_times text[]; extra_time jsonb;
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
  all_times=array[r->>'time'];
  if r ? 'additional_times' then
   if jsonb_typeof(r->'additional_times') is distinct from 'array' or jsonb_array_length(r->'additional_times')>7 then
    raise exception 'Cada salida admite hasta 8 horarios válidos.';
   end if;
   for extra_time in select value from jsonb_array_elements(r->'additional_times') loop
    if jsonb_typeof(extra_time) is distinct from 'string' or coalesce(extra_time#>>'{}','')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then
     raise exception 'Indica una hora válida para cada horario adicional.';
    end if;
    slot_time=extra_time#>>'{}';
    if slot_time=any(all_times) then raise exception 'No repitas un horario en la misma salida.';end if;
    all_times=array_append(all_times,slot_time);
   end loop;
  end if;
  select array_agg(v order by v) into all_times from unnest(all_times) x(v);
  if length(btrim(regexp_replace(translate(coalesce(r->>'meeting_point',''),chr(160),' '),'[[:space:]]+',' ','g')))=0 or length(r->>'meeting_point')>300 then raise exception 'Indica el punto de reunión (máximo 300 caracteres).';end if;
  if jsonb_typeof(r->'conductor_ids') is distinct from 'array' or jsonb_array_length(r->'conductor_ids') not between 0 and 8 then raise exception 'Selecciona hasta 8 conductores activos del maestro, o deja la salida sin conductor.';end if;
  if jsonb_typeof(r->'territories') is distinct from 'array' or jsonb_array_length(r->'territories')>64 then raise exception 'Lista de territorios no válida.';end if;
  conductor_ids='[]';conductor_names='[]';territory_numbers='[]';row_territories='[]';
  for cid in select value::uuid from jsonb_array_elements_text(r->'conductor_ids') loop
   select cc.id,cc.active,cc.deleted_at,p.active as person_active,p.display_name into c from public.conductors cc join public.people p on p.id=cc.person_id where cc.id=cid for share of cc,p;
   if not found or not c.active or c.deleted_at is not null or not c.person_active then raise exception 'El conductor ya no está activo en el maestro.';end if;
   foreach slot_time in array all_times loop
   k=day_number::text||'|'||slot_time||'|'||cid::text;
   if k=any(booked) then raise exception 'Un conductor tiene dos salidas a la misma hora.';end if;booked=array_append(booked,k);
   end loop;
   conductor_ids=conductor_ids||jsonb_build_array(cid);conductor_names=conductor_names||jsonb_build_array(c.display_name);
  end loop;
  for t in select value from jsonb_array_elements(r->'territories') loop
   tid=(t->>'territory_id')::uuid;
   select territory_number into n from public.territories where id=tid and active;
   if not found then raise exception 'Territorio no disponible.';end if;
   foreach slot_time in array all_times loop
   k=day_number::text||'|'||slot_time||'|'||tid::text;
   if k=any(booked_territories) then raise exception 'El territorio % se repite a la misma hora.',n;end if;booked_territories=array_append(booked_territories,k);
   end loop;
   policy=private.preaching_territory_status(tid,outing_date);reason=btrim(coalesce(t->>'reason',''));
   if policy->>'kind'='blocked' then raise exception 'Territorio %: %',n,policy->>'message';end if;
   if policy->>'kind'='rest' and not private.preaching_reason_ok(reason) then raise exception 'Territorio %: indica el motivo para programarlo antes de los 14 días (8 a 2000 caracteres).',n;end if;
   if length(reason)>2000 then raise exception 'El motivo admite hasta 2000 caracteres.';end if;
   row_territories=row_territories||jsonb_build_array(jsonb_build_object('territory_id',tid,'reason',reason,'policy',policy));territory_numbers=territory_numbers||jsonb_build_array(n);
  end loop;
  result=result||jsonb_build_array(jsonb_build_object('id',entry_id,'day',day_number,'time',all_times[1],'additional_times',to_jsonb(all_times[2:]),'meeting_point',btrim(r->>'meeting_point'),
   'conductor_ids',conductor_ids,'conductor_names',conductor_names,'territories',row_territories,'territory_numbers',territory_numbers));
 end loop;
 return coalesce((select jsonb_agg(v order by (v->>'day')::int,v->>'time',v->>'meeting_point',v->>'id') from jsonb_array_elements(result) v),'[]');
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Identificador o día de salida no válido.';
end $$;



notify pgrst,'reload schema';
commit;
