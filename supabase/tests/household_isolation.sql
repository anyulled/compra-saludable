-- Run against a disposable Supabase database after migrations are applied.
-- Fixtures are rolled back and contain no real household or user data.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.invalid', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.households (id) values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.household_workspaces (household_id, revision, payload) values
  ('20000000-0000-4000-8000-000000000001', 1, '{"marker":"household-a"}'),
  ('20000000-0000-4000-8000-000000000002', 1, '{"marker":"household-b"}')
on conflict (household_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  visible_count integer;
  own_marker text;
  write_result record;
begin
  select count(*) into visible_count from public.household_workspaces;
  if visible_count <> 1 then
    raise exception 'RLS isolation failed: expected one visible household workspace';
  end if;

  select payload->>'marker' into own_marker
  from public.household_workspaces
  where household_id = '20000000-0000-4000-8000-000000000001';
  if own_marker <> 'household-a' then
    raise exception 'RLS isolation failed: own household workspace was not readable';
  end if;

  begin
    perform * from public.write_household_workspace(
      '20000000-0000-4000-8000-000000000001', 0, '{"marker":"unauthorized-bootstrap"}'
    );
    raise exception 'Bootstrap guard failed: authenticated user initialized a workspace';
  exception when insufficient_privilege then
    null;
  end;

  select * into write_result
  from public.write_household_workspace(
    '20000000-0000-4000-8000-000000000001', 1, '{"marker":"household-a-updated"}'
  );
  if not write_result.ok or write_result.revision <> 2 then
    raise exception 'CAS failed for a household member';
  end if;

  begin
    perform * from public.write_household_workspace(
      '20000000-0000-4000-8000-000000000002', 1, '{"marker":"unauthorized"}'
    );
    raise exception 'RLS isolation failed: cross-household write unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

rollback;
