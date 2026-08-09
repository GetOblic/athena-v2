import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AthenaEstimateMessage } from "../../services/estimate/athenaEstimateTypes";

const ROOT = process.cwd();
const L1_MIGRATION =
  "supabase/migrations/20260809000001_create_athena_estimates.sql";
const L10_MIGRATION =
  "supabase/migrations/20260809000002_athena_estimate_soft_hide_and_messages.sql";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectFiles(dir: string, acc: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return acc;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectFiles(rel, acc);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") ||
        entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".jsx"))
    ) {
      acc.push(rel);
    }
  }
  return acc;
}

describe("Athena Estimate L10 soft-hide + message persistence foundation", () => {
  it("1. migration adds hidden_at timestamptz null", () => {
    assert.equal(existsSync(join(ROOT, L10_MIGRATION)), true);
    const migration = read(L10_MIGRATION);
    assert.match(
      migration,
      /alter table athena_estimates\s+add column if not exists hidden_at timestamptz null/i,
    );
  });

  it("2. migration does NOT modify Estimate generation status CHECK", () => {
    const l10 = read(L10_MIGRATION);
    const l1 = read(L1_MIGRATION);
    assert.doesNotMatch(l10, /check\s*\(\s*status\s+in/i);
    assert.doesNotMatch(l10, /drop constraint/i);
    assert.doesNotMatch(l10, /alter table athena_estimates.*status/i);
    assert.match(
      l1,
      /check \(status in \('Queued', 'Processing', 'Ready', 'Processing Failed'\)\)/,
    );
  });

  it("3. partial visible-history index exists", () => {
    const migration = read(L10_MIGRATION);
    assert.match(
      migration,
      /athena_estimates_licensee_visible_created_idx/,
    );
    assert.match(
      migration,
      /on athena_estimates \(licensee_account_id, created_at desc\)\s+where hidden_at is null/i,
    );
  });

  it("4. athena_estimate_messages table exists", () => {
    const migration = read(L10_MIGRATION);
    assert.match(
      migration,
      /create table if not exists athena_estimate_messages/,
    );
    assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
    assert.match(migration, /content text not null/);
    assert.match(
      migration,
      /created_at timestamptz not null default now\(\)/,
    );
  });

  it("5. message role CHECK user/assistant only", () => {
    const migration = read(L10_MIGRATION);
    assert.match(
      migration,
      /role text not null\s+check \(role in \('user', 'assistant'\)\)/,
    );
  });

  it("6. message FKs: estimate CASCADE, licensee CASCADE, organization RESTRICT", () => {
    const migration = read(L10_MIGRATION);
    assert.match(
      migration,
      /estimate_id uuid not null\s+references athena_estimates\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /licensee_account_id uuid not null\s+references licensee_accounts\(id\) on delete cascade/,
    );
    assert.match(
      migration,
      /organization_id uuid not null\s+references organizations\(id\) on delete restrict/,
    );
  });

  it("7/8/9. message table RLS enabled; public/anon/authenticated revoked; service_role granted", () => {
    const migration = read(L10_MIGRATION);
    assert.match(
      migration,
      /alter table athena_estimate_messages enable row level security/i,
    );
    assert.match(
      migration,
      /revoke all on table athena_estimate_messages from public/i,
    );
    assert.match(
      migration,
      /revoke all on table athena_estimate_messages from anon/i,
    );
    assert.match(
      migration,
      /revoke all on table athena_estimate_messages from authenticated/i,
    );
    assert.match(
      migration,
      /grant all on table athena_estimate_messages to service_role/i,
    );
    assert.doesNotMatch(migration, /create policy/i);
  });

  it("10. Hide API requires genuine active Master via getUser + requireLicenseeMasterAccount", () => {
    const route = read("app/api/licensee/estimate/[id]/hide/route.ts");
    assert.match(route, /createSupabaseServerClient/);
    assert.match(route, /auth\.getUser/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /401/);
    assert.match(route, /hideAthenaEstimateForMaster/);
    assert.match(route, /LicenseeAccessError/);
    assert.match(route, /403/);
    assert.doesNotMatch(route, /LICENSEE_MASTER_MARKER/);
    assert.doesNotMatch(route, /master-marker/);
    assert.doesNotMatch(route, /cookies\(\)\.get/);
    assert.doesNotMatch(route, /isSuperAdmin|super_admin/i);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const hideStart = orchestration.indexOf(
      "export async function hideAthenaEstimateForMaster",
    );
    assert.ok(hideStart >= 0);
    const hideFn = orchestration.slice(hideStart);
    assert.match(hideFn, /requireLicenseeMasterAccount/);
    assert.doesNotMatch(hideFn, /assertLicenseeOwnsSubAccount/);
  });

  it("11/12. hide constrained to owning Master licensee_account_id; disconnected owned Estimate can hide", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const hideStart = service.indexOf(
      "export async function hideAthenaEstimateForLicensee",
    );
    assert.ok(hideStart >= 0);
    const nextExport = service.indexOf("\nexport async function", hideStart + 1);
    const hideFn = service.slice(
      hideStart,
      nextExport > hideStart ? nextExport : undefined,
    );
    assert.match(hideFn, /\.eq\("id", input\.estimateId\)/);
    assert.match(
      hideFn,
      /\.eq\("licensee_account_id", input\.licenseeAccountId\)/,
    );
    assert.match(hideFn, /\.is\("hidden_at", null\)/);
    assert.doesNotMatch(hideFn, /licensee_sub_accounts/);
    assert.doesNotMatch(hideFn, /assertLicenseeOwnsSubAccount/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const orchHide = orchestration.slice(
      orchestration.indexOf("export async function hideAthenaEstimateForMaster"),
    );
    assert.match(
      orchHide,
      /hideAthenaEstimateForLicensee\(\{\s*licenseeAccountId: masterAccount\.id,\s*estimateId: input\.estimateId,\s*\}\)/,
    );
    assert.doesNotMatch(orchHide, /assertLicenseeOwnsSubAccount/);
  });

  it("13/14/21. hide sets hidden_at only; never deletes; does not alter status/request/package/provenance/job", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const hideStart = service.indexOf(
      "export async function hideAthenaEstimateForLicensee",
    );
    const nextExport = service.indexOf("\nexport async function", hideStart + 1);
    const hideFn = service.slice(
      hideStart,
      nextExport > hideStart ? nextExport : undefined,
    );
    assert.match(hideFn, /\.update\(\{\s*hidden_at: touch\(\),\s*\}\)/);
    assert.doesNotMatch(hideFn, /\.delete\(\)/);
    assert.doesNotMatch(hideFn, /status:/);
    assert.doesNotMatch(hideFn, /request_json/);
    assert.doesNotMatch(hideFn, /package_json/);
    assert.doesNotMatch(hideFn, /instruction_/);
    assert.doesNotMatch(hideFn, /generation_stage/);
    assert.doesNotMatch(hideFn, /athena_estimate_generation_jobs/);
    // Soft-hide must not touch durable Ask Athena message rows.
    assert.doesNotMatch(hideFn, /athena_estimate_messages/);

    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const orchHide = orchestration.slice(
      orchestration.indexOf("export async function hideAthenaEstimateForMaster"),
    );
    assert.doesNotMatch(orchHide, /\.delete\(\)/);
    assert.doesNotMatch(orchHide, /failEstimate|cancel|enqueue/);
    assert.doesNotMatch(orchHide, /athena_estimate_messages/);

    const route = read("app/api/licensee/estimate/[id]/hide/route.ts");
    assert.doesNotMatch(route, /\.delete\(/);
    assert.doesNotMatch(route, /export async function DELETE/);
    assert.doesNotMatch(route, /athena_estimate_messages/);
  });

  it("15/16/17. list/detail exclude hidden; already-hidden treated as not found", () => {
    const service = read("services/estimate/athenaEstimateService.ts");

    const listStart = service.indexOf(
      "export async function listAthenaEstimatesForLicensee",
    );
    const listNext = service.indexOf("\nexport async function", listStart + 1);
    const listFn = service.slice(
      listStart,
      listNext > listStart ? listNext : undefined,
    );
    assert.match(listFn, /\.is\("hidden_at", null\)/);
    assert.match(listFn, /\.order\("created_at", \{ ascending: false \}\)/);

    const getStart = service.indexOf(
      "export async function getAthenaEstimateByIdForLicensee",
    );
    const getNext = service.indexOf("\nexport async function", getStart + 1);
    const getFn = service.slice(
      getStart,
      getNext > getStart ? getNext : undefined,
    );
    // Visible-only get (not the IncludingHidden variant).
    assert.ok(
      getFn.startsWith(
        "export async function getAthenaEstimateByIdForLicensee(",
      ),
    );
    assert.match(getFn, /\.is\("hidden_at", null\)/);

    const hideFn = service.slice(
      service.indexOf("export async function hideAthenaEstimateForLicensee"),
    );
    assert.match(hideFn, /AthenaEstimateNotFoundError/);
    assert.match(hideFn, /\.is\("hidden_at", null\)/);

    const publicDto = read("services/estimate/athenaEstimatePublic.ts");
    assert.doesNotMatch(publicDto, /hiddenAt|hidden_at/);
  });

  it("18. hidden Estimate cannot regenerate through normal path", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    const regen = orchestration.slice(
      orchestration.indexOf("export async function regenerateAthenaEstimate"),
    );
    assert.match(
      regen,
      /getAthenaEstimateByIdForLicensee\(\s*input\.sourceEstimateId,\s*masterAccount\.id/,
    );
    assert.doesNotMatch(regen, /IncludingHidden/);
  });

  it("19. hiding Queued/Processing does not cancel job; executor loads including hidden", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const hideStart = service.indexOf(
      "export async function hideAthenaEstimateForLicensee",
    );
    const hideNext = service.indexOf("\nexport async function", hideStart + 1);
    const hideFn = service.slice(
      hideStart,
      hideNext > hideStart ? hideNext : undefined,
    );
    assert.doesNotMatch(hideFn, /generation_jobs/);
    assert.doesNotMatch(hideFn, /status:\s*"/);
    assert.doesNotMatch(hideFn, /fail_|cancel|claim_/);

    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    assert.match(
      executor,
      /getAthenaEstimateByIdForLicenseeIncludingHidden/,
    );
    assert.match(
      executor,
      /deps\.getEstimate \?\? getAthenaEstimateByIdForLicenseeIncludingHidden/,
    );

    const includingStart = service.indexOf(
      "export async function getAthenaEstimateByIdForLicenseeIncludingHidden",
    );
    const includingNext = service.indexOf(
      "\nexport async function",
      includingStart + 1,
    );
    const includingBody = service.slice(
      includingStart,
      includingNext > includingStart ? includingNext : undefined,
    );
    assert.doesNotMatch(includingBody, /\.is\("hidden_at"/);

    // Complete RPC may mark Ready but must never clear/re-expose via hidden_at.
    const completeRpc = read(L1_MIGRATION);
    const completeStart = completeRpc.indexOf(
      "create or replace function complete_athena_estimate_generation_job",
    );
    assert.ok(completeStart >= 0);
    const completeBody = completeRpc.slice(
      completeStart,
      completeRpc.indexOf(
        "revoke all on function complete_athena_estimate_generation_job",
      ),
    );
    assert.doesNotMatch(completeBody, /hidden_at/);
    assert.match(completeBody, /status = 'Ready'/);
  });

  it("20. new Estimate defaults visible (no hidden_at write on create)", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    const createStart = service.indexOf(
      "export async function createQueuedAthenaEstimate",
    );
    const createNext = service.indexOf(
      "\nexport async function",
      createStart + 1,
    );
    const createFn = service.slice(
      createStart,
      createNext > createStart ? createNext : undefined,
    );
    assert.doesNotMatch(createFn, /hidden_at/);
    assert.match(createFn, /status: "Queued"/);
  });

  it("no hard DELETE API/route for Estimates; Hide path has no .delete()", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/[id]/hide/route.ts")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/[id]/delete/route.ts")),
      false,
    );
    const hideRoute = read("app/api/licensee/estimate/[id]/hide/route.ts");
    assert.match(hideRoute, /export async function POST/);
    assert.doesNotMatch(hideRoute, /export async function DELETE/);
    assert.match(hideRoute, /\{ ok: true, hidden: true \}/);
    assert.match(hideRoute, /404/);
    assert.match(hideRoute, /500/);
    assert.doesNotMatch(hideRoute, /hidden_at|organizationId|licenseeAccountId/);

    const service = read("services/estimate/athenaEstimateService.ts");
    const hideStart = service.indexOf(
      "export async function hideAthenaEstimateForLicensee",
    );
    const hideNext = service.indexOf("\nexport async function", hideStart + 1);
    const hideBody = service.slice(
      hideStart,
      hideNext > hideStart ? hideNext : undefined,
    );
    assert.doesNotMatch(hideBody, /\.delete\(\)/);
  });

  it("22. Quote tree untouched / no Estimate hide imports", () => {
    const quoteFiles = [
      ...collectFiles("app/licensee/quote"),
      ...collectFiles("components/quote"),
      "tests/quote/athenaQuoteUi.test.ts",
    ];
    for (const file of quoteFiles) {
      if (!existsSync(join(ROOT, file))) continue;
      const source = read(file);
      assert.doesNotMatch(source, /services\/estimate/);
      assert.doesNotMatch(source, /athena_estimates|athena_estimate_messages/);
      assert.doesNotMatch(source, /hideAthenaEstimate|hidden_at/);
    }
  });

  it("message types + L10 hide foundation remain — Ask Athena UI still absent", () => {
    const types = read("services/estimate/athenaEstimateTypes.ts");
    assert.match(
      types,
      /export type AthenaEstimateMessageRole = "user" \| "assistant"/,
    );
    assert.match(types, /export type AthenaEstimateMessage = \{/);

    const message: AthenaEstimateMessage = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      estimateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      licenseeAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      organizationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      role: "user",
      content: "Hello",
      createdAt: "2026-08-09T00:00:00.000Z",
    };
    assert.equal(message.role, "user");

    // Legacy placeholder paths remain unused; L11 uses /conversation.
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/[id]/messages")),
      false,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/licensee/estimate/[id]/ask")),
      false,
    );

    const hideRoute = read("app/api/licensee/estimate/[id]/hide/route.ts");
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    for (const source of [hideRoute, orchestration]) {
      assert.doesNotMatch(source, /openrouter|OpenRouter|LLM/i);
      assert.doesNotMatch(source, /composeEstimate|estimateContextComposer/);
      assert.doesNotMatch(source, /athena_estimate_messages/);
    }

    const client = read(
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
    );
    // L12 owns Hide UX; L10 still forbids DB soft-hide leakage into the client.
    assert.doesNotMatch(client, /hidden_at|soft.?hide/i);
    assert.match(client, /\/hide/);
  });

  it("23. Ready immutability / complete RPC contracts remain in L1 migration", () => {
    const migration = read(L1_MIGRATION);
    assert.match(migration, /complete_athena_estimate_generation_job/);
    assert.match(
      migration,
      /Ready packages are immutable|status = 'Ready' and package_json is not null/,
    );
    const l10 = read(L10_MIGRATION);
    assert.doesNotMatch(l10, /create or replace function/i);
    assert.doesNotMatch(l10, /complete_athena_estimate_generation_job/);
  });

  it("migration is present and not applied by this suite", () => {
    assert.equal(existsSync(join(ROOT, L10_MIGRATION)), true);
    const service = read("services/estimate/athenaEstimateService.ts");
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    for (const source of [service, orchestration]) {
      assert.doesNotMatch(source, /supabase db push/);
      assert.doesNotMatch(source, /execSql|runMigration/i);
    }
  });
});
