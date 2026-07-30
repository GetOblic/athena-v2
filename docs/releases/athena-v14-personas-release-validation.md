# Athena V14 Personas — Release Validation & Deployment Runbook

**Decision:** APPROVED FOR PUSH AND STAGING DEPLOYMENT  
**Not approved for unattended production deployment** — next authorization covers push, staging/controlled production deploy, migrations, smoke tests, tag, and merge.

**Validated on:** 2026-07-30  
**Branch:** `v14-development`  
**Production baseline:** `259d2ac` (tag `v13.0.0`)  
**Release candidate tip (pre-docs):** `36daefa`  
**Documentation commit:** follows this file

---

## 1. Release scope

V14 introduces **Persona Executive Intelligence** as a first-class archetype/audience source, parallel to Prospects:

```text
Persona source record
→ manual creation or CSV import
→ Persona library and metadata management
→ persona_intelligence bridge
→ durable generation (shared athena-worker)
→ Strategic Blueprint
→ 14 required Persona Deployment Assets
→ immutable Current Executive Version
→ Ready
→ Think Differently
→ Reference Website Deep Scrape
→ Append Interaction
→ Ask Athena about this Persona
```

In scope: Stages 1–5 on `v14-development` (`27bf6ff` … `36daefa`) plus this validation documentation.

Out of scope for this authorization: push, production migration apply, PM2 restart, merge to `main`, release tag.

---

## 2. Commit list

| Commit | Summary |
|--------|---------|
| `259d2ac` | Production baseline — Athena V13 |
| `27bf6ff` | Stage 1 — persona data model and CRUD foundation |
| `0fd48ec` | Stage 2 — persona library and import workflow |
| `73e0f2c` | Stage 3 — durable intelligence generation bridge |
| `5109203` | Stage 4 — publish persona executive intelligence |
| `36daefa` | Stage 5 — research interactions and guidance |
| *(docs)* | This release-validation runbook |

No V14 commits had been pushed at validation time. Local `v14-development` was ahead of `origin/v14-development` by 5 commits (Stages 1–5).

---

## 3. Migrations

Exactly two V14 migrations:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `supabase/migrations/20260730000001_create_personas.sql` | Create isolated `personas` table + indexes (additive) |
| 2 | `supabase/migrations/20260731000001_persona_deep_scrape_source.sql` | Add `persona_id`, extend deep-scrape `source_type` CHECK to include `persona`, ownership CHECK, one-active Persona index, claim RPC Phase B for persona |

### Validation performed

- Filename / dependency order: `20260730…` before `20260731…` (personas table must exist before FK).
- Static SQL review: additive-only; no Prospect/Discussion destructive changes; no hard-coded org/user UUIDs; intentional index names; `on delete cascade` for org/persona deep-scrape ownership; defaults match service assumptions (`status` default `Queued`, `lifecycle_status` default `New`, `source` default `manual`).
- Deep-scrape CHECK preserves `brain` and `prospect` and adds `persona` only.
- No `persona_deep_scrape` generation trigger added.
- **Not executed against production.**
- **Not executed against a shared remote developer database.**
- Local validation: Python structural/paren/UUID scan + repository contract tests that read migration SQL. No disposable Supabase reset was performed.

### Production execution requirements

Apply **before** deploying code that enqueues Persona deep-scrape jobs, and before relying on Persona CRUD against the new table.

Established Athena production practice (see `supabase/migration-manifest.json` manual steps and `workers/README.md`): apply SQL files in order through the **Supabase SQL Editor** when production migration history may diverge from CLI. Alternative for CLI-tracked environments: `supabase db push` after confirming version tokens are unique.

Order:

1. Paste/run `20260730000001_create_personas.sql`
2. Paste/run `20260731000001_persona_deep_scrape_source.sql`
3. Verify: `\d personas` / table exists; `athena_website_deep_scrape_jobs.persona_id` exists; CHECK allows `'persona'`.

### Rollback implications

Migrations are additive. Code rollback to `259d2ac` can leave V14 tables/columns/constraints in place safely (unused). Do **not** drop `personas` or weaken deep-scrape CHECKs in an emergency rollback unless a dedicated destructive rollback is explicitly authorized.

---

## 4. Environment requirements

