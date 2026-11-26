-- Executable PostgreSQL assertions for reconcile_athena_monitor_source_categories.
-- Not a production migration. Not part of the runtime transfer.
-- Apply the original Monitor migration and the additive publication migration first.

\set ON_ERROR_STOP on

insert into auth.users (id)
values ('30000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.organizations (id)
values ('20000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.athena_monitor_sources (
  id, normalized_host, canonical_url, registered_source_id,
  platform, adapter_id, adapter_version, extraction_config,
  discovery_status, access_status
) values
(
  '10000000-0000-4000-8000-000000000001',
  'toscane-boutique.fr',
  'https://toscane-boutique.fr/',
  'toscane',
  'solusquare',
  'solusquare',
  '2',
  '{"version":"1","registrableDomain":"toscane-boutique.fr","adapterId":"solusquare","adapterVersion":"2","platform":"solusquare"}'::jsonb,
  'pending',
  'feasible'
),
(
  '10000000-0000-4000-8000-000000000002',
  'breal.net',
  'https://breal.net/',
  'breal',
  'sfra',
  'sfra',
  '2',
  '{"version":"1","registrableDomain":"breal.net","adapterId":"sfra","adapterVersion":"2","platform":"sfra"}'::jsonb,
  'pending',
  'feasible'
);

do $$
declare
  v_result jsonb;
  v_row public.athena_monitor_source_categories;
  v_parent uuid;
begin
  v_result := public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T09:00:00Z',
    false,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'fr/pantalons-c-42.htm',
      'displayName', 'Pantalons',
      'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T09:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  if v_result->>'outcome' is distinct from 'published' then
    raise exception 'initial publication outcome was %', v_result->>'outcome';
  end if;
  select * into v_row
  from public.athena_monitor_source_categories
  where source_id = '10000000-0000-4000-8000-000000000001'
    and category_key = 'fr/pantalons-c-42.htm';
  if v_row.id is null then
    raise exception 'initial category row is missing';
  end if;
  perform set_config('monitor.pants_id', v_row.id::text, false);
  perform set_config('monitor.pants_created', v_row.created_at::text, false);

  v_result := public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T10:00:00Z',
    false,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'fr/pantalons-c-42.htm',
      'displayName', 'Pantalons femme',
      'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T10:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  select * into v_row
  from public.athena_monitor_source_categories
  where category_key = 'fr/pantalons-c-42.htm'
    and source_id = '10000000-0000-4000-8000-000000000001';
  if v_row.id::text is distinct from current_setting('monitor.pants_id')
     or v_row.created_at::text is distinct from current_setting('monitor.pants_created')
     or v_row.display_name is distinct from 'Pantalons femme' then
    raise exception 'rediscovery replaced the category identity';
  end if;

  perform public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T11:00:00Z',
    false,
    jsonb_build_array(
      jsonb_build_object(
        'categoryKey', 'fr/treggings-c-77.htm',
        'displayName', 'Treggings',
        'canonicalUrl', 'https://toscane-boutique.fr/fr/treggings-c-77.htm',
        'parentCategoryKey', 'fr/pantalons-c-42.htm',
        'discoveredAt', '2026-11-26T11:00:00Z',
        'discoveryStatus', 'current',
        'productFamilyCount', null,
        'productFamilyCountBasis', null
      ),
      jsonb_build_object(
        'categoryKey', 'fr/pantalons-c-42.htm',
        'displayName', 'Pantalons femme',
        'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
        'parentCategoryKey', null,
        'discoveredAt', '2026-11-26T11:00:00Z',
        'discoveryStatus', 'current',
        'productFamilyCount', null,
        'productFamilyCountBasis', null
      )
    )
  );
  select id into v_parent
  from public.athena_monitor_source_categories
  where id = current_setting('monitor.pants_id')::uuid;
  select * into v_row
  from public.athena_monitor_source_categories
  where source_id = '10000000-0000-4000-8000-000000000001'
    and category_key = 'fr/treggings-c-77.htm';
  if v_row.id is null or v_row.parent_category_id is distinct from v_parent then
    raise exception 'parent category was not reconciled before the child';
  end if;
  perform set_config('monitor.treg_id', v_row.id::text, false);
  perform set_config('monitor.treg_created', v_row.created_at::text, false);
end $$;

insert into public.athena_monitor_discovery_coverage (
  id, source_id, scope_kind, category_id, scope_key, status,
  adapter_id, adapter_version, schema_version, discovered_at, family_ids, family_count
) values (
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'category',
  current_setting('monitor.pants_id')::uuid,
  'fr/pantalons-c-42.htm',
  'completed',
  'solusquare',
  '2',
  1,
  '2026-11-26T09:00:00Z',
  '["901"]'::jsonb,
  1
);

