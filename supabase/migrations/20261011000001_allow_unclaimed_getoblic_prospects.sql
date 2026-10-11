-- Athena V2 — CO-UNCLAIMED-1 Gate 3A
-- Licensee permission and the database insertion contract for unclaimed
-- GetOblic Directory Prospects.
-- Additive. Does not apply itself. Do not apply this migration from
-- application code.
--
-- Column:
--   licensee_accounts.allow_unclaimed_getoblic_prospecting
--   boolean NOT NULL DEFAULT false
-- Existing licensee rows receive false from the catalog default. This
-- statement does not rewrite historical rows. The boolean may be set
-- before Own Company designation. It grants no insertion authority until
-- the checks below succeed.
--
-- Chosen mechanism:
--   A narrow SECURITY DEFINER RPC, acquire_unclaimed_getoblic_prospect,
--   is the only authorized writer. It locks the organization row (the same
--   serialization primitive as the 300-Prospect trigger), proves the Own
--   Company contract, and either returns the existing same-organization
--   Prospect for that exact canonical WordPress listing id or inserts one
--   new row. Immediately before that insert it sets a transaction-local
--   token naming this invocation: organization id, listing id, the Prospect
--   id it is about to insert, and a nonce. The capacity trigger still locks
--   the organization and still enforces organization_prospect_capacity_limit()
--   unless unclaimed_getoblic_prospect_insert_authorized() accepts that token
--   for THIS row and re-checks the Own Company contract.
--
-- Why SECURITY DEFINER is necessary here:
--   Only this RPC is SECURITY DEFINER. It must stamp source, origin, and
--   the canonical listing id itself, under a fixed search_path, so the
--   caller cannot substitute those identity fields. Helper predicates and
--   the capacity trigger stay SECURITY INVOKER. EXECUTE is revoked from
--   PUBLIC, anon, and authenticated and granted only to service_role.
--   search_path lists pg_temp last so a session temp table cannot shadow
--   public relations. Table and function references are also schema-qualified.
--
-- Rejected: organization-id-only session setting.
--   A setting that only names an organization would exempt every later
--   insert for that organization in the transaction, including ordinary
--   Prospects. The token instead names the organization, the listing, and
--   the Prospect id of the one insert, and the trigger compares all three
--   to NEW plus source and origin.
--
-- Rejected: exemption from forged source or raw_json on a normal INSERT.
--   Ordinary inserts do not set the token. Matching source, origin, or
--   raw_json alone never skips the 300-row count.
--
-- Rejected: writable exemption-ticket table.
--   A ticket table would be a second writable authority. service_role would
--   be able to insert tickets, which is the same role as a normal Prospect
--   insert.
--
-- Rejected: disabling triggers.
--   Turning the capacity trigger off would remove the race-safe cap for
--   every row in the session.
--
-- Rejected: session_replication_role.
--   That bypasses triggers broadly, not for one verified row.
--
-- Idempotency:
--   Reuse is organization_id + source getoblic + origin getoblic_directory
--   + canonical WordPress listing id. Canonical id prefers a positive
--   integer at raw_json.wordpress_listing_id, otherwise
--   raw_json.observed.wordpress_listing_id. Website, business name, and
--   city are not identity. Existing website and name/city unique indexes
--   stay in force and are not caught or merged.
--
-- Permission off:
--   No Prospect row is updated or deleted. Previously inserted unclaimed
--   Prospects remain. Later inserts without a matching token stay subject
--   to the ordinary 300-Prospect trigger.
--
-- Active Master:
--   Missing account_access_status row means active. Only status = active
--   is active when a row exists. Any other status, including deactivated,
--   is not active.
--
-- This migration does not modify listing links, the listing-capacity RPC,
-- author assignment, Prospect-to-Client conversion, or Free Convert.

alter table licensee_accounts
  add column if not exists allow_unclaimed_getoblic_prospecting boolean not null default false;

comment on column licensee_accounts.allow_unclaimed_getoblic_prospecting is
  'Licensee-level switch for unclaimed GetOblic Directory prospecting. NOT NULL default false. No historical rewrite. May be enabled before Own Company designation, but grants no Prospect insertion authority until that Licensee is the single Own Company designation, the organization has exactly one licensee_sub_accounts row and it belongs to that Licensee, and the Master is active. Does not transfer listing ownership or exempt any other Prospect insert from the 300-row limit.';