V14 introduces **no new required environment variables**.

Existing requirements (already used by Prospects / worker / Ask Athena parity):

| Variable | Used by |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | App + worker |
| `SUPABASE_SERVICE_ROLE_KEY` | App + worker |
| `OPENROUTER_API_KEY` | Generation + Ask Athena |

Optional (unchanged): `OPENROUTER_ANALYSIS_MODEL`, `OPENROUTER_PREMIUM_MODEL`, `OPENROUTER_MODEL`, worker timing vars in `workers/README.md`.

---

## 5. Pre-deployment checks

```bash
cd ~/Athena/athena
git branch --show-current          # v14-development
git rev-parse HEAD                 # docs commit after Stages 1–5
git status                         # clean
git log -8 --oneline --decorate
git diff --check 259d2ac..HEAD
node --import tsx --test tests/personas/*.test.ts
npm run test:worker
npm run build
npm run build:worker
```

Confirm build route table includes all Persona UI and API routes listed in §8 of the final report / §18 below.

---

## 6. Deployment order

1. Push `v14-development` (separate authorization).
2. Production/staging preflight (inspect only).
3. **Apply migrations** (SQL Editor order above).
4. Fetch and check out the approved release commit.
5. `npm install`
6. `npm run build` and `npm run build:worker`
7. Reload `athena` and `athena-worker` via PM2.
8. `pm2 save`
9. Post-deployment smoke tests (§9 / Phase 5).

---

## 7. Migration order

See §3. Always:

1. `20260730000001_create_personas.sql`
2. `20260731000001_persona_deep_scrape_source.sql`

Do not reverse order. Do not skip the deep-scrape migration if Stage 5 Deep Scrape will be used.

---

## 8. PM2 processes affected

| Process | Role |
|---------|------|
| `athena` | Next.js web app |
| `athena-worker` | Durable generation + deep-scrape claim loop |

Both use application path `/home/master/applications/znfjdnxytk/public_html` (or `ATHENA_APP_PATH`). See `ecosystem.config.cjs` and `workers/README.md`.

V14 does **not** introduce a Persona-specific worker, concurrency change, lease change, heartbeat change, or retry-count change.

---

## 9. Post-deployment smoke tests

1. Homepage / login health (`/`, `/api/health`).
2. Navigate `/personas`, `/personas/import`, open a Persona detail.
3. Unauthenticated Persona API → 401.
4. Cross-org Persona ID → 404.
5. `pm2 status` — `athena` and `athena-worker` online.
6. DB: `personas` table exists; deep-scrape CHECK includes `persona`.
7. Create minimal Persona (Additional Context only) → appears in library as Profile Created.
8. Generate Intelligence → job queued → worker processes → Ready only with Current EV + Blueprint + 14 assets.
9. Confirm 14 assets in order; no Primary Reply fallback.
10. Think Differently → new Current; prior Archived; immutable.
11. Deep Scrape (valid Reference Website) → research saved → regen → new Current.
12. Append Interaction → Notes append → regen; Additional Context / Ads Content unchanged.
13. Ask Athena → grounded answer; sessionStorage history; no system-prompt injection.
14. Prospect smoke: open existing Ready Prospect; list/import untouched.
15. Ordinary Discussion smoke: Discussion list/queue/community do not show Persona bridges.

---

## 10. Rollback procedure

### Code before migration

Restore previous commit (`259d2ac` / prior approved SHA). No DB cleanup required.

### Code after additive migrations

Restore previous commit. Leave `personas` table and deep-scrape Persona columns/constraints in place. They are unused by V13 code.

### Failed build

Do not restart PM2. Fix or revert commit; rebuild; only then reload processes.

### Failed PM2 restart

```bash
pm2 describe athena
pm2 describe athena-worker
pm2 logs athena --lines 100
pm2 logs athena-worker --lines 100
# Restore last known-good commit + rebuild, then:
pm2 startOrReload ecosystem.config.cjs --only athena
pm2 startOrReload ecosystem.config.cjs --only athena-worker
pm2 save
```

### Worker failure

Stop/reload `athena-worker` only after confirming migrations applied. Web app can stay up; generation queues until worker recovers. Incomplete Persona publication remains retryable; prior Current EV is preserved on failed regen.

