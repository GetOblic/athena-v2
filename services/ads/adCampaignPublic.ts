/**
 * Public API shapes for Ad campaigns — never trust client org ownership.
 */

import type {
  AdCampaign,
  AdCampaignBrief,
  AdCampaignGenerationStage,
  AdCampaignPackage,
  AdCampaignStatus,
} from "@/services/ads/adCampaignTypes";

export type PublicAdCampaignSummary = {
  id: string;
  name: string;
  status: AdCampaignStatus;
  generationStage: AdCampaignGenerationStage | null;
  objective: string | null;
  campaignTheme: string | null;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PublicAdCampaignDetail = PublicAdCampaignSummary & {
  brief: AdCampaignBrief;
  package: AdCampaignPackage | null;
};

/** Ready campaigns expose package; processing/failed never expose partial packages. */
export function toPublicAdCampaignSummary(campaign: AdCampaign): PublicAdCampaignSummary {
  const isReady = campaign.status === "Ready";
  const pkg = isReady ? campaign.package_json : null;

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    generationStage: campaign.generation_stage,
    objective: pkg?.strategy.objective ?? null,
    campaignTheme: pkg?.googleSearch.campaignTheme ?? null,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    errorCode: campaign.error_code,
    errorMessage: campaign.error_message,
  };
}

export function toPublicAdCampaignDetail(campaign: AdCampaign): PublicAdCampaignDetail {
  const summary = toPublicAdCampaignSummary(campaign);
  const isReady = campaign.status === "Ready";

  return {
    ...summary,
    brief: campaign.brief_json ?? {},
    package: isReady ? campaign.package_json : null,
  };
}

export type PublicAdCampaignStatus = {
  id: string;
  status: AdCampaignStatus;
  generationStage: AdCampaignGenerationStage | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
  isReady: boolean;
  isFailed: boolean;
  isInFlight: boolean;
};

export function toPublicAdCampaignStatus(campaign: AdCampaign): PublicAdCampaignStatus {
  return {
    id: campaign.id,
    status: campaign.status,
    generationStage: campaign.generation_stage,
    errorCode: campaign.error_code,
    errorMessage: campaign.error_message,
    updatedAt: campaign.updated_at,
    isReady: campaign.status === "Ready",
    isFailed: campaign.status === "Processing Failed",
    isInFlight:
      campaign.status === "Queued" || campaign.status === "Processing",
  };
}