-- Canonical WordPress listing id. Positive integer only.
-- Top-level raw_json.wordpress_listing_id wins. Otherwise observed.
-- Text is trimmed. Leading zeros, fractions, and values above bigint are
-- not canonical. 19-digit values must fit in bigint.
create or replace function public.prospect_canonical_wordpress_listing_id(p_raw jsonb)
returns bigint
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select case
    when btrim(p_raw->>'wordpress_listing_id') ~ '^[1-9][0-9]{0,18}$'
         and btrim(p_raw->>'wordpress_listing_id')::numeric <= 9223372036854775807
      then btrim(p_raw->>'wordpress_listing_id')::bigint
    when jsonb_typeof(p_raw->'observed') = 'object'
         and btrim(p_raw->'observed'->>'wordpress_listing_id') ~ '^[1-9][0-9]{0,18}$'
         and btrim(p_raw->'observed'->>'wordpress_listing_id')::numeric <= 9223372036854775807
      then btrim(p_raw->'observed'->>'wordpress_listing_id')::bigint
    else null
  end;
$$;

comment on function public.prospect_canonical_wordpress_listing_id(jsonb) is
  'Exact canonical WordPress listing id from Prospect raw_json. Top-level wordpress_listing_id, otherwise observed.wordpress_listing_id. Not a website, name, or city match.';