### Migration applied but release rolled back

Safe: leave additive schema. Do not run destructive DROP/ALTER rollback SQL unless separately authorized after data review.

---

## 11. Known limitations

- Library enrichment uses stored readiness for cheap list loads (not live Current EV re-verify).
- `Learning from Website` remains in stored-status vocabulary but is not a Persona display label (Prospect leftover; unused by Persona writers).
- Persona delete does not cascade-delete the bridge Discussion (Stage 1 row-scoped delete retained).
- Ask Athena API can accept an org-scoped `executiveVersionId` (including Archived); UI defaults to Current only.
- Some Persona API error handlers echo `error.message` (Prospect parity).
- ESLint `react-hooks/set-state-in-effect` reports on Persona generate/progress components (prop sync pattern); build/typecheck pass; not on deploy path.
- `deploy.sh` only restarts `athena`; production worker reload must use ecosystem / explicit `athena-worker` reload.
- Append Interaction notes stamps use `Europe/Belgrade` display labels (Stage 5 product convention); `last_activity` stored as UTC ISO.

---

## 12. Trigger-name note

Persona Deep Scrape regeneration currently reuses the existing `prospect_deep_scrape` generation trigger. Source identity remains persona through the Deep Scrape source kind and `persona_intelligence` bridge platform.

Observability progress may show phase `persona_deep_scrape` while the durable generation `triggerType` remains `prospect_deep_scrape`. This is intentional; do not rename the trigger in this release.

---

## 13. Final manual test matrix (staging after deploy)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Minimal manual Persona (Additional Context only) | Bridge + queue → Ready only after complete publication; 14 assets |
| 2 | Full manual Persona | All fields display; prompt evidence classification holds |
| 3 | CSV partial success | Valid persist; blanks skipped; invalid website warned; hard dup skipped; context-only likely dup warned; queue failure reported separately |
| 4 | Stage 2-style Persona (no bridge) | Profile Created; Generate Intelligence creates bridge and publishes |
| 5 | Think Differently | Prior Current → Archived; new Current; old immutable |
| 6 | Deep Scrape success | External evidence saved; bridge refreshed; new Current; old Archived |
| 7 | Deep Scrape failure | Failure recorded; prior Ready version visible; retry available |
| 8 | Append Interaction | Notes append; Additional Context/Ads unchanged; new Current |
| 9 | Append queue failure | Interaction persists; partial failure shown; Generate recovers |
| 10 | Ask Athena | Grounded in Current; evidence vs inference; unknown demographics refused; sessionStorage reload |
| 11 | Tenant isolation | Org B cannot read/edit/delete/scrape/refresh/query/append Org A Persona |
| 12 | Ordinary Discussion isolation | Persona bridge absent from list, queue, community, domains, Brain learning |

Do not execute production-side manual scenarios under this authorization.

---

## 14. Release-blocker findings

| Severity | Finding | Resolution | Commit |
|----------|---------|------------|--------|
| BLOCKER | *(none)* | — | — |
| REQUIRED BEFORE DEPLOYMENT | Apply both V14 migrations before Stage 5 Deep Scrape / Persona CRUD in target env | Ops — SQL Editor order in §3 | — |
| REQUIRED BEFORE DEPLOYMENT | Ensure existing `OPENROUTER_API_KEY` (and Supabase secrets) present for worker + Ask Athena | Ops — env preflight | — |
| SAFE FOLLOW-UP | Echoing `error.message` on some Persona routes (Prospect parity) | Harden later | — |
| SAFE FOLLOW-UP | ESLint setState-in-effect on generate/progress buttons | Align with Prospect render-sync pattern later | — |
| SAFE FOLLOW-UP | Bridge trust allows null `organization_id`; delete does not clean bridge Discussion; conversation API allows archived EV id | Harden later | — |
| SAFE FOLLOW-UP | Update `migration-manifest.json` to list V14 files | Docs hygiene | — |
| NO ACTION | Europe/Belgrade interaction stamp | Intentional Stage 5 display convention; DB timestamps remain UTC ISO | — |
| NO ACTION | Reuse of `prospect_deep_scrape` trigger | Documented intentional | — |

**No Blockers or code-level Required Before Deployment defects remaining in the release candidate.**

---

## 15. Exact validated test results

