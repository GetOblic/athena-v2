export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { AppendProspectInformationForm } from "@/components/prospects/AppendProspectInformationForm";
import { ProspectHomepageIntelligence } from "@/components/prospects/ProspectHomepageIntelligence";
import { ProspectLifecycleStatusControl } from "@/components/prospects/ProspectLifecycleStatusControl";
import { ProspectMetadataEditor } from "@/components/prospects/ProspectMetadataEditor";
import { ProspectDeepScrapeWebsiteButton } from "@/components/prospects/ProspectDeepScrapeWebsiteButton";
import { ProspectHeaderDeleteButton } from "@/components/prospects/ProspectHeaderDeleteButton";
import { GetOblicWebsiteCompletionCard } from "@/components/prospects/GetOblicWebsiteCompletionCard";
import { ProspectRefreshIntelligenceButton } from "@/components/prospects/ProspectRefreshIntelligenceButton";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import {
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
} from "@/services/prospects/prospectDisplay";
import { getActiveGenerationJobForDiscussion } from "@/services/generationJobs/generationJobService";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getSharedAssetChrome } from "@/lib/tenantI18n/opportunityPresentation";
import {
  getLocalizedProspectHomepageLearning,
  resolveProspectHomepageLearningKey,
} from "@/lib/tenantI18n/prospectPresentation";
import {
  getProspectIntelligenceStatusLabel,
  isProspectIntelligenceFailed,
  isProspectIntelligenceProcessing,
  shouldOfferProspectFullIntelligenceAction,
} from "@/lib/prospects/prospectReadinessPresentation";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import {
  getExecutiveVersionsForDiscussionPage,
  loadLiveExecutiveIntelligence,
} from "@/services/executiveVersions/executiveVersionService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { getOrganizationAiWorkspacePreferences } from "@/services/identity/aiWorkspacePreferences";
import { getOrganizationBrandIdentity } from "@/services/identity/brandIdentityService";
import { toBlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getProspectById } from "@/services/prospects/prospectService";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

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
      <TenantAppShell currentPath={`/prospects/${id}`} messages={messages}>
        <Link
          href="/prospects"
          className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
        >
          {copy.backToProspects}
        </Link>
        <h1 className="text-4xl font-semibold">{copy.notFound}</h1>
      </TenantAppShell>
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
  const scrapeStatus = getLocalizedProspectHomepageLearning(
    messages,
    resolveProspectHomepageLearningKey({
      website: prospect.website,
      websiteError: websiteIntel.error,
      scrapedAt: websiteIntel.scraped_at,
    }),
  );
  const websiteHref = normalizeWebsiteUrl(prospect.website);
  const offerFullIntelligence = shouldOfferProspectFullIntelligenceAction({
    source: prospect.source,
    website: prospect.website,
    hasCurrentVersion,
  });
  const location = [prospect.city, prospect.state, prospect.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const categoryOrIndustry =
    prospect.category?.trim() || prospect.industry?.trim() || "";
  const subtitleParts = [
    categoryOrIndustry,
    location,
    prospect.decision_maker?.trim() || "",
  ].filter(Boolean);
  const intelligenceProcessing =
    isProspectIntelligenceProcessing(intelligenceReadiness);
  const intelligenceFailed = isProspectIntelligenceFailed(intelligenceReadiness);
  const createdLabel = formatTenantDate(prospect.created_at, language);
  const updatedLabel = formatTenantDate(prospect.updated_at, language);

  const profileEditor = (
    <ProspectMetadataEditor
      prospect={prospect}
      discussionId={discussion?.id ?? null}
      chrome={copy.metadata}
      emptyValue={copy.emptyValue}
      defaultOpen={!hasCurrentVersion}
      createdLabel={createdLabel}
      updatedLabel={updatedLabel}
      opportunityScoreLabel={
        currentVersionScore != null ? String(currentVersionScore) : undefined
      }
    />
  );

  const websiteResearch = (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">
        {copy.convert.websiteResearch}
      </h2>
      <p className="text-sm leading-6 text-white/45">
        {copy.convert.websiteResearchAlt}
      </p>
      <ProspectHomepageIntelligence
        websiteIntelligence={prospect.website_intelligence}
        scrapeStatus={scrapeStatus}
        chrome={copy.homepage}
      />
    </div>
  );

  const addInformation = discussion ? (
    <AppendProspectInformationForm
      prospectId={prospect.id}
      discussionId={discussion.id}
      chrome={copy.append}
    />
  ) : null;

  const pageBody = (
    <TenantAppShell currentPath={`/prospects/${id}`} messages={messages}>
      <Link
        href="/prospects"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToProspects}
      </Link>

      <TractionPageHeader
        eyebrow={copy.detail.eyebrow}
        title={prospect.business_name}
        question={copy.detail.question}
        subtitle={subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined}
        badge={
          <span className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--athena-orange)]">
            {getProspectIntelligenceStatusLabel(messages, intelligenceReadiness)}
          </span>
        }
      >
        {websiteHref ? (
          <p className="mt-3 text-sm">
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-[var(--athena-orange)] underline underline-offset-2"
            >
              {prospect.website}
            </a>
          </p>
        ) : null}
      </TractionPageHeader>

      {prospect.source === "getoblic" && !prospect.website ? (
        <GetOblicWebsiteCompletionCard
          prospectId={prospect.id}
          messages={messages}
        />
      ) : null}

      {!hasCurrentVersion && !intelligenceProcessing && !intelligenceFailed ? (
        <div className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-medium text-white/80">
            {copy.detail.savedBanner}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {copy.detail.savedBannerHelp}
          </p>
        </div>
      ) : null}

      {intelligenceProcessing ? (
        <div className="mb-6 rounded-[24px] border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 p-5">
          <p className="text-sm font-medium text-white/80">
            {copy.detail.processingBanner}
          </p>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {copy.detail.processingBannerHelp}
          </p>
        </div>
      ) : null}

      {intelligenceFailed ? (
        <div className="mb-6 rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-5">
          <p className="text-sm leading-6 text-rose-100/80">
            {copy.detail.failedBanner}
          </p>
        </div>
      ) : null}

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {offerFullIntelligence ? (
          <ProspectRefreshIntelligenceButton
            prospectId={prospect.id}
            discussionId={
              discussion?.id ?? prospect.linked_discussion_id ?? null
            }
            chrome={copy.detail}
            hasCurrentVersion={hasCurrentVersion}
            intelligenceStatus={intelligenceReadiness}
          />
        ) : (
          <p className="text-sm leading-6 text-white/55">
            {copy.websiteCompletion.addWebsiteToStartResearch}
          </p>
        )}
        <ProspectDeepScrapeWebsiteButton
          prospectId={prospect.id}
          initiallyAvailable={hasCurrentVersion && Boolean(prospect.website)}
          messages={copy.deepScrape}
          locale={locale}
        />
        <ProspectLifecycleStatusControl
          prospect={prospect}
          messages={messages}
        />
        <ProspectHeaderDeleteButton
          prospectId={prospect.id}
          confirmMessage={copy.detail.deleteConfirm}
          errorFallback={copy.detail.deleteFailed}
          chrome={messages.common}
        />
      </div>

      {discussion ? (
        <>
          <DiscussionRegenerationProgress />
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
            tenantMessages={messages}
            afterBlueprint={
              <div className="mt-8 space-y-8">
                {profileEditor}
                {websiteResearch}
                {addInformation}
              </div>
            }
            afterDetailedReasoning={null}
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
              </div>
            }
          />
        </>
      ) : (
        <div className="space-y-8">
          <div
            className={`rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
          >
            <p className="max-w-3xl text-sm leading-7 text-white/50">
              {offerFullIntelligence
                ? copy.detail.noDiscussion
                : copy.websiteCompletion.addWebsiteToStartResearch}
            </p>
          </div>
          {profileEditor}
          {websiteResearch}
        </div>
      )}
    </TenantAppShell>
  );

  return (
    <DiscussionRegenerationProvider
      discussionId={discussion?.id ?? null}
      initialSnapshot={initialRegenerationSnapshot}
      chrome={executive}
    >
      {pageBody}
    </DiscussionRegenerationProvider>
  );
}
