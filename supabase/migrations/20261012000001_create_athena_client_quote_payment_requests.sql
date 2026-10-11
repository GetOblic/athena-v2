-- CQ-STRIPE-1 Gate 2A — Local payment-request intents for issued Client Quotes.
-- Additive only. Does not alter athena_client_quotes, athena_client_invoices,
-- athena_estimates, athena_client_quote_templates, organizations, or workers.
-- Does not call Stripe. Does not store payment status, refunds, or cancellations.
-- Stripe Price id, Payment Link id, and Payment Link URL may be written once
-- after insert. Commercial fields and idempotency keys stay immutable.
-- Amounts are frozen snapshot totals. Discounts and taxes are not reapplied.
-- Every chargeable purpose requires at least 50 minor units.
-- validUntil is the inclusive last civil day and takes precedence. Otherwise
-- validForDays counts from the UTC issue date. The next UTC midnight is exclusive.
-- Expiry blocks a new intent. Existing intents stay readable.
-- Source migration only. Do not apply this file from application code.
-- Do not run supabase db push or migration repair for this gate.
-- Apply manually in the isolated Athena V3 Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- athena_client_quote_payment_requests
-- One durable intent per quotation and purpose.
-- A quotation may have a one_time_full row, or the deposit/balance pair,
-- never both. Recurring purposes are independent of that choice.
-- service_role may select. Inserts go through the security-definer function.
-- ---------------------------------------------------------------------------
create table if not exists public.athena_client_quote_payment_requests (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references public.licensee_accounts(id) on delete cascade,

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  requested_by uuid
    references auth.users(id) on delete set null,

  source_quote_id uuid not null
    references public.athena_client_quotes(id) on delete restrict,

  purpose text not null,

  billing_frequency text not null,

  currency_code text not null,

  currency_scale smallint not null,

  amount_minor bigint not null,

  amount_source text not null,

  one_time_collection_mode text,

  one_time_total_minor bigint,

  deposit_minor bigint,

  balance_minor bigint,

  quote_number text not null,

  quote_issued_at timestamptz not null,

  settlement_account text not null,

  request_parameters jsonb not null,

  stripe_price_idempotency_key text not null,

  stripe_payment_link_idempotency_key text not null,

  stripe_price_id text,

  stripe_payment_link_id text,

  stripe_payment_link_url text,

  created_at timestamptz not null default now(),

  constraint athena_client_quote_payment_requests_purpose_chk
    check (
      purpose in (
        'one_time_full',
        'one_time_deposit',
        'one_time_balance',
        'monthly',
        'quarterly',
        'annually'
      )
    ),

  constraint athena_client_quote_payment_requests_frequency_chk
    check (billing_frequency in ('one_time', 'monthly', 'quarterly', 'annually')),

  constraint athena_client_quote_payment_requests_currency_chk
    check (currency_code in ('USD', 'EUR') and currency_scale = 2),

  constraint athena_client_quote_payment_requests_amount_chk
    check (amount_minor >= 50 and amount_minor <= 9007199254740991),

  constraint athena_client_quote_payment_requests_amount_source_chk
    check (amount_source in ('frequency_totals', 'legacy_one_time_totals')),

  constraint athena_client_quote_payment_requests_settlement_chk
    check (settlement_account = 'getoblic_central'),

  constraint athena_client_quote_payment_requests_quote_number_chk
    check (
      quote_number = btrim(quote_number)
      and char_length(quote_number) between 1 and 40
    ),

  constraint athena_client_quote_payment_requests_price_key_chk
    check (stripe_price_idempotency_key ~ '^cqpr_price_v1_[0-9a-f]{64}$'),

  constraint athena_client_quote_payment_requests_link_key_chk
    check (stripe_payment_link_idempotency_key ~ '^cqpr_link_v1_[0-9a-f]{64}$'),

  constraint athena_client_quote_payment_requests_idempotency_distinct_chk
    check (stripe_price_idempotency_key <> stripe_payment_link_idempotency_key),

  constraint athena_client_quote_payment_requests_stripe_price_id_chk
    check (
      stripe_price_id is null
      or stripe_price_id ~ '^price_[A-Za-z0-9]{8,80}$'
    ),

  constraint athena_client_quote_payment_requests_stripe_link_id_chk
    check (
      stripe_payment_link_id is null
      or stripe_payment_link_id ~ '^plink_[A-Za-z0-9]{8,80}$'
    ),

  constraint athena_client_quote_payment_requests_stripe_link_url_chk
    check (
      stripe_payment_link_url is null
      or stripe_payment_link_url ~ '^https://buy\.stripe\.com/(test_)?[A-Za-z0-9]{8,80}$'
    ),

  constraint athena_client_quote_payment_requests_stripe_link_pair_chk
    check (
      (
        stripe_payment_link_id is null
        and stripe_payment_link_url is null
      )
      or (
        stripe_payment_link_id is not null
        and stripe_payment_link_url is not null
      )
    ),

  constraint athena_client_quote_payment_requests_stripe_link_price_chk
    check (stripe_payment_link_id is null or stripe_price_id is not null),

  constraint athena_client_quote_payment_requests_shape_chk
    check (
      (
        purpose = 'one_time_full'
        and billing_frequency = 'one_time'
        and amount_source in ('frequency_totals', 'legacy_one_time_totals')
        and one_time_collection_mode = 'full'
        and one_time_total_minor = amount_minor
        and amount_minor >= 50
        and deposit_minor is null
        and balance_minor is null
      )
      or (
        purpose = 'one_time_deposit'
        and billing_frequency = 'one_time'
        and amount_source in ('frequency_totals', 'legacy_one_time_totals')
        and one_time_collection_mode = 'split'
        and deposit_minor = amount_minor
        and deposit_minor >= 50
        and deposit_minor <= 9007199254740991
        and balance_minor >= 50
        and balance_minor <= 9007199254740991
        and one_time_total_minor = deposit_minor + balance_minor
        and one_time_total_minor <= 9007199254740991
      )
      or (
        purpose = 'one_time_balance'
        and billing_frequency = 'one_time'
        and amount_source in ('frequency_totals', 'legacy_one_time_totals')
        and one_time_collection_mode = 'split'
        and balance_minor = amount_minor
        and deposit_minor >= 50
        and deposit_minor <= 9007199254740991
        and balance_minor >= 50
        and balance_minor <= 9007199254740991
        and one_time_total_minor = deposit_minor + balance_minor
        and one_time_total_minor <= 9007199254740991
      )
      or (
        purpose in ('monthly', 'quarterly', 'annually')
        and billing_frequency = purpose
        and amount_source = 'frequency_totals'
        and one_time_collection_mode is null
        and one_time_total_minor is null
        and deposit_minor is null
        and balance_minor is null
        and amount_minor >= 50
      )
    ),

  constraint athena_client_quote_payment_requests_parameters_chk
    check (
      jsonb_typeof(request_parameters) = 'object'
      and request_parameters->>'schemaVersion' = 'client_quote_payment_request_v1'
      and request_parameters->>'settlementAccount' = settlement_account
      and request_parameters->>'licenseeAccountId' = licensee_account_id::text
      and request_parameters->>'organizationId' = organization_id::text
      and request_parameters->>'sourceQuoteId' = source_quote_id::text
      and request_parameters->>'quoteNumber' = quote_number
      and jsonb_typeof(request_parameters->'quoteIssuedAt') = 'string'
      and request_parameters->>'purpose' = purpose
      and request_parameters->>'billingFrequency' = billing_frequency
      and request_parameters->>'currencyCode' = currency_code
      and request_parameters->>'currencyScale' = currency_scale::text
      and request_parameters->>'amountMinor' = amount_minor::text
      and request_parameters->>'amountSource' = amount_source
      and (
        (
          one_time_collection_mode is null
          and request_parameters->'oneTimeCollectionMode' = 'null'::jsonb
        )
        or request_parameters->>'oneTimeCollectionMode' = one_time_collection_mode
      )
      and (
        (
          one_time_total_minor is null
          and request_parameters->'oneTimeTotalMinor' = 'null'::jsonb
        )
        or request_parameters->>'oneTimeTotalMinor' = one_time_total_minor::text
      )
      and (
        (
          deposit_minor is null
          and request_parameters->'depositMinor' = 'null'::jsonb
        )
        or request_parameters->>'depositMinor' = deposit_minor::text
      )
      and (
        (
          balance_minor is null
          and request_parameters->'balanceMinor' = 'null'::jsonb
        )
        or request_parameters->>'balanceMinor' = balance_minor::text
      )
      and not (request_parameters ? 'stripePriceIdempotencyKey')
      and not (request_parameters ? 'stripePaymentLinkIdempotencyKey')
      and not (request_parameters ? 'stripePriceId')
      and not (request_parameters ? 'stripePaymentLinkId')
      and not (request_parameters ? 'stripePaymentLinkUrl')
      and not (request_parameters ? 'status')
      and not (request_parameters ? 'stripeStatus')
      and not (request_parameters ? 'amountPaidMinor')
    )
);

