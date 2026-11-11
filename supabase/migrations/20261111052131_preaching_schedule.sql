begin;

insert into public.permission_catalog(key,module,action) values
 ('schedules.view','Cronograma semanal','Visualizar'),
 ('schedules.create','Cronograma semanal','Crear semanas'),
 ('schedules.edit','Cronograma semanal','Editar salidas y días'),
 ('schedules.export','Cronograma semanal','Descargar conductores y publicadores');

-- One versioned document per week: a single transaction protects every row.
-- Removed outings remain in the immutable before/after audit snapshots.
create table public.preaching_schedules (
 id uuid primary key default gen_random_uuid(),
 week_start date not null unique check(extract(isodow from week_start)=1 and week_start between date '1900-01-01' and date '9998-12-24'),
 rows jsonb not null default '[]' check(jsonb_typeof(rows)='array'),
 version integer not null default 1,
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index preaching_created_by_idx on public.preaching_schedules(created_by);
create index preaching_updated_by_idx on public.preaching_schedules(updated_by);
-- Private initial weekly structure. Subsequent weeks use the last saved week.
create table public.preaching_template (
 singleton boolean primary key default true check(singleton),
 slots jsonb not null default '[]' check(jsonb_typeof(slots)='array'),
 updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
create index preaching_template_actor_idx on public.preaching_template(updated_by);
alter table public.preaching_schedules enable row level security;
alter table public.preaching_template enable row level security;
create policy preaching_read on public.preaching_schedules for select to authenticated using ((select private.has_permission('schedules.view')));
create policy preaching_template_read on public.preaching_template for select to authenticated using ((select private.has_permission('schedules.view')));
revoke all on public.preaching_schedules,public.preaching_template from anon,authenticated;
grant select on public.preaching_schedules,public.preaching_template to authenticated;
create trigger audit_preaching_schedules after insert or update or delete on public.preaching_schedules for each row execute function private.audit_change();
create trigger audit_preaching_template after insert or update or delete on public.preaching_template for each row execute function private.audit_change();

alter table public.territory_observations
 drop constraint territory_observations_kind_check,
 add column schedule_id uuid references public.preaching_schedules(id),
 add column schedule_entry_id uuid,
 add constraint territory_observations_kind_check check(kind in ('general','timing_exception','schedule_exception')),
 add constraint schedule_observation_reference check(kind<>'schedule_exception' or (schedule_id is not null and schedule_entry_id is not null));
create index observations_schedule_idx on public.territory_observations(schedule_id,schedule_entry_id,territory_id);

create function private.preaching_reason_ok(p_reason text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select length(btrim(regexp_replace(translate(coalesce(p_reason,''),chr(160),' '),'[[:space:]]+',' ','g')))>=8
 and length(btrim(coalesce(p_reason,'')))<=2000
$$;

create function private.preaching_territory_status(p_id uuid,p_day date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a public.assignments; finish date; earliest date; deadline date;
begin
 select * into a from public.assignments where territory_id=p_id and voided_at is null and assigned_at<=p_day
  and (completed_at is null or completed_at>p_day) order by assigned_at desc limit 1;
 if found then
  deadline=(a.assigned_at+interval '3 months')::date;
  return jsonb_build_object('kind',case when p_day>deadline then 'blocked' else 'continuation' end,'assignment_id',a.id,'deadline',deadline,
   'message',case when p_day>deadline then format('Sigue abierto desde %s y vence el %s. Debe cerrarse antes de volver a programarlo; después se revisarán los 14 días.',to_char(a.assigned_at,'DD/MM/YYYY'),to_char(deadline,'DD/MM/YYYY'))
    else format('Continuación de la asignación abierta. Cierre hasta %s.',to_char(deadline,'DD/MM/YYYY')) end);
 end if;
 select max(completed_at) into finish from public.assignments where territory_id=p_id and voided_at is null and completed_at<=p_day;
 earliest=finish+14;
 return jsonb_strip_nulls(jsonb_build_object('kind',case when p_day<earliest then 'rest' else 'available' end,'earliest',earliest,
  'message',case when p_day<earliest then format('Descanso incompleto: último cierre %s, primer inicio habitual %s. Se puede programar con motivo obligatorio.',to_char(finish,'DD/MM/YYYY'),to_char(earliest,'DD/MM/YYYY')) else 'Disponible para programar.' end));
end $$;

create function private.normalize_preaching_rows(p_monday date,p_rows jsonb) returns jsonb
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
  if jsonb_typeof(r->'conductor_ids') is distinct from 'array' or jsonb_array_length(r->'conductor_ids') not between 1 and 8 then raise exception 'Selecciona entre 1 y 8 conductores activos del maestro.';end if;
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

create function private.save_preaching_schedule(p_id uuid,p_expected_version integer,p_week_start date,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.preaching_schedules; saved public.preaching_schedules; normalized jsonb; r jsonb;t jsonb;exception_body text;
begin
 perform private.require_permission('schedules.view');
 if p_id is null or p_expected_version is null or p_expected_version<0 then raise exception using errcode='40001',message='Actualiza el cronograma y revisa su versión.';end if;
 perform pg_advisory_xact_lock(hashtextextended('preaching-week:'||coalesce(p_week_start::text,''),0));
 select * into existing from public.preaching_schedules where week_start=p_week_start for update;
 if found then
  if existing.id<>p_id or existing.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otra persona guardó esta semana. Carga la versión actual antes de guardar.';end if;
  perform private.require_permission('schedules.edit');
 else
  if p_expected_version<>0 then raise exception using errcode='40001',message='Cronograma no disponible; actualiza la semana.';end if;
  perform private.require_permission('schedules.create');
 end if;
 normalized=private.normalize_preaching_rows(p_week_start,p_rows);
 perform set_config('app.audit_reason',case when existing.id is null then 'Creación del cronograma semanal' else 'Actualización del cronograma semanal' end,true);
 if existing.id is null then
  insert into public.preaching_schedules(id,week_start,rows,created_by,updated_by) values(p_id,p_week_start,normalized,auth.uid(),auth.uid()) returning * into saved;
 else
  update public.preaching_schedules set rows=normalized,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into saved;
 end if;
 for r in select value from jsonb_array_elements(normalized) loop
  for t in select value from jsonb_array_elements(r->'territories') loop
   if t->'policy'->>'kind'='rest' then
    exception_body='Excepción de cronograma · '||to_char(p_week_start+(r->>'day')::int,'DD/MM/YYYY')||' '||(r->>'time')||E'\n'||(t->'policy'->>'message')||E'\nMotivo: '||(t->>'reason');
    if not exists(select 1 from public.territory_observations o where o.schedule_id=p_id and o.schedule_entry_id=(r->>'id')::uuid and o.territory_id=(t->>'territory_id')::uuid and o.body=exception_body) then
     insert into public.territory_observations(territory_id,kind,schedule_id,schedule_entry_id,body,created_by)
      values((t->>'territory_id')::uuid,'schedule_exception',p_id,(r->>'id')::uuid,exception_body,auth.uid());
    end if;
   end if;
  end loop;
 end loop;
 return to_jsonb(saved);
end $$;

create function private.get_preaching_context(p_week_start date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_permission('schedules.view');
 if p_week_start is null or extract(isodow from p_week_start)<>1 or p_week_start not between date '1900-01-01' and date '9998-12-24' then raise exception 'Elige el lunes de la semana.';end if;
 return jsonb_build_object(
  'schedule',(select to_jsonb(w) from public.preaching_schedules w where week_start=p_week_start),
  'previous',(select to_jsonb(w) from public.preaching_schedules w where week_start<p_week_start order by week_start desc limit 1),
  'template',coalesce((select slots from public.preaching_template where singleton),'[]'::jsonb),
  'territories',coalesce((select jsonb_agg(t order by territory_number) from public.territories t),'[]'::jsonb),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'territory_id',a.territory_id,'person_id',case when a.completed_at is null then a.person_id end,'assigned_at',a.assigned_at,'completed_at',a.completed_at) order by territory_id,assigned_at,id) from public.assignments a where voided_at is null),'[]'::jsonb),
  'conductors',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'person_id',c.person_id,'code',c.code,'display_name',p.display_name,'active',c.active,'deleted_at',c.deleted_at,'version',c.version) order by p.display_name,c.code) from public.conductors c join public.people p on p.id=c.person_id where c.active and c.deleted_at is null and p.active),'[]'::jsonb),
  'revision',statement_timestamp());
