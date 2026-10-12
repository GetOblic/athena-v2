-- CQ-STRIPE-1 — Payment Link URLs on pay.getoblic.com/b/ and buy.stripe.com.
-- Forward-only. Does not edit an applied migration.
-- Widens the URL check, the fulfillment URL predicate, and the column comment.
-- Preserves the fulfillment signature, security definer, search_path,
-- permissions, and every other business rule.
-- Does not alter athena_client_quotes, athena_client_invoices, or dispatch proof.
-- Source migration only. Do not apply this file from application code.

alter table public.athena_client_quote_payment_requests
  drop constraint athena_client_quote_payment_requests_stripe_link_url_chk;

alter table public.athena_client_quote_payment_requests
  add constraint athena_client_quote_payment_requests_stripe_link_url_chk
  check (
    stripe_payment_link_url is null
    or stripe_payment_link_url ~ '^https://(buy\.stripe\.com|pay\.getoblic\.com/b)/(test_)?[A-Za-z0-9]{8,80}$'
  );

comment on column public.athena_client_quote_payment_requests.stripe_payment_link_url is
  'Stripe Payment Link URL on buy.stripe.com or pay.getoblic.com/b. Live and test-mode tokens are accepted. Recorded with stripe_payment_link_id. Write-once. Not payment status.';

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
       or p_stripe_payment_link_url !~ '^https://(buy\.stripe\.com|pay\.getoblic\.com/b)/(test_)?[A-Za-z0-9]{8,80}$'
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

revoke all on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) from public;
revoke all on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) from anon;
revoke all on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.record_client_quote_payment_request_stripe_fulfillment(uuid, uuid, text, text, text) to service_role;
