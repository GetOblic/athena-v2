-- Athena V14 Stage 5 — additive Persona deep-scrape source support.
-- Preserves brain + prospect source types and all existing constraints.
-- Does not add a persona_deep_scrape generation trigger (reuse prospect_deep_scrape).

-- ---------------------------------------------------------------------------
-- persona_id column
-- ---------------------------------------------------------------------------
alter table athena_website_deep_scrape_jobs
  add column if not exists persona_id uuid references personas(id) on delete cascade;

create index if not exists athena_website_deep_scrape_jobs_persona_idx
  on athena_website_deep_scrape_jobs (persona_id, created_at desc)
  where persona_id is not null;

-- ---------------------------------------------------------------------------
-- source_type CHECK: append persona only
-- ---------------------------------------------------------------------------
alter table athena_website_deep_scrape_jobs
  drop constraint if exists athena_website_deep_scrape_jobs_source_type_check;

alter table athena_website_deep_scrape_jobs
  add constraint athena_website_deep_scrape_jobs_source_type_check
  check (source_type in ('brain', 'prospect', 'persona'));

-- ---------------------------------------------------------------------------
-- source ownership CHECK: append persona branch; preserve brain/prospect
-- ---------------------------------------------------------------------------
alter table athena_website_deep_scrape_jobs
  drop constraint if exists athena_website_deep_scrape_jobs_source_ck;

alter table athena_website_deep_scrape_jobs
  add constraint athena_website_deep_scrape_jobs_source_ck check (
    (
      source_type = 'brain'
      and identity_id is not null
      and prospect_id is null
      and persona_id is null
    )
    or
    (
      source_type = 'prospect'
      and prospect_id is not null
      and identity_id is null
      and persona_id is null
    )
    or
    (
      source_type = 'persona'
      and persona_id is not null
      and identity_id is null
      and prospect_id is null
    )
  );

-- One active deep-scrape job per Persona
create unique index if not exists athena_website_deep_scrape_jobs_one_active_persona
  on athena_website_deep_scrape_jobs (persona_id)
  where source_type = 'persona'
    and persona_id is not null
    and status in ('queued', 'processing', 'awaiting_follow_on', 'retryable');

-- ---------------------------------------------------------------------------
-- Claim RPC: resume regenerating for persona (same as prospect Phase B)
-- ---------------------------------------------------------------------------
create or replace function claim_athena_website_deep_scrape_job(
  p_worker_id text,
  p_claim_token uuid,
  p_lease_seconds integer default 120
)
returns athena_website_deep_scrape_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_website_deep_scrape_jobs;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 120), 30);
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'worker_id required';
  end if;

  if p_claim_token is null then
    raise exception 'claim_token required';
  end if;

  select j.*
  into v_job
  from athena_website_deep_scrape_jobs j
  where
    (
      j.status = 'queued'
      or (
        j.status = 'retryable'
        and (j.next_attempt_at is null or j.next_attempt_at <= v_now)
      )
      or (
        j.status = 'processing'
        and j.claim_expires_at is not null
        and j.claim_expires_at < v_now
      )
    )
  order by j.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update athena_website_deep_scrape_jobs
  set
    status = 'processing',
    claimed_by = trim(p_worker_id),
    claim_token = p_claim_token,
    claimed_at = v_now,
    claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
    heartbeat_at = v_now,
    started_at = coalesce(started_at, v_now),
    attempt_count = attempt_count + 1,
    current_stage = case
      when promoted_at is not null and source_type = 'brain' then 'retraining'
      when promoted_at is not null and source_type in ('prospect', 'persona') then 'regenerating'
      when current_stage in ('completed', 'failed') then 'discovering'
      when current_stage = 'queued' then 'discovering'
      else current_stage
    end,
    updated_at = v_now,
    error_code = null,
    error_message = null
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from public;
revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from anon;
revoke all on function claim_athena_website_deep_scrape_job(text, uuid, integer) from authenticated;

comment on column athena_website_deep_scrape_jobs.persona_id is
  'Persona source for deep scrape jobs when source_type = persona. Null for brain/prospect.';