-- Read-only Own Company contract. Does not lock and does not insert.
-- Exactly one Own Company designation, permission on, exactly one
-- controlling sub-account row for that same Licensee, and an active Master.
create or replace function public.licensee_own_company_unclaimed_getoblic_authorized(
  p_organization_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_designated_count integer;
  v_licensee_id uuid;
  v_user_id uuid;
  v_allowed boolean;
  v_relationship_count integer;
  v_relationship_licensee_id uuid;
  v_access_status text;
begin
  if p_organization_id is null then
    return false;
  end if;

  perform 1
  from public.organizations
  where id = p_organization_id;

  if not found then
    return false;
  end if;

  select
    count(*)::integer,
    case when count(*) = 1 then (array_agg(id))[1] else null end,
    case when count(*) = 1 then (array_agg(user_id))[1] else null end,
    bool_and(allow_unclaimed_getoblic_prospecting)
  into v_designated_count, v_licensee_id, v_user_id, v_allowed
  from public.licensee_accounts
  where own_company_organization_id = p_organization_id;

  if v_designated_count <> 1 or v_allowed is distinct from true then
    return false;
  end if;

  select
    count(*)::integer,
    case when count(*) = 1 then (array_agg(licensee_account_id))[1] else null end
  into v_relationship_count, v_relationship_licensee_id
  from public.licensee_sub_accounts
  where organization_id = p_organization_id;

  if v_relationship_count <> 1
     or v_relationship_licensee_id is distinct from v_licensee_id then
    return false;
  end if;

  select status
    into v_access_status
  from public.account_access_status
  where user_id = v_user_id;

  -- Missing account_access_status row means active.
  -- A present row must be status active. deactivated and any other value fail.
  if found and v_access_status is distinct from 'active' then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.licensee_own_company_unclaimed_getoblic_authorized(uuid) is
  'True only for one Own Company Licensee with allow_unclaimed_getoblic_prospecting, one controlling licensee_sub_accounts row for that Licensee, a real organization, and an active Master. Missing account_access_status means active. Permission without the relationship is false.';

-- Trigger predicate. Consumes a present token so it authorizes one insert.
-- Returns true only when NEW is the authorized Prospect.
create or replace function public.unclaimed_getoblic_prospect_insert_authorized(
  p_prospect_id uuid,
  p_organization_id uuid,
  p_source text,
  p_raw_json jsonb
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_token text;
  v_parts text[];
begin
  v_token := pg_catalog.current_setting(
    'athena.unclaimed_getoblic_prospect_authorization',
    true
  );

  if v_token is null or v_token = '' then
    return false;
  end if;

  -- Single-use even when NEW does not match the token.
  perform pg_catalog.set_config(
    'athena.unclaimed_getoblic_prospect_authorization',
    '',
    true
  );

  select captured.parts
    into v_parts
  from pg_catalog.regexp_matches(
    v_token,
    '^v1[|]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[|]([1-9][0-9]{0,18})[|]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[|]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
  ) as captured(parts);

  if not found or v_parts is null or v_parts[4] is null then
    return false;
  end if;

  if v_parts[2]::numeric > 9223372036854775807 then
    return false;
  end if;

  if p_prospect_id is distinct from v_parts[3]::uuid then
    return false;
  end if;

  if p_organization_id is distinct from v_parts[1]::uuid then
    return false;
  end if;

  if p_source is distinct from 'getoblic' then
    return false;
  end if;

  if p_raw_json->>'origin' is distinct from 'getoblic_directory' then
    return false;
  end if;

  if public.prospect_canonical_wordpress_listing_id(p_raw_json)
     is distinct from v_parts[2]::bigint then
    return false;
  end if;

  return public.licensee_own_company_unclaimed_getoblic_authorized(p_organization_id);
end;
$$;

comment on function public.unclaimed_getoblic_prospect_insert_authorized(uuid, uuid, text, jsonb) is
  'True only when the transaction-local token matches this Prospect id, organization, source getoblic, origin getoblic_directory, and canonical listing id, and the Own Company contract currently authorizes that organization. Consumes the token. A normal insert with forged raw_json has no token and returns false.';

-- Service-role insertion contract. One new Prospect or the existing
-- same-organization canonical listing row. No listing-link write.
create or replace function public.acquire_unclaimed_getoblic_prospect(
  p_organization_id uuid,
  p_wordpress_listing_id bigint,
  p_business_name text,
  p_user_id uuid default null,
  p_website text default null,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_city text default null,
  p_state text default null,
  p_country text default null,
  p_category text default null,
  p_google_business_url text default null
)
returns table (
  prospect_id uuid,
  inserted boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_existing_id uuid;
  v_prospect_id uuid;
  v_nonce uuid;
  v_inserted_id uuid;
begin
  if p_organization_id is null then
    raise exception 'unclaimed_getoblic_prospecting_not_authorized'
      using errcode = 'P0001';
  end if;

  if p_wordpress_listing_id is null or p_wordpress_listing_id <= 0 then
    raise exception 'unclaimed_getoblic_listing_id_invalid'
      using errcode = 'P0001';
  end if;

  -- Lock order: organization, designated licensee, sub-account,
  -- access-status, then an existing Prospect row. The capacity trigger
  -- locks the same organization row again in this transaction.
  perform 1
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then
    raise exception 'unclaimed_getoblic_prospecting_not_authorized'
      using errcode = 'P0001';
  end if;

  perform 1
  from public.licensee_accounts
  where own_company_organization_id = p_organization_id
  for update;

  perform 1
  from public.licensee_sub_accounts
  where organization_id = p_organization_id
  for update;

  perform 1
  from public.account_access_status
  where user_id in (
    select user_id
    from public.licensee_accounts
    where own_company_organization_id = p_organization_id
  )
  for update;

  if not public.licensee_own_company_unclaimed_getoblic_authorized(p_organization_id) then
    raise exception 'unclaimed_getoblic_prospecting_not_authorized'
      using errcode = 'P0001';
  end if;

  select prospect_row.id
    into v_existing_id
  from public.prospects prospect_row
  where prospect_row.organization_id = p_organization_id
    and prospect_row.source = 'getoblic'
    and prospect_row.raw_json->>'origin' = 'getoblic_directory'
    and public.prospect_canonical_wordpress_listing_id(prospect_row.raw_json) = p_wordpress_listing_id
  order by prospect_row.created_at asc, prospect_row.id asc
  limit 1
  for update;

  if found then
    prospect_id := v_existing_id;
    inserted := false;
    return next;
    return;
  end if;

  if p_business_name is null or length(btrim(p_business_name)) = 0 then
    raise exception 'unclaimed_getoblic_business_name_required'
      using errcode = 'P0001';
  end if;

  v_prospect_id := pg_catalog.gen_random_uuid();
  v_nonce := pg_catalog.gen_random_uuid();

  perform pg_catalog.set_config(
    'athena.unclaimed_getoblic_prospect_authorization',
    'v1|'
      || lower(p_organization_id::text)
      || '|'
      || p_wordpress_listing_id::text
      || '|'
      || lower(v_prospect_id::text)
      || '|'
      || lower(v_nonce::text),
    true
  );

  insert into public.prospects (
    id,
    organization_id,
    user_id,
    business_name,
    website,
    email,
    phone,
    address,
    city,
    state,
    country,
    category,
    google_business_url,
    source,
    status,
    raw_json,
    last_activity
  ) values (
    v_prospect_id,
    p_organization_id,
    p_user_id,
    btrim(p_business_name),
    nullif(btrim(p_website), ''),
    nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_address), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_state), ''),
    nullif(btrim(p_country), ''),
    nullif(btrim(p_category), ''),
    nullif(btrim(p_google_business_url), ''),
    'getoblic',
    'Saved',
    pg_catalog.jsonb_build_object(
      'origin', 'getoblic_directory',
      'wordpress_listing_id', p_wordpress_listing_id,
      'observed', pg_catalog.jsonb_build_object(
        'wordpress_listing_id', p_wordpress_listing_id
      )
    ),
    pg_catalog.now()
  )
  returning id into v_inserted_id;

  perform pg_catalog.set_config(
    'athena.unclaimed_getoblic_prospect_authorization',
    '',
    true
  );

  if v_inserted_id is distinct from v_prospect_id then
    raise exception 'unclaimed_getoblic_prospecting_not_authorized'
      using errcode = 'P0001';
  end if;

  prospect_id := v_inserted_id;
  inserted := true;
  return next;
  return;
