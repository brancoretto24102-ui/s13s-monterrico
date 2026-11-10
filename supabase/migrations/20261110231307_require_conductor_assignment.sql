begin;

-- Historical imports and corrections keep their original name snapshots.
-- Every new assignment must identify an active entry in the conductor master.
create or replace function private.assign_territory(p_territory_id uuid,p_expected_version integer,p_name text,p_assigned_at date,p_person_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.territories; a_id uuid; last_start date; c public.conductors; p public.people; nm text;
begin
 perform private.require_permission('territories.assign');
 if p_person_id is null then raise exception 'Seleccione un conductor activo del maestro.';end if;
 select * into t from public.territories where id=p_territory_id for update;
 if not found or not t.active then raise exception 'Territorio no disponible.';end if;
 if t.version is distinct from p_expected_version then raise exception using errcode='40001',message='Otro usuario actualizó este territorio. Revise el registro.';end if;
 select max(assigned_at) into last_start from public.assignments where territory_id=t.id and voided_at is null;
 if last_start is not null and p_assigned_at<=last_start then raise exception 'Use corrección administrativa para un alta retroactiva.';end if;
 -- Catalog writes lock conductor, then person. SHARE prevents a rename or
 -- deactivation between validation and insertion, without blocking other readers.
 select * into c from public.conductors where person_id=p_person_id for share;
 if not found then raise exception 'Seleccione un conductor activo del maestro.';end if;
 if not c.active or c.deleted_at is not null then raise exception 'El conductor está inactivo o eliminado.';end if;
 select * into p from public.people where id=c.person_id for share;
 if not found or not p.active then raise exception 'El conductor ya no está disponible.';end if;
 nm=btrim(p_name);
 if nm is not null and nm<>p.display_name then raise exception using errcode='40001',message='El nombre del conductor cambió. Revise la selección.';end if;
 perform set_config('app.audit_reason','Asignación de territorio',true);
 insert into public.assignments(territory_id,person_id,assigned_name_snapshot,assigned_at,created_by,updated_by)
 values(t.id,c.person_id,p.display_name,p_assigned_at,auth.uid(),auth.uid()) returning id into a_id;
 return a_id;
end $$;

notify pgrst,'reload schema';
commit;