insert into public.athena_monitor_public_observations (
  id, source_id, registered_source_id, family_id, adapter_id, adapter_version,
  schema_version, product_name, canonical_url, price_amount, currency,
  observed_at, provenance, content_key
) values (
  '80000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'toscane',
  '901',
  'solusquare',
  '2',
  1,
  'Modele 901',
  'https://toscane-boutique.fr/fr/pantalons/modele-p-901-coul-1.htm',
  '49.00',
  'EUR',
  '2026-11-26T09:00:00Z',
  '{"version":1,"adapterId":"solusquare","adapterVersion":"2","schemaVersion":1}'::jsonb,
  repeat('ab', 32)
);

do $$
declare
  v_result jsonb;
begin
  perform public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T12:00:00Z',
    false,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'fr/pantalons-c-42.htm',
      'displayName', 'Pantalons femme',
      'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T12:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  if (select discovery_status from public.athena_monitor_source_categories where id = current_setting('monitor.treg_id')::uuid)
     is distinct from 'current' then
    raise exception 'non-authoritative omission changed an existing category';
  end if;

  v_result := public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T13:00:00Z',
    false,
    '[]'::jsonb
  );
  if v_result->>'outcome' is distinct from 'empty'
     or (select last_discovered_at from public.athena_monitor_sources where id = '10000000-0000-4000-8000-000000000001')
        is distinct from '2026-11-26T12:00:00Z'::timestamptz then
    raise exception 'empty discovery advanced source freshness';
  end if;

  v_result := public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T12:00:00Z',
    true,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'fr/robes-c-18.htm',
      'displayName', 'Robes',
      'canonicalUrl', 'https://toscane-boutique.fr/fr/robes-c-18.htm',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T12:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  if v_result->>'outcome' is distinct from 'already_published' or exists (
    select 1 from public.athena_monitor_source_categories
    where source_id = '10000000-0000-4000-8000-000000000001'
      and category_key = 'fr/robes-c-18.htm'
  ) then
    raise exception 'equal timestamp wrote a different category set';
  end if;

  v_result := public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T08:00:00Z',
    true,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'fr/pantalons-c-42.htm',
      'displayName', 'Older',
      'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T08:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  if v_result->>'outcome' is distinct from 'stale'
     or (select display_name from public.athena_monitor_source_categories where id = current_setting('monitor.pants_id')::uuid)
        is distinct from 'Pantalons femme' then
    raise exception 'stale publication overwrote category metadata';
  end if;
end $$;

do $$
begin
  begin
    perform public.reconcile_athena_monitor_source_categories(
      '10000000-0000-4000-8000-000000000001',
      '2026-11-26T14:00:00Z',
      false,
      jsonb_build_array(jsonb_build_object(
        'categoryKey', 'fr/robes-c-18.htm',
        'displayName', 'Robes',
        'canonicalUrl', 'https://toscane-boutique.fr/fr/robes-c-18.htm',
        'parentCategoryKey', 'fr/missing-parent.htm',
        'discoveredAt', '2026-11-26T14:00:00Z',
        'discoveryStatus', 'current',
        'productFamilyCount', null,
        'productFamilyCountBasis', null
      ))
    );
    raise exception 'invalid parent was accepted';
  exception
    when others then
      if sqlerrm = 'invalid parent was accepted' then raise; end if;
  end;
  begin
    perform public.reconcile_athena_monitor_source_categories(
      '10000000-0000-4000-8000-000000000001',
      '2026-11-26T14:00:00Z',
      false,
      jsonb_build_array(
        jsonb_build_object(
          'categoryKey', 'fr/robes-c-18.htm',
          'displayName', 'Robes',
          'canonicalUrl', 'https://toscane-boutique.fr/fr/robes-c-18.htm',
          'parentCategoryKey', 'fr/chemisiers-tuniques-c-15.htm',
          'discoveredAt', '2026-11-26T14:00:00Z',
          'discoveryStatus', 'current',
          'productFamilyCount', null,
          'productFamilyCountBasis', null
        ),
        jsonb_build_object(
          'categoryKey', 'fr/chemisiers-tuniques-c-15.htm',
          'displayName', 'Chemisiers',
          'canonicalUrl', 'https://toscane-boutique.fr/fr/chemisiers-tuniques-c-15.htm',
          'parentCategoryKey', 'fr/robes-c-18.htm',
          'discoveredAt', '2026-11-26T14:00:00Z',
          'discoveryStatus', 'current',
          'productFamilyCount', null,
          'productFamilyCountBasis', null
        )
      )
    );
    raise exception 'category cycle was accepted';
  exception
    when others then
      if sqlerrm = 'category cycle was accepted' then raise; end if;
  end;
  if (select last_discovered_at from public.athena_monitor_sources where id = '10000000-0000-4000-8000-000000000001')
     is distinct from '2026-11-26T12:00:00Z'::timestamptz then
    raise exception 'invalid category graph advanced freshness';
  end if;
