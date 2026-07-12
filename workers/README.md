# Athena Worker (V3.2)

Dedicated PM2 process that claims and executes durable Athena generation jobs.

## Required environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- Optional model overrides already used by the web app (`OPENROUTER_ANALYSIS_MODEL`, `OPENROUTER_PREMIUM_MODEL`, etc.)

## Commands

```bash
# Development (uses tsx)
npm run worker:dev

# Production build
npm run build:worker

# Production start
npm run worker:start
```

## PM2

See `ecosystem.config.cjs`. Process name must be exactly `athena-worker`.

Do not start in production until migrations and approval are complete.
