#!/bin/sh
# Disposable PostgreSQL integration runner for category publication.
# This script is not part of the production runtime transfer.
# It refuses the production Supabase project and any URL that is not explicitly disposable.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)"
URL="${MONITOR_INTEGRATION_DATABASE_URL:-}"

if [ -z "$URL" ]; then
  echo "MONITOR_INTEGRATION_DATABASE_URL is required and must name a disposable database." >&2
  exit 2
fi

case "$URL" in
  *xoueryfirdttowgglwtk*|*supabase.co*|*getoblic.com*|*athena-v2*)
    echo "Refusing to run integration tests against production." >&2
    exit 1
    ;;
esac

case "$URL" in
  *monitor_integration*|*disposable*)
    ;;
  *)
    echo "The database URL must identify a disposable database by containing monitor_integration or disposable." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not available. Integration assets are prepared but were not executed." >&2
  exit 2
fi

psql_q() {
  psql "$URL" -v ON_ERROR_STOP=1 -X -q "$@"
}

cleanup() {
  psql "$URL" -v ON_ERROR_STOP=1 -X -q -c "drop table if exists public.monitor_integration_gate;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_q -tA -c "select current_setting('server_version_num')::int >= 140000" | grep -qx t

echo "Applying disposable prerequisites and Monitor migrations."
psql_q -f "$ROOT/tests/monitor/integration/00_prerequisites.sql"
psql_q -f "$ROOT/supabase/migrations/20261124000001_create_athena_monitors.sql"
psql_q -f "$ROOT/supabase/migrations/20261126000001_reconcile_athena_monitor_source_categories.sql"
psql_q -f "$ROOT/tests/monitor/integration/reconcile_categories.sql"

echo "Running deterministic concurrent publication sessions."
psql_q -c "create table if not exists public.monitor_integration_gate (step text primary key);"
psql_q -c "delete from public.monitor_integration_gate;"

SOURCE_A="10000000-0000-4000-8000-000000000001"
SOURCE_B="10000000-0000-4000-8000-000000000002"

# Session A holds source A, waits until session B is blocked on that row,
# then publishes a newer category set and commits. Session B then rechecks freshness.
psql_q <<SQL &
set statement_timeout = '20s';
begin;
select id from public.athena_monitor_sources where id = '$SOURCE_A' for update;
insert into public.monitor_integration_gate (step) values ('source_a_locked');
do \$\$
begin
  -- source_a_locked
  if current_setting('server_version_num')::int >= 150000 then
    perform set_config('stats_fetch_consistency', 'none', true);
  end if;
  loop
    if current_setting('server_version_num')::int >= 150000 then
      perform pg_stat_clear_snapshot();
    end if;
    exit when exists (
      select 1
      from pg_stat_activity
      where wait_event_type = 'Lock'
        and pid <> pg_backend_pid()
        and query ilike '%reconcile_athena_monitor_source_categories%'
    );
    perform pg_sleep(0.05);
  end loop;
end
\$\$;
select public.reconcile_athena_monitor_source_categories(
  '$SOURCE_A',
  '2026-11-26T18:00:00Z',
  false,
  jsonb_build_array(jsonb_build_object(
    'categoryKey', 'fr/pantalons-c-42.htm',
    'displayName', 'Newer publication',
    'canonicalUrl', 'https://toscane-boutique.fr/fr/pantalons-c-42.htm',
    'parentCategoryKey', null,
    'discoveredAt', '2026-11-26T18:00:00Z',
    'discoveryStatus', 'current',
    'productFamilyCount', null,
    'productFamilyCountBasis', null
  ))
);
commit;
SQL
HOLDER=$!

i=0
while [ "$i" -lt 200 ]; do
  if psql_q -tA -c "select position(('source_a_' || 'locked') in query) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and position(('source_a_' || 'locked') in query) > 0" | grep -q '[1-9]'; then
    break
  fi
  i=$((i + 1))
  sleep 0.05
done
psql_q -tA -c "select position(('source_a_' || 'locked') in query) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and position(('source_a_' || 'locked') in query) > 0" | grep -q '[1-9]'

STALE_OUTCOME="$(psql_q -tA -c "select public.reconcile_athena_monitor_source_categories(
  '$SOURCE_A',
  '2026-11-26T17:00:00Z',
  false,
  jsonb_build_array(jsonb_build_object(
    'categoryKey', 'fr/robes-c-18.htm',
    'displayName', 'Waiting older publication',
    'canonicalUrl', 'https://toscane-boutique.fr/fr/robes-c-18.htm',
    'parentCategoryKey', null,
    'discoveredAt', '2026-11-26T17:00:00Z',
    'discoveryStatus', 'current',
    'productFamilyCount', null,
    'productFamilyCountBasis', null
  ))
)->>'outcome'")"
wait "$HOLDER"
if [ "$STALE_OUTCOME" != "stale" ]; then
  echo "Older waiting publication outcome was $STALE_OUTCOME." >&2
  exit 1
fi
psql_q -c "do \$\$ begin
  if exists (
    select 1 from public.athena_monitor_source_categories
    where source_id = '$SOURCE_A' and category_key = 'fr/robes-c-18.htm'
  ) then
    raise exception 'older waiting publication inserted a category';
  end if;
  if (select display_name from public.athena_monitor_source_categories
      where source_id = '$SOURCE_A' and category_key = 'fr/pantalons-c-42.htm')
     is distinct from 'Newer publication' then
    raise exception 'newer publication did not commit before the waiter';
  end if;
end \$\$;"

# Unrelated sources: B commits while A still holds source A.
psql_q <<SQL &
set statement_timeout = '20s';
begin;
select id from public.athena_monitor_sources where id = '$SOURCE_A' for update;
insert into public.monitor_integration_gate (step) values ('unrelated_locked');
do \$\$
begin
  -- unrelated_locked
  loop
    exit when exists (select 1 from public.monitor_integration_gate where step = 'unrelated_done');
    perform pg_sleep(0.05);
  end loop;
  if (select last_discovered_at from public.athena_monitor_sources where id = '$SOURCE_B')
     is distinct from '2026-11-26T09:30:00Z'::timestamptz then
    raise exception 'unrelated source publication did not commit while this source lock was held';
  end if;
end
\$\$;
commit;
SQL
UNRELATED=$!

i=0
while [ "$i" -lt 200 ]; do
  if psql_q -tA -c "select position(('unrelated_' || 'locked') in query) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and position(('unrelated_' || 'locked') in query) > 0" | grep -q '[1-9]'; then
    break
  fi
  i=$((i + 1))
  sleep 0.05
done
psql_q -tA -c "select position(('unrelated_' || 'locked') in query) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and position(('unrelated_' || 'locked') in query) > 0" | grep -q '[1-9]'
psql_q -c "select public.reconcile_athena_monitor_source_categories(
  '$SOURCE_B',
  '2026-11-26T09:30:00Z',
  false,
  jsonb_build_array(jsonb_build_object(
    'categoryKey', 'jeans-femme',
    'displayName', 'Jeans femme',
    'canonicalUrl', 'https://breal.net/jeans-femme',
    'parentCategoryKey', null,
    'discoveredAt', '2026-11-26T09:30:00Z',
    'discoveryStatus', 'current',
    'productFamilyCount', null,
    'productFamilyCountBasis', null
  ))
);"
psql_q -c "insert into public.monitor_integration_gate (step) values ('unrelated_done');"
wait "$UNRELATED"

echo "PostgreSQL category publication integration passed."

if [ -n "${MONITOR_INTEGRATION_POSTGREST_URL:-}" ]; then
  node --import tsx "$ROOT/tests/monitor/integration/postgrest_store_check.ts"
else
  echo "PostgREST integration was not executed. Set MONITOR_INTEGRATION_POSTGREST_URL and MONITOR_INTEGRATION_SERVICE_JWT for a disposable API."
fi

echo "Disposable integration teardown removes the synchronization table. Monitor tables remain in the disposable database until that database is dropped."
