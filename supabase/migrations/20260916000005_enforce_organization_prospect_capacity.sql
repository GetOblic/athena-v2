-- Athena V2 — organization Prospect capacity (300).
-- Additive only. Does not alter GetOblic listing capacity, directory
-- settings, listing links, allocation events, or existing Prospect rows.
-- Do not apply this migration from application code.
--
-- Product rule: each organization / Athena sub-account may hold at most
-- 300 Prospect rows. Soft-delete does not exist; every prospects row for
-- organization_id counts. GetOblic listing links and allocation events
-- are not counted.
--
-- App-level count-then-insert can race (two concurrent creates at 299
-- both observe remaining = 1). The TypeScript contract in
-- services/prospects/prospectCapacity.ts is the product constant and
-- friendly preflight. This trigger is the race-safe backstop: lock the
-- organization row, count existing Prospects, reject the insert that
-- would become #301.

create or replace function organization_prospect_capacity_limit()
returns integer
language sql
immutable
as $$
  select 300;
$$;

comment on function organization_prospect_capacity_limit() is
  'Universal Athena V2 held-Prospect limit per organization. Mirrors services/prospects/prospectCapacity.ts MAX_PROSPECTS_PER_ORGANIZATION. Not GetOblic listing capacity.';

create or replace function enforce_organization_prospect_capacity()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
  v_limit integer;
begin
  v_limit := organization_prospect_capacity_limit();

  -- Serialization primitive: one Prospect-capacity decision at a time
  -- per organization. Held through the count that authorizes this insert.
  perform 1
  from organizations
  where id = NEW.organization_id
  for update;

  select count(*)
    into v_count
  from prospects
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
  execute function enforce_organization_prospect_capacity();

comment on function enforce_organization_prospect_capacity() is
  'BEFORE INSERT race-safe Prospect capacity guard. Locks organizations for the row, counts prospects for that organization_id, and rejects inserts at or above organization_prospect_capacity_limit(). Does not inspect GetOblic listing links or settings.';

revoke all on function organization_prospect_capacity_limit() from public;
revoke all on function organization_prospect_capacity_limit() from anon;
revoke all on function organization_prospect_capacity_limit() from authenticated;
grant execute on function organization_prospect_capacity_limit() to service_role;
