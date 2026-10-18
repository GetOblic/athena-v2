/**
 * Read-only Prospect Intelligence continuity for a converted Client.
 *
 * Loads the original Prospect in the Licensee Own Company. Does not copy,
 * hydrate, publish, generate, or train anything in either organization.
 */

import { parseLabeledDeploymentAssets } from "@/lib/deploymentAssets";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById, type Discussion } from "@/services/discussionService";
import type { ExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionTypes";
import { listExecutiveVersions } from "@/services/executiveVersions/executiveVersionService";
import {
  isProspectIntelligenceBridge,
} from "@/services/prospects/prospectBridgeMarker";
import {
  readSavedProspectDirectoryArtifacts,
  type ProspectDirectoryArtifactRecord,
} from "@/services/prospects/prospectDirectoryArtifacts";
import { getProspectById, type Prospect } from "@/services/prospects/prospectService";
import {
  isDeepWebsiteIntelligence,
  type DeepCrawledPage,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { getLatestDeepScrapeJobForProspect } from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import type { AthenaWebsiteDeepScrapeJob } from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  resolveClientProspectIntelligenceAuthority,
  type ClientProspectIntelligenceAuthority,
  type ClientProspectIntelligenceDenial,
} from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";

const KNOWLEDGE_BASE_ASSET_KEY = "knowledge_base_enhancement";

const WEBSITE_SECTION_KEYS = [
  "positioning",
  "products",
  "services",
  "about",
  "target_audience",
  "messaging",
  "value_proposition",
  "cta",
  "differentiators",
  "trust_signals",
  "contact_information",
  "brand_tone",
] as const;

export type ClientProspectIntelligenceTextSection = {
  key: string;
  text: string;
};

export type ClientProspectIntelligenceAssetView = {
  key: string;
  title: string;
  content: string;
};

export type ClientProspectIntelligenceVersionView = {
  id: string;
  versionNumber: number;
  generatedAt: string;
  analysis: DiscussionAnalysis | null;
  opportunity: {
    title: string | null;
    reason: string | null;
    recommendedAction: string | null;
  } | null;
  briefing: {
    summary: string | null;
    recommendedResponse: string | null;
    cta: string | null;
    painPoints: string | null;
  } | null;
  blueprint: {
    title: string | null;
    businessGoal: string | null;
    targetAudience: string | null;
    priority: string | null;
    notes: string | null;
  } | null;
  deploymentAssets: ClientProspectIntelligenceAssetView[];
  knowledgeBase: string | null;
};

export type ClientProspectIntelligenceView = {
  businessName: string;
  prospect: Prospect;
  discussion: {
    title: string;
    summary: string | null;
    body: string | null;
  } | null;
  websiteSections: ClientProspectIntelligenceTextSection[];
  generatedDescription: string | null;
  savedDescription: ProspectDirectoryArtifactRecord | null;
  savedKnowledgeBase: ProspectDirectoryArtifactRecord | null;
  directoryArtifactsAvailable: boolean;
  deepScrape: {
    provider: string | null;
    url: string | null;
    pagesAnalyzed: number | null;
    scrapedAt: string | null;
    pages: Array<{ url: string; title: string | null }>;
    jobStatus: string | null;
    jobPagesAnalyzed: number | null;
  } | null;
  currentVersion: ClientProspectIntelligenceVersionView | null;
  historicalVersions: ClientProspectIntelligenceVersionView[];
};

export type ClientProspectIntelligenceLoadResult =
  | { ok: true; view: ClientProspectIntelligenceView }
  | { ok: false; reason: ClientProspectIntelligenceDenial };

export function sourceProspectMatchesConversion(
  prospect: Pick<Prospect, "id" | "organization_id"> | null | undefined,
  conversion: { prospectId: string; sourceOrganizationId: string },
): prospect is Pick<Prospect, "id" | "organization_id"> {
  return (
    prospect != null &&
    prospect.id === conversion.prospectId &&
    prospect.organization_id === conversion.sourceOrganizationId
  );
}

export function retainAuthorizedProspectDiscussion(
  discussion: Discussion | null | undefined,
  input: { discussionId: string; sourceOrganizationId: string },
): Discussion | null {
  if (!discussion) return null;
  if (discussion.id !== input.discussionId) return null;
  if (!isProspectIntelligenceBridge(discussion)) return null;
  if (
    typeof discussion.organization_id === "string" &&
    discussion.organization_id !== input.sourceOrganizationId
  ) {
    return null;
  }
  return discussion;
}

export function retainAuthorizedExecutiveVersions(
  versions: readonly ExecutiveIntelligenceVersion[],
  input: { discussionId: string; sourceOrganizationId: string },
): ExecutiveIntelligenceVersion[] {
  return versions.filter(
    (version) =>
      version.discussion_id === input.discussionId &&
      version.organization_id === input.sourceOrganizationId,
  );
}

export function retainAuthorizedDeepScrapeJob(
  job: AthenaWebsiteDeepScrapeJob | null | undefined,
  input: { prospectId: string; sourceOrganizationId: string },
): AthenaWebsiteDeepScrapeJob | null {
  if (!job) return null;
  if (job.prospect_id !== input.prospectId) return null;
  if (job.organization_id !== input.sourceOrganizationId) return null;
  if (job.source_type !== "prospect") return null;
  return job;
}

export function selectSingleCurrentExecutiveVersion(
  versions: readonly ExecutiveIntelligenceVersion[],
): ExecutiveIntelligenceVersion | null {
  const current = versions.filter((version) => version.is_current);
  return current.length === 1 ? current[0] : null;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAnalysis(intelligence: unknown): DiscussionAnalysis | null {
  const record = readRecord(intelligence);
  const analysis = readRecord(record?.analysis);
  if (!analysis) return null;
  return analysis as DiscussionAnalysis;
}

function projectStoredExecutiveVersion(
  version: ExecutiveIntelligenceVersion,
): ClientProspectIntelligenceVersionView {
  const intelligence = readRecord(version.intelligence);
  const analysis = readAnalysis(intelligence);
  const opportunity = readRecord(intelligence?.opportunity);
  const briefing = readRecord(intelligence?.briefing);
  const blueprint = readRecord(intelligence?.blueprint);
  const suggestedCta = readText(analysis?.suggested_cta);
  const assets = parseLabeledDeploymentAssets(suggestedCta);
  const knowledgeBaseMatches = assets.filter(
    (asset) => asset.assetKey === KNOWLEDGE_BASE_ASSET_KEY && asset.content.trim(),
  );
  const opportunityTitle = readText(opportunity?.title);
  const opportunityReason = readText(opportunity?.reason);
  const opportunityAction = readText(opportunity?.recommended_action);
  const briefingSummary = readText(briefing?.summary);
  const briefingResponse = readText(briefing?.recommended_response);
  const briefingCta = readText(briefing?.cta);
  const briefingPain = readText(briefing?.pain_points);
  const blueprintTitle = readText(blueprint?.asset_title);
  const blueprintGoal = readText(blueprint?.business_goal);
  const blueprintAudience = readText(blueprint?.target_audience);
  const blueprintPriority = readText(blueprint?.priority);
  const blueprintNotes = readText(blueprint?.notes);

  return {
    id: version.id,
    versionNumber: version.version_number,
    generatedAt: version.generated_at,
    analysis,
    opportunity:
      opportunityTitle || opportunityReason || opportunityAction
        ? {
            title: opportunityTitle,
            reason: opportunityReason,
            recommendedAction: opportunityAction,
          }
        : null,
    briefing:
      briefingSummary || briefingResponse || briefingCta || briefingPain
        ? {
            summary: briefingSummary,
            recommendedResponse: briefingResponse,
            cta: briefingCta,
            painPoints: briefingPain,
          }
        : null,
    blueprint:
      blueprintTitle ||
      blueprintGoal ||
      blueprintAudience ||
      blueprintPriority ||
      blueprintNotes
        ? {
            title: blueprintTitle,
            businessGoal: blueprintGoal,
            targetAudience: blueprintAudience,
            priority: blueprintPriority,
            notes: blueprintNotes,
          }
        : null,
    deploymentAssets: assets
      .filter((asset) => asset.assetKey !== KNOWLEDGE_BASE_ASSET_KEY)
      .filter((asset) => asset.content.trim().length > 0)
      .map((asset) => ({
        key: asset.assetKey ?? asset.title,
        title: asset.title,
        content: asset.content.trim(),
      })),
    knowledgeBase:
      knowledgeBaseMatches.length === 1
        ? knowledgeBaseMatches[0].content.trim()
        : null,
  };
}

function websiteSectionsFrom(
  websiteIntelligence: Record<string, unknown> | null,
): ClientProspectIntelligenceTextSection[] {
  if (!websiteIntelligence) return [];
  return WEBSITE_SECTION_KEYS.flatMap((key) => {
    const text = readText(websiteIntelligence[key]);
    return text ? [{ key, text }] : [];
  });
}

function deepPageTitle(page: DeepCrawledPage): string | null {
  return readText(page.title);
}

function projectDeepScrape(input: {
  websiteIntelligence: Record<string, unknown> | null;
  job: AthenaWebsiteDeepScrapeJob | null;
}): ClientProspectIntelligenceView["deepScrape"] {
  const deep = isDeepWebsiteIntelligence(input.websiteIntelligence)
    ? input.websiteIntelligence
    : null;
  if (!deep && !input.job) return null;
  return {
    provider: deep ? deep.provider : null,
    url: deep?.url ?? readText(input.job?.root_url),
    pagesAnalyzed: deep?.pages_analyzed ?? null,
    scrapedAt: deep ? readText(deep.scraped_at) : null,
    pages:
      deep && Array.isArray(deep.pages)
        ? deep.pages.flatMap((page) => {
            if (!page || typeof page.url !== "string" || !page.url.trim()) {
              return [];
            }
            return [{ url: page.url, title: deepPageTitle(page) }];
          })
        : [],
    jobStatus: input.job?.status ?? null,
    jobPagesAnalyzed:
      input.job && Number.isFinite(input.job.pages_analyzed)
        ? input.job.pages_analyzed
        : null,
  };
}

export function buildClientProspectIntelligenceView(input: {
  prospect: Prospect;
  discussion: Discussion | null;
  versions: readonly ExecutiveIntelligenceVersion[];
  job: AthenaWebsiteDeepScrapeJob | null;
  savedDescription: ProspectDirectoryArtifactRecord | null;
  savedKnowledgeBase: ProspectDirectoryArtifactRecord | null;
  directoryArtifactsAvailable: boolean;
}): ClientProspectIntelligenceView {
  const current = selectSingleCurrentExecutiveVersion(input.versions);
  const historical = input.versions.filter((version) => version.id !== current?.id);
  return {
    businessName: input.prospect.business_name,
    prospect: input.prospect,
    discussion: input.discussion
      ? {
          title: input.discussion.title,
          summary: readText(input.discussion.summary),
          body: readText(input.discussion.body),
        }
      : null,
    websiteSections: websiteSectionsFrom(input.prospect.website_intelligence),
    generatedDescription: readText(
      input.prospect.generated_listing_description?.description,
    ),
    savedDescription: input.savedDescription,
    savedKnowledgeBase: input.savedKnowledgeBase,
    directoryArtifactsAvailable: input.directoryArtifactsAvailable,
    deepScrape: projectDeepScrape({
      websiteIntelligence: input.prospect.website_intelligence,
      job: input.job,
    }),
    currentVersion: current ? projectStoredExecutiveVersion(current) : null,
    historicalVersions: historical.map(projectStoredExecutiveVersion),
  };
}

export async function loadClientProspectIntelligence(
  clientOrganizationId: string,
): Promise<ClientProspectIntelligenceLoadResult> {
  const authority: ClientProspectIntelligenceAuthority =
    await resolveClientProspectIntelligenceAuthority(clientOrganizationId);
  if (!authority.ok) {
    return authority;
  }

  const { conversion } = authority;
  const prospect = await getProspectById(
    conversion.prospectId,
    conversion.sourceOrganizationId,
  );
  if (!sourceProspectMatchesConversion(prospect, conversion)) {
    return { ok: false, reason: "source_mismatch" };
  }

  const discussionId = readText(prospect.linked_discussion_id);
  const loadedDiscussion = discussionId
    ? await getDiscussionById(discussionId, conversion.sourceOrganizationId)
    : null;
  const discussion = retainAuthorizedProspectDiscussion(loadedDiscussion, {
    discussionId: discussionId ?? "",
    sourceOrganizationId: conversion.sourceOrganizationId,
  });

  const versions = discussion
    ? retainAuthorizedExecutiveVersions(
        await listExecutiveVersions(
          discussion.id,
          conversion.sourceOrganizationId,
        ),
        {
          discussionId: discussion.id,
          sourceOrganizationId: conversion.sourceOrganizationId,
        },
      )
    : [];

  const job = retainAuthorizedDeepScrapeJob(
    await getLatestDeepScrapeJobForProspect({
      prospectId: prospect.id,
      organizationId: conversion.sourceOrganizationId,
    }),
    {
      prospectId: prospect.id,
      sourceOrganizationId: conversion.sourceOrganizationId,
    },
  );

  const savedArtifacts = await readSavedProspectDirectoryArtifacts({
    prospectId: prospect.id,
    sourceOrganizationId: conversion.sourceOrganizationId,
  });

  return {
    ok: true,
    view: buildClientProspectIntelligenceView({
      prospect,
      discussion,
      versions,
      job,
      savedDescription: savedArtifacts.ok ? savedArtifacts.description : null,
      savedKnowledgeBase: savedArtifacts.ok
        ? savedArtifacts.knowledgeBase
        : null,
      directoryArtifactsAvailable: savedArtifacts.ok,
    }),
  };
}
