export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
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
import { ProspectDeepScrapeWebsiteButton } from "@/components/prospects/ProspectDeepScrapeWebsiteButton";
import { ProspectHeaderDeleteButton } from "@/components/prospects/ProspectHeaderDeleteButton";
import { ProspectRefreshIntelligenceButton } from "@/components/prospects/ProspectRefreshIntelligenceButton";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import {
  formatProspectOpportunityScoreWithRecommendation,
  resolveProspectDisplayStatus,
  resolveProspectOpportunityRecommendation,
  resolveProspectOpportunityScore,
} from "@/services/prospects/prospectDisplay";
import { normalizeProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";
import { getActiveGenerationJobForDiscussion } from "@/services/generationJobs/generationJobService";
import { fillChromeTemplate } from "@/lib/discussionExecutiveChrome";
import { buildDiscussionWorkflowSteps } from "@/lib/discussionWorkflow";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getSharedAssetChrome } from "@/lib/tenantI18n/opportunityPresentation";
import {
  getLocalizedProspectHomepageLearning,
  getLocalizedProspectLifecycleLabel,
  getLocalizedProspectReadinessLabel,
  getLocalizedProspectVerdict,
  resolveProspectHomepageLearningKey,
} from "@/lib/tenantI18n/prospectPresentation";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import {
  getExecutiveVersionsForDiscussionPage,
  loadLiveExecutiveIntelligence,
} from "@/services/executiveVersions/executiveVersionService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { getOrganizationAiWorkspacePreferences } from "@/services/identity/aiWorkspacePreferences";
import {
  getOrganizationBrandIdentity,
} from "@/services/identity/brandIdentityService";
import { toBlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
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
  const [{ language, locale, messages }, prospect] = await Promise.all([
    getTenantLocalization(),
    getProspectById(id, organizationId),
  ]);
  const copy = messages.prospects;
  const executive = messages.prospects.executive;

  if (!prospect) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink
          className="mb-8"
          tagline={messages.chrome.tagline}
          logoutLabel={messages.chrome.logOut}
          sessionActionsLabel={messages.chrome.sessionActions}
        />
        <TenantBackLink href="/prospects" label={copy.backToProspects} />
        <h1 className="mt-8 text-4xl font-semibold">{copy.notFound}</h1>
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
    organizationBrand,
    continuationPreferences,
  ] = discussion
    ? await Promise.all([
        getLatestDiscussionAnalysis(discussion.id, organizationId),
        getDisplayAssetBlueprintByDiscussionId(discussion.id, organizationId),
        getOpportunityByDiscussionId(discussion.id, organizationId),
        getExecutiveVersionsForDiscussionPage(discussion.id, organizationId),
        loadLiveExecutiveIntelligence(discussion.id, organizationId),
        getOrganizationBrandIdentity(organizationId).catch((error) => {
          console.error("[BRAND_DIRECTION] prospect_load_failed", error);
          return null;
        }),
        getOrganizationAiWorkspacePreferences(organizationId),
      ])
    : await Promise.all([
        Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve({ versions: [], current: null }),
        Promise.resolve(null),
        getOrganizationBrandIdentity(organizationId).catch((error) => {
          console.error("[BRAND_DIRECTION] prospect_load_failed", error);
          return null;
        }),
        getOrganizationAiWorkspacePreferences(organizationId),
      ]);

  const brandDirection = toBlueprintBrandDirectionInput(organizationBrand);

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
  }).map((step) => {
    if (step.key === "outcome") {
      return {
        ...step,
        label: fillChromeTemplate(copy.detail.workflowCurrentStatus, {
          status: getLocalizedProspectLifecycleLabel(messages, lifecycleStatus),
        }),
      };
    }
    const workflowLabels = {
      analysis: copy.detail.workflowAnalysis,
      opportunity: copy.detail.workflowOpportunity,
      briefing: copy.detail.workflowBriefing,
      assets: copy.detail.workflowAssets,
    } as const;
    return {
      ...step,
      label: workflowLabels[step.key] ?? step.label,
    };
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
  const scrapeStatus = getLocalizedProspectHomepageLearning(
    messages,
    resolveProspectHomepageLearningKey({
      website: prospect.website,
      websiteError: websiteIntel.error,
      scrapedAt: websiteIntel.scraped_at,
    }),
  );
  const websiteHref = normalizeWebsiteUrl(prospect.website);
  const linkedinHref = normalizeWebsiteUrl(prospect.linkedin);

  return (
    <DiscussionRegenerationProvider
      discussionId={discussion?.id ?? prospect.id}
      initialSnapshot={initialRegenerationSnapshot}
      chrome={executive}
    >
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink
          className="mb-8"
          tagline={messages.chrome.tagline}
          logoutLabel={messages.chrome.logOut}
          sessionActionsLabel={messages.chrome.sessionActions}
        />
        <TenantBackLink href="/prospects" label={copy.backToProspects} />

        <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {copy.detail.eyebrow}
            </div>
            <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
              {prospect.business_name}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              {copy.detail.subtitle}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 lg:items-end">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ProspectRefreshIntelligenceButton
                prospectId={prospect.id}
                discussionId={
                  discussion?.id ?? prospect.linked_discussion_id ?? null
                }
                chrome={copy.detail}
              />
              <ProspectDeepScrapeWebsiteButton
                prospectId={prospect.id}
                initiallyAvailable={hasCurrentVersion && Boolean(prospect.website)}
                messages={copy.deepScrape}
                locale={locale}
              />
              <ProspectHeaderDeleteButton
                prospectId={prospect.id}
                confirmMessage={copy.detail.deleteConfirm}
                errorFallback={copy.detail.deleteFailed}
                chrome={messages.common}
              />
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HeaderMetric label={copy.detail.website}>
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
              prospect.website || copy.emptyValue
            )}
          </HeaderMetric>
          <HeaderMetric
            label={copy.detail.category}
            value={prospect.category || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.decisionMaker}
            value={prospect.decision_maker || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.jobTitle}
            value={prospect.job_title || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.email}
            value={prospect.email || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.phone}
            value={prospect.phone || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.whatsappNumber}
            value={prospect.whatsapp_number || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.prospectStatus}
            value={getLocalizedProspectLifecycleLabel(messages, lifecycleStatus)}
          />
          <HeaderMetric
            label={copy.detail.intelligence}
            value={getLocalizedProspectReadinessLabel(
              messages,
              intelligenceReadiness,
            )}
          />
          <HeaderMetric label={copy.detail.opportunityScore} highlight="orange">
            <div>
              <div>{scorePresentation.scoreLabel}</div>
              {scorePresentation.recommendation &&
                scorePresentation.scoreLabel !== "—" && (
                  <div className="mt-1 text-sm font-medium text-white/55">
                    {getLocalizedProspectVerdict(
                      messages,
                      scorePresentation.recommendation,
                    )}
                  </div>
                )}
            </div>
          </HeaderMetric>
          <HeaderMetric
            label={copy.detail.created}
            value={formatTenantDate(prospect.created_at, language)}
          />
          <HeaderMetric
            label={copy.detail.updated}
            value={formatTenantDate(prospect.updated_at, language)}
          />
          <HeaderMetric label={copy.detail.linkedin}>
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
              prospect.linkedin || copy.emptyValue
            )}
          </HeaderMetric>
          <HeaderMetric
            label={copy.detail.source}
            value={prospect.source || copy.emptyValue}
          />
          <HeaderMetric
            label={copy.detail.homepageLearning}
            value={scrapeStatus}
          />
        </div>

        <div className="mt-4 max-w-md">
          <ProspectLifecycleStatusControl
            prospect={prospect}
            messages={messages}
          />
        </div>

        {discussion ? (
          <>
            <div className="mt-8">
              <DiscussionWorkflowStrip
                steps={workflowSteps}
                title={copy.detail.workflowProgress}
              />
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
              brandDirection={brandDirection}
              continuationPreferences={continuationPreferences}
              chrome={executive}
              locale={locale}
              conversationChrome={copy.conversation}
              assetChrome={getSharedAssetChrome(messages)}
              afterBlueprint={null}
              afterDetailedReasoning={
                <div className="mt-8">
                  <AppendProspectInformationForm
                    prospectId={prospect.id}
                    discussionId={discussion.id}
                    chrome={copy.append}
                  />
                </div>
              }
              originalDiscussionSection={
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-white/45">
                    {copy.detail.sourceContextHelp}
                  </p>
                  {prospect.ads_content?.trim() ? (
                    <div>
                      <div className="text-sm text-white/40">
                        {copy.detail.adsContent}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
                        {prospect.ads_content}
                      </div>
                    </div>
                  ) : null}
                  <ProspectHomepageIntelligence
                    websiteIntelligence={prospect.website_intelligence}
                    scrapeStatus={scrapeStatus}
                    chrome={copy.homepage}
                  />
                </div>
              }
            />
          </>
        ) : (
          <div className="mt-8 rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-10 text-white/50">
            {copy.detail.noDiscussion}
          </div>
        )}

        <div className="mt-8">
          <ProspectMetadataEditor
            prospect={prospect}
            discussionId={discussion?.id ?? null}
            chrome={copy.metadata}
            emptyValue={copy.emptyValue}
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
    <div
      className={`rounded-[22px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-5`}
    >
      <div className="text-xs uppercase tracking-[0.22em] text-white/35">
        {label}
      </div>
      <div className={`mt-3 text-lg font-semibold ${color}`}>
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}