create unique index if not exists athena_client_quote_payment_requests_quote_purpose_uidx
  on public.athena_client_quote_payment_requests (source_quote_id, purpose);

create unique index if not exists athena_client_quote_payment_requests_price_key_uidx
  on public.athena_client_quote_payment_requests (stripe_price_idempotency_key);

create unique index if not exists athena_client_quote_payment_requests_link_key_uidx
  on public.athena_client_quote_payment_requests (stripe_payment_link_idempotency_key);

create unique index if not exists athena_client_quote_payment_requests_stripe_price_id_uidx
  on public.athena_client_quote_payment_requests (stripe_price_id)
  where stripe_price_id is not null;

create unique index if not exists athena_client_quote_payment_requests_stripe_link_id_uidx
  on public.athena_client_quote_payment_requests (stripe_payment_link_id)
  where stripe_payment_link_id is not null;

create unique index if not exists athena_client_quote_payment_requests_stripe_link_url_uidx
  on public.athena_client_quote_payment_requests (stripe_payment_link_url)
  where stripe_payment_link_url is not null;

create index if not exists athena_client_quote_payment_requests_licensee_quote_idx
  on public.athena_client_quote_payment_requests (
    licensee_account_id,
    source_quote_id,
    created_at
  );

comment on table public.athena_client_quote_payment_requests is
  'Licensee payment-link intents for an issued client quotation. Each row freezes one chargeable purpose from issued_snapshot_json. Settlement is the central GetOblic Stripe account. This is not a payment status, a Stripe object, or an invoice. service_role may select. Inserts go through create_client_quote_payment_request_intents. Stripe Price id, Payment Link id, and URL are written once through record_client_quote_payment_request_stripe_fulfillment.';

