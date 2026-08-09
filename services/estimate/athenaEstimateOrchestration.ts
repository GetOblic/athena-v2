/**
 * Create / regenerate Athena Estimates with failure-safe job enqueue.
 * Master-authorized; uses assertLicenseeOwnsSubAccount for current access.
 *
 * Failure safety (mirrors SEO/Ads):
 * 1. Insert Estimate (Queued)
 * 2. Try enqueue generation job
 * 3. On enqueue failure → markAthenaEstimateEnqueueFailed (Processing Failed) → rethrow
 *
 * No DB transaction wrapping create+enqueue. No delete-on-failure.
 * Worker claim/complete remains later-phase RPC responsibility.
 */

import { normalizeEstimateRequest } from "@/services/estimate/athenaEstimateRequest";
import {
  createQueuedAthenaEstimate,
  getAthenaEstimateByIdForLicensee,
  getEstimateRelationshipConnected,
  getEstimateRelationshipConnectedMap,
  listAthenaEstimatesForLicensee,
  loadOrganizationNameSnapshot,
  markAthenaEstimateEnqueueFailed,
  type AthenaEstimate,
} from "@/services/estimate/athenaEstimateService";
import {
  toPublicAthenaEstimateDetail,
  toPublicAthenaEstimateSummary,
  type PublicAthenaEstimateDetail,
  type PublicAthenaEstimateSummary,
} from "@/services/estimate/athenaEstimatePublic";
import { enqueueAthenaEstimateGenerationJob } from "@/services/estimate/estimateGenerationJobs/estimateGenerationJobService";
import type { AthenaEstimateGenerationJob } from "@/services/estimate/estimateGenerationJobs/estimateGenerationJobTypes";
import { assertLicenseeOwnsSubAccount } from "@/services/licensee/licenseeIdentity";
import { requireLicenseeMasterAccount } from "@/services/licensee/licenseeSubAccounts";
import type { EstimateRequest } from "@/services/estimate/athenaEstimateTypes";

export class AthenaEstimateOrchestrationNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Estimate not found.") {
    super(message);
    this.name = "AthenaEstimateOrchestrationNotFoundError";
  }
}

export async function createAthenaEstimateWithJob(input: {
  masterUserId: string;
  organizationId: string;
  request: EstimateRequest | unknown;
}): Promise<{
  estimate: AthenaEstimate;
  job: AthenaEstimateGenerationJob;
  relationshipConnected: boolean;
}> {
  const masterAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const organizationId = input.organizationId.trim();
  const request = normalizeEstimateRequest(input.request);

  const authorized = await assertLicenseeOwnsSubAccount({
    masterUserId: input.masterUserId,
    organizationId,
  });

  // Prefer the account id from the relationship authorization chain.
  const licenseeAccountId = authorized.licenseeAccountId;
  if (licenseeAccountId !== masterAccount.id) {
    // Defensive: both helpers resolve the same Master account.
    throw new Error("Licensee account identity mismatch.");
  }

  const organizationNameSnapshot = await loadOrganizationNameSnapshot({
    licenseeAccountId,
    organizationId,
  });

  const estimate = await createQueuedAthenaEstimate({
    licenseeAccountId,
    organizationId,
    requestedBy: input.masterUserId,
    organizationNameSnapshot,
    request,
  });

  try {
    const { job } = await enqueueAthenaEstimateGenerationJob({
      licenseeAccountId,
      organizationId,
      estimateId: estimate.id,
      requestedBy: input.masterUserId,
      allowExisting: false,
    });
    return {
      estimate,
      job,
      relationshipConnected: true,
    };
  } catch (error) {
    await markAthenaEstimateEnqueueFailed({
      estimateId: estimate.id,
      licenseeAccountId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue Estimate generation job.",
    });
    throw error;
  }
}

export async function listAthenaEstimatesForMaster(input: {
  masterUserId: string;
}): Promise<PublicAthenaEstimateSummary[]> {
  const masterAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const estimates = await listAthenaEstimatesForLicensee(masterAccount.id);
  const connectedMap = await getEstimateRelationshipConnectedMap({
    licenseeAccountId: masterAccount.id,
    organizationIds: estimates.map((row) => row.organization_id),
  });

  return estimates.map((estimate) =>
    toPublicAthenaEstimateSummary(
      estimate,
      connectedMap.get(estimate.organization_id) ?? false,
    ),
  );
}

export async function getAthenaEstimateDetailForMaster(input: {
  masterUserId: string;
  estimateId: string;
}): Promise<PublicAthenaEstimateDetail> {
  const masterAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const estimate = await getAthenaEstimateByIdForLicensee(
    input.estimateId,
    masterAccount.id,
  );
  if (!estimate) {
    throw new AthenaEstimateOrchestrationNotFoundError();
  }

  const relationshipConnected = await getEstimateRelationshipConnected({
    licenseeAccountId: masterAccount.id,
    organizationId: estimate.organization_id,
  });

  return toPublicAthenaEstimateDetail(estimate, relationshipConnected);
}

/**
 * Regenerate creates a NEW Estimate row + job from the previous request_json.
 * Ready (and all) source Estimates are never overwritten.
 * Requires CURRENT sub-account relationship (create path ownership assert).
 */
export async function regenerateAthenaEstimate(input: {
  masterUserId: string;
  sourceEstimateId: string;
}): Promise<{
  estimate: AthenaEstimate;
  job: AthenaEstimateGenerationJob;
  relationshipConnected: boolean;
  regeneratedFrom: string;
}> {
  const masterAccount = await requireLicenseeMasterAccount(input.masterUserId);
  const source = await getAthenaEstimateByIdForLicensee(
    input.sourceEstimateId,
    masterAccount.id,
  );
  if (!source) {
    throw new AthenaEstimateOrchestrationNotFoundError();
  }

  const created = await createAthenaEstimateWithJob({
    masterUserId: input.masterUserId,
    organizationId: source.organization_id,
    request: source.request_json,
  });

  return {
    ...created,
    regeneratedFrom: source.id,
  };
}