end $$;

create or replace function public.monitor_integration_fail_category()
returns trigger
language plpgsql
as $$
begin
  if new.category_key = current_setting('monitor.fail_category_key', true) then
    raise exception 'forced category constraint failure' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists monitor_integration_fail_category on public.athena_monitor_source_categories;
create trigger monitor_integration_fail_category
  before insert or update on public.athena_monitor_source_categories
  for each row
  execute function public.monitor_integration_fail_category();

do $$
begin
  perform set_config('monitor.fail_category_key', 'fr/chemisiers-tuniques-c-15.htm', true);
  begin
    perform public.reconcile_athena_monitor_source_categories(
      '10000000-0000-4000-8000-000000000001',
      '2026-11-26T14:00:00Z',
      false,
      jsonb_build_array(
        jsonb_build_object(
          'categoryKey', 'fr/pantalons-c-42.htm',
          'displayName', 'Should roll back',
          'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
          'parentCategoryKey', null,
          'discoveredAt', '2026-11-26T14:00:00Z',
          'discoveryStatus', 'current',
          'productFamilyCount', null,
          'productFamilyCountBasis', null
        ),
        jsonb_build_object(
          'categoryKey', 'fr/chemisiers-tuniques-c-15.htm',
          'displayName', 'Chemisiers',
          'canonicalUrl', 'https://toscane-boutique.fr/fr/chemisiers-tuniques-c-15.htm',
          'parentCategoryKey', null,
          'discoveredAt', '2026-11-26T14:00:00Z',
          'discoveryStatus', 'current',
          'productFamilyCount', null,
          'productFamilyCountBasis', null
        )
      )
    );
    raise exception 'mid-publication constraint failure was suppressed';
  exception
    when others then
      if sqlerrm = 'mid-publication constraint failure was suppressed' then raise; end if;
  end;
  if (select display_name from public.athena_monitor_source_categories where id = current_setting('monitor.pants_id')::uuid)
     is distinct from 'Pantalons femme'
     or exists (
       select 1 from public.athena_monitor_source_categories
       where source_id = '10000000-0000-4000-8000-000000000001'
         and category_key = 'fr/chemisiers-tuniques-c-15.htm'
     )
     or (select last_discovered_at from public.athena_monitor_sources where id = '10000000-0000-4000-8000-000000000001')
        is distinct from '2026-11-26T12:00:00Z'::timestamptz then
    raise exception 'mid-publication failure committed category or freshness changes';
  end if;
end $$;

drop trigger monitor_integration_fail_category on public.athena_monitor_source_categories;
drop function public.monitor_integration_fail_category();

do $$
declare
  v_row public.athena_monitor_source_categories;
begin
  perform public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T15:00:00Z',
    true,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'fr/pantalons-c-42.htm',
      'displayName', 'Pantalons femme',
      'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T15:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  select * into v_row
  from public.athena_monitor_source_categories
  where id = current_setting('monitor.treg_id')::uuid;
  if v_row.id::text is distinct from current_setting('monitor.treg_id')
     or v_row.discovery_status is distinct from 'removed' then
    raise exception 'authoritative removal deleted or replaced a category';
  end if;
  if (select category_id::text from public.athena_monitor_discovery_coverage where id = '70000000-0000-4000-8000-000000000001')
     is distinct from current_setting('monitor.pants_id')
     or (select family_ids from public.athena_monitor_discovery_coverage where id = '70000000-0000-4000-8000-000000000001')
        is distinct from '["901"]'::jsonb
     or (select product_name from public.athena_monitor_public_observations where id = '80000000-0000-4000-8000-000000000001')
        is distinct from 'Modele 901' then
    raise exception 'historical coverage or observation changed during removal';
  end if;

  perform public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000001',
    '2026-11-26T16:00:00Z',
    false,
    jsonb_build_array(
      jsonb_build_object(
        'categoryKey', 'fr/pantalons-c-42.htm',
        'displayName', 'Pantalons femme',
        'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
        'parentCategoryKey', null,
        'discoveredAt', '2026-11-26T16:00:00Z',
        'discoveryStatus', 'current',
        'productFamilyCount', null,
        'productFamilyCountBasis', null
      ),
      jsonb_build_object(
        'categoryKey', 'fr/treggings-c-77.htm',
        'displayName', 'Treggings',
        'canonicalUrl', 'https://toscane-boutique.fr/fr/treggings-c-77.htm',
        'parentCategoryKey', 'fr/pantalons-c-42.htm',
        'discoveredAt', '2026-11-26T16:00:00Z',
        'discoveryStatus', 'current',
        'productFamilyCount', null,
        'productFamilyCountBasis', null
      )
    )
  );
  select * into v_row
  from public.athena_monitor_source_categories
  where id = current_setting('monitor.treg_id')::uuid;
  if v_row.discovery_status is distinct from 'current'
     or v_row.created_at::text is distinct from current_setting('monitor.treg_created') then
    raise exception 'reactivation did not preserve the category identity';
  end if;