comment on column public.athena_client_quote_payment_requests.licensee_account_id is
  'Owning Licensee Master account. Authorization key. Cascade-deletes intents with the Licensee account.';

comment on column public.athena_client_quote_payment_requests.organization_id is
  'Operational client-organization context copied from the quotation. ON DELETE RESTRICT. Never sole authorization.';

comment on column public.athena_client_quote_payment_requests.requested_by is
  'Authenticated user who requested the intent. ON DELETE SET NULL. Not part of the idempotency parameters.';

comment on column public.athena_client_quote_payment_requests.source_quote_id is
  'Issued quotation that authorized the amount. ON DELETE RESTRICT. Masking or expiry of the quotation does not delete the intent.';

comment on column public.athena_client_quote_payment_requests.purpose is
  'one_time_full, one_time_deposit, one_time_balance, monthly, quarterly, or annually. Unique per quotation.';

comment on column public.athena_client_quote_payment_requests.amount_minor is
  'Frozen charge in minor units, at least 50 for every V1 purpose. USD and EUR scale 2 is 0.50 in major units when that charge currency is activated. This floor does not model conversion into a different settlement currency. Not recomputed from discounts, taxes, or a sum across frequencies.';

comment on column public.athena_client_quote_payment_requests.amount_source is
  'frequency_totals, or legacy_one_time_totals when the issued snapshot omits frequencyTotals.';

comment on column public.athena_client_quote_payment_requests.one_time_collection_mode is
  'full, split, or null for a recurring purpose. Full and split cannot both exist for one quotation.';

comment on column public.athena_client_quote_payment_requests.balance_minor is
  'Frozen one-time total minus frozen deposit. Null except on a split pair. Not an amount already paid.';

comment on column public.athena_client_quote_payment_requests.settlement_account is
  'getoblic_central. No Licensee connected account is stored in this gate.';

comment on column public.athena_client_quote_payment_requests.request_parameters is
  'Immutable client_quote_payment_request_v1 parameters. Stripe idempotency keys are derived from this object and stored in their own columns.';

comment on column public.athena_client_quote_payment_requests.stripe_price_idempotency_key is
  'Deterministic Stripe Price idempotency key. Stored for a later Stripe call. Not a Stripe identifier.';

comment on column public.athena_client_quote_payment_requests.stripe_payment_link_idempotency_key is
  'Deterministic Stripe Payment Link idempotency key. Separate from the Price key. Not a Stripe identifier. Derived from kind plus the sealed parameters, which include source quote and purpose.';

comment on column public.athena_client_quote_payment_requests.stripe_price_id is
  'Stripe Price id recorded after the intent exists. Null until then. Write-once. Not payment status.';

comment on column public.athena_client_quote_payment_requests.stripe_payment_link_id is
  'Stripe Payment Link id. Null until recorded with its URL. Write-once. Requires stripe_price_id. Not payment status.';

comment on column public.athena_client_quote_payment_requests.stripe_payment_link_url is
  'Stripe Payment Link URL on buy.stripe.com. Recorded with stripe_payment_link_id. Write-once. Not payment status.';

comment on column public.athena_client_quote_payment_requests.created_at is
  'When the intent was recorded. There is no updated_at. Commercial fields are not revised. Stripe identifiers are filled once through record_client_quote_payment_request_stripe_fulfillment.';

-- Nonnegative JSON minor unit. Null when the value is not a safe integer.
create or replace function public.client_quote_payment_json_minor(p_value jsonb)
returns bigint
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_text text;
  v_amount bigint;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) is distinct from 'number' then
    return null;
  end if;
  v_text := p_value::text;
  if v_text is null or v_text !~ '^[0-9]+$' or char_length(v_text) > 16 then
    return null;
  end if;
  v_amount := v_text::bigint;
  if v_amount < 0 or v_amount > 9007199254740991 then
    return null;
  end if;
  return v_amount;
end;
$$;

comment on function public.client_quote_payment_json_minor(jsonb) is
  'Reads a nonnegative JSON integer minor amount. Returns null for fractions, strings, and values above the JavaScript safe integer maximum. Does not round.';

