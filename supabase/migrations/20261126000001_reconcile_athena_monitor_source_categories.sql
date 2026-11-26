-- Athena V3 MONITOR-1 Gate 7B.2-FT
-- Additive shared-category publication. Does not alter the applied
-- 20261124000001 schema, foreign keys, or historical rows.
-- One call reconciles one source. A constraint failure aborts the
-- surrounding transaction, so category rows and source freshness
-- cannot commit separately.
-- SECURITY INVOKER: service_role already has table privileges on
-- athena_monitor_sources and athena_monitor_source_categories, and those
-- tables have no trigger that must run as the owner. The function does
-- not read or write organization-owned tables.
-- search_path is pinned and every persistent object is schema-qualified.
-- No dynamic SQL. No DELETE. No organization parameter.
-- Source migration only. Do not apply this file from application code.

create or replace function public.reconcile_athena_monitor_source_categories(
  p_source_id uuid,
  p_discovered_at timestamptz,
  p_authoritative boolean,
  p_categories jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $reconcile$
declare
  v_last timestamptz;
  v_count integer;
  v_item jsonb;
  v_norm jsonb := '[]'::jsonb;
  v_key text;
  v_parent text;
  v_chain text[];
  v_ordered text[] := array[]::text[];
  v_existing_id uuid;
  v_parent_id uuid;
  v_name text;
  v_url text;
  v_status text;
  v_basis text;
  v_family_count integer;
  v_discovered timestamptz;
  v_categories jsonb;
begin
  if p_source_id is null or p_discovered_at is null or p_authoritative is null then
    raise exception 'monitor_category_publication_invalid' using errcode = '22023';
  end if;
  if p_categories is null or jsonb_typeof(p_categories) <> 'array' then
    raise exception 'monitor_category_publication_invalid' using errcode = '22023';
  end if;

  -- 20000 is the existing discovery-coverage family array bound.
  -- It is not a tighter retailer taxonomy limit. Website inspection
  -- still sends at most 50 categories before it calls this function.
  v_count := jsonb_array_length(p_categories);
  if v_count > 20000 then
    raise exception 'monitor_category_publication_invalid' using errcode = '22023';
  end if;

  if v_count > 0 then
    if (
      select count(*)
      from jsonb_array_elements(p_categories) element
    ) <> (
      select count(distinct element->>'categoryKey')
      from jsonb_array_elements(p_categories) element
    ) then
      raise exception 'monitor_category_publication_invalid' using errcode = '22023';
    end if;
    if (
      select count(*)
      from jsonb_array_elements(p_categories) element
    ) <> (
      select count(distinct element->>'canonicalUrl')
      from jsonb_array_elements(p_categories) element
    ) then
      raise exception 'monitor_category_publication_invalid' using errcode = '22023';
    end if;

    for v_item in
      select element.value
      from jsonb_array_elements(p_categories) element
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;
      if v_item ? 'sourceId' and v_item->>'sourceId' is distinct from p_source_id::text then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_key := v_item->>'categoryKey';
      if v_key is null
         or v_key !~ '^[a-z0-9][a-z0-9./_-]{0,199}$'
         or v_key = 'whole_catalog' then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_name := v_item->>'displayName';
      if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 200 then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_url := v_item->>'canonicalUrl';
      if v_url is null or v_url !~ '^https://' then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_parent := v_item->>'parentCategoryKey';
      if v_parent is not null and (
        v_parent !~ '^[a-z0-9][a-z0-9./_-]{0,199}$'
        or v_parent = 'whole_catalog'
        or v_parent = v_key
      ) then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_status := v_item->>'discoveryStatus';
      if v_status is null or v_status not in ('current', 'removed', 'partial') then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      if v_item->>'discoveredAt' is null then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;
      v_discovered := (v_item->>'discoveredAt')::timestamptz;

      if jsonb_typeof(v_item->'productFamilyCount') = 'number' then
        if (v_item->>'productFamilyCount') !~ '^[0-9]+$' then
          raise exception 'monitor_category_publication_invalid' using errcode = '22023';
        end if;
        v_family_count := (v_item->>'productFamilyCount')::integer;
      elsif v_item->'productFamilyCount' is null or jsonb_typeof(v_item->'productFamilyCount') = 'null' then
        v_family_count := null;
      else
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_basis := v_item->>'productFamilyCountBasis';
      if v_basis is not null and v_basis not in ('verified', 'estimated') then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;

      v_norm := v_norm || jsonb_build_array(jsonb_build_object(
        'categoryKey', v_key,
        'displayName', v_name,
        'canonicalUrl', v_url,
        'parentCategoryKey', v_parent,
        'discoveredAt', v_discovered,
        'discoveryStatus', v_status,
        'productFamilyCount', v_family_count,
        'productFamilyCountBasis', v_basis
      ));
    end loop;
  end if;

  select source.last_discovered_at
  into v_last
  from public.athena_monitor_sources source
  where source.id = p_source_id
  for update;

  if not found then
    raise exception 'monitor_source_missing' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.id,
    'sourceId', category.source_id,
    'categoryKey', category.category_key,
    'displayName', category.display_name,
    'canonicalUrl', category.canonical_url,
    'parentCategoryId', category.parent_category_id,
    'parentCategoryKey', category.parent_category_key,
    'discoveredAt', category.discovered_at,
    'discoveryStatus', category.discovery_status,
    'productFamilyCount', category.product_family_count,
    'productFamilyCountBasis', category.product_family_count_basis,
    'createdAt', category.created_at,
    'updatedAt', category.updated_at
  ) order by category.category_key), '[]'::jsonb)
  into v_categories
  from public.athena_monitor_source_categories category
  where category.source_id = p_source_id;

  if v_count = 0 then
    return jsonb_build_object(
      'outcome', 'empty',
      'freshnessAdvanced', false,
      'taxonomyCompleteness', 'unverified',
      'absentCategoriesPreserved', true,
      'limitation', 'Category discovery did not establish an authoritative taxonomy. Previously known categories were preserved.',
      'categories', v_categories
    );
  end if;

  -- Equal timestamps are not evidence that the payloads match.
  -- The waiting publication returns the committed rows and writes nothing.
  if v_last is not null and p_discovered_at = v_last then
    return jsonb_build_object(
      'outcome', 'already_published',
      'freshnessAdvanced', false,
      'taxonomyCompleteness', 'unverified',
      'absentCategoriesPreserved', true,
      'limitation', 'A category publication with the same discovery timestamp was not applied. An equal timestamp does not show that the category sets match.',
      'categories', v_categories
    );
  end if;

  if v_last is not null and p_discovered_at < v_last then
    return jsonb_build_object(
      'outcome', 'stale',
      'freshnessAdvanced', false,
      'taxonomyCompleteness', 'unverified',
      'absentCategoriesPreserved', true,
      'limitation', 'An older category refresh was ignored because a newer discovery is already recorded.',
      'categories', v_categories
    );
  end if;

  for v_item in
    select element.value
    from jsonb_array_elements(v_norm) element
  loop
    v_chain := array[v_item->>'categoryKey'];
    v_parent := v_item->>'parentCategoryKey';
    while v_parent is not null loop
      if v_parent = any(v_chain) then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(v_norm) element
        where element->>'categoryKey' = v_parent
      ) then
        if not exists (
          select 1
          from public.athena_monitor_source_categories category
          where category.source_id = p_source_id
            and category.category_key = v_parent
        ) then
          raise exception 'monitor_category_publication_invalid' using errcode = '22023';
        end if;
        exit;
      end if;
      v_chain := array[v_parent] || v_chain;
      select element->>'parentCategoryKey'
      into v_parent
      from jsonb_array_elements(v_norm) element
      where element->>'categoryKey' = v_parent;
    end loop;
    foreach v_key in array v_chain loop
      if not v_key = any(v_ordered) then
        v_ordered := v_ordered || v_key;
      end if;
    end loop;
  end loop;

  -- Park URLs that this publication is moving so a swap does not fail
  -- the unique constraint halfway through. These assignments roll back
  -- with any later constraint error. Rows that are not part of the
  -- publication are not rewritten here.
  update public.athena_monitor_source_categories category
  set canonical_url = 'https://monitor-reconcile.invalid/' || category.id::text
  where category.source_id = p_source_id
    and exists (
      select 1
      from jsonb_array_elements(v_norm) incoming
      where incoming->>'canonicalUrl' = category.canonical_url
        and incoming->>'categoryKey' <> category.category_key
    )
    and exists (
      select 1
      from jsonb_array_elements(v_norm) moving
      where moving->>'categoryKey' = category.category_key
        and moving->>'canonicalUrl' is distinct from category.canonical_url
    );

  foreach v_key in array v_ordered loop
    select element.value
    into v_item
    from jsonb_array_elements(v_norm) element
    where element->>'categoryKey' = v_key;

    v_name := v_item->>'displayName';
    v_url := v_item->>'canonicalUrl';
    v_parent := v_item->>'parentCategoryKey';
    v_status := v_item->>'discoveryStatus';
    v_basis := v_item->>'productFamilyCountBasis';
    v_discovered := (v_item->>'discoveredAt')::timestamptz;
    if v_item->'productFamilyCount' is null or jsonb_typeof(v_item->'productFamilyCount') = 'null' then
      v_family_count := null;
    else
      v_family_count := (v_item->>'productFamilyCount')::integer;
    end if;

    if v_parent is null then
      v_parent_id := null;
    else
      select category.id
      into v_parent_id
      from public.athena_monitor_source_categories category
      where category.source_id = p_source_id
        and category.category_key = v_parent;
      if v_parent_id is null then
        raise exception 'monitor_category_publication_invalid' using errcode = '22023';
      end if;
    end if;

    select category.id
    into v_existing_id
    from public.athena_monitor_source_categories category
    where category.source_id = p_source_id
      and category.category_key = v_key;

    if v_existing_id is null then
      insert into public.athena_monitor_source_categories (
        id,
        source_id,
        category_key,
        display_name,
        canonical_url,
        parent_category_id,
        parent_category_key,
        discovered_at,
        discovery_status,
        product_family_count,
        product_family_count_basis,
        created_at,
        updated_at
      ) values (
        pg_catalog.gen_random_uuid(),
        p_source_id,
        v_key,
        v_name,
        v_url,
        v_parent_id,
        v_parent,
        v_discovered,
        v_status,
        v_family_count,
        v_basis,
        p_discovered_at,
        p_discovered_at
      );
    else
      update public.athena_monitor_source_categories
      set
        display_name = v_name,
        canonical_url = v_url,
        parent_category_id = v_parent_id,
        parent_category_key = v_parent,
        discovered_at = v_discovered,
        discovery_status = v_status,
        product_family_count = v_family_count,
        product_family_count_basis = v_basis,
        updated_at = p_discovered_at
      where id = v_existing_id
        and source_id = p_source_id;
    end if;
  end loop;

  if p_authoritative then
    update public.athena_monitor_source_categories category
    set
      discovery_status = 'removed',
      discovered_at = p_discovered_at,
      updated_at = p_discovered_at
    where category.source_id = p_source_id
      and category.discovery_status is distinct from 'removed'
      and not exists (
        select 1
        from jsonb_array_elements(v_norm) incoming
        where incoming->>'categoryKey' = category.category_key
      );
  end if;

  update public.athena_monitor_sources
  set
    discovery_status = 'current',
    last_discovered_at = p_discovered_at,
    updated_at = p_discovered_at
  where id = p_source_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.id,
    'sourceId', category.source_id,
    'categoryKey', category.category_key,
    'displayName', category.display_name,
    'canonicalUrl', category.canonical_url,
    'parentCategoryId', category.parent_category_id,
    'parentCategoryKey', category.parent_category_key,
    'discoveredAt', category.discovered_at,
    'discoveryStatus', category.discovery_status,
    'productFamilyCount', category.product_family_count,
    'productFamilyCountBasis', category.product_family_count_basis,
    'createdAt', category.created_at,
    'updatedAt', category.updated_at
  ) order by category.category_key), '[]'::jsonb)
  into v_categories
  from public.athena_monitor_source_categories category
  where category.source_id = p_source_id;

  return jsonb_build_object(
    'outcome', 'published',
    'freshnessAdvanced', true,
    'taxonomyCompleteness', case when p_authoritative then 'authoritative' else 'unverified' end,
    'absentCategoriesPreserved', not p_authoritative,
    'limitation', case
      when p_authoritative then null
      else 'Category discovery did not establish an authoritative taxonomy. Previously known categories were preserved.'
    end,
    'categories', v_categories
  );
end;
$reconcile$;

comment on function public.reconcile_athena_monitor_source_categories(uuid, timestamptz, boolean, jsonb) is
  'Publishes one shared category set for one source under a row lock. Preserves category UUIDs and created_at. Does not delete categories, coverage, observations, monitors, or jobs. An equal discovery timestamp writes nothing and does not mean the payloads were identical. An empty set does not advance freshness. Omitted categories are marked removed only when p_authoritative is true and the set is non-empty. Constraint failures propagate and roll back the publication.';

revoke all on function public.reconcile_athena_monitor_source_categories(uuid, timestamptz, boolean, jsonb) from public;
revoke all on function public.reconcile_athena_monitor_source_categories(uuid, timestamptz, boolean, jsonb) from anon;
revoke all on function public.reconcile_athena_monitor_source_categories(uuid, timestamptz, boolean, jsonb) from authenticated;
grant execute on function public.reconcile_athena_monitor_source_categories(uuid, timestamptz, boolean, jsonb) to service_role;
