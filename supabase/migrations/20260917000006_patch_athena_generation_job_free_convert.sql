-- Athena V2 FREE-11 follow-up — attach consume/release to the generic
-- discussion worker RPCs the prospect worker already calls.
-- Do not edit 20260917000005_add_organization_free_convert.sql.
-- Do not apply this migration from application code.
--
-- complete_athena_generation_job / fail_athena_generation_job keep their
-- existing signatures, locking, claim ownership, retry semantics, returned
-- row shape, and service-role-only execute. After a successful job row
-- completion, consume_athena_free_convert is a no-op unless the discussion
-- belongs to the exact reserved prospect. Terminal fail releases only that
-- exact reservation. Retryable failures stay reserved.

create or replace function complete_athena_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_analysis_id uuid default null,
  p_opportunity_id uuid default null,
  p_review_id uuid default null,
  p_blueprint_id uuid default null,
  p_executive_version_id uuid default null,
  p_published_version_id uuid default null
)
returns athena_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_generation_jobs;
  v_now timestamptz := now();
  v_prospect_id uuid;
begin
  update athena_generation_jobs
  set
    status = 'completed',
    current_stage = 'completed',
    analysis_id = coalesce(p_analysis_id, analysis_id),
    opportunity_id = coalesce(p_opportunity_id, opportunity_id),
    review_id = coalesce(p_review_id, review_id),
    blueprint_id = coalesce(p_blueprint_id, blueprint_id),
    executive_version_id = coalesce(p_executive_version_id, executive_version_id),
    published_version_id = coalesce(p_published_version_id, published_version_id, p_executive_version_id, executive_version_id),
    completed_at = v_now,
    updated_at = v_now,
    claim_expires_at = null,
    error_code = null,
    error_message = null
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  if not found then
    return v_job;
  end if;

  select p.id
    into v_prospect_id
  from prospects p
  where p.linked_discussion_id = v_job.discussion_id
    and p.organization_id = v_job.organization_id
  limit 1;

  if v_prospect_id is not null then
    -- Free Convert consumption is a no-op unless this prospect is the reserved starter.
    perform consume_athena_free_convert(v_job.organization_id, v_prospect_id);
  end if;

  return v_job;
end;
$$;

revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from authenticated;
grant execute on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to service_role;

create or replace function fail_athena_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default false,
  p_next_attempt_at timestamptz default null,
  p_error_metadata jsonb default null,
  p_failed_stage text default null
)
returns athena_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_generation_jobs;
  v_now timestamptz := now();
  v_status text;
  v_prospect_id uuid;
begin
  select * into v_job
  from athena_generation_jobs
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

  update athena_generation_jobs
  set
    status = v_status,
    current_stage = coalesce(p_failed_stage, current_stage),
    error_code = left(coalesce(p_error_code, 'UNKNOWN'), 120),
    error_message = left(coalesce(p_error_message, 'Generation failed'), 1000),
    error_metadata = p_error_metadata,
    next_attempt_at = case
      when v_status = 'retryable' then coalesce(p_next_attempt_at, v_now + interval '30 seconds')
      else null
    end,
    completed_at = case when v_status = 'failed' then v_now else null end,
    claim_expires_at = null,
    claim_token = null,
    claimed_by = null,
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  if v_status = 'failed' then
    select p.id
      into v_prospect_id
    from prospects p
    where p.linked_discussion_id = v_job.discussion_id
      and p.organization_id = v_job.organization_id
    limit 1;

    if v_prospect_id is not null then
      perform release_athena_free_convert(
        v_job.organization_id,
        v_prospect_id,
        null
      );
    end if;
  end if;

  return v_job;
end;
$$;

revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from public;
revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from anon;
revoke all on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) from authenticated;
grant execute on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) to service_role;

comment on function complete_athena_generation_job(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) is
  'Token-gated discussion job completion. After the job row completes, consume_athena_free_convert runs only when the discussion belongs to the exact reserved Free Convert prospect.';
comment on function fail_athena_generation_job(uuid, uuid, text, text, boolean, timestamptz, jsonb, text) is
  'Token-gated discussion job fail/retry. Terminal failed releases the exact reserved Free Convert prospect. Retryable stays reserved.';