-- Commercial columns and idempotency keys cannot change.
-- Stripe identifiers may move from null to a value, or stay the same.
-- Deletes are not blocked, so Licensee cascade can remove rows.
create or replace function public.reject_athena_client_quote_payment_request_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.licensee_account_id is distinct from old.licensee_account_id
     or new.organization_id is distinct from old.organization_id
     or new.requested_by is distinct from old.requested_by
     or new.source_quote_id is distinct from old.source_quote_id
     or new.purpose is distinct from old.purpose
     or new.billing_frequency is distinct from old.billing_frequency
     or new.currency_code is distinct from old.currency_code
     or new.currency_scale is distinct from old.currency_scale
     or new.amount_minor is distinct from old.amount_minor
     or new.amount_source is distinct from old.amount_source
     or new.one_time_collection_mode is distinct from old.one_time_collection_mode
     or new.one_time_total_minor is distinct from old.one_time_total_minor
     or new.deposit_minor is distinct from old.deposit_minor
     or new.balance_minor is distinct from old.balance_minor
     or new.quote_number is distinct from old.quote_number
     or new.quote_issued_at is distinct from old.quote_issued_at
     or new.settlement_account is distinct from old.settlement_account
     or new.request_parameters is distinct from old.request_parameters
     or new.stripe_price_idempotency_key is distinct from old.stripe_price_idempotency_key
     or new.stripe_payment_link_idempotency_key is distinct from old.stripe_payment_link_idempotency_key
     or new.created_at is distinct from old.created_at
     or (
       old.stripe_price_id is not null
       and new.stripe_price_id is distinct from old.stripe_price_id
     )
     or (
       old.stripe_payment_link_id is not null
       and new.stripe_payment_link_id is distinct from old.stripe_payment_link_id
     )
     or (
       old.stripe_payment_link_url is not null
       and new.stripe_payment_link_url is distinct from old.stripe_payment_link_url
     )
     or (new.stripe_payment_link_id is null) is distinct from (new.stripe_payment_link_url is null)
     or (new.stripe_payment_link_id is not null and new.stripe_price_id is null)
  then
    raise exception 'client_quote_payment_request_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

comment on function public.reject_athena_client_quote_payment_request_update() is
  'BEFORE UPDATE guard. Commercial fields and idempotency keys are immutable. Stripe Price id, Payment Link id, and URL may be filled once from null. Established Stripe identifiers cannot be replaced. Not payment status.';

drop trigger if exists athena_client_quote_payment_requests_immutable
  on public.athena_client_quote_payment_requests;

create trigger athena_client_quote_payment_requests_immutable
  before update on public.athena_client_quote_payment_requests
  for each row
  execute function public.reject_athena_client_quote_payment_request_update();

-- Exclusive UTC instant at which a new intent becomes ineligible.
-- validUntil, when present and not JSON null, is the inclusive last civil day
-- and takes precedence. Otherwise validForDays counts from the UTC issue date.
-- The expiry instant is the following UTC midnight and is exclusive.
-- Returns null when validity cannot be read. Does not inspect existing intents.
create or replace function public.client_quote_payment_expires_at(
  p_snapshot jsonb,
  p_issued_at timestamptz
)
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_validity jsonb;
  v_until text;
  v_until_date date;
  v_days_text text;
  v_days integer;
  v_issued_date date;
  v_last_date date;
begin
  if p_snapshot is null
     or pg_catalog.jsonb_typeof(p_snapshot) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_snapshot->'validity') is distinct from 'object'
     or p_issued_at is null
  then
    return null;
  end if;

  v_validity := p_snapshot->'validity';

  if pg_catalog.jsonb_typeof(v_validity->'validUntil') = 'string' then
    v_until := v_validity->>'validUntil';
    if v_until is null or v_until !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return null;
    end if;
    begin
      v_until_date := v_until::date;
    exception
      when others then
        return null;
    end;
    if pg_catalog.to_char(v_until_date, 'YYYY-MM-DD') is distinct from v_until then
      return null;
    end if;
    return ((v_until_date + 1)::timestamp) at time zone 'UTC';
  end if;

  if v_validity->'validUntil' is not null
     and pg_catalog.jsonb_typeof(v_validity->'validUntil') is distinct from 'null'
  then
    return null;
  end if;

  if pg_catalog.jsonb_typeof(v_validity->'validForDays') is distinct from 'number' then
    return null;
  end if;
  v_days_text := v_validity->>'validForDays';
  if v_days_text is null or v_days_text !~ '^[0-9]+$' or pg_catalog.char_length(v_days_text) > 4 then
    return null;
  end if;
  v_days := v_days_text::integer;
  if v_days < 1 or v_days > 3650 then
    return null;
  end if;

  v_issued_date := (p_issued_at at time zone 'UTC')::date;
  v_last_date := v_issued_date + v_days;
  return ((v_last_date + 1)::timestamp) at time zone 'UTC';
end;
$$;

comment on function public.client_quote_payment_expires_at(jsonb, timestamptz) is
  'Exclusive UTC expiry of an issued quotation. validUntil is the inclusive last civil day and takes precedence. Otherwise validForDays is added to the UTC issue date. The following UTC midnight is exclusive. Null means validity cannot be read. Does not delete or hide an existing payment request.';

-- Atomic insert. Locks the quotation row, then either inserts one full
-- request, the deposit/balance pair, or one recurring request.
-- Reads frozen totalMinor only. Does not update the quotation or any invoice.
-- Rejects a new intent at or after the exclusive expiry instant.
-- Existing intents stay readable after expiry.
create or replace function public.create_client_quote_payment_request_intents(
  p_licensee_account_id uuid,
  p_source_quote_id uuid,
  p_requested_by uuid,
  p_rows jsonb
)
returns setof public.athena_client_quote_payment_requests
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_quote public.athena_client_quotes%rowtype;
  v_snapshot jsonb;
  v_count integer;
  v_index integer;
  v_element jsonb;
  v_parameters jsonb;
  v_purpose text;
  v_frequency text;
  v_amount_source text;
  v_group_total bigint;
  v_frozen bigint;
  v_deposit bigint;
  v_balance bigint;
  v_total bigint;
  v_amount bigint;
  v_existing_full boolean;
  v_existing_split boolean;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_issued_at timestamptz;
  v_expires_at timestamptz;
