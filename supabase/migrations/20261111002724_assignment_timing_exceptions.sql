begin;

-- Existing profiles keep their permissions. Administrators already have all
-- registered capabilities; custom profiles must select this exception explicitly.
insert into public.permission_catalog(key,module,action) values
 ('territories.override_timing','Territorios','Permitir excepciones de 14 días y 3 meses con motivo');

alter table public.territory_observations
 add column assignment_id uuid references public.assignments(id),
 add column kind text not null default 'general' check(kind in ('general','timing_exception')),
 add constraint timing_observation_assignment check(kind<>'timing_exception' or assignment_id is not null);
create index territory_observations_assignment_idx on public.territory_observations(assignment_id);

create function private.assignment_timing_issues(p_territory_id uuid,p_start date,p_completed date,p_exclude uuid default null,p_check_start boolean default true)
returns text[] language plpgsql stable security invoker set search_path='' as $$
declare prev public.assignments; nxt public.assignments; deadline date; issues text[]='{}'; today date=(now() at time zone 'America/Lima')::date;
begin
 if p_start is null then return issues;end if;
 deadline=(p_start+interval '3 months')::date;
 select * into prev from public.assignments where territory_id=p_territory_id and voided_at is null
  and id is distinct from p_exclude and assigned_at<=p_start order by assigned_at desc,id desc limit 1;
 select * into nxt from public.assignments where territory_id=p_territory_id and voided_at is null
  and id is distinct from p_exclude and assigned_at>p_start order by assigned_at,id limit 1;
 -- Overlaps and invalid chronological dates remain non-overridable and are
 -- checked by the existing assignment guard. These checks cover valid gaps.
 if p_check_start and prev.completed_at is not null and p_start>prev.completed_at and p_start<prev.completed_at+14 then
  issues=array_append(issues,format('Inicio anticipado: fecha elegida %s; finalización anterior %s. Primer inicio permitido: %s (14 días de descanso).',to_char(p_start,'DD/MM/YYYY'),to_char(prev.completed_at,'DD/MM/YYYY'),to_char(prev.completed_at+14,'DD/MM/YYYY')));
 end if;
 if p_completed>deadline then
  issues=array_append(issues,format('Cierre fuera de plazo: inicio %s, finalización %s. Fecha límite: %s (3 meses calendario).',to_char(p_start,'DD/MM/YYYY'),to_char(p_completed,'DD/MM/YYYY'),to_char(deadline,'DD/MM/YYYY')));
 elsif p_completed is null and today>deadline then
  issues=array_append(issues,format('La asignación se inicia ya vencida: inicio %s, fecha actual %s. Fecha límite: %s (3 meses calendario).',to_char(p_start,'DD/MM/YYYY'),to_char(today,'DD/MM/YYYY'),to_char(deadline,'DD/MM/YYYY')));
 end if;
 if p_completed is not null and nxt.id is not null and p_completed<nxt.assigned_at and nxt.assigned_at<p_completed+14 then
  issues=array_append(issues,format('La corrección acorta el descanso de la siguiente asignación: cierre %s, siguiente inicio %s. Primer inicio permitido: %s (14 días de descanso).',to_char(p_completed,'DD/MM/YYYY'),to_char(nxt.assigned_at,'DD/MM/YYYY'),to_char(p_completed+14,'DD/MM/YYYY')));
 end if;
 return issues;
end $$;

create function private.require_timing_exception(p_issues text[],p_reason text) returns void
language plpgsql stable security invoker set search_path='' as $$
begin
 if cardinality(p_issues)=0 then return;end if;
 if not private.has_permission('territories.override_timing') then
  raise exception using errcode='42501',message='No tiene permiso para exceptuar los plazos de 14 días y 3 meses. Revise las fechas o solicite la intervención de una persona autorizada.';
 end if;
 if length(btrim(regexp_replace(translate(coalesce(p_reason,''),chr(160),' '),'[[:space:]]+',' ','g')))<8 or length(btrim(coalesce(p_reason,'')))>2000 then
  raise exception 'Indique el motivo obligatorio de la excepción (entre 8 y 2000 caracteres).';
 end if;
end $$;

