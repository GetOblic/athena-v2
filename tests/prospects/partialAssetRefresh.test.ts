import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ATHENA_GENERATION_TRIGGER_TYPES,
  isPartialRefreshTriggerType,
} from "../../services/generationJobs/generationJobTypes";
import {
  parsePartialRefreshScope,
  triggerTypeForPartialRefreshScope,
} from "../../services/generationJobs/partialRefreshScope";
import { resolveProspectWebsiteLearningDecision } from "../../services/prospects/prospectWebsiteLearningPolicy";
import {
  isPartialRefreshComplete,
  isRegenerationComplete,
} from "../../lib/discussionRegenerationStatus";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("V6 Sprint 3 — Partial Deployment / Strategic refresh", () => {
  it("migration extends trigger_type constraint with partial refresh values", () => {
    const migration = read(
      "supabase/migrations/20260722000001_add_partial_refresh_trigger_types.sql",
    );
    assert.match(migration, /deployment_assets_refresh/);
    assert.match(migration, /strategic_assets_refresh/);
    assert.match(migration, /manual_refresh/);
    assert.match(migration, /discussion_import/);
    assert.match(migration, /discussion_update/);
    assert.doesNotMatch(migration, /update\s+athena_generation_jobs/i);
  });

  it("TypeScript unions include partial refresh triggers", () => {
    assert.ok(
      ATHENA_GENERATION_TRIGGER_TYPES.includes("deployment_assets_refresh"),
    );
    assert.ok(
      ATHENA_GENERATION_TRIGGER_TYPES.includes("strategic_assets_refresh"),
    );
    assert.equal(isPartialRefreshTriggerType("deployment_assets_refresh"), true);
    assert.equal(isPartialRefreshTriggerType("manual_refresh"), false);
  });

  it("scope parsing maps to persisted trigger types", () => {
    assert.equal(parsePartialRefreshScope("deployment_assets"), "deployment_assets");
    assert.equal(parsePartialRefreshScope("strategic_assets"), "strategic_assets");
    assert.equal(parsePartialRefreshScope("full"), null);
    assert.equal(
      triggerTypeForPartialRefreshScope("deployment_assets"),
      "deployment_assets_refresh",
    );
    assert.equal(
      triggerTypeForPartialRefreshScope("strategic_assets"),
      "strategic_assets_refresh",
    );
  });

  it("1-4. Discussion and Prospect APIs enqueue scoped partial refreshes only", () => {
    const discussionRoute = read("app/api/discussions/[id]/refresh/route.ts");
    const prospectRoute = read("app/api/prospects/[id]/refresh/route.ts");
    const api = read("services/generationJobs/partialRefreshApi.ts");
    const scope = read("services/generationJobs/partialRefreshScope.ts");
    const enqueue = read("services/generationJobs/partialRefreshEnqueue.ts");

    assert.match(discussionRoute, /parsePartialRefreshScope/);
    assert.match(prospectRoute, /parsePartialRefreshScope/);
    assert.match(api, /queuePartialAssetRefreshForDiscussion/);
    assert.match(api, /triggerTypeForPartialRefreshScope/);
    assert.match(scope, /deployment_assets_refresh/);
    assert.match(scope, /strategic_assets_refresh/);
    assert.match(enqueue, /sameScope/);
    assert.match(enqueue, /FULL_GENERATION_ACTIVE/);
    assert.match(enqueue, /INCOMPATIBLE_PARTIAL_SCOPE/);
    assert.doesNotMatch(enqueue, /markDiscussionPendingGenerationFollowUp/);
  });

  it("5/6/19/20. worker runs only selected stage and uses typed publish", () => {
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    const workflow = read("services/workflows/partialRefreshWorkflow.ts");
    const ev = read("services/executiveVersions/executiveVersionService.ts");

    assert.match(executor, /processPartialAssetRefresh/);
    assert.match(executor, /isPartialRefreshTriggerType/);
    assert.match(
      executor,
      /if \(!isPartialRefreshTriggerType\(job\.trigger_type\)\) \{\s*await maybeEnqueueFollowUp/,
    );

    assert.match(workflow, /generateDeploymentAssets/);
    assert.match(workflow, /createAssetBlueprintForBriefing|createAssetBlueprintForDiscussionAnalysis/);
    assert.match(workflow, /getCurrentExecutiveVersion/);
    assert.match(workflow, /publishPartialRefreshExecutiveVersion/);
    assert.match(workflow, /sourceIntel\.blueprint/);
    assert.match(workflow, /sourceIntel\.analysis/);

    // Deployment path must not call blueprint generation.
    const deploymentFn = workflow.slice(
      workflow.indexOf("async function runDeploymentPartialRefresh"),
      workflow.indexOf("async function runStrategicPartialRefresh"),
    );
    assert.doesNotMatch(deploymentFn, /createAssetBlueprint/);

    const strategicFn = workflow.slice(
      workflow.indexOf("async function runStrategicPartialRefresh"),
    );
    assert.doesNotMatch(strategicFn, /generateDeploymentAssets/);

    assert.match(ev, /publishPartialRefreshExecutiveVersion/);
    assert.match(ev, /__partialRefreshPublication/);
    assert.match(ev, /createPartialRefreshPublicationOptions/);
  });

  it("7-14/37. carry-forward uses published EV snapshot fields", () => {
    const workflow = read("services/workflows/partialRefreshWorkflow.ts");
    assert.match(workflow, /sourceVersion\.intelligence/);
    assert.match(workflow, /assembled: ExecutiveIntelligencePayload/);
    assert.match(
      workflow,
      /blueprint: input\.sourceIntel\.blueprint/,
    );
    assert.match(
      workflow,
      /analysis: input\.sourceIntel\.analysis/,
    );
    assert.doesNotMatch(workflow, /loadLiveExecutiveIntelligence/);
  });

  it("15-18. typed partial publish allows same analysis_id; global gate remains", () => {
    const ev = read("services/executiveVersions/executiveVersionService.ts");
    const publishFull = ev.slice(
      ev.indexOf("export async function publishExecutiveIntelligenceVersion"),
      ev.indexOf("async function patchIncompleteCurrentExecutiveVersion"),
    );
    assert.match(
      publishFull,
      /current\.analysis_id === intelligence\.analysis\.id/,
    );
    assert.doesNotMatch(publishFull, /__partialRefreshPublication/);

    const publishPartial = ev.slice(
      ev.indexOf("export async function publishPartialRefreshExecutiveVersion"),
      ev.indexOf("export async function publishExecutiveIntelligenceVersion"),
    );
    assert.match(publishPartial, /insertExecutiveVersion/);
    assert.doesNotMatch(
      publishPartial,
      /current\.analysis_id === intelligence\.analysis\.id/,
    );
  });

  it("21-26. enqueue conflict and no follow-up conversion", () => {
    const enqueue = read("services/generationJobs/partialRefreshEnqueue.ts");
    assert.match(enqueue, /PartialRefreshConflictError/);
    assert.match(enqueue, /Never coalesces into discussion_update/);
    assert.doesNotMatch(enqueue, /triggerType:\s*"discussion_update"/);
    assert.doesNotMatch(enqueue, /triggerType:\s*"manual_refresh"/);
    assert.doesNotMatch(enqueue, /markDiscussionPendingGenerationFollowUp/);

    const executor = read("services/generationJobs/generationJobExecutor.ts");
    assert.match(
      executor,
      /if \(!isPartialRefreshTriggerType\(job\.trigger_type\)\) \{\s*await maybeEnqueueFollowUp/,
    );
  });

  it("27-30. full generation paths still use processDiscussionEndToEnd", () => {
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    assert.match(executor, /processDiscussionEndToEnd/);
    assert.match(executor, /explicitRegeneration: job\.trigger_type === "manual_refresh"/);

    const analyze = read("app/api/discussions/[id]/analyze/route.ts");
    assert.match(analyze, /triggerType:\s*"manual_refresh"/);

    const importer = read("services/prospects/prospectImporter.ts");
    assert.match(
      importer,
      /triggerType:\s*options\?\.triggerType \?\? "discussion_import"/,
    );
  });

  it("31. website learning does not crawl for partial refresh", () => {
    assert.deepEqual(
      resolveProspectWebsiteLearningDecision({
        triggerType: "deployment_assets_refresh",
        hasWebsite: true,
        websiteIntelligence: null,
      }),
      { shouldCrawl: false, reason: "intelligence_refresh" },
    );
    assert.deepEqual(
      resolveProspectWebsiteLearningDecision({
        triggerType: "strategic_assets_refresh",
        hasWebsite: true,
        websiteIntelligence: null,
      }),
      { shouldCrawl: false, reason: "intelligence_refresh" },
    );
  });

  it("32/35. status polling and completion use published version id", () => {
    const status = read("app/api/discussions/[id]/status/route.ts");
    assert.match(status, /jobTriggerType/);
    assert.match(status, /publishedVersionId/);

    assert.equal(
      isPartialRefreshComplete(
        { publishedVersionId: "v1" },
        {
          ...{
            latestAnalysisId: null,
            latestAnalysisCreatedAt: null,
            latestAnalysisUpdatedAt: null,
            blueprintUpdatedAt: null,
            regenerationInFlight: false,
            jobStatus: "completed",
            publishedVersionId: "v2",
            jobTriggerType: "deployment_assets_refresh",
          },
        },
      ),
      true,
    );
    assert.equal(
      isRegenerationComplete(
        {
          latestAnalysisUpdatedAt: null,
          blueprintUpdatedAt: null,
          publishedVersionId: "v1",
        },
        {
          latestAnalysisId: null,
          latestAnalysisCreatedAt: null,
          latestAnalysisUpdatedAt: null,
          blueprintUpdatedAt: null,
          regenerationInFlight: false,
          jobStatus: "completed",
          publishedVersionId: "v2",
          jobTriggerType: "strategic_assets_refresh",
        },
        Date.now(),
      ),
      true,
    );
  });

  it("33/34. UI renders both buttons on Discussion and Prospect pages", () => {
    const header = read("components/discussions/DiscussionHeaderActions.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    const actions = read("components/discussions/PartialRefreshActions.tsx");

    assert.match(header, /PartialRefreshActions/);
    assert.match(prospectPage, /PartialRefreshActions/);
    assert.match(actions, /Refresh Deployment Assets/);
    assert.match(actions, /Refresh Strategic Assets/);
    assert.doesNotMatch(header, /Refresh Intelligence/);
    assert.doesNotMatch(prospectPage, /ProspectRefreshIntelligenceButton/);
  });

  it("36. tenant isolation remains via organization context", () => {
    const api = read("services/generationJobs/partialRefreshApi.ts");
    assert.match(api, /getDiscussionById/);
    assert.match(api, /organizationId/);
    const discussionRoute = read("app/api/discussions/[id]/refresh/route.ts");
    assert.match(discussionRoute, /requireCurrentOrganizationContext/);
    const prospectRoute = read("app/api/prospects/[id]/refresh/route.ts");
    assert.match(prospectRoute, /requireCurrentOrganizationContext/);
    assert.match(prospectRoute, /getProspectById/);
  });

  it("38/39. publication safeguards remain wired", () => {
    const workflow = read("services/workflows/partialRefreshWorkflow.ts");
    assert.match(workflow, /validateProspectDeploymentAssetPayload/);
    assert.match(workflow, /requireProspectCompleteness/);
    assert.match(workflow, /IncompleteProspectDeploymentAssetsError/);
  });

  it("no second job framework introduced", () => {
    const files = readdirSync(join(ROOT, "services/generationJobs"));
    assert.ok(files.includes("partialRefreshEnqueue.ts"));
    assert.ok(files.includes("generationJobRunner.ts"));
  });
});