begin
  if p_licensee_account_id is null or p_source_quote_id is null then
    raise exception 'client_quote_payment_quote_ineligible'
      using errcode = 'P0001';
  end if;

  if pg_catalog.jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'client_quote_payment_pair_incomplete'
      using errcode = 'P0001';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_rows);
  if v_count is null or v_count < 1 or v_count > 2 then
    raise exception 'client_quote_payment_pair_incomplete'
      using errcode = 'P0001';
  end if;

  select *
    into v_quote
  from public.athena_client_quotes
  where id = p_source_quote_id
  for update;

  if not found then
    raise exception 'client_quote_payment_quote_ineligible'
      using errcode = 'P0001';
  end if;

  v_snapshot := v_quote.issued_snapshot_json;

  if v_quote.licensee_account_id is distinct from p_licensee_account_id
     or v_quote.status is distinct from 'issued'
     or v_quote.deleted_at is not null
     or v_snapshot is null
     or pg_catalog.jsonb_typeof(v_snapshot) is distinct from 'object'
     or v_snapshot->>'schemaVersion' is distinct from 'client_quote_issued_v1'
     or lower(v_snapshot->>'quoteId') is distinct from v_quote.id::text
     or lower(v_snapshot->>'licenseeAccountId') is distinct from v_quote.licensee_account_id::text
     or lower(v_snapshot->>'organizationId') is distinct from v_quote.organization_id::text
     or v_quote.currency_code not in ('USD', 'EUR')
     or v_snapshot->>'currencyCode' is distinct from v_quote.currency_code
     or v_snapshot->>'currencyScale' is distinct from '2'
     or v_quote.quote_number is null
     or v_snapshot->>'quoteNumber' is distinct from v_quote.quote_number
     or v_quote.issued_at is null
  then
    raise exception 'client_quote_payment_quote_ineligible'
      using errcode = 'P0001';
  end if;

  begin
    v_issued_at := (v_snapshot->>'issuedAt')::timestamptz;
  exception
    when others then
      raise exception 'client_quote_payment_quote_ineligible'
        using errcode = 'P0001';
  end;

  if v_issued_at is distinct from v_quote.issued_at then
    raise exception 'client_quote_payment_quote_ineligible'
      using errcode = 'P0001';
  end if;

  v_expires_at := public.client_quote_payment_expires_at(v_snapshot, v_issued_at);
  if v_expires_at is null then
    raise exception 'client_quote_payment_validity_unreadable'
      using errcode = 'P0001';
  end if;
  if pg_catalog.now() >= v_expires_at then
    raise exception 'client_quote_payment_quote_expired'
      using errcode = 'P0001';
  end if;

  if v_count = 2 then
    if (p_rows->0->'requestParameters'->>'purpose') is null
       or (p_rows->1->'requestParameters'->>'purpose') is null
       or (p_rows->0->'requestParameters'->>'purpose')
          is not distinct from (p_rows->1->'requestParameters'->>'purpose')
       or (p_rows->0->'requestParameters'->>'purpose')
          not in ('one_time_deposit', 'one_time_balance')
       or (p_rows->1->'requestParameters'->>'purpose')
          not in ('one_time_deposit', 'one_time_balance')
    then
      raise exception 'client_quote_payment_pair_incomplete'
        using errcode = 'P0001';
    end if;
  end if;

  for v_index in 0..(v_count - 1) loop
    v_element := p_rows -> v_index;
    if pg_catalog.jsonb_typeof(v_element) is distinct from 'object' then
      raise exception 'client_quote_payment_pair_incomplete'
        using errcode = 'P0001';
    end if;
    v_parameters := v_element->'requestParameters';
    if pg_catalog.jsonb_typeof(v_parameters) is distinct from 'object' then
      raise exception 'client_quote_payment_pair_incomplete'
        using errcode = 'P0001';
    end if;

    v_purpose := v_parameters->>'purpose';
    v_frequency := v_parameters->>'billingFrequency';
    v_amount_source := v_parameters->>'amountSource';
    v_amount := public.client_quote_payment_json_minor(v_parameters->'amountMinor');

    if v_parameters->>'schemaVersion' is distinct from 'client_quote_payment_request_v1'
       or v_parameters->>'settlementAccount' is distinct from 'getoblic_central'
       or v_purpose is null
       or v_purpose not in (
         'one_time_full',
         'one_time_deposit',
         'one_time_balance',
         'monthly',
         'quarterly',
         'annually'
       )
       or lower(v_parameters->>'licenseeAccountId') is distinct from v_quote.licensee_account_id::text
       or lower(v_parameters->>'organizationId') is distinct from v_quote.organization_id::text
       or lower(v_parameters->>'sourceQuoteId') is distinct from v_quote.id::text
       or v_parameters->>'quoteNumber' is distinct from v_quote.quote_number
       or v_parameters->>'currencyCode' is distinct from v_quote.currency_code
       or v_parameters->>'currencyScale' is distinct from '2'
       or v_amount is null
       or v_amount < 50
       or v_element->>'stripePriceIdempotencyKey' !~ '^cqpr_price_v1_[0-9a-f]{64}$'
       or v_element->>'stripePaymentLinkIdempotencyKey' !~ '^cqpr_link_v1_[0-9a-f]{64}$'
       or v_element->>'stripePriceIdempotencyKey'
          is not distinct from v_element->>'stripePaymentLinkIdempotencyKey'
    then
      raise exception 'client_quote_payment_amount_rejected'
        using errcode = 'P0001';
    end if;

    begin
      if (v_parameters->>'quoteIssuedAt')::timestamptz is distinct from v_issued_at then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
    exception
      when sqlstate 'P0001' then
        raise;
      when others then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
    end;

    if v_count = 1 and (
      v_purpose is null
      or v_purpose not in ('one_time_full', 'monthly', 'quarterly', 'annually')
    ) then
      raise exception 'client_quote_payment_pair_incomplete'
        using errcode = 'P0001';
    end if;

    if v_purpose in ('monthly', 'quarterly', 'annually') then
      if v_frequency is distinct from v_purpose
         or v_amount_source is distinct from 'frequency_totals'
         or v_parameters->'oneTimeCollectionMode' is distinct from 'null'::jsonb
         or v_parameters->'oneTimeTotalMinor' is distinct from 'null'::jsonb
         or v_parameters->'depositMinor' is distinct from 'null'::jsonb
         or v_parameters->'balanceMinor' is distinct from 'null'::jsonb
      then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      v_group_total := v_amount;
    elsif v_purpose = 'one_time_full' then
      v_total := public.client_quote_payment_json_minor(v_parameters->'oneTimeTotalMinor');
      if v_frequency is distinct from 'one_time'
         or v_amount_source not in ('frequency_totals', 'legacy_one_time_totals')
         or v_parameters->>'oneTimeCollectionMode' is distinct from 'full'
         or v_parameters->'depositMinor' is distinct from 'null'::jsonb
         or v_parameters->'balanceMinor' is distinct from 'null'::jsonb
         or v_total is null
         or v_total is distinct from v_amount
      then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      v_group_total := v_total;
    else
      v_deposit := public.client_quote_payment_json_minor(v_parameters->'depositMinor');
      v_balance := public.client_quote_payment_json_minor(v_parameters->'balanceMinor');
      v_total := public.client_quote_payment_json_minor(v_parameters->'oneTimeTotalMinor');
      if v_frequency is distinct from 'one_time'
         or v_amount_source not in ('frequency_totals', 'legacy_one_time_totals')
         or v_parameters->>'oneTimeCollectionMode' is distinct from 'split'
         or v_deposit is null
         or v_balance is null
         or v_total is null
         or v_deposit < 50
         or v_balance < 50
         or v_total is distinct from v_deposit + v_balance
         or (v_purpose = 'one_time_deposit' and v_amount is distinct from v_deposit)
         or (v_purpose = 'one_time_balance' and v_amount is distinct from v_balance)
      then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      v_group_total := v_total;
    end if;

    if v_amount_source = 'legacy_one_time_totals' then
      if v_snapshot->'frequencyTotals' is not null
         and pg_catalog.jsonb_typeof(v_snapshot->'frequencyTotals') is distinct from 'null'
      then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      if pg_catalog.jsonb_typeof(v_snapshot->'lineItems') is distinct from 'array' then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      if pg_catalog.jsonb_array_length(v_snapshot->'lineItems') < 1
         or exists (
           select 1
           from pg_catalog.jsonb_array_elements(v_snapshot->'lineItems') as line
           where line ? 'billingFrequency'
             and not (
               pg_catalog.jsonb_typeof(line->'billingFrequency') = 'null'
               or line->>'billingFrequency' = 'one_time'
             )
         )
      then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      v_frozen := public.client_quote_payment_json_minor(v_snapshot->'totals'->'totalMinor');
    else
      if pg_catalog.jsonb_typeof(v_snapshot->'frequencyTotals') is distinct from 'array' then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      if (
        select count(*)
        from pg_catalog.jsonb_array_elements(v_snapshot->'frequencyTotals') as element
        where element->>'billingFrequency' = v_frequency
      ) is distinct from 1 then
        raise exception 'client_quote_payment_amount_rejected'
          using errcode = 'P0001';
      end if;
      select public.client_quote_payment_json_minor(element->'totals'->'totalMinor')
        into v_frozen
      from pg_catalog.jsonb_array_elements(v_snapshot->'frequencyTotals') as element
      where element->>'billingFrequency' = v_frequency;
    end if;

    if v_frozen is null or v_frozen <= 0 or v_frozen is distinct from v_group_total then
      raise exception 'client_quote_payment_amount_rejected'
        using errcode = 'P0001';
    end if;
  end loop;

  if v_count = 2 then
    if (p_rows->0->'requestParameters'->>'amountSource')
         is distinct from (p_rows->1->'requestParameters'->>'amountSource')
       or (p_rows->0->'requestParameters'->>'oneTimeTotalMinor')
         is distinct from (p_rows->1->'requestParameters'->>'oneTimeTotalMinor')
       or (p_rows->0->'requestParameters'->>'depositMinor')
         is distinct from (p_rows->1->'requestParameters'->>'depositMinor')
       or (p_rows->0->'requestParameters'->>'balanceMinor')
         is distinct from (p_rows->1->'requestParameters'->>'balanceMinor')
       or (p_rows->0->'requestParameters'->>'currencyCode')
         is distinct from (p_rows->1->'requestParameters'->>'currencyCode')
    then
      raise exception 'client_quote_payment_amount_rejected'
        using errcode = 'P0001';
    end if;
  end if;

  select exists (
    select 1
    from public.athena_client_quote_payment_requests as existing
    where existing.source_quote_id = p_source_quote_id
      and existing.purpose = 'one_time_full'
  )
    into v_existing_full;

  select exists (
    select 1
    from public.athena_client_quote_payment_requests as existing
    where existing.source_quote_id = p_source_quote_id
      and existing.purpose in ('one_time_deposit', 'one_time_balance')
  )
    into v_existing_split;

  if v_count = 1 and (p_rows->0->'requestParameters'->>'purpose') = 'one_time_full' and v_existing_split then
    raise exception 'client_quote_payment_collection_conflict'
      using errcode = 'P0001';
  end if;
  if v_count = 2 and v_existing_full then
    raise exception 'client_quote_payment_collection_conflict'
      using errcode = 'P0001';
  end if;
  if v_count = 2 and v_existing_split then
    raise exception 'client_quote_payment_request_duplicate'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.athena_client_quote_payment_requests as existing
    where existing.source_quote_id = p_source_quote_id
      and existing.purpose in (
        select element->'requestParameters'->>'purpose'
        from pg_catalog.jsonb_array_elements(p_rows) as element
      )
  ) then
    raise exception 'client_quote_payment_request_duplicate'
      using errcode = 'P0001';
  end if;

  for v_index in 0..(v_count - 1) loop
    v_element := p_rows -> v_index;
    v_parameters := v_element->'requestParameters';
    v_purpose := v_parameters->>'purpose';
    insert into public.athena_client_quote_payment_requests (
      licensee_account_id,
      organization_id,
      requested_by,
      source_quote_id,
      purpose,
      billing_frequency,
      currency_code,
      currency_scale,
      amount_minor,
      amount_source,
      one_time_collection_mode,
      one_time_total_minor,
      deposit_minor,
      balance_minor,
      quote_number,
      quote_issued_at,
      settlement_account,
      request_parameters,
      stripe_price_idempotency_key,
      stripe_payment_link_idempotency_key
    ) values (
      v_quote.licensee_account_id,
      v_quote.organization_id,
      p_requested_by,
      v_quote.id,
      v_purpose,
      v_parameters->>'billingFrequency',
      v_quote.currency_code,
      2,
      public.client_quote_payment_json_minor(v_parameters->'amountMinor'),
      v_parameters->>'amountSource',
      case
        when v_parameters->'oneTimeCollectionMode' = 'null'::jsonb then null
        else v_parameters->>'oneTimeCollectionMode'
      end,
      public.client_quote_payment_json_minor(v_parameters->'oneTimeTotalMinor'),
      public.client_quote_payment_json_minor(v_parameters->'depositMinor'),
      public.client_quote_payment_json_minor(v_parameters->'balanceMinor'),
      v_quote.quote_number,
      v_issued_at,
      'getoblic_central',
      v_parameters,
      v_element->>'stripePriceIdempotencyKey',
      v_element->>'stripePaymentLinkIdempotencyKey'
    )
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return query
  select *
  from public.athena_client_quote_payment_requests
  where id = any (v_ids);
