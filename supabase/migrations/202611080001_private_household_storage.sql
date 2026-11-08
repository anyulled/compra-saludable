-- Private, household-scoped storage. Apply with Supabase migrations after auth is configured.
create table if not exists public.households (
  id uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_workspaces (
  household_id uuid primary key references public.households(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_workspaces enable row level security;

create policy "members can read their household" on public.households
  for select to authenticated
  using (exists (select 1 from public.household_members m where m.household_id = id and m.user_id = auth.uid()));

create policy "members can read membership" on public.household_members
  for select to authenticated using (user_id = auth.uid());

create policy "members can read workspace" on public.household_workspaces
  for select to authenticated
  using (exists (select 1 from public.household_members m where m.household_id = household_workspaces.household_id and m.user_id = auth.uid()));

-- CAS updates an existing workspace only. Initial provisioning is reserved for
-- the admin migration script so a newly authenticated user cannot win a race.
create or replace function public.write_household_workspace(
  p_household_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
) returns table(ok boolean, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.user_id = auth.uid()
  ) then
    raise exception 'household access denied' using errcode = '42501';
  end if;

  if p_expected_revision = 0 then
    raise exception 'workspace initialization requires the admin migrator' using errcode = '42501';
  end if;

  update public.household_workspaces w
  set revision = w.revision + 1, payload = p_payload, updated_at = now()
  where w.household_id = p_household_id
    and w.revision = p_expected_revision
    and exists (select 1 from public.household_members m where m.household_id = w.household_id and m.user_id = auth.uid())
  returning w.revision into v_revision;
  if found then return query select true, v_revision; return; end if;

  select w.revision into v_revision
  from public.household_workspaces w
  where w.household_id = p_household_id
    and exists (select 1 from public.household_members m where m.household_id = w.household_id and m.user_id = auth.uid());
  return query select false, coalesce(v_revision, 0);
end;
$$;

revoke all on function public.write_household_workspace(uuid, bigint, jsonb) from public, anon;
grant execute on function public.write_household_workspace(uuid, bigint, jsonb) to authenticated;
grant select on public.households, public.household_members, public.household_workspaces to authenticated;

-- Uploaded recipe documents are private by default. The application can keep
-- using client-side PDF parsing; this bucket supports explicitly retained files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('household-documents', 'household-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "household members read private documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'household-documents' and exists (
    select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()
  ));
create policy "household members upload private documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'household-documents' and exists (
    select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()
  ));
create policy "household members update private documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'household-documents' and exists (
    select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()
  )) with check (bucket_id = 'household-documents' and exists (
    select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()
  ));
create policy "household members delete private documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'household-documents' and exists (
    select 1 from public.household_members m
    where m.household_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()
  ));
