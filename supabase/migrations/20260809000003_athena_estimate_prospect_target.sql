-- Athena V27 L13 — Optional Prospect commercial target on Athena Estimates.
-- Additive only. Extends V26 athena_estimates without altering estimate_v1,
-- request_json, package_json shape, Hide, Ask Athena, SEO, Ads, or Quote.
--
-- Org-only Estimates remain fully valid with all three columns NULL.
-- Prospect-targeted Estimates freeze business name at create time and may
-- freeze bounded generation context atomically at Ready completion.
-- Prospect deletion: ON DELETE SET NULL on prospect_id; snapshot + frozen
-- context are retained (CHECK permits null id with retained snapshot).
--
-- Operator applies this migration manually. Do not auto-apply from app code.

-- ---------------------------------------------------------------------------
-- athena_estimates — Prospect target columns
-- ---------------------------------------------------------------------------
alter table athena_estimates
  add column if not exists prospect_id uuid null
    references prospects(id) on delete set null;

alter table athena_estimates
  add column if not exists prospect_business_name_snapshot text null;

alter table athena_estimates
  add column if not exists prospect_generation_context_json jsonb null;

-- Live Prospect id requires a frozen business-name snapshot.
-- After Prospect deletion: prospect_id becomes NULL while snapshot (and any
-- Ready frozen context) remain — CHECK still holds.
alter table athena_estimates
  drop constraint if exists athena_estimates_prospect_target_chk;

alter table athena_estimates
  add constraint athena_estimates_prospect_target_chk
  check (
    prospect_id is null
    or (
      prospect_business_name_snapshot is not null
      and char_length(trim(prospect_business_name_snapshot)) > 0
    )
  );

comment on column athena_estimates.prospect_id is
  'Optional commercial Prospect target. Nullable; ON DELETE SET NULL retains Estimate history after Prospect removal.';
comment on column athena_estimates.prospect_business_name_snapshot is
  'Frozen Prospect business name at Estimate creation. Retained after Prospect rename or deletion.';
comment on column athena_estimates.prospect_generation_context_json is
  'Ready-only immutable freeze of bounded Prospect generation context (estimate_prospect_context_v1). Null for org-only Estimates.';

-- FK deletion / future prospect-scoped lookups (partial — only targeted rows).
create index if not exists athena_estimates_prospect_id_idx
  on athena_estimates (prospect_id)
  where prospect_id is not null;

-- ---------------------------------------------------------------------------
-- complete RPC — optional atomic Prospect generation-context freeze
-- Signature change requires drop + recreate (CREATE OR REPLACE cannot alter args).
-- Existing 3-arg callers remain valid via DEFAULT null on the 4th parameter.
-- ---------------------------------------------------------------------------
drop function if exists complete_athena_estimate_generation_job(uuid, uuid, jsonb);

create or replace function complete_athena_estimate_generation_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_package_json jsonb,
  p_prospect_generation_context_json jsonb default null
)
returns athena_estimate_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job athena_estimate_generation_jobs;
  v_now timestamptz := now();
  v_currency_code text;
  v_geography_label text;
  v_currency_resolution text;
  v_instruction_config_key text;
  v_instruction_revision_id uuid;
  v_instruction_configured boolean;
begin
  if p_package_json is null then
    raise exception 'package_json required';
  end if;

  update athena_estimate_generation_jobs
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

  v_currency_code := nullif(
    trim(coalesce(p_package_json->'recommendedClientPrice'->>'currencyCode', '')),
    ''
  );

  if jsonb_typeof(p_package_json->'geographyLabel') = 'string' then
    v_geography_label := nullif(trim(p_package_json->>'geographyLabel'), '');
  else
    v_geography_label := null;
  end if;

  if p_package_json->>'currencyResolution' in ('derived', 'fallback') then
    v_currency_resolution := p_package_json->>'currencyResolution';
  else
    v_currency_resolution := null;
  end if;

  v_instruction_config_key := nullif(
    trim(coalesce(p_package_json->'instructionProvenance'->>'configKey', '')),
    ''
  );

  begin
    v_instruction_revision_id := nullif(
      trim(coalesce(p_package_json->'instructionProvenance'->>'revisionId', '')),
      ''
    )::uuid;
  exception
    when invalid_text_representation then
      v_instruction_revision_id := null;
  end;

  v_instruction_configured := coalesce(
    (p_package_json->'instructionProvenance'->>'configured')::boolean,
    false
  );

  -- Ready packages and frozen Prospect generation context are immutable.
  -- Stale-job reconciliation may complete with the existing package/context,
  -- but must never replace Ready JSON with different values.
  update athena_estimates
  set
    status = 'Ready',
    generation_stage = 'completed',
    package_json = case
      when status = 'Ready' and package_json is not null then package_json
      else p_package_json
    end,
    prospect_generation_context_json = case
      when status = 'Ready' and package_json is not null
        then prospect_generation_context_json
      when p_prospect_generation_context_json is not null
        then p_prospect_generation_context_json
      else prospect_generation_context_json
    end,
    currency_code = case
      when status = 'Ready' and package_json is not null then currency_code
      else v_currency_code
    end,
    geography_label = case
      when status = 'Ready' and package_json is not null then geography_label
      else v_geography_label
    end,
    currency_resolution = case
      when status = 'Ready' and package_json is not null then currency_resolution
      else v_currency_resolution
    end,
    instruction_config_key = case
      when status = 'Ready' and package_json is not null then instruction_config_key
      else v_instruction_config_key
    end,
    instruction_revision_id = case
      when status = 'Ready' and package_json is not null then instruction_revision_id
      else v_instruction_revision_id
    end,
    instruction_configured = case
      when status = 'Ready' and package_json is not null then instruction_configured
      else v_instruction_configured
    end,
    error_code = null,
    error_message = null,
    updated_at = v_now
  where id = v_job.estimate_id;

  return v_job;
end;
$$;

revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) from public;
revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) from anon;
revoke all on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function complete_athena_estimate_generation_job(uuid, uuid, jsonb, jsonb) to service_role;