exception
  when unique_violation then
    raise exception 'client_quote_payment_request_duplicate'
      using errcode = 'P0001';
end;
$$;

comment on function public.create_client_quote_payment_request_intents(uuid, uuid, uuid, jsonb) is
  'Service-role insert of one payment-link intent decision. Locks the quotation, requires an issued unmasked USD or EUR snapshot, and reads frozen totalMinor only. Rejects an expired quotation: validUntil is the inclusive last civil day and takes precedence, otherwise validForDays counts from the UTC issue date, and the following UTC midnight is exclusive. Inserts one full payment, one recurring purpose, or both deposit and balance. Rejects full together with split. Requires at least 50 minor units for every chargeable purpose. Does not update the quotation, invoice, or an existing intent. Does not call Stripe. Existing intents stay readable after expiry.';

-- Write Stripe Price id, Payment Link id, and URL onto an existing intent.
-- Null arguments leave the stored value. The same value may be repeated.
-- A different established value is rejected. Link id and URL are one pair
-- and require a Price id. Does not change commercial fields or idempotency
-- keys. Does not re-check quotation expiry. Does not call Stripe.
create or replace function public.record_client_quote_payment_request_stripe_fulfillment(
  p_licensee_account_id uuid,
  p_request_id uuid,
  p_stripe_price_id text,
  p_stripe_payment_link_id text,
  p_stripe_payment_link_url text
)
returns setof public.athena_client_quote_payment_requests
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_row public.athena_client_quote_payment_requests%rowtype;
  v_price text;
  v_link_id text;
  v_link_url text;
