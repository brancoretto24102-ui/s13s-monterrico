begin;
-- The shared audit trigger identifies every record by UUID, including the
-- singleton template. Preserve its singleton key and give it an audit identity.
alter table public.preaching_template add column id uuid not null default gen_random_uuid() unique;
notify pgrst,'reload schema';
commit;
