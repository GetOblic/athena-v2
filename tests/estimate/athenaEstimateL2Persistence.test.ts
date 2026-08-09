import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapAthenaEstimateRow } from "../../services/estimate/athenaEstimateMappers";
import { mapEstimateGenerationJobRow } from "../../services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Athena Estimate L2 persistence + orchestration", () => {
  it("persistence service exposes create/list/get/relationship/enqueue-failure helpers", () => {
    const service = read("services/estimate/athenaEstimateService.ts");
    assert.match(service, /export async function createQueuedAthenaEstimate/);
    assert.match(service, /export async function listAthenaEstimatesForLicensee/);
    assert.match(service, /export async function getAthenaEstimateByIdForLicensee/);
    assert.match(
      service,
      /export async function getAthenaEstimateByIdForLicenseeIncludingHidden/,
    );
    assert.match(service, /export async function hideAthenaEstimateForLicensee/);
    assert.match(service, /export async function getEstimateRelationshipConnected/);
    assert.match(service, /export async function getEstimateRelationshipConnectedMap/);
    assert.match(service, /export async function markAthenaEstimateEnqueueFailed/);
    assert.match(service, /export async function loadOrganizationNameSnapshot/);
    assert.match(service, /\.is\("hidden_at", null\)/);
    assert.match(service, /resolveLicenseeSubAccountTitle/);
    assert.match(service, /licenseeAccountId: string/);
    assert.match(service, /organizationId: string/);
    // Package mutation / Ready completion is not an application-service concern.
    assert.doesNotMatch(service, /package_json:\s*input/);
    assert.doesNotMatch(service, /status:\s*"Ready"/);
  });

  it("orchestration wires Master auth → ownership → snapshot → create → enqueue", () => {
    const orchestration = read(
      "services/estimate/athenaEstimateOrchestration.ts",
    );
    assert.match(orchestration, /export async function createAthenaEstimateWithJob/);
    assert.match(orchestration, /export async function listAthenaEstimatesForMaster/);
    assert.match(orchestration, /export async function getAthenaEstimateDetailForMaster/);
    assert.match(orchestration, /export async function regenerateAthenaEstimate/);
    assert.match(orchestration, /export async function hideAthenaEstimateForMaster/);
    assert.match(orchestration, /requireLicenseeMasterAccount/);
    assert.match(orchestration, /assertLicenseeOwnsSubAccount/);
    assert.match(orchestration, /markAthenaEstimateEnqueueFailed/);
    assert.match(orchestration, /Failure safety \(mirrors SEO\/Ads\)/);
    assert.match(
      orchestration,
      /loadOrganizationNameSnapshot\(\{\s*licenseeAccountId,\s*organizationId,\s*\}\)/,
    );
  });

  it("maps estimate and job rows without requiring Ready package", () => {
    const estimate = mapAthenaEstimateRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      licensee_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requested_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      organization_name_snapshot: "Snapshot Co",
      request_json: {
        projectNeed: "Build a landing page",
        timeframe: "flexible",
      },
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      currency_code: null,
      geography_label: null,
      currency_resolution: null,
      instruction_config_key: null,
      instruction_revision_id: null,
      instruction_configured: false,
      created_at: "2026-08-09T12:00:00.000Z",
      updated_at: "2026-08-09T12:00:00.000Z",
    });
    assert.equal(estimate.status, "Queued");
    assert.equal(estimate.organization_name_snapshot, "Snapshot Co");
    assert.equal(estimate.request_json.projectNeed, "Build a landing page");
    assert.equal(estimate.request_json.timeframe, "flexible");
    assert.equal(estimate.package_json, null);

    const job = mapEstimateGenerationJobRow({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      licensee_account_id: estimate.licensee_account_id,
      organization_id: estimate.organization_id,
      estimate_id: estimate.id,
      status: "queued",
      generation_stage: "assembling_context",
      attempt_count: 0,
      max_attempts: 3,
      claimed_by: null,
      claim_token: null,
      claimed_at: null,
      claim_expires_at: null,
      heartbeat_at: null,
      next_attempt_at: null,
      error_code: null,
      error_message: null,
      error_metadata: null,
      requested_by: estimate.requested_by,
      started_at: null,
      completed_at: null,
      created_at: estimate.created_at,
      updated_at: estimate.updated_at,
    });
    assert.equal(job.estimate_id, estimate.id);
    assert.equal(job.status, "queued");
  });

  it("does not alter SEO/Ads enqueue services or worker priority", () => {
    const seo = read(
      "services/seo/seoGenerationJobs/seoGenerationJobService.ts",
    );
    const ads = read(
      "services/ads/adsGenerationJobs/adGenerationJobService.ts",
    );
    const worker = read("workers/athenaWorker.ts");
    assert.match(seo, /enqueueSeoGenerationJob/);
    assert.match(ads, /enqueueAdGenerationJob/);
    assert.doesNotMatch(seo, /athena_estimate/);
    assert.doesNotMatch(ads, /athena_estimate/);
    assert.doesNotMatch(worker, /athena_estimate_generation_jobs/);
    assert.doesNotMatch(worker, /enqueueAthenaEstimateGenerationJob/);
  });
});
