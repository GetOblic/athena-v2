-- Athena V2 FREE-10 — one-time Free Generate Traction advertising campaign.
-- Additive organization product state only. Not a quota table, entitlement
-- engine, or campaign-count heuristic.
-- Do not apply this migration from application code.
--
-- Invariant:
--   A Free Traction reservation is organization-scoped.
--   Acquisition is a single-row compare-and-swap on organizations
--   (SELECT ... FOR UPDATE). At most one reserved Free campaign exists.
--   Reservation is acquired BEFORE a second request can create another
--   ad_campaigns row or generation job.
--   Worker retryable failures stay reserved.
--   Ready consumes only when free_traction_campaign_id matches.
--   Terminal Processing Failed releases only that exact reservation.
--   Existing Ready ad_campaigns evidence is lazily marked consumed so a
--   Full -> Free organization cannot obtain an additional Free-funded run.
--   consumed is historical and is never cleared by product plan changes
--   or by deleting the consumed campaign.
--
-- Crash window:
--   reserved + campaign_id IS NULL, or reserved + non-Ready campaign with
--   no active generation job, after process death before bind/enqueue.
--   Recovery happens only inside reserve_athena_free_traction after
--   free_traction_reserved_at is older than 2 minutes.
--   Bound Processing Failed is never recovered into a new unbound campaign.
--   Page load never acquires, binds, consumes, or releases.

alter table organizations
  add column if not exists free_traction_status text;

alter table organizations
  add column if not exists free_traction_campaign_id uuid;

alter table organizations
  add column if not exists free_traction_reserved_at timestamptz;

alter table organizations
  add column if not exists free_traction_reservation_token uuid;

alter table organizations
  drop constraint if exists organizations_free_traction_status_check;

alter table organizations
  add constraint organizations_free_traction_status_check
  check (
    free_traction_status is null
    or free_traction_status in ('reserved', 'consumed')
  );

alter table organizations
  drop constraint if exists organizations_free_traction_state_check;

alter table organizations
  add constraint organizations_free_traction_state_check
  check (
    (
      free_traction_status is null
      and free_traction_reserved_at is null
      and free_traction_reservation_token is null
    )
    or (
      free_traction_status = 'reserved'
      and free_traction_reserved_at is not null
      and free_traction_reservation_token is not null
    )
    or (
      free_traction_status = 'consumed'
      and free_traction_campaign_id is not null
      and free_traction_reserved_at is null
      and free_traction_reservation_token is null
    )
  );

comment on column organizations.free_traction_status is
  'One-time Free Advertising campaign authority: null (available), reserved, consumed. Historical consumed is never cleared by plan change or campaign delete.';
comment on column organizations.free_traction_campaign_id is
  'Ad campaign bound to the current reserved starter, the consumed starter, or the last released failed attempt. Not a count heuristic.';
comment on column organizations.free_traction_reserved_at is
  'Reservation timestamp used only to recover a crash before bind/enqueue. Not a page-load lock.';
comment on column organizations.free_traction_reservation_token is
  'Compare-and-swap token for the active reservation. Bind and unbound release must match it.';

