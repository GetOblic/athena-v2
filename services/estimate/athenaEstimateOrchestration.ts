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
 *
 * L14/L15:
 * Optional Prospect commercial target may be authorized, snapshotted, and persisted
 * on create/regenerate. Generation (L15) re-fetches the Prospect and freezes bounded
 * Prospect Commercial Target Intelligence into prospect_generation_context_json at Ready.
 * Org-only Estimates remain V26 org-context with null frozen Prospect context.
 */

import { normalizeEstimateRequest } from "@/services/estimate/athenaEstimateRequest";
import {
  AthenaEstimateProspectResolutionError,
  isRemovedAthenaEstimateProspectTarget,
  resolveAthenaEstimateProspectTarget,
} from "@/services/estimate/athenaEstimateProspectTarget";
import {
  AthenaEstimateNotFoundError,
  createQueuedAthenaEstimate,
  getAthenaEstimateByIdForLicensee,
  getEstimateRelationshipConnected,
  getEstimateRelationshipConnectedMap,
  hideAthenaEstimateForLicensee,
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
import { getProspects } from "@/services/prospects/prospectService";
import type { EstimateRequest } from "@/services/estimate/athenaEstimateTypes";

export class AthenaEstimateOrchestrationNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "Estimate not found.") {
    super(message);
    this.name = "AthenaEstimateOrchestrationNotFoundError";
  }
}

export {
  AthenaEstimateProspectResolutionError,
} from "@/services/estimate/athenaEstimateProspectTarget";

/** Minimal Master selector contract — id + businessName only. */
export type AthenaEstimateProspectOption = {
  id: string;
  businessName: string;
};

/**
 * Master-authorized Prospect discovery for a selected sub-account.
 * Auth sequence must run before this is called, or call the list helper which
 * performs the full Master → ownership → org-bound load chain.
 */
export async function listAthenaEstimateProspectsForMaster(input: {
  masterUserId: string;
  organizationId: string;
}): Promise<AthenaEstimateProspectOption[]> {
  await requireLicenseeMasterAccount(input.masterUserId);
  const organizationId = input.organizationId.trim();

  await assertLicenseeOwnsSubAccount({
    masterUserId: input.masterUserId,
    organizationId,
  });

  // Only after ownership assertion: load Prospects for EXACTLY this organizationId.
  const prospects = await getProspects(organizationId);
  return prospects.map((prospect) => ({
    id: prospect.id,
    businessName: prospect.business_name,
  }));
}

export async function createAthenaEstimateWithJob(input: {
  masterUserId: string;
  organizationId: string;
  request: EstimateRequest | unknown;
  /** Optional commercial Prospect target id (V27). Org-only when omitted/null. */
  prospectId?: string | null;
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

  // Resolve Prospect under the SAME authorized organizationId (identity only).
  // Never trust client-supplied business-name snapshots or generation context.
  const prospectTarget = await resolveAthenaEstimateProspectTarget({
    organizationId,
    prospectId: input.prospectId,
  });

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
    prospectId: prospectTarget.prospectId,
    prospectBusinessNameSnapshot:
      prospectTarget.prospectBusinessNameSnapshot,
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
 *
 * Prospect-targeted sources re-resolve the live Prospect under the source
 * organization; business-name snapshot is refreshed from current business_name.
 * Removed-Prospect historical rows (null id + retained snapshot) fail closed.
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

  // Removed Prospect: id SET NULL, snapshot retained → do not create a new Estimate.
  // Do NOT reconstruct target from snapshot or frozen generation context.
  if (
    isRemovedAthenaEstimateProspectTarget({
      prospectId: source.prospect_id,
      prospectBusinessNameSnapshot: source.prospect_business_name_snapshot,
    })
  ) {
    throw new AthenaEstimateProspectResolutionError(
      "Prospect target is no longer available for regenerate.",
    );
  }

  // Org-only: both null. Active Prospect: non-null prospect_id (re-resolved in create).
  const created = await createAthenaEstimateWithJob({
    masterUserId: input.masterUserId,
    organizationId: source.organization_id,
    request: source.request_json,
    prospectId: source.prospect_id,
  });

  return {
    ...created,
    regeneratedFrom: source.id,
  };
}

/**
 * Soft-hide a Master-owned Estimate.
 * Current sub-account relationship is NOT required — hide manages Master history.
 * Does not cancel generation, alter job state, or mutate package/request/provenance.
 * Works for org-only, active Prospect, and removed-Prospect historical Estimates.
 */
export async function hideAthenaEstimateForMaster(input: {
  masterUserId: string;
  estimateId: string;
}): Promise<void> {
  const masterAccount = await requireLicenseeMasterAccount(input.masterUserId);
  try {
    await hideAthenaEstimateForLicensee({
      licenseeAccountId: masterAccount.id,
      estimateId: input.estimateId,
    });
  } catch (error) {
    if (error instanceof AthenaEstimateNotFoundError) {
      throw new AthenaEstimateOrchestrationNotFoundError();
    }
    throw error;
  }
}
