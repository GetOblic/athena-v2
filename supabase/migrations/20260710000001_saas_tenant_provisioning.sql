-- Idempotent SaaS tenant provisioning and historical data reassignment.
-- Safe to run multiple times. Does not hardcode customer emails or names.

create or replace function athena_slugify_org_name(input text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(lower(trim(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
      ''
    ),
    'workspace'
  );
$$;

create or replace function athena_provision_missing_user_tenants()
returns void
language plpgsql
as $$
declare
  auth_user record;
  new_org_id uuid;
  base_name text;
  org_slug text;
begin
  for auth_user in
    select u.id, u.email
    from auth.users u
    where not exists (
      select 1
      from organization_members om
      where om.user_id = u.id
    )
  loop
    base_name := coalesce(nullif(split_part(auth_user.email, '@', 1), ''), 'workspace');
    org_slug := athena_slugify_org_name(base_name) || '-' || substr(auth_user.id::text, 1, 8);

    insert into organizations (name, slug)
    values (base_name || '''s Organization', org_slug)
    on conflict (slug) do update
      set updated_at = now()
    returning id into new_org_id;

    if new_org_id is null then
      select id into new_org_id
      from organizations
      where slug = org_slug
      limit 1;
    end if;

    insert into organization_members (organization_id, user_id, role)
    values (new_org_id, auth_user.id, 'owner')
    on conflict (user_id) do nothing;
  end loop;
end;
$$;

create or replace function athena_rehome_users_in_shared_organizations()
returns void
language plpgsql
as $$
declare
  member record;
  new_org_id uuid;
  base_name text;
  org_slug text;
  user_email text;
begin
  for member in
    select om.user_id, om.organization_id
    from organization_members om
    where (
      select count(*)
      from organization_members om2
      where om2.organization_id = om.organization_id
    ) > 1
  loop
    select email into user_email from auth.users where id = member.user_id;
    base_name := coalesce(nullif(split_part(user_email, '@', 1), ''), 'workspace');
    org_slug := athena_slugify_org_name(base_name) || '-' || substr(member.user_id::text, 1, 8);

    insert into organizations (name, slug)
    values (base_name || '''s Organization', org_slug)
    on conflict (slug) do update
      set updated_at = now()
    returning id into new_org_id;

    if new_org_id is null then
      select id into new_org_id
      from organizations
      where slug = org_slug
      limit 1;
    end if;

    update organization_members
    set organization_id = new_org_id
    where user_id = member.user_id;
  end loop;
end;
$$;

create or replace function athena_backfill_tenant_table_by_user_id(target_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    $sql$
      update %1$s t
      set organization_id = om.organization_id
      from organization_members om
      where t.user_id = om.user_id
        and t.user_id is not null
        and (t.organization_id is distinct from om.organization_id)
    $sql$,
    target_table
  );
end;
$$;

-- Extend tenant columns to link tables that inherit ownership.
alter table knowledge_asset_links
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table identity_documents
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

select athena_provision_missing_user_tenants();
select athena_rehome_users_in_shared_organizations();
select athena_provision_missing_user_tenants();

select athena_backfill_tenant_table_by_user_id('discussions');
select athena_backfill_tenant_table_by_user_id('athena_discussion_analysis');
select athena_backfill_tenant_table_by_user_id('opportunities');
select athena_backfill_tenant_table_by_user_id('athena_reviews');
select athena_backfill_tenant_table_by_user_id('knowledge_assets');
select athena_backfill_tenant_table_by_user_id('athena_identity');

-- Tables without user_id (athena_discussion_updates, communities, intelligence tables)
-- receive organization_id via relationship propagation below.
update communities c
set organization_id = d.organization_id
from (
  select distinct on (community_id) community_id, organization_id
  from discussions
  where community_id is not null
    and organization_id is not null
  order by community_id, created_at desc
) d
where c.id = d.community_id
  and (c.organization_id is distinct from d.organization_id);

update athena_discussion_analysis a
set organization_id = d.organization_id
from discussions d
where a.discussion_id = d.id
  and d.organization_id is not null
  and (a.organization_id is distinct from d.organization_id);

update athena_discussion_updates u
set organization_id = d.organization_id
from discussions d
where u.discussion_id = d.id
  and d.organization_id is not null
  and (u.organization_id is distinct from d.organization_id);

update opportunities o
set organization_id = d.organization_id
from discussions d
where o.discussion_id = d.id
  and d.organization_id is not null
  and (o.organization_id is distinct from d.organization_id);

update athena_reviews r
set organization_id = o.organization_id
from opportunities o
where r.opportunity_id = o.id
  and o.organization_id is not null
  and (r.organization_id is distinct from o.organization_id);

update athena_reviews r
set organization_id = d.organization_id
from discussions d
where r.discussion_id = d.id
  and d.organization_id is not null
  and (r.organization_id is distinct from d.organization_id);

update athena_asset_blueprints b
set organization_id = r.organization_id
from athena_reviews r
where b.briefing_id = r.id
  and r.organization_id is not null
  and (b.organization_id is distinct from r.organization_id);

update athena_asset_blueprints b
set organization_id = d.organization_id
from discussions d
where b.discussion_id = d.id
  and d.organization_id is not null
  and (b.organization_id is distinct from d.organization_id);

update athena_asset_blueprints b
set organization_id = o.organization_id
from opportunities o
where b.opportunity_id = o.id
  and o.organization_id is not null
  and (b.organization_id is distinct from o.organization_id);

update athena_community_intelligence ci
set organization_id = c.organization_id
from communities c
where ci.community_id = c.id
  and c.organization_id is not null
  and (ci.organization_id is distinct from c.organization_id);

update athena_production_intelligence pi
set organization_id = c.organization_id
from communities c
where pi.community_id = c.id
  and c.organization_id is not null
  and (pi.organization_id is distinct from c.organization_id);

update knowledge_assets ka
set organization_id = c.organization_id
from communities c
where ka.community_id = c.id
  and c.organization_id is not null
  and (ka.organization_id is distinct from c.organization_id);

update knowledge_assets ka
set organization_id = d.organization_id
from discussions d
where ka.source_type = 'discussions'
  and ka.source_id = d.id
  and d.organization_id is not null
  and (ka.organization_id is distinct from d.organization_id);

update knowledge_assets ka
set organization_id = r.organization_id
from athena_reviews r
where ka.source_type = 'athena_reviews'
  and ka.source_id = r.id
  and r.organization_id is not null
  and (ka.organization_id is distinct from r.organization_id);

update knowledge_asset_links l
set organization_id = ka.organization_id
from knowledge_assets ka
where l.knowledge_asset_id = ka.id
  and ka.organization_id is not null
  and (l.organization_id is distinct from ka.organization_id);

update identity_documents doc
set organization_id = ai.organization_id
from athena_identity ai
where doc.identity_id = ai.id
  and ai.organization_id is not null
  and (doc.organization_id is distinct from ai.organization_id);

-- Align identity rows with the user's organization membership.
update athena_identity ai
set organization_id = om.organization_id
from organization_members om
where ai.user_id = om.user_id
  and (ai.organization_id is distinct from om.organization_id);

-- Identity uniqueness is per user within a tenant.
alter table athena_identity
  drop constraint if exists athena_identity_user_id_unique;

create unique index if not exists athena_identity_user_org_unique
  on athena_identity (user_id, organization_id);

create index if not exists knowledge_asset_links_organization_id_idx
  on knowledge_asset_links (organization_id);

create index if not exists identity_documents_organization_id_idx
  on identity_documents (organization_id);

-- Drop legacy helper functions after reassignment (optional cleanup).
drop function if exists athena_backfill_tenant_table_by_user_id(regclass);
