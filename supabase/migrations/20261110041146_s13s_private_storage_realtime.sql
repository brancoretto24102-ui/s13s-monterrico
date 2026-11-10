begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('s13s-private','s13s-private',false,1048576,array['application/pdf']) on conflict(id) do nothing;
create policy s13_template_read on storage.objects for select to authenticated using(bucket_id='s13s-private' and name='template/S-13_S.pdf' and private.may_export());
create policy s13_template_insert on storage.objects for insert to authenticated with check(bucket_id='s13s-private' and name='template/S-13_S.pdf' and private.app_role()='administrador');
create policy s13_template_update on storage.objects for update to authenticated using(bucket_id='s13s-private' and name='template/S-13_S.pdf' and private.app_role()='administrador') with check(bucket_id='s13s-private' and name='template/S-13_S.pdf' and private.app_role()='administrador');
-- Publish only invalidations without names or history. Full data is fetched again
-- through authorization-checked RPCs. No assignments DELETE events are exposed.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='territories') then alter publication supabase_realtime add table public.territories;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then alter publication supabase_realtime add table public.profiles;end if;
 end if;
end $$;
commit;