end;
$$;

comment on function public.acquire_unclaimed_getoblic_prospect(uuid, bigint, text, uuid, text, text, text, text, text, text, text, text, text) is
  'Service-role-only unclaimed GetOblic Prospect acquisition. Inserts one Saved getoblic_directory Prospect or returns the existing same-organization canonical listing row. Does not write listing links, does not merge on website or name and city, and does not exempt any other insert.';

-- Ordinary inserts keep the organization lock and the 300-row count.
-- The exemption branch runs only after that lock and only for a token
-- that matches the row being inserted.
create or replace function public.enforce_organization_prospect_capacity()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
  v_limit integer;
begin
  -- Serialization primitive: one Prospect-capacity decision at a time
  -- per organization. Held through the count that authorizes an ordinary
  -- insert. Also held for an exempt insert so the two paths cannot race.
  perform 1
  from public.organizations
  where id = NEW.organization_id
  for update;

  if public.unclaimed_getoblic_prospect_insert_authorized(
    NEW.id,
    NEW.organization_id,
    NEW.source,
    NEW.raw_json
  ) then
    return NEW;
  end if;

  v_limit := public.organization_prospect_capacity_limit();

  select count(*)
    into v_count
  from public.prospects
  where organization_id = NEW.organization_id;

  if v_count >= v_limit then
    raise exception 'prospect_capacity_exceeded'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists prospects_enforce_organization_capacity on prospects;

create trigger prospects_enforce_organization_capacity
  before insert on prospects
  for each row
  execute function public.enforce_organization_prospect_capacity();

comment on function public.enforce_organization_prospect_capacity() is
  'BEFORE INSERT race-safe Prospect capacity guard. Locks the organization row and enforces organization_prospect_capacity_limit() for ordinary inserts. Skips that count only when unclaimed_getoblic_prospect_insert_authorized() matches NEW.id, NEW.organization_id, source getoblic, origin getoblic_directory, and the canonical listing id for a current Own Company authorization. Forged provenance on a normal insert is not an exemption.';

revoke all on function public.prospect_canonical_wordpress_listing_id(jsonb) from public;
revoke all on function public.prospect_canonical_wordpress_listing_id(jsonb) from anon;
revoke all on function public.prospect_canonical_wordpress_listing_id(jsonb) from authenticated;
grant execute on function public.prospect_canonical_wordpress_listing_id(jsonb) to service_role;

revoke all on function public.licensee_own_company_unclaimed_getoblic_authorized(uuid) from public;
revoke all on function public.licensee_own_company_unclaimed_getoblic_authorized(uuid) from anon;
revoke all on function public.licensee_own_company_unclaimed_getoblic_authorized(uuid) from authenticated;
grant execute on function public.licensee_own_company_unclaimed_getoblic_authorized(uuid) to service_role;

revoke all on function public.unclaimed_getoblic_prospect_insert_authorized(uuid, uuid, text, jsonb) from public;
revoke all on function public.unclaimed_getoblic_prospect_insert_authorized(uuid, uuid, text, jsonb) from anon;
revoke all on function public.unclaimed_getoblic_prospect_insert_authorized(uuid, uuid, text, jsonb) from authenticated;
grant execute on function public.unclaimed_getoblic_prospect_insert_authorized(uuid, uuid, text, jsonb) to service_role;

revoke all on function public.acquire_unclaimed_getoblic_prospect(uuid, bigint, text, uuid, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.acquire_unclaimed_getoblic_prospect(uuid, bigint, text, uuid, text, text, text, text, text, text, text, text, text) from anon;
revoke all on function public.acquire_unclaimed_getoblic_prospect(uuid, bigint, text, uuid, text, text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.acquire_unclaimed_getoblic_prospect(uuid, bigint, text, uuid, text, text, text, text, text, text, text, text, text) to service_role;

revoke all on function public.enforce_organization_prospect_capacity() from public;
revoke all on function public.enforce_organization_prospect_capacity() from anon;
revoke all on function public.enforce_organization_prospect_capacity() from authenticated;
grant execute on function public.enforce_organization_prospect_capacity() to service_role;