begin
  if p_licensee_account_id is null or p_request_id is null then
    raise exception 'client_quote_payment_request_not_found'
      using errcode = 'P0001';
  end if;

  if p_stripe_price_id is null
     and p_stripe_payment_link_id is null
     and p_stripe_payment_link_url is null
  then
    raise exception 'client_quote_payment_stripe_fulfillment_rejected'
      using errcode = 'P0001';
  end if;

  if (p_stripe_payment_link_id is null) is distinct from (p_stripe_payment_link_url is null) then
    raise exception 'client_quote_payment_stripe_fulfillment_rejected'
      using errcode = 'P0001';
  end if;

  select *
    into v_row
  from public.athena_client_quote_payment_requests
  where id = p_request_id
    and licensee_account_id = p_licensee_account_id
  for update;

  if not found then
    raise exception 'client_quote_payment_request_not_found'
      using errcode = 'P0001';
  end if;

  if p_stripe_price_id is null then
    v_price := v_row.stripe_price_id;
  elsif v_row.stripe_price_id is null or v_row.stripe_price_id = p_stripe_price_id then
    if p_stripe_price_id !~ '^price_[A-Za-z0-9]{8,80}$' then
      raise exception 'client_quote_payment_stripe_fulfillment_rejected'
        using errcode = 'P0001';
    end if;
    v_price := p_stripe_price_id;
  else
    raise exception 'client_quote_payment_stripe_fulfillment_rejected'
      using errcode = 'P0001';
  end if;

  if p_stripe_payment_link_id is null then
    v_link_id := v_row.stripe_payment_link_id;
    v_link_url := v_row.stripe_payment_link_url;
  elsif (v_row.stripe_payment_link_id is null or v_row.stripe_payment_link_id = p_stripe_payment_link_id)
        and (v_row.stripe_payment_link_url is null or v_row.stripe_payment_link_url = p_stripe_payment_link_url)
  then
    if p_stripe_payment_link_id !~ '^plink_[A-Za-z0-9]{8,80}$'
       or p_stripe_payment_link_url !~ '^https://buy\.stripe\.com/(test_)?[A-Za-z0-9]{8,80}$'
    then
      raise exception 'client_quote_payment_stripe_fulfillment_rejected'
        using errcode = 'P0001';
    end if;
    v_link_id := p_stripe_payment_link_id;
    v_link_url := p_stripe_payment_link_url;
  else
    raise exception 'client_quote_payment_stripe_fulfillment_rejected'
      using errcode = 'P0001';
  end if;

  if (v_link_id is null) is distinct from (v_link_url is null)
     or (v_link_id is not null and v_price is null)
  then
    raise exception 'client_quote_payment_stripe_fulfillment_rejected'
      using errcode = 'P0001';
  end if;

  if v_price is not distinct from v_row.stripe_price_id
     and v_link_id is not distinct from v_row.stripe_payment_link_id
     and v_link_url is not distinct from v_row.stripe_payment_link_url
  then
    return query
    select *
    from public.athena_client_quote_payment_requests
    where id = v_row.id
      and licensee_account_id = p_licensee_account_id;
    return;
  end if;

  update public.athena_client_quote_payment_requests
  set
    stripe_price_id = v_price,
    stripe_payment_link_id = v_link_id,
    stripe_payment_link_url = v_link_url
  where id = v_row.id
    and licensee_account_id = p_licensee_account_id;

  return query
  select *
  from public.athena_client_quote_payment_requests
  where id = v_row.id
    and licensee_account_id = p_licensee_account_id;
