-- CQ-STRIPE-1 Gate 2B — Stripe dispatch proof for an existing payment intent.
-- Additive. Does not alter athena_client_quotes, athena_client_invoices,
-- athena_estimates, or athena_client_quote_payment_requests.
-- A row is proof that a Stripe Price or Payment Link request was initiated.
-- It is not a payment status, a Stripe object, or the Athena intent itself.
-- The first request body and dispatched_at win. dispatched_at is not the
-- payment-request created_at. Source migration only. Do not apply this file
-- from application code.

create table if not exists public.athena_client_quote_payment_stripe_dispatches (
  id uuid primary key default gen_random_uuid(),

  licensee_account_id uuid not null
    references public.licensee_accounts(id) on delete cascade,

  payment_request_id uuid not null
    references public.athena_client_quote_payment_requests(id) on delete cascade,

  kind text not null,

  idempotency_key text not null,

  request_body text not null,

  dispatched_at timestamptz not null,

  created_at timestamptz not null default now(),

  constraint athena_client_quote_payment_stripe_dispatches_kind_chk
    check (kind in ('price', 'payment_link')),

  constraint athena_client_quote_payment_stripe_dispatches_key_chk
    check (
      (
        kind = 'price'
        and idempotency_key ~ '^cqpr_price_v1_[0-9a-f]{64}$'
      )
      or (
        kind = 'payment_link'
        and idempotency_key ~ '^cqpr_link_v1_[0-9a-f]{64}$'
      )
    ),

  constraint athena_client_quote_payment_stripe_dispatches_body_chk
    check (char_length(request_body) between 1 and 4000),

  constraint athena_client_quote_payment_stripe_dispatches_request_kind_uidx
    unique (payment_request_id, kind),

  constraint athena_client_quote_payment_stripe_dispatches_key_uidx
    unique (idempotency_key)
);

comment on table public.athena_client_quote_payment_stripe_dispatches is
  'Proof that a Stripe Price or Payment Link create was initiated for one payment intent. dispatched_at starts the safe idempotency window. It is not the intent created_at and it is not payment status. The first request body is kept for retries.';

comment on column public.athena_client_quote_payment_stripe_dispatches.dispatched_at is
  'Server clock immediately before the Stripe HTTP call. Not athena_client_quote_payment_requests.created_at.';

comment on column public.athena_client_quote_payment_stripe_dispatches.request_body is
  'Exact application/x-www-form-urlencoded body of the first Stripe call. Retries resend this body and the original idempotency key.';

create or replace function public.reject_athena_client_quote_payment_stripe_dispatch_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'client_quote_payment_stripe_dispatch_rejected'
    using errcode = 'P0001';
end;
$$;

comment on function public.reject_athena_client_quote_payment_stripe_dispatch_update() is
  'Dispatch proof is write-once. The original body and timestamp cannot be replaced.';

drop trigger if exists athena_client_quote_payment_stripe_dispatches_immutable
  on public.athena_client_quote_payment_stripe_dispatches;

create trigger athena_client_quote_payment_stripe_dispatches_immutable
  before update on public.athena_client_quote_payment_stripe_dispatches
  for each row
  execute function public.reject_athena_client_quote_payment_stripe_dispatch_update();

-- Record the first Stripe dispatch for one intent and kind.
-- Repeating the same idempotency key returns the original row, including
-- its original body and dispatched_at. A different key is rejected.
-- Does not update the payment request and does not call Stripe.
create or replace function public.record_client_quote_payment_stripe_dispatch(
  p_licensee_account_id uuid,
  p_payment_request_id uuid,
  p_kind text,
  p_idempotency_key text,
  p_request_body text,
  p_dispatched_at timestamptz
)
returns setof public.athena_client_quote_payment_stripe_dispatches
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_request public.athena_client_quote_payment_requests%rowtype;
  v_row public.athena_client_quote_payment_stripe_dispatches%rowtype;
begin
  if p_licensee_account_id is null
     or p_payment_request_id is null
     or p_dispatched_at is null
     or p_kind not in ('price', 'payment_link')
     or p_request_body is null
     or char_length(p_request_body) < 1
     or char_length(p_request_body) > 4000
  then
    raise exception 'client_quote_payment_stripe_dispatch_rejected'
      using errcode = 'P0001';
  end if;

  select *
    into v_request
  from public.athena_client_quote_payment_requests
  where id = p_payment_request_id
    and licensee_account_id = p_licensee_account_id
  for share;

  if not found then
    raise exception 'client_quote_payment_request_not_found'
      using errcode = 'P0001';
  end if;

  if p_kind = 'price'
     and p_idempotency_key is distinct from v_request.stripe_price_idempotency_key
  then
    raise exception 'client_quote_payment_stripe_dispatch_rejected'
      using errcode = 'P0001';
  end if;

  if p_kind = 'payment_link'
     and p_idempotency_key is distinct from v_request.stripe_payment_link_idempotency_key
  then
    raise exception 'client_quote_payment_stripe_dispatch_rejected'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.athena_client_quote_payment_stripe_dispatches (
      licensee_account_id,
      payment_request_id,
      kind,
      idempotency_key,
      request_body,
      dispatched_at
    ) values (
      v_request.licensee_account_id,
      v_request.id,
      p_kind,
      p_idempotency_key,
      p_request_body,
      p_dispatched_at
    );
  exception
    when unique_violation then
      null;
  end;

  select *
    into v_row
  from public.athena_client_quote_payment_stripe_dispatches
  where payment_request_id = v_request.id
    and kind = p_kind;

  if not found
     or v_row.idempotency_key is distinct from p_idempotency_key
     or v_row.licensee_account_id is distinct from v_request.licensee_account_id
  then
    raise exception 'client_quote_payment_stripe_dispatch_rejected'
      using errcode = 'P0001';
  end if;

  return query
  select *
  from public.athena_client_quote_payment_stripe_dispatches
  where id = v_row.id;
end;
$$;

comment on function public.record_client_quote_payment_stripe_dispatch(uuid, uuid, text, text, text, timestamptz) is
  'Service-role write-once proof that a Stripe Price or Payment Link request was initiated. Keeps the first body and dispatched_at. Rejects a replacement idempotency key. Does not change the payment intent and does not call Stripe.';

alter table public.athena_client_quote_payment_stripe_dispatches enable row level security;

revoke all on table public.athena_client_quote_payment_stripe_dispatches from public;
revoke all on table public.athena_client_quote_payment_stripe_dispatches from anon;
revoke all on table public.athena_client_quote_payment_stripe_dispatches from authenticated;
revoke all on table public.athena_client_quote_payment_stripe_dispatches from service_role;
grant select on table public.athena_client_quote_payment_stripe_dispatches to service_role;

revoke all on function public.reject_athena_client_quote_payment_stripe_dispatch_update() from public;
revoke all on function public.reject_athena_client_quote_payment_stripe_dispatch_update() from anon;
revoke all on function public.reject_athena_client_quote_payment_stripe_dispatch_update() from authenticated;
revoke all on function public.reject_athena_client_quote_payment_stripe_dispatch_update() from service_role;

revoke all on function public.record_client_quote_payment_stripe_dispatch(uuid, uuid, text, text, text, timestamptz) from public;
revoke all on function public.record_client_quote_payment_stripe_dispatch(uuid, uuid, text, text, text, timestamptz) from anon;
revoke all on function public.record_client_quote_payment_stripe_dispatch(uuid, uuid, text, text, text, timestamptz) from authenticated;
grant execute on function public.record_client_quote_payment_stripe_dispatch(uuid, uuid, text, text, text, timestamptz) to service_role;
