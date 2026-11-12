begin;

-- Map viewers receive counts only. Address references still require visits.view
-- through the existing snapshot API and RLS. Keep the current maps.view gate,
-- private SECURITY DEFINER implementation and public SECURITY INVOKER wrapper.
create or replace function private.get_territory_map() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 'visit_restriction_summary',coalesce((select jsonb_agg(jsonb_build_object(
   'territory_id',v.territory_id,'blocking_count',v.blocking_count,'eligible_count',v.eligible_count) order by v.territory_id)
   from (select territory_id,
    count(*) filter(where eligible_on>(now() at time zone 'America/Lima')::date) as blocking_count,
    count(*) filter(where eligible_on<=(now() at time zone 'America/Lima')::date) as eligible_count
    from public.visit_restrictions where active and deleted_at is null group by territory_id) v),'[]'::jsonb),
 'revision',statement_timestamp()) into output;
 return output;
end $$;
notify pgrst,'reload schema';
commit;