exception
  when unique_violation then
    raise exception 'client_quote_payment_stripe_fulfillment_rejected'
      using errcode = 'P0001';
end;
$$;

comment on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) is
  'Service-role write-once record of a Stripe Price id and, optionally, a Payment Link id plus URL. Locks the intent by id and licensee. Repeating the stored values is allowed. Replacing an established identifier is rejected. Does not change amount, currency, purpose, source quote, request parameters, or idempotency keys. Does not re-check quotation expiry. Does not call Stripe and does not store payment status.';

alter table public.athena_client_quote_payment_requests enable row level security;

revoke all on table public.athena_client_quote_payment_requests from public;
revoke all on table public.athena_client_quote_payment_requests from anon;
revoke all on table public.athena_client_quote_payment_requests from authenticated;
revoke all on table public.athena_client_quote_payment_requests from service_role;
grant select on table public.athena_client_quote_payment_requests to service_role;

revoke all on function public.client_quote_payment_json_minor(jsonb) from public;
revoke all on function public.client_quote_payment_json_minor(jsonb) from anon;
revoke all on function public.client_quote_payment_json_minor(jsonb) from authenticated;
revoke all on function public.client_quote_payment_json_minor(jsonb) from service_role;

revoke all on function public.client_quote_payment_expires_at(jsonb, timestamptz) from public;
revoke all on function public.client_quote_payment_expires_at(jsonb, timestamptz) from anon;
revoke all on function public.client_quote_payment_expires_at(jsonb, timestamptz) from authenticated;
revoke all on function public.client_quote_payment_expires_at(jsonb, timestamptz) from service_role;

revoke all on function public.reject_athena_client_quote_payment_request_update() from public;
revoke all on function public.reject_athena_client_quote_payment_request_update() from anon;
revoke all on function public.reject_athena_client_quote_payment_request_update() from authenticated;
revoke all on function public.reject_athena_client_quote_payment_request_update() from service_role;

revoke all on function public.create_client_quote_payment_request_intents(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.create_client_quote_payment_request_intents(uuid, uuid, uuid, jsonb) from anon;
revoke all on function public.create_client_quote_payment_request_intents(uuid, uuid, uuid, jsonb) from authenticated;
grant execute on function public.create_client_quote_payment_request_intents(uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) from public;
revoke all on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) from anon;
revoke all on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) to service_role;