create function private.record_timing_exception(p_territory_id uuid,p_assignment_id uuid,p_event text,p_issues text[],p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if cardinality(p_issues)=0 then return;end if;
 insert into public.territory_observations(territory_id,assignment_id,kind,body,created_by)
 values(p_territory_id,p_assignment_id,'timing_exception','Excepción de plazos · '||p_event||E'\n'||array_to_string(p_issues,E'\n')||E'\nMotivo: '||btrim(p_reason),auth.uid());
end $$;
revoke all on function private.assignment_timing_issues(uuid,date,date,uuid,boolean),private.require_timing_exception(text[],text),private.record_timing_exception(uuid,uuid,text,text[],text) from public,anon,authenticated;

create function private.assign_territory_with_reason(p_territory_id uuid,p_expected_version integer,p_name text,p_assigned_at date,p_person_id uuid,p_exception_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.territories; a_id uuid; last_start date; c public.conductors; p public.people; nm text; issues text[];
begin
 perform private.require_permission('territories.assign');
 if p_person_id is null then raise exception 'Seleccione un conductor activo del maestro.';end if;
 select * into t from public.territories where id=p_territory_id for update;
 if not found or not t.active then raise exception 'Territorio no disponible.';end if;
 if t.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Revise el registro.';end if;
 select max(assigned_at) into last_start from public.assignments where territory_id=t.id and voided_at is null;
 if last_start is not null and p_assigned_at<=last_start then raise exception 'Use corrección administrativa para un alta retroactiva.';end if;
 issues=private.assignment_timing_issues(t.id,p_assigned_at,null,null);
 perform private.require_timing_exception(issues,p_exception_reason);
 select * into c from public.conductors where person_id=p_person_id for share;
 if not found then raise exception 'Seleccione un conductor activo del maestro.';end if;
 if not c.active or c.deleted_at is not null then raise exception 'El conductor está inactivo o eliminado.';end if;
 select * into p from public.people where id=c.person_id for share;
 if not found or not p.active then raise exception 'El conductor ya no está disponible.';end if;
 nm=btrim(p_name);
 if nm is not null and nm<>p.display_name then raise exception using errcode='40001',message='El nombre del conductor cambió. Revise la selección.';end if;
 perform set_config('app.audit_reason',case when cardinality(issues)>0 then 'Excepción de plazos al iniciar: '||btrim(p_exception_reason) else 'Asignación de territorio' end,true);
 insert into public.assignments(territory_id,person_id,assigned_name_snapshot,assigned_at,created_by,updated_by)
 values(t.id,c.person_id,p.display_name,p_assigned_at,auth.uid(),auth.uid()) returning id into a_id;
 perform private.record_timing_exception(t.id,a_id,'Inicio de asignación',issues,p_exception_reason);
 return a_id;
end $$;

create function private.complete_assignment_with_reason(p_id uuid,p_expected_version integer,p_territory_version integer,p_completed_at date,p_exception_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments; t public.territories; tid uuid; issues text[];
begin
 perform private.require_permission('territories.complete');
 select territory_id into tid from public.assignments where id=p_id;
 select * into t from public.territories where id=tid for update;
 select * into a from public.assignments where id=p_id for update;
 if a.id is null or a.voided_at is not null then raise exception 'Registro no disponible.';end if;
 if a.version is distinct from p_expected_version or t.version is distinct from p_territory_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla.';end if;
 if a.completed_at is not null then raise exception 'El registro ya está completado; un administrador puede corregirlo con motivo.';end if;
 if p_completed_at is null then raise exception 'Indique la fecha de finalización.';end if;
 -- An early start already authorized and recorded is not re-authorized at close.
 -- Completion enforces its own duration; the original start observation remains.
 issues='{}';
 if p_completed_at>(a.assigned_at+interval '3 months')::date then
  issues=array[format('Cierre fuera de plazo: inicio %s, finalización %s. Fecha límite: %s (3 meses calendario).',to_char(a.assigned_at,'DD/MM/YYYY'),to_char(p_completed_at,'DD/MM/YYYY'),to_char((a.assigned_at+interval '3 months')::date,'DD/MM/YYYY'))];
 end if;
 perform private.require_timing_exception(issues,p_exception_reason);
 perform set_config('app.audit_reason',case when cardinality(issues)>0 then 'Excepción de plazos al cerrar: '||btrim(p_exception_reason) else 'Finalización de asignación' end,true);
 update public.assignments set completed_at=p_completed_at where id=p_id;
 perform private.record_timing_exception(t.id,a.id,'Finalización de asignación',issues,p_exception_reason);
end $$;

-- Preserve cached-client signatures without granting silent exceptions.
create or replace function private.assign_territory(p_territory_id uuid,p_expected_version integer,p_name text,p_assigned_at date,p_person_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin return private.assign_territory_with_reason(p_territory_id,p_expected_version,p_name,p_assigned_at,p_person_id,null);end $$;
create or replace function private.complete_assignment(p_id uuid,p_expected_version integer,p_territory_version integer,p_completed_at date)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.complete_assignment_with_reason(p_id,p_expected_version,p_territory_version,p_completed_at,null);end $$;

create function public.assign_territory_with_reason(p_territory_id uuid,p_expected_version integer,p_name text,p_assigned_at date,p_person_id uuid,p_exception_reason text default null)
returns uuid language sql security invoker set search_path='' as $$select private.assign_territory_with_reason(p_territory_id,p_expected_version,p_name,p_assigned_at,p_person_id,p_exception_reason)$$;
create function public.complete_assignment_with_reason(p_id uuid,p_expected_version integer,p_territory_version integer,p_completed_at date,p_exception_reason text default null)
returns void language sql security invoker set search_path='' as $$select private.complete_assignment_with_reason(p_id,p_expected_version,p_territory_version,p_completed_at,p_exception_reason)$$;
revoke all on function private.assign_territory_with_reason(uuid,integer,text,date,uuid,text),private.complete_assignment_with_reason(uuid,integer,integer,date,text),public.assign_territory_with_reason(uuid,integer,text,date,uuid,text),public.complete_assignment_with_reason(uuid,integer,integer,date,text) from public,anon,authenticated;
grant execute on function private.assign_territory_with_reason(uuid,integer,text,date,uuid,text),private.complete_assignment_with_reason(uuid,integer,integer,date,text),public.assign_territory_with_reason(uuid,integer,text,date,uuid,text),public.complete_assignment_with_reason(uuid,integer,integer,date,text) to authenticated;

create or replace function private.correct_assignment(p_id uuid,p_expected_version integer,p_territory_version integer,p_name text,p_assigned_at date,p_completed_at date,p_reason text,p_void boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments; t public.territories; tid uuid; issues text[]='{}';
begin
 p_void=coalesce(p_void,false);
 perform private.require_permission(case when p_void then 'territories.void' else 'territories.correct' end);
 if length(btrim(coalesce(p_reason,'')))<8 then raise exception 'Describa el motivo de la corrección (mínimo 8 caracteres).';end if;
 select territory_id into tid from public.assignments where id=p_id;
 select * into t from public.territories where id=tid for update;
 select * into a from public.assignments where id=p_id for update;
 if a.id is null or a.voided_at is not null then raise exception 'Registro no disponible.';end if;
 if a.version is distinct from p_expected_version or t.version is distinct from p_territory_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Actualice la pantalla.';end if;
 -- Existing historical dates and name-only corrections retain their provenance.
 if not p_void and (p_assigned_at is distinct from a.assigned_at or p_completed_at is distinct from a.completed_at) then
  issues=private.assignment_timing_issues(tid,p_assigned_at,p_completed_at,p_id,p_assigned_at is distinct from a.assigned_at);
  perform private.require_timing_exception(issues,p_reason);
 end if;
 perform set_config('app.audit_reason',btrim(p_reason),true);
 update public.assignments set assigned_name_snapshot=btrim(p_name),assigned_at=p_assigned_at,completed_at=p_completed_at,
  person_id=case when btrim(p_name) is distinct from a.assigned_name_snapshot then null else a.person_id end,
  voided_at=case when p_void then now() end,void_reason=case when p_void then btrim(p_reason) end where id=p_id;
 perform private.record_timing_exception(tid,p_id,'Corrección administrativa',issues,p_reason);
end $$;

notify pgrst,'reload schema';
commit;