end $$;

create function private.export_preaching_schedule(p_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.preaching_schedules;r jsonb;t jsonb;policy jsonb;tid uuid;
begin
 perform private.require_permission('schedules.view');perform private.require_permission('schedules.export');
 select * into w from public.preaching_schedules where id=p_id for share;
 if not found or w.version is distinct from p_expected_version then raise exception using errcode='40001',message='El cronograma cambió. Revisa la versión guardada antes de descargar.';end if;
 for tid in select distinct (x->>'territory_id')::uuid from jsonb_array_elements(w.rows) rr cross join lateral jsonb_array_elements(rr->'territories') x order by 1 loop
  perform 1 from public.territories where id=tid for share;
 end loop;
 for r in select value from jsonb_array_elements(w.rows) loop
  for t in select value from jsonb_array_elements(r->'territories') loop
   policy=private.preaching_territory_status((t->>'territory_id')::uuid,w.week_start+(r->>'day')::int);
   if policy->>'kind'='blocked' then raise exception 'Revisa el cronograma: %',policy->>'message';end if;
   if policy->>'kind'='rest' and (not private.preaching_reason_ok(t->>'reason') or t->'policy'->>'kind' is distinct from 'rest' or t->'policy'->>'earliest' is distinct from policy->>'earliest') then
    raise exception 'Cambió el descanso de un territorio. Revisa el motivo y guarda el cronograma antes de descargar.';
   end if;
  end loop;
 end loop;
 insert into public.audit_log(actor_id,entity,entity_id,operation,reason) values(auth.uid(),'preaching_schedules',w.id::text,'EXPORT','Descarga privada del cronograma semanal');
 return to_jsonb(w);
end $$;

create function public.get_preaching_context(p_week_start date) returns jsonb language sql security invoker set search_path='' as $$select private.get_preaching_context(p_week_start)$$;
create function public.save_preaching_schedule(p_id uuid,p_expected_version integer,p_week_start date,p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_preaching_schedule(p_id,p_expected_version,p_week_start,p_rows)$$;
create function public.export_preaching_schedule(p_id uuid,p_expected_version integer) returns jsonb language sql security invoker set search_path='' as $$select private.export_preaching_schedule(p_id,p_expected_version)$$;
revoke all on function private.preaching_reason_ok(text),private.preaching_territory_status(uuid,date),private.normalize_preaching_rows(date,jsonb) from public,anon,authenticated;
revoke all on function private.get_preaching_context(date),private.save_preaching_schedule(uuid,integer,date,jsonb),private.export_preaching_schedule(uuid,integer),public.get_preaching_context(date),public.save_preaching_schedule(uuid,integer,date,jsonb),public.export_preaching_schedule(uuid,integer) from public,anon,authenticated;
grant execute on function private.get_preaching_context(date),private.save_preaching_schedule(uuid,integer,date,jsonb),private.export_preaching_schedule(uuid,integer),public.get_preaching_context(date),public.save_preaching_schedule(uuid,integer,date,jsonb),public.export_preaching_schedule(uuid,integer) to authenticated;

do $$ declare d text;begin
 select pg_get_functiondef('private.backup_data()'::regprocedure) into d;
 if position('''preaching_schedules''' in d)=0 then
  d=replace(d,'''schema_version'',1','''schema_version'',1,''preaching_schedules'',coalesce((select jsonb_agg(w) from public.preaching_schedules w),''[]''::jsonb),''preaching_template'',coalesce((select jsonb_agg(pt) from public.preaching_template pt),''[]''::jsonb)');
  execute d;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