create or replace function consume_athena_free_traction(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns table (
  consumed boolean,
  already boolean,
  ignored boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_campaign_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_id required';
  end if;

  select o.free_traction_status, o.free_traction_campaign_id
    into v_status, v_campaign_id
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    consumed := false;
    already := false;
    ignored := true;
    return next;
    return;
  end if;

  if v_status = 'consumed' and v_campaign_id = p_campaign_id then
    consumed := false;
    already := true;
    ignored := false;
    return next;
    return;
  end if;

  if v_status is distinct from 'reserved' or v_campaign_id is distinct from p_campaign_id then
    consumed := false;
    already := false;
    ignored := true;
    return next;
    return;
  end if;

  update organizations
  set
    free_traction_status = 'consumed',
    free_traction_campaign_id = p_campaign_id,
    free_traction_reserved_at = null,
    free_traction_reservation_token = null,
    updated_at = now()
  where id = p_organization_id
    and free_traction_status = 'reserved'
    and free_traction_campaign_id = p_campaign_id;

  consumed := found;
  already := false;
  ignored := not found;
  return next;
end;
$$;

create or replace function release_athena_free_traction(
  p_organization_id uuid,
  p_campaign_id uuid default null,
  p_reservation_token uuid default null
)
returns table (
  released boolean,
  ignored boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_campaign_id uuid;
  v_token uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_traction_status,
    o.free_traction_campaign_id,
    o.free_traction_reservation_token
    into v_status, v_campaign_id, v_token
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found or v_status is distinct from 'reserved' then
    released := false;
    ignored := true;
    return next;
    return;
  end if;

  if not (
    (p_campaign_id is not null and v_campaign_id = p_campaign_id)
    or (
      v_campaign_id is null
      and p_reservation_token is not null
      and v_token = p_reservation_token
    )
  ) then
    released := false;
    ignored := true;
    return next;
    return;
  end if;

  update organizations
  set
    free_traction_status = null,
    free_traction_reserved_at = null,
    free_traction_reservation_token = null,
    free_traction_campaign_id = coalesce(p_campaign_id, v_campaign_id),
    updated_at = now()
  where id = p_organization_id
    and free_traction_status = 'reserved';

  released := found;
  ignored := not found;
  return next;
end;
$$;

create or replace function bind_athena_free_traction_campaign(
  p_organization_id uuid,
  p_reservation_token uuid,
  p_campaign_id uuid
)
returns table (
  bound boolean,
  conflicted boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if p_reservation_token is null then
    raise exception 'reservation_token required';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_id required';
  end if;

  perform 1
  from organizations o
  where o.id = p_organization_id
  for update;

  update organizations
  set
    free_traction_campaign_id = p_campaign_id,
    updated_at = now()
  where id = p_organization_id
    and free_traction_status = 'reserved'
    and free_traction_reservation_token = p_reservation_token
    and free_traction_campaign_id is null;

  if found then
    bound := true;
    conflicted := false;
    return next;
    return;
  end if;

  bound := false;
  conflicted := true;
  return next;
end;
$$;

create or replace function reserve_athena_free_traction(
  p_organization_id uuid
)
returns table (
  reserved boolean,
  recovered boolean,
  already_reserved boolean,
  already_consumed boolean,
  reservation_token uuid,
  campaign_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_campaign_id uuid;
  v_reserved_at timestamptz;
  v_token uuid;
  v_campaign_status text;
  v_ready_id uuid;
  v_has_active_job boolean := false;
  v_has_in_flight boolean := false;
  v_stale interval := interval '2 minutes';
  v_can_recover boolean := false;
  v_reuse_failed boolean := false;
  v_new_token uuid := gen_random_uuid();
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  select
    o.free_traction_status,
    o.free_traction_campaign_id,
    o.free_traction_reserved_at,
    o.free_traction_reservation_token
    into v_status, v_campaign_id, v_reserved_at, v_token
  from organizations o
  where o.id = p_organization_id
  for update;

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := false;
    reservation_token := null;
    campaign_id := null;
    return next;
    return;
  end if;

  if v_status = 'consumed' then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    campaign_id := v_campaign_id;
    return next;
    return;
  end if;

  if v_status = 'reserved' then
    if v_campaign_id is not null then
      select c.status
        into v_campaign_status
      from ad_campaigns c
      where c.id = v_campaign_id
        and c.organization_id = p_organization_id;

      if v_campaign_status = 'Ready' then
        perform consume_athena_free_traction(p_organization_id, v_campaign_id);
        reserved := false;
        recovered := false;
        already_reserved := false;
        already_consumed := true;
        reservation_token := null;
        campaign_id := v_campaign_id;
        return next;
        return;
      end if;

      select exists(
        select 1
        from athena_ad_generation_jobs j
        where j.organization_id = p_organization_id
          and j.campaign_id = v_campaign_id
          and j.status in ('queued', 'processing', 'retryable')
      ) into v_has_active_job;
    end if;

    -- Never mint a second campaign from a bound Processing Failed reservation.
    -- Retry must reuse the same campaign through /generate or same-campaign POST.
    if v_campaign_status = 'Processing Failed' then
      reserved := false;
      recovered := false;
      already_reserved := true;
      already_consumed := false;
      reservation_token := v_token;
      campaign_id := v_campaign_id;
      return next;
      return;
    end if;

    v_can_recover :=
      (
        v_campaign_id is null
        and (v_reserved_at is null or v_reserved_at <= now() - v_stale)
      )
      or (
        v_campaign_id is not null
        and not v_has_active_job
        and v_campaign_status is distinct from 'Ready'
        and v_campaign_status is distinct from 'Processing Failed'
        and (v_reserved_at is null or v_reserved_at <= now() - v_stale)
      );

    if not v_can_recover then
      reserved := false;
      recovered := false;
      already_reserved := true;
      already_consumed := false;
      reservation_token := v_token;
      campaign_id := v_campaign_id;
      return next;
      return;
    end if;

    -- Bound enqueue-crash: refresh the token and keep the same campaign.
    if v_campaign_id is not null then
      update organizations
      set
        free_traction_status = 'reserved',
        free_traction_campaign_id = v_campaign_id,
        free_traction_reserved_at = now(),
        free_traction_reservation_token = v_new_token,
        updated_at = now()
      where id = p_organization_id
        and free_traction_status = 'reserved'
        and free_traction_campaign_id = v_campaign_id;

      if found then
        reserved := true;
        recovered := true;
        already_reserved := false;
        already_consumed := false;
        reservation_token := v_new_token;
        campaign_id := v_campaign_id;
        return next;
        return;
      end if;
    end if;
  end if;

  -- Historical Ready evidence: lazily mark consumed. Never fund another run.
  select c.id
    into v_ready_id
  from ad_campaigns c
  where c.organization_id = p_organization_id
    and c.status = 'Ready'
  order by c.updated_at desc nulls last
  limit 1;

  if v_ready_id is not null then
    update organizations
    set
      free_traction_status = 'consumed',
      free_traction_campaign_id = v_ready_id,
      free_traction_reserved_at = null,
      free_traction_reservation_token = null,
      updated_at = now()
    where id = p_organization_id
      and free_traction_status is distinct from 'consumed';

    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    campaign_id := v_ready_id;
    return next;
    return;
  end if;

  -- Historical in-flight during Full -> Free: do not cancel, do not mint another.
  select exists(
    select 1
    from ad_campaigns c
    where c.organization_id = p_organization_id
      and c.status in ('Queued', 'Processing')
  ) into v_has_in_flight;

  if v_has_in_flight then
    reserved := false;
    recovered := false;
    already_reserved := true;
    already_consumed := false;
    reservation_token := null;
    campaign_id := v_campaign_id;
    return next;
    return;
  end if;

  -- Released failed starter: re-reserve the exact same campaign. Never mint another.
  if v_campaign_id is not null then
    select c.status
      into v_campaign_status
    from ad_campaigns c
    where c.id = v_campaign_id
      and c.organization_id = p_organization_id;

    v_reuse_failed := v_campaign_status = 'Processing Failed';
  end if;

  update organizations
  set
    free_traction_status = 'reserved',
    free_traction_campaign_id = case
      when v_reuse_failed then v_campaign_id
      else null
    end,
    free_traction_reserved_at = now(),
    free_traction_reservation_token = v_new_token,
    updated_at = now()
  where id = p_organization_id
    and (
      free_traction_status is null
      or free_traction_status = 'reserved'
    )
    and free_traction_status is distinct from 'consumed';

  if not found then
    reserved := false;
    recovered := false;
    already_reserved := false;
    already_consumed := true;
    reservation_token := null;
    campaign_id := v_campaign_id;
    return next;
    return;
  end if;

  reserved := true;
  recovered := v_status = 'reserved' or v_reuse_failed;
  already_reserved := false;
  already_consumed := false;
  reservation_token := v_new_token;
  campaign_id := case when v_reuse_failed then v_campaign_id else null end;
  return next;
end;
$$;

revoke all on function consume_athena_free_traction(uuid, uuid) from public;
revoke all on function consume_athena_free_traction(uuid, uuid) from anon;
revoke all on function consume_athena_free_traction(uuid, uuid) from authenticated;
grant execute on function consume_athena_free_traction(uuid, uuid) to service_role;

revoke all on function release_athena_free_traction(uuid, uuid, uuid) from public;
revoke all on function release_athena_free_traction(uuid, uuid, uuid) from anon;
revoke all on function release_athena_free_traction(uuid, uuid, uuid) from authenticated;
grant execute on function release_athena_free_traction(uuid, uuid, uuid) to service_role;

revoke all on function bind_athena_free_traction_campaign(uuid, uuid, uuid) from public;
revoke all on function bind_athena_free_traction_campaign(uuid, uuid, uuid) from anon;
revoke all on function bind_athena_free_traction_campaign(uuid, uuid, uuid) from authenticated;
grant execute on function bind_athena_free_traction_campaign(uuid, uuid, uuid) to service_role;

revoke all on function reserve_athena_free_traction(uuid) from public;
revoke all on function reserve_athena_free_traction(uuid) from anon;
revoke all on function reserve_athena_free_traction(uuid) from authenticated;
grant execute on function reserve_athena_free_traction(uuid) to service_role;

comment on function consume_athena_free_traction(uuid, uuid) is
  'Server-only. reserved -> consumed only when free_traction_campaign_id matches. Never clears consumed.';
comment on function release_athena_free_traction(uuid, uuid, uuid) is
  'Server-only. Releases reserved only for the matching campaign or unbound reservation token.';
comment on function bind_athena_free_traction_campaign(uuid, uuid, uuid) is
  'Server-only. Binds a newly created ad campaign to the exact reservation token.';
comment on function reserve_athena_free_traction(uuid) is
  'Server-only compare-and-swap Free Traction reservation. Recovers stale crash-window reservations. Lazily consumes historical Ready. Never clears consumed.';

create or replace function complete_athena_ad_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_package_json jsonb
)
returns athena_ad_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_ad_generation_jobs;
  v_now timestamptz := now();
  v_campaign_name text;
begin
  if p_package_json is null then
    raise exception 'package_json required';
  end if;

  update athena_ad_generation_jobs
  set
    status = 'completed',
    generation_stage = 'completed',
    completed_at = v_now,
    updated_at = v_now,
    claim_expires_at = null,
    claim_token = null,
    claimed_by = null,
    heartbeat_at = null,
    error_code = null,
    error_message = null
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  if not found then
    return null;
  end if;

  v_campaign_name := nullif(
    trim(coalesce(p_package_json->'strategy'->>'campaignName', '')),
    ''
  );

  update ad_campaigns
  set
    status = 'Ready',
    generation_stage = 'completed',
    package_json = p_package_json,
    name = coalesce(v_campaign_name, name),
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.campaign_id;

  -- Free Traction consumption is a no-op unless this campaign is the reserved starter.
  perform consume_athena_free_traction(v_job.organization_id, v_job.campaign_id);

  return v_job;
end;
$$;

revoke all on function complete_athena_ad_generation_job(uuid, uuid, jsonb) from public;
revoke all on function complete_athena_ad_generation_job(uuid, uuid, jsonb) from anon;
revoke all on function complete_athena_ad_generation_job(uuid, uuid, jsonb) from authenticated;
grant execute on function complete_athena_ad_generation_job(uuid, uuid, jsonb) to service_role;

create or replace function fail_athena_ad_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_ad_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_ad_generation_jobs;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_job
  from athena_ad_generation_jobs
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  for update;

  if not found then
    return null;
  end if;

  if p_retryable and v_job.attempt_count < v_job.max_attempts then
    v_status := 'retryable';
  else
    v_status := 'failed';
  end if;

  update athena_ad_generation_jobs
  set
    status = v_status,
    generation_stage = coalesce(p_failed_stage, generation_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'Ads generation failed'), 1000),
    error_metadata = p_error_metadata,
    next_attempt_at = case
      when v_status = 'retryable' then coalesce(p_next_attempt_at, v_now + interval '30 seconds')
      else null
    end,
    completed_at = case when v_status = 'failed' then v_now else null end,
    claim_expires_at = null,
    claim_token = null,
    claimed_by = null,
    heartbeat_at = null,
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  if v_status = 'failed' then
    update ad_campaigns
    set
      status = 'Processing Failed',
      generation_stage = 'failed',
      package_json = null,
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.campaign_id;

    perform release_athena_free_traction(
      v_job.organization_id,
      v_job.campaign_id,
      null
    );
  else
    -- retryable: keep campaign Processing so UI continues polling
    update ad_campaigns
    set
      status = 'Processing',
      generation_stage = coalesce(p_failed_stage, generation_stage),
      error_code = v_job.error_code,
      error_message = v_job.error_message,
      updated_at = v_now
    where id = v_job.campaign_id;
  end if;

  return v_job;
end;
$$;

revoke all on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_ad_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;
