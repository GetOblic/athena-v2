# Breakthrough Intelligence — Non-Production Evaluation Harness

**NON-PRODUCTION ONLY.**

This harness evaluates Breakthrough Doctrine against Standard prompts.

Doctrine files:
- `doctrine/breakthrough_doctrine.v1.txt` — original pilot doctrine (preserved)
- `doctrine/breakthrough_doctrine.v2.txt` — evidence-revised doctrine for focused re-test

It must never be imported by `app/`, `workers/`, or production services entrypoints.

It must never write Executive Versions, enqueue durable jobs, or call production APIs for persistence.

## What it does

1. Loads 8 synthetic prospect fixtures  
2. Assembles **Standard** prompts via existing production assemblers  
3. Assembles **Breakthrough** prompts by appending doctrine **once per stage**  
4. Verifies prompt integrity (hashes + append equality)  
5. Optionally generates via existing `generateReview` + `resolveModelForStage` routing  
6. Extracts the 10 pilot assets  
7. Writes blinded A/B review packs locally  

## Commands

From repository root:

```bash
# Assemble prompts + integrity + blind placeholders (no LLM calls)
node --import tsx scripts/evaluation/breakthrough/src/run.ts --assemble-only

# Smoke: 3 prospects × full stage generation (requires OpenRouter env)
node --import tsx scripts/evaluation/breakthrough/src/run.ts --smoke

# Full: 8 prospects × generation
node --import tsx scripts/evaluation/breakthrough/src/run.ts --full

# Focused K v2 dry-run: pin/hash + 32-pair selection + Standard baseline load (no LLM)
node --import tsx scripts/evaluation/breakthrough/src/run.ts --focused-v2-validate

# Focused K v2 re-test: Breakthrough-only generation vs frozen Standard baselines
# (do not run until authorized)
node --import tsx scripts/evaluation/breakthrough/src/run.ts --focused-v2
```

Focused mode reuses Standard outputs from `out/run_2026-07-17T20-53-15-237Z` and never regenerates Standard.

Requires `.env.local` / env vars already used by Athena for OpenRouter when generating.

## Outputs (gitignored)

- `out/<runId>/prompts/...` — Standard + Breakthrough prompts + integrity JSON  
- `out/<runId>/raw/...` — raw model responses (generate modes)  
- `out/<runId>/blind/*.md` — blinded review packs  
- `out/<runId>/meta/*.mapping.json` — mode reveal (after scoring only)  
- `reports/<runId>.json` — run summary  

## Validation checklist

- [ ] `--assemble-only` exits 0  
- [ ] Each stage `integrity.json` has `integrityOk: true`  
- [ ] Standard prompts contain no `ATHENA BREAKTHROUGH DOCTRINE`  
- [ ] Breakthrough prompts contain exactly one doctrine delimiter  
- [ ] Resolved models come from existing routing (no harness-specific provider logic)  
- [ ] No files written outside `scripts/evaluation/breakthrough/out|reports`  
- [ ] Production code paths do not import this harness  

## Smoke failure scenarios

| Symptom | Likely cause |
|---|---|
| Integrity fail | Doctrine double-append or Standard pollution |
| Fixture load fail | Missing/invalid slot among P1–P8 |
| Generation error | Missing OpenRouter credentials / network |
| Empty extracted assets | Model output missing required headings/fields |

## Isolation

Do not add imports from `scripts/evaluation/breakthrough` into production modules.
