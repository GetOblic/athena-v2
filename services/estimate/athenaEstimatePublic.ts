/**
 * Public API shapes for Athena Estimates — Licensee Master scoped.
 * Never trust client ownership fields.
 *
 * Prospect identity/status (V27 L14) is exposed for later UI.
 * Frozen Prospect generation context is NEVER exposed publicly.
 */

import {
  deriveAthenaEstimateProspectRemoved,
} from "@/services/estimate/athenaEstimateProspectTarget";
import type {
  AthenaEstimate,
  AthenaEstimateGenerationStage,
  AthenaEstimatePackage,
  AthenaEstimateStatus,
  AthenaEstimateCurrencyResolution,
  EstimateMoney,
  EstimateRequest,
} from "@/services/estimate/athenaEstimateTypes";

export type PublicAthenaEstimateSummary = {
  id: string;
  organizationId: string;
  organizationNameSnapshot: string;
  request: EstimateRequest;
  status: AthenaEstimateStatus;
  generationStage: AthenaEstimateGenerationStage | string | null;
  currencyCode: string | null;
  geographyLabel: string | null;
  currencyResolution: AthenaEstimateCurrencyResolution | null;
  /** Ready only — for Master history list display; never expose partial packages. */
  recommendedClientPrice: EstimateMoney | null;
  /** Optional commercial Prospect target id; null when org-only or Prospect removed. */
  prospectId: string | null;
  /** Frozen Prospect business name at create (retained after rename/deletion). */
  prospectBusinessNameSnapshot: string | null;
  /**
   * True when historical Prospect-targeted Estimate lost its live prospect_id
   * (ON DELETE SET NULL) but retained the business-name snapshot.
   */
  prospectRemoved: boolean;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  relationshipConnected: boolean;
};

export type PublicAthenaEstimateDetail = PublicAthenaEstimateSummary & {
  package: AthenaEstimatePackage | null;
};

/** Ready Estimates expose package; processing/failed never expose partial packages. */
export function toPublicAthenaEstimateSummary(
  estimate: AthenaEstimate,
  relationshipConnected: boolean,
): PublicAthenaEstimateSummary {
  const isReady = estimate.status === "Ready";
  const recommendedClientPrice =
    isReady && estimate.package_json?.recommendedClientPrice
      ? estimate.package_json.recommendedClientPrice
      : null;

  const prospectId = estimate.prospect_id;
  const prospectBusinessNameSnapshot =
    estimate.prospect_business_name_snapshot;

  return {
    id: estimate.id,
    organizationId: estimate.organization_id,
    organizationNameSnapshot: estimate.organization_name_snapshot,
    request: estimate.request_json,
    status: estimate.status,
    generationStage: estimate.generation_stage,
    currencyCode: estimate.currency_code,
    geographyLabel: estimate.geography_label,
    currencyResolution: estimate.currency_resolution,
    recommendedClientPrice,
    prospectId,
    prospectBusinessNameSnapshot,
    prospectRemoved: deriveAthenaEstimateProspectRemoved({
      prospectId,
      prospectBusinessNameSnapshot,
    }),
    createdAt: estimate.created_at,
    updatedAt: estimate.updated_at,
    errorCode: estimate.error_code,
    errorMessage: estimate.error_message,
    relationshipConnected,
  };
}

export function toPublicAthenaEstimateDetail(
  estimate: AthenaEstimate,
  relationshipConnected: boolean,
): PublicAthenaEstimateDetail {
  const summary = toPublicAthenaEstimateSummary(
    estimate,
    relationshipConnected,
  );
  const isReady = estimate.status === "Ready";

  return {
    ...summary,
    package: isReady ? estimate.package_json : null,
  };
}
