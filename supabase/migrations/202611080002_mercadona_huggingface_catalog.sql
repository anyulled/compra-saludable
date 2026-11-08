create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.mercadona_catalog_products (
  revision text not null,
  product_id text not null,
  display_name text not null,
  product_data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (revision, product_id)
);

create index if not exists mercadona_catalog_products_revision_name_idx
  on public.mercadona_catalog_products (revision, lower(display_name));

create table if not exists public.mercadona_catalog_sync_state (
  id smallint primary key check (id = 1),
  active_revision text,
  source_last_modified timestamptz,
  synced_at timestamptz,
  product_count integer not null default 0 check (product_count >= 0)
);

insert into public.mercadona_catalog_sync_state (id)
values (1)
on conflict (id) do nothing;

alter table public.mercadona_catalog_products enable row level security;
alter table public.mercadona_catalog_sync_state enable row level security;

create policy "household members can read Mercadona catalog" on public.mercadona_catalog_products
  for select to authenticated
  using (exists (select 1 from public.household_members m where m.user_id = auth.uid()));

create policy "household members can read Mercadona catalog status" on public.mercadona_catalog_sync_state
  for select to authenticated
  using (exists (select 1 from public.household_members m where m.user_id = auth.uid()));

grant select on public.mercadona_catalog_products, public.mercadona_catalog_sync_state to authenticated;
grant all on public.mercadona_catalog_products, public.mercadona_catalog_sync_state to service_role;

create or replace function public.activate_mercadona_catalog_revision(
  p_revision text,
  p_source_last_modified timestamptz,
  p_product_count integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_revision is null or p_revision !~ '^[a-f0-9]{40}$' then
    raise exception 'invalid catalog revision';
  end if;
  if p_product_count < 1 then
    raise exception 'catalog cannot be empty';
  end if;

  update public.mercadona_catalog_sync_state
  set active_revision = p_revision,
      source_last_modified = p_source_last_modified,
      synced_at = now(),
      product_count = p_product_count
  where id = 1;

  delete from public.mercadona_catalog_products where revision <> p_revision;
end;
$$;

revoke all on function public.activate_mercadona_catalog_revision(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.activate_mercadona_catalog_revision(text, timestamptz, integer) to service_role;

create or replace function public.search_mercadona_catalog(p_queries text[])
returns table(query text, products jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(array_length(p_queries, 1), 0) < 1 or array_length(p_queries, 1) > 30 then
    raise exception 'provide between 1 and 30 queries';
  end if;
  if exists (select 1 from unnest(p_queries) as queries(query) where length(btrim(query)) = 0 or length(query) > 120) then
    raise exception 'queries must contain between 1 and 120 characters';
  end if;

  return query
  select q.query,
    coalesce((
      select jsonb_agg(to_jsonb(matches.product_data) order by matches.score desc, matches.display_name)
      from (
        select c.product_data, c.display_name,
          (select count(*)::integer
             from regexp_split_to_table(extensions.unaccent(lower(btrim(q.query))), '\s+') as terms(term)
            where length(term) > 2
              and extensions.unaccent(lower(c.display_name)) like '%' || term || '%') as score
        from public.mercadona_catalog_products c
        join public.mercadona_catalog_sync_state s on s.id = 1 and s.active_revision = c.revision
        where exists (
          select 1 from regexp_split_to_table(extensions.unaccent(lower(btrim(q.query))), '\s+') as terms(term)
          where length(term) > 2 and extensions.unaccent(lower(c.display_name)) like '%' || term || '%'
        )
        order by score desc, c.display_name
        limit 12
      ) as matches
    ), '[]'::jsonb) as products
  from unnest(p_queries) as q(query);
end;
$$;

revoke all on function public.search_mercadona_catalog(text[]) from public, anon;
grant execute on function public.search_mercadona_catalog(text[]) to authenticated;