| Suite | Command | Result |
|-------|---------|--------|
| Persona (all stages) | `node --import tsx --test tests/personas/*.test.ts` | **112 pass / 0 fail** (45 suites) |
| Prospect regressions (basics, CSV, bridge, generation, DA contract, publication/EV, Think Differently, Deep Scrape, conversation) | Targeted `node --import tsx --test` over listed Prospect/generationJobs/executiveVersions files | **255 pass / 0 fail** (60 suites) |
| Discussion isolation + Deep Scrape lifecycle + Identity EI | `generationJobBasics`, `generationJobClaimResult`, `deepScrapeBasics`, `deepScrapeLifecycleHotfix`, `identityExecutiveIntelligence` | **82 pass / 0 fail** (22 suites) |
| Full worker suite | `npm run test:worker` | **753 pass / 0 fail** (161 suites) |
| Production build | `npm run build` | **Success** — Persona routes present |
| Diff whitespace | `git diff --check 259d2ac..HEAD` | **Clean** |
| Lint (scoped Persona paths) | `npm run lint -- …` | 2 errors (setState-in-effect) + warnings — SAFE FOLLOW-UP; not on deploy path |
| Typecheck | Included in `next build` | **Passed** |

### Build routes confirmed

```text
/personas
/personas/import
/personas/[id]
/api/personas
/api/personas/[id]
/api/personas/[id]/lifecycle
/api/personas/import
/api/personas/import/preview
/api/personas/[id]/refresh
/api/personas/[id]/status
/api/personas/[id]/think-differently
/api/personas/[id]/deep-scrape
/api/personas/[id]/deep-scrape/status
/api/personas/[id]/updates
/api/personas/[id]/conversation
```

No unauthorized Persona routes.

---

## Deployment runbook (prepared — do not execute under this authorization)

### Phase 1 — Local release preparation

```bash
cd ~/Athena/athena
git branch --show-current
git status
git log -8 --oneline --decorate
# After approval:
git push -u origin v14-development
git fetch origin
git rev-parse HEAD
git rev-parse origin/v14-development   # must match
```

### Phase 2 — Production preflight (inspect only)

```bash
cd /home/master/applications/znfjdnxytk/public_html
pwd
git branch --show-current
git rev-parse HEAD
git status
git remote -v
node -v
npm -v
pm2 list
pm2 describe athena
pm2 describe athena-worker
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/health || true
```

### Phase 3 — Database migration (do not execute here)

Apply via **Supabase SQL Editor** in order:

1. Contents of `supabase/migrations/20260730000001_create_personas.sql`
2. Contents of `supabase/migrations/20260731000001_persona_deep_scrape_source.sql`

Verify table/column/CHECK existence before code deploy that depends on them.

### Phase 4 — Code deployment

```bash
cd /home/master/applications/znfjdnxytk/public_html
git fetch origin
# Prefer explicit commit verification over blind pull:
git checkout v14-development
git reset --hard <APPROVED_V14_SHA>   # only when authorized; confirms exact RC
# Or: git merge --ff-only origin/v14-development after verifying SHA

npm install
npm run build
npm run build:worker

export ATHENA_APP_PATH=/home/master/applications/znfjdnxytk/public_html
pm2 startOrReload ecosystem.config.cjs --only athena
pm2 startOrReload ecosystem.config.cjs --only athena-worker
pm2 save
```

Note: repository `deploy.sh` pulls `main` and restarts only `athena`. Prefer the ecosystem reload above for V14 so `athena-worker` picks up Persona deep-scrape / generation branches.

### Phase 5 — Post-deployment validation

Execute §9 smoke tests and matrix rows 1–12 on staging/controlled production.

### Phase 6 — Rollback

See §10. Additive migrations may remain after code rollback.

---

## Append Interaction timestamp decision

- Stage 5 stamps interaction blocks with `Europe/Belgrade` via `formatPersonaInteractionStamp`.
- `last_activity` / DB fields use UTC ISO (`new Date().toISOString()`).
- Prospect Append Information does not use the same Belgrade stamp (joins notes without timezone label).
- **Decision:** Retain Stage 5 Belgrade display stamp (approved Stage 5 product convention). No change in this validation phase; does not conflict with UTC storage.