end $$;

do $$
begin
  begin
    execute 'set local role anon';
    perform public.reconcile_athena_monitor_source_categories(
      '10000000-0000-4000-8000-000000000001',
      '2026-11-26T17:00:00Z',
      false,
      '[]'::jsonb
    );
    raise exception 'anon execution was permitted';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    execute 'set local role authenticated';
    perform public.reconcile_athena_monitor_source_categories(
      '10000000-0000-4000-8000-000000000001',
      '2026-11-26T17:00:00Z',
      false,
      '[]'::jsonb
    );
    raise exception 'authenticated execution was permitted';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

set role service_role;
do $$
declare
  v_result jsonb;
begin
  v_result := public.reconcile_athena_monitor_source_categories(
    '10000000-0000-4000-8000-000000000002',
    '2026-11-26T09:00:00Z',
    false,
    jsonb_build_array(jsonb_build_object(
      'categoryKey', 'jeans-femme',
      'displayName', 'Jeans',
      'canonicalUrl', 'https://breal.net/jeans-femme',
      'parentCategoryKey', null,
      'discoveredAt', '2026-11-26T09:00:00Z',
      'discoveryStatus', 'current',
      'productFamilyCount', null,
      'productFamilyCountBasis', null
    ))
  );
  if v_result->>'outcome' is distinct from 'published' then
    raise exception 'service_role publication failed';
  end if;
end $$;
reset role;

insert into public.athena_monitors (
  id, organization_id, name, configuration_version, configuration, created_by
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Integration',
  1,
  '{"version":"1","name":"Integration","objective":"Find families with several distinct color patterns.","sources":[{"sourceId":"toscane","websiteUrl":"https://toscane-boutique.fr/","selection":{"mode":"whole_catalog"}}],"criterion":{"id":"distinctColorPatternCount","operator":"gte","minimum":3}}'::jsonb,
  '30000000-0000-4000-8000-000000000001'
);

insert into public.athena_monitor_jobs (
  id, organization_id, monitor_id, status, configuration_version, configuration_snapshot
) values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'queued',
  1,
  '{"version":"1","name":"Integration","objective":"Find families with several distinct color patterns.","sources":[{"sourceId":"toscane","websiteUrl":"https://toscane-boutique.fr/","selection":{"mode":"whole_catalog"}}],"criterion":{"id":"distinctColorPatternCount","operator":"gte","minimum":3}}'::jsonb
);

do $$
declare
  v_job public.athena_monitor_jobs;
  v_stale public.athena_monitor_jobs;
  v_done public.athena_monitor_jobs;
begin
  select * into v_job
  from public.claim_athena_monitor_job(
    'athena-v2-monitor-worker',
    '60000000-0000-4000-8000-000000000001',
    120,
    21600,
    600,
    20000
  );
  if v_job.id is distinct from '50000000-0000-4000-8000-000000000001' then
    raise exception 'claim did not return the fixture job';
  end if;
  select * into v_stale
  from public.finalize_athena_monitor_job(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000099',
    'failed',
    'JOB_EXECUTION_FAILED',
    'The search could not continue.',
    null,
    '[]'::jsonb,
    '{"version":1}'::jsonb,
    '{"version":1,"sources":[]}'::jsonb
  );
  if v_stale.id is not null
     or (select status from public.athena_monitor_jobs where id = '50000000-0000-4000-8000-000000000001')
        is distinct from 'processing' then
    raise exception 'stale claim token finalized the job';
  end if;
  select * into v_done
  from public.finalize_athena_monitor_job(
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'failed',
    'JOB_EXECUTION_FAILED',
    'The search could not continue.',
    null,
    '[]'::jsonb,
    '{"version":1}'::jsonb,
    '{"version":1,"sources":[]}'::jsonb
  );
  if v_done.status is distinct from 'failed' then
    raise exception 'valid claim token did not finalize the job';
  end if;
end $$;
