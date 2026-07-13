export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ReactNode } from "react";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { DiscussionWorkflowStrip } from "@/components/discussions/DiscussionWorkflowStrip";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { AppendProspectInformationForm } from "@/components/prospects/AppendProspectInformationForm";
import { ProspectHomepageIntelligence } from "@/components/prospects/ProspectHomepageIntelligence";
import { ProspectLifecycleStatusControl } from "@/components/prospects/ProspectLifecycleStatusControl";
import { ProspectMetadataEditor } from "@/components/prospects/ProspectMetadataEditor";
import {
  formatProspectOpportunityScoreWithRecommendation,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityRecommendation,
  resolveProspectOpportunityScore,
} from "@/services/prospects/prospectDisplay";
import { normalizeProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";
import { getActiveGenerationJobForDiscussion } from "@/services/generationJobs/generationJobService";
import { buildDiscussionWorkflowSteps } from "@/lib/discussionWorkflow";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import {
  getExecutiveVersionsForDiscussionPage,
  loadLiveExecutiveIntelligence,
} from "@/services/executiveVersions/executiveVersionService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";

export default async function ProspectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const prospect = await getProspectById(id, organizationId);

  if (!prospect) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/prospects" className="text-sm text-[var(--athena-orange)]">
          ← Prospects
        </Link>
        <h1 className="mt-8 text-4xl font-semibold">Prospect not found</h1>
      </main>
    );
  }

  const discussionId = prospect.linked_discussion_id;
  const discussion = discussionId
    ? await getDiscussionById(discussionId, organizationId)
    : null;

  const [
    latestAnalysis,
    assetBlueprint,
    opportunity,
    versionState,
    liveIntelligence,
  ] = discussion
    ? await Promise.all([
        getLatestDiscussionAnalysis(discussion.id, organizationId),
        getDisplayAssetBlueprintByDiscussionId(discussion.id, organizationId),
        getOpportunityByDiscussionId(discussion.id, organizationId),
        getExecutiveVersionsForDiscussionPage(discussion.id, organizationId),
        loadLiveExecutiveIntelligence(discussion.id, organizationId),
      ])
    : [null, null, null, { versions: [], current: null }, null];

  const briefing = opportunity
    ? await getLatestReviewByOpportunityId(opportunity.id, organizationId)
    : null;

  const lifecycleStatus = normalizeProspectLifecycleStatus(
    prospect.lifecycle_status,
  );
  const workflowSteps = buildDiscussionWorkflowSteps({
    analysis: versionState.current?.intelligence.analysis ?? latestAnalysis,
    opportunity:
      versionState.current?.intelligence.opportunity ?? opportunity,
    briefing: versionState.current?.intelligence.briefing ?? briefing,
    assetBlueprint:
      versionState.current?.intelligence.blueprint ?? assetBlueprint,
    clientStatusLabel: lifecycleStatus,
  });

  const initialRegenerationSnapshot = {
    latestAnalysisId: latestAnalysis?.id ?? null,
    latestAnalysisCreatedAt: latestAnalysis?.created_at ?? null,
    latestAnalysisUpdatedAt: latestAnalysis?.updated_at ?? null,
    blueprintUpdatedAt: assetBlueprint?.updated_at ?? null,
    regenerationInFlight: false,
  };

  const websiteIntel = prospect.website_intelligence ?? {};
  const activeJob = discussion
    ? await getActiveGenerationJobForDiscussion(discussion.id, organizationId)
    : null;
  const hasCurrentVersion = Boolean(versionState.current);
  const intelligenceReadiness = resolveProspectDisplayStatus({
    prospectStatus: prospect.status,
    jobStatus: activeJob?.status ?? null,
    jobStage: activeJob?.current_stage ?? null,
    hasCurrentVersion,
  });
  const currentVersionScore = resolveProspectOpportunityScore({
    canonicalScore:
      versionState.current?.intelligence.opportunity?.score ??
      opportunity?.score ??
      null,
    denormalizedScore: prospect.opportunity_score,
  });
  const currentRecommendation = resolveProspectOpportunityRecommendation(
    versionState.current?.intelligence.analysis ?? latestAnalysis,
  );
  const scorePresentation = formatProspectOpportunityScoreWithRecommendation({
    score: currentVersionScore,
    recommendation: currentRecommendation,
  });
  const scrapeStatus = !prospect.website
    ? "No website provided"
    : typeof websiteIntel.error === "string" && websiteIntel.error
      ? websiteIntel.crawl_partial || websiteIntel.crawl_timeout
        ? "Website learning partial — generation continued with available pages"
        : "Website learning incomplete — generation continued with available fields"
      : typeof websiteIntel.scraped_at === "string"
        ? typeof websiteIntel.pages_analyzed === "number"
          ? `Website learned (${websiteIntel.pages_analyzed}/${
              typeof websiteIntel.pages_limit === "number"
                ? websiteIntel.pages_limit
                : 10
            } pages)`
          : "Website learned"
        : "Website learning pending";
  const websiteHref = normalizeWebsiteUrl(prospect.website);
  const linkedinHref = normalizeWebsiteUrl(prospect.linkedin);

  return (
    <DiscussionRegenerationProvider
      discussionId={discussion?.id ?? prospect.id}
      initialSnapshot={initialRegenerationSnapshot}
      sourceKind="prospect"
    >
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/prospects" className="text-sm text-[var(--athena-orange)]">
          ← Prospects
        </Link>

        <div className="mt-10">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Prospect Intelligence
          </div>
          <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
            {prospect.business_name}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Executive-grade intelligence for this prospect relationship.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HeaderMetric label="Website">
            {websiteHref ? (
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--athena-orange)] underline underline-offset-2"
              >
                {prospect.website}
              </a>
            ) : (
              prospect.website || "—"
            )}
          </HeaderMetric>
          <HeaderMetric label="Category" value={prospect.category || "—"} />
          <HeaderMetric
            label="Decision Maker"
            value={prospect.decision_maker || "—"}
          />
          <HeaderMetric label="Job Title" value={prospect.job_title || "—"} />
          <HeaderMetric label="Email" value={prospect.email || "—"} />
          <HeaderMetric label="Phone" value={prospect.phone || "—"} />
          <HeaderMetric
            label="WhatsApp Number"
            value={prospect.whatsapp_number || "—"}
          />
          <HeaderMetric label="Prospect Status" value={lifecycleStatus} />
          <HeaderMetric
            label="Intelligence"
            value={intelligenceReadiness}
          />
          <HeaderMetric label="Opportunity Score" highlight="orange">
            <div>
              <div>{scorePresentation.scoreLabel}</div>
              {scorePresentation.recommendation &&
                scorePresentation.scoreLabel !== "—" && (
                  <div className="mt-1 text-sm font-medium text-white/55">
                    {scorePresentation.recommendation}
                  </div>
                )}
            </div>
          </HeaderMetric>
          <HeaderMetric
            label="Created"
            value={new Date(prospect.created_at).toLocaleDateString("en-US")}
          />
          <HeaderMetric
            label="Updated"
            value={new Date(prospect.updated_at).toLocaleDateString("en-US")}
          />
          <HeaderMetric label="LinkedIn">
            {linkedinHref ? (
              <a
                href={linkedinHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--athena-orange)] underline underline-offset-2"
              >
                {prospect.linkedin}
              </a>
            ) : (
              prospect.linkedin || "—"
            )}
          </HeaderMetric>
          <HeaderMetric label="Source" value={prospect.source || "—"} />
          <HeaderMetric label="Website Learning" value={scrapeStatus} />
        </div>

        <div className="mt-4 max-w-md">
          <ProspectLifecycleStatusControl prospect={prospect} />
        </div>

        {discussion ? (
          <>
            <div className="mt-8">
              <DiscussionWorkflowStrip steps={workflowSteps} />
            </div>
            <div className="mt-8">
              <DiscussionRegenerationProgress />
            </div>
            <ExecutiveIntelligenceWorkspace
              discussionId={discussion.id}
              prospectId={prospect.id}
              sourceKind="prospect"
              versions={versionState.versions}
              fallbackIntelligence={
                versionState.current?.intelligence ?? liveIntelligence
              }
              afterBlueprint={null}
              afterDetailedReasoning={
                <div className="mt-8">
                  <AppendProspectInformationForm
                    prospectId={prospect.id}
                    discussionId={discussion.id}
                  />
                </div>
              }
              originalDiscussionSection={
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-white/45">
                    Website Analysis and Ads Content captured for this
                    Prospect. Profile fields are managed in Prospect Details
                    below.
                  </p>
                  {prospect.ads_content?.trim() ? (
                    <div>
                      <div className="text-sm text-white/40">Ads Content</div>
                      <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
                        {prospect.ads_content}
                      </div>
                    </div>
                  ) : null}
                  <ProspectHomepageIntelligence
                    websiteIntelligence={prospect.website_intelligence}
                    scrapeStatus={scrapeStatus}
                  />
                </div>
              }
            />
          </>
        ) : (
          <div className="mt-8 rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-10 text-white/50">
            Prospect Intelligence has not been queued yet. Use Refresh
            Intelligence in Prospect Details to start asynchronous generation.
          </div>
        )}

        <div className="mt-8">
          <ProspectMetadataEditor
            prospect={prospect}
            discussionId={discussion?.id ?? null}
          />
        </div>
      </main>
    </DiscussionRegenerationProvider>
  );
}

function HeaderMetric({
  label,
  value,
  highlight,
  children,
}: {
  label: string;
  value?: string;
  highlight?: "orange";
  children?: ReactNode;
}) {
  const color =
    highlight === "orange" ? "text-[var(--athena-orange)]" : "text-white";
  return (
    <div className="rounded-[22px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-5">
      <div className="text-xs uppercase tracking-[0.22em] text-white/35">
        {label}
      </div>
      <div className={`mt-3 text-lg font-semibold ${color}`}>
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}
