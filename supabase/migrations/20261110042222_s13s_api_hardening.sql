begin;
-- Public RPCs keep their signatures. Privileged implementations live in the
-- unexposed private schema and independently verify the caller's active role.
do $$
declare f record; call_args text; volatility text;
begin
 for f in
  select p.oid,p.proname,p.proargnames,p.provolatile,
   pg_get_function_identity_arguments(p.oid) as identity_arguments,
   pg_get_function_arguments(p.oid) as full_arguments,
   pg_get_function_result(p.oid) as result_type
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
  ('assign_territory','complete_assignment','correct_assignment','manage_profile',
   'manage_territory','add_observation','import_history','get_snapshot','get_export_snapshot','backup_data')
 loop
  select coalesce(string_agg(quote_ident(arg_name),', ' order by position),'') into call_args
   from unnest(f.proargnames) with ordinality as args(arg_name,position);
  volatility=case f.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end;
  execute format('alter function public.%I(%s) set schema private',f.proname,f.identity_arguments);
  execute format('revoke all on function private.%I(%s) from public,anon',f.proname,f.identity_arguments);
  execute format('grant execute on function private.%I(%s) to authenticated',f.proname,f.identity_arguments);
  execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path='''' as %L',
   f.proname,f.full_arguments,f.result_type,volatility,format('select private.%I(%s)',f.proname,call_args));
  execute format('revoke all on function public.%I(%s) from public,anon',f.proname,f.identity_arguments);
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_arguments);
 end loop;
 -- The platform's event-trigger function has no reason to be a client RPC.
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
 end if;
end $$;
alter policy profile_self_or_admin on public.profiles
 using(id=(select auth.uid()) or (select private.app_role())='administrador');
create index assignments_created_by_idx on public.assignments(created_by);
create index assignments_updated_by_idx on public.assignments(updated_by);
create index assignments_person_id_idx on public.assignments(person_id);
create index assignments_import_batch_idx on public.assignments(source_import_batch_id);
create index import_batches_created_by_idx on public.import_batches(created_by);
create index conductors_person_id_idx on public.conductors(person_id);
create index meeting_schedule_conductor_idx on public.meeting_schedule(conductor_id);
create index observations_created_by_idx on public.territory_observations(created_by);
create index observations_territory_date_idx on public.territory_observations(territory_id,created_at desc);
notify pgrst, 'reload schema';
commit;
