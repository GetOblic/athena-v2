# Athena Worker (V3.2 / V3.2.1)

Dedicated PM2 process that claims and executes durable Athena generation jobs.

## Process names

- `athena` — Next.js web application
- `athena-worker` — durable generation worker

Do not rename these processes.

## Application path (`ATHENA_APP_PATH`)

`ecosystem.config.cjs` resolves the application root as:

1. `ATHENA_APP_PATH` if set
2. otherwise `/home/master/applications/znfjdnxytk/public_html`

Both `athena` and `athena-worker` use the same resolved path as `cwd`.

The ecosystem file **fails fast** if:

- the path is empty
- the path still contains a `YOUR_APP` placeholder
- the directory does not exist
- the Next.js binary is missing under that path

Cloudways may start Athena with direct `pm2` commands. The ecosystem file is compatible with:

```bash
export ATHENA_APP_PATH=/home/master/applications/znfjdnxytk/public_html
pm2 startOrReload ecosystem.config.cjs --only athena
pm2 startOrReload ecosystem.config.cjs --only athena-worker
```

## Required secrets

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`

Optional model overrides already used by the web app:

- `OPENROUTER_ANALYSIS_MODEL`
- `OPENROUTER_PREMIUM_MODEL`
- `OPENROUTER_MODEL`

Never put secret values in `ecosystem.config.cjs`.

## Optional worker timing variables

| Variable | Default | Notes |
|----------|---------|-------|
| `ATHENA_WORKER_POLL_INTERVAL_MS` | `3000` | Idle queue poll |
| `ATHENA_WORKER_HEARTBEAT_INTERVAL_MS` | `20000` | Must be < half lease |
| `ATHENA_WORKER_LEASE_SECONDS` | `120` | Claim lease duration |
| `ATHENA_WORKER_MAX_ATTEMPTS` | `3` | Bounded retries |
| `ATHENA_WORKER_SHUTDOWN_TIMEOUT_MS` | `90000` | SIGTERM grace |
| `ATHENA_WORKER_CONCURRENCY` | `1` | Forced to 1 in V3.2 |

Invalid values fall back to safe defaults. Concurrency is always forced to **1** in this sprint.

## Commands

```bash
# Development (uses tsx; not for production)
npm run worker:dev

# Production build
npm run build:worker

# Production start (compiled bundle)
npm run worker:start
```

## Critical warnings

1. **Apply migrations before starting `athena-worker`:**
   - `20260713000001_create_athena_generation_jobs.sql`
   - `20260713000002_add_generation_job_worker_leases.sql`
2. **Do not start the worker until migrations are applied** — claim/heartbeat RPCs will fail otherwise.
3. **Worker concurrency is 1** — do not run parallel job execution in V3.2.
4. Do not deploy or start PM2 processes until explicitly approved.
