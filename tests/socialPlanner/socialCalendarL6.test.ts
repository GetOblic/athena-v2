import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TENANT_TABLES } from "../../lib/tenantDatabase";
import { SOCIAL_CALENDAR_GENERATION_JOB_RPCS } from "../../services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";
import { SOCIAL_PLANNER_READY_HISTORY_QUERY } from "../../services/socialPlanner/diversity/loadSocialPlannerSocialMemory";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L6 persistence and worker wiring", () => {
  it("complete RPC is the only five-argument Social Planner complete function", () => {
    const migration = read(
      "supabase/migrations/20260819000001_create_athena_social_calendars.sql",
    );
    assert.equal(
      SOCIAL_CALENDAR_GENERATION_JOB_RPCS.complete,
      "complete_athena_social_calendar_generation_job",
    );
    assert.match(
      migration,
      /create or replace function complete_athena_social_calendar_generation_job\(\s*p_job_id uuid,\s*p_claim_token uuid,\s*p_package_json jsonb,\s*p_calendar_context_json jsonb,\s*p_provenance_json jsonb\s*\)/s,
    );
    assert.doesNotMatch(
      migration,
      /complete_athena_social_calendar_generation_job\(uuid, uuid, jsonb\)/,
    );
    assert.match(migration, /p_package_json jsonb/);
    assert.match(migration, /p_calendar_context_json jsonb/);
    assert.match(migration, /p_provenance_json jsonb/);
  });

  it("job service uses service-role Social Planner RPCs only", () => {
    const service = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobService.ts",
    );
    assert.match(service, /SOCIAL_CALENDAR_GENERATION_JOB_RPCS\.claim/);
    assert.match(service, /SOCIAL_CALENDAR_GENERATION_JOB_RPCS\.heartbeat/);
    assert.match(service, /SOCIAL_CALENDAR_GENERATION_JOB_RPCS\.complete/);
    assert.match(service, /SOCIAL_CALENDAR_GENERATION_JOB_RPCS\.fail/);
    assert.match(service, /p_package_json: input.packageJson/);
    assert.match(service, /p_calendar_context_json: input.calendarContextJson/);
    assert.match(service, /p_provenance_json: input.provenanceJson/);
    assert.doesNotMatch(service, /claim_athena_ad_generation_job/);
    assert.doesNotMatch(service, /claim_athena_seo_generation_job/);
    assert.doesNotMatch(service, /claim_athena_estimate_generation_job/);
    assert.doesNotMatch(service, /claim_athena_generation_job/);
  });

  it("create+enqueue follows Ads compensating semantics", () => {
    const orchestration = read(
      "services/socialPlanner/socialCalendarOrchestration.ts",
    );
    assert.match(orchestration, /createSocialCalendar\(/);
    assert.match(orchestration, /enqueueSocialCalendarGenerationJob/);
    assert.match(orchestration, /markSocialCalendarEnqueueFailed/);
    assert.doesNotMatch(orchestration, /create_athena_social_calendar_with_job/);
  });

  it("history memory query stays org-bound, Ready-only, and bounded", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /SOCIAL_PLANNER_READY_HISTORY_QUERY\.table/);
    assert.match(service, /\.eq\("organization_id", input.organizationId\)/);
    assert.match(service, /\.eq\("status", SOCIAL_PLANNER_READY_HISTORY_QUERY.status\)/);
    assert.match(service, /\.not\("package_json", "is", null\)/);
    assert.match(service, /\.limit\(input.limit\)/);
    assert.equal(SOCIAL_PLANNER_READY_HISTORY_QUERY.table, "athena_social_calendars");
    assert.equal(SOCIAL_PLANNER_READY_HISTORY_QUERY.status, "Ready");
  });

  it("tenant scope registers Social Planner tables without removing Ads or SEO", () => {
    assert.ok(TENANT_TABLES.includes("athena_social_calendars"));
    assert.ok(TENANT_TABLES.includes("athena_social_calendar_generation_jobs"));
    assert.ok(TENANT_TABLES.includes("athena_social_calendar_messages"));
    assert.ok(TENANT_TABLES.includes("ad_campaigns"));
    assert.ok(TENANT_TABLES.includes("seo_reports"));
    const tenant = read("lib/tenantDatabase.ts");
    assert.match(tenant, /"athena_social_calendars"/);
    assert.match(tenant, /"athena_social_calendar_generation_jobs"/);
    assert.match(tenant, /"athena_social_calendar_messages"/);
  });

  it("worker claims Social Planner last and does not starve existing jobs", () => {
    const worker = read("workers/athenaWorker.ts");
    const reconcileIdx = worker.indexOf("await reconcileAwaitingFollowOnJobs()");
    const genIdx = worker.indexOf("claimAndExecuteNextJob(workerId");
    const deepIdx = worker.indexOf("claimAndExecuteNextDeepScrapeJob(workerId");
    const adsIdx = worker.indexOf("claimAndExecuteNextAdGenerationJob(workerId");
    const seoIdx = worker.indexOf("claimAndExecuteNextSeoGenerationJob(workerId");
    const estimateIdx = worker.indexOf(
      "claimAndExecuteNextEstimateGenerationJob(workerId",
    );
    const socialIdx = worker.indexOf(
      "claimAndExecuteNextSocialCalendarGenerationJob(",
    );

    assert.ok(reconcileIdx > 0);
    assert.ok(genIdx > reconcileIdx);
    assert.ok(deepIdx > genIdx);
    assert.ok(adsIdx > deepIdx);
    assert.ok(seoIdx > adsIdx);
    assert.ok(estimateIdx > seoIdx);
    assert.ok(socialIdx > estimateIdx);

    assert.match(worker, /if \(didWork\) \{\s*continue;/);
    assert.match(worker, /if \(didDeepWork\) \{\s*continue;/);
    assert.match(worker, /if \(didAdsWork\) \{\s*continue;/);
    assert.match(worker, /if \(didSeoWork\) \{\s*continue;/);
    assert.match(worker, /if \(didEstimateWork\) \{\s*continue;/);
    assert.match(
      worker,
      /Social Planner only when generation \+ deep scrape \+ Ads \+ SEO \+ Estimate queues are idle/,
    );
    assert.match(worker, /concurrency remains forced to 1|concurrency must be 1/);
    assert.doesNotMatch(worker, /runAdsGenerationPipeline|generateHistoricallyDiverseSocialCalendar/);
  });

  it("executor orchestrates L3 + L5 and never writes context/provenance outside complete RPC", () => {
    const executor = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobExecutor.ts",
    );
    assert.match(executor, /composeSocialPlannerIntelligence/);
    assert.match(executor, /generateHistoricallyDiverseSocialCalendar/);
    assert.match(executor, /Ready Social Calendar|status === "Ready"/);
    assert.match(executor, /heartbeatSocialCalendarGenerationJob|heartbeat\(/);
    assert.match(executor, /calendarContextJson/);
    assert.match(executor, /provenanceJson/);
    assert.doesNotMatch(executor, /\.update\(/);
    assert.doesNotMatch(executor, /calendar_context_json:/);
    assert.doesNotMatch(executor, /thinkDifferentlyWorkflow/);
    assert.doesNotMatch(executor, /from\("athena_social_calendars"\)\.update/);
  });

  it("L6 API does not add delete, regeneration, or a second worker", () => {
    const listRoute = read("app/api/social-planner/route.ts");
    const detailRoute = read("app/api/social-planner/[id]/route.ts");
    assert.doesNotMatch(listRoute, /export async function DELETE/);
    assert.doesNotMatch(detailRoute, /export async function DELETE/);
    assert.doesNotMatch(listRoute, /think_differently/);
    assert.doesNotMatch(detailRoute, /conversation/);
    const ecosystem = read("ecosystem.config.cjs");
    assert.equal((ecosystem.match(/name: "athena-worker"/g) ?? []).length, 1);
    assert.doesNotMatch(ecosystem, /social-planner-worker/i);
  });
});
