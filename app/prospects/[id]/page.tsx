export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { AppendProspectInformationForm } from "@/components/prospects/AppendProspectInformationForm";
import { ProspectDetailHeader } from "@/components/prospects/ProspectDetailHeader";
import { ProspectGetoblicDescriptionCard } from "@/components/prospects/ProspectGetoblicDescriptionCard";
import { ProspectHomepageIntelligence } from "@/components/prospects/ProspectHomepageIntelligence";
import { ProspectIdentityContactGlance } from "@/components/prospects/ProspectIdentityContactGlance";
import { ProspectIntelligenceScore } from "@/components/prospects/ProspectIntelligenceScore";
import { ProspectConvertToClientAction } from "@/components/prospects/ProspectConvertToClientAction";
import { ProspectLifecycleStatusControl } from "@/components/prospects/ProspectLifecycleStatusControl";
import { ProspectMetadataEditor } from "@/components/prospects/ProspectMetadataEditor";
import { ProspectDeepScrapeWebsiteButton } from "@/components/prospects/ProspectDeepScrapeWebsiteButton";
import { GetOblicFunnelControls } from "@/components/prospects/GetOblicFunnelControls";
import { GetOblicListingOutboundControls } from "@/components/prospects/GetOblicListingOutboundControls";
import { GetOblicListingReleaseControl } from "@/components/prospects/GetOblicListingReleaseControl";
import { GetOblicWebsiteCompletionCard } from "@/components/prospects/GetOblicWebsiteCompletionCard";
import { ProspectCreateAudienceButton } from "@/components/prospects/ProspectCreateAudienceButton";
import { ProspectRefreshIntelligenceButton } from "@/components/prospects/ProspectRefreshIntelligenceButton";
import {
  buildGetOblicFunnelPresentation,
  readLinkedGetOblicFunnelContactId,
} from "@/lib/prospects/getOblicFunnelPresentation";
import { shouldShowGetOblicListingReleaseAction } from "@/lib/prospects/getOblicListingReleasePresentation";
import { shouldShowProspectCreateAudience } from "@/lib/personas/freeAudiencePresentation";
import {
  shouldShowProspectConvertToClient,
  shouldShowProspectDeepScrape,
  shouldShowProspectGenerate,
  shouldShowProspectMeaningfulEdit,
  shouldShowProspectRegenerate,
  shouldShowProspectSyncAi,
} from "@/lib/prospects/freeConvertPresentation";
import { PROSPECT_BACK_LINK_CLASS } from "@/lib/prospects/prospectDetailPresentation";
import {
  resolveProspectDisplayStatus,
  resolveProspectOpportunityScore,
} from "@/services/prospects/prospectDisplay";
import {
  computeProspectIntelligenceCompleteness,
  hasActiveGetOblicListingLink,
} from "@/services/prospects/prospectIntelligenceCompleteness";
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
import { isLicenseeOwnCompanyOrganization } from "@/services/licensee/licenseeIdentity";
import { getProspectClientConversionState } from "@/services/licensee/licenseeProspectClientConversionReads";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { hasCurrentKnowledgeBaseAsset } from "@/services/getoblicDirectory/getoblicDirectoryKnowledgeBaseService";
import { getActiveGetOblicLinkForProspect } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { resolveLicenseeOwnCompanyGetOblicAuthorId } from "@/services/prospects/getOblicFunnelAuthor";
import { readObservedListingDescription } from "@/services/prospects/prospectGetoblicDescription";
import { isGetOblicDerivedProspect } from "@/services/prospects/prospectGetOblicOwnership";
import { loadFreeAudiencePageState } from "@/services/personas/freeAudiencePageState";
import { loadFreeConvertPageState } from "@/services/prospects/freeConvertPageState";
import { getProspectById } from "@/services/prospects/prospectService";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";

export default async function ProspectDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, locale, messages }, prospect, freeConvert, freeAudience] =
    await Promise.all([
    getTenantLocalization(),
    getProspectById(id, organizationId),
    loadFreeConvertPageState(),
    loadFreeAudiencePageState(),
  ]);
  const copy = messages.prospects;
  const executive = messages.prospects.executive;
  const {
    presentation,
    convert,
    boundProspectStatus: _boundProspectStatus,
    ...freeProgression
  } = freeConvert;
  const isBoundProspect = Boolean(
    convert.prospectId && convert.prospectId === prospect?.id,
  );
  const showSyncAi = shouldShowProspectSyncAi(presentation);
  const showRegenerate = shouldShowProspectRegenerate(presentation);
  const showMeaningfulEdit = shouldShowProspectMeaningfulEdit(presentation);
  const showGenerate = shouldShowProspectGenerate({
    presentation,
    currentProspectId: prospect?.id,
    boundProspectId: convert.prospectId,
  });
  const showDeepScrape = shouldShowProspectDeepScrape(presentation);
  const showConvertToClient = shouldShowProspectConvertToClient(presentation);

  if (!prospect) {
    return (
      <TenantAppShell
        currentPath={`/prospects/${id}`}
        messages={messages}
        {...freeProgression}
      >
        <Link href="/prospects" className={PROSPECT_BACK_LINK_CLASS}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {messages.nav.prospects}
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
  const [
    activeGetOblicLink,
    conversionState,
    canConvertProspectToClient,
    licenseeOwnCompanyAuthor,
  ] = await Promise.all([
    getActiveGetOblicLinkForProspect(organizationId, prospect.id),
    getProspectClientConversionState(prospect.id),
    isLicenseeOwnCompanyOrganization(organizationId),
    resolveLicenseeOwnCompanyGetOblicAuthorId(organizationId),
  ]);
  const getOblicFunnel = licenseeOwnCompanyAuthor
    ? buildGetOblicFunnelPresentation({
        authorId: licenseeOwnCompanyAuthor.authorId,
        contactId: readLinkedGetOblicFunnelContactId(activeGetOblicLink),
        businessName: prospect.business_name.trim(),
        licenseeDefaultLanguage: licenseeOwnCompanyAuthor.licenseeDefaultLanguage,
      })
    : null;
  const getoblicDerived = isGetOblicDerivedProspect(prospect);
  const hasActiveGetOblicOwnership = activeGetOblicLink != null;
  const showGetOblicOutbound =
    activeGetOblicLink?.relationship_status === "linked";
  const showGetOblicRelease = shouldShowGetOblicListingReleaseAction({
    relationshipStatus: activeGetOblicLink?.relationship_status ?? null,
    conversionStatus: conversionState.status,
  });
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
  const ready = intelligenceReadiness === "Ready";
  const completeness = computeProspectIntelligenceCompleteness({
    prospect,
    hasCurrentExecutiveVersion: hasCurrentVersion,
    hasActiveGetOblicListingLink: hasActiveGetOblicListingLink(activeGetOblicLink),
  });

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
    <ProspectHomepageIntelligence
      websiteIntelligence={prospect.website_intelligence}
      scrapeStatus={scrapeStatus}
      chrome={copy.homepage}
      heading={copy.convert.websiteResearch}
      help={copy.convert.websiteResearchAlt}
    />
  );

  const getoblicDescription = (
    <ProspectGetoblicDescriptionCard
      prospectId={prospect.id}
      currentListingCopy={readObservedListingDescription(prospect.raw_json)}
      generatedListingDescription={prospect.generated_listing_description}
      messages={copy.getoblicDescription}
      showGenerate={showSyncAi}
    />
  );

  const identityGlance = (
    <ProspectIdentityContactGlance prospect={prospect} messages={copy} />
  );

  const addInformation =
    discussion && showRegenerate ? (
    <AppendProspectInformationForm
      prospectId={prospect.id}
      discussionId={discussion.id}
      chrome={copy.append}
    />
  ) : null;

  const generateActions = offerFullIntelligence && showGenerate ? (
    <ProspectRefreshIntelligenceButton
      prospectId={prospect.id}
      discussionId={discussion?.id ?? prospect.linked_discussion_id ?? null}
      chrome={copy.detail}
      hasCurrentVersion={hasCurrentVersion}
      intelligenceStatus={intelligenceReadiness}
      showGenerate={showGenerate}
      showThinkDifferently={showRegenerate}
    />
  ) : showGenerate && isBoundProspect && !offerFullIntelligence ? (
    <p className="text-sm leading-6 text-white/55">
      {copy.free.websiteRequired}
    </p>
  ) : presentation === "full" && !offerFullIntelligence ? (
    <p className="text-sm leading-6 text-white/55">
      {copy.websiteCompletion.addWebsiteToStartResearch}
    </p>
  ) : null;

  const pageBody = (
    <TenantAppShell
      currentPath={`/prospects/${id}`}
      messages={messages}
      {...freeProgression}
    >
      <ProspectDetailHeader
        backHref="/prospects"
        backLabel={messages.nav.prospects}
        eyebrow={copy.detail.eyebrow}
        title={prospect.business_name}
        question={copy.detail.question}
        subtitle={subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined}
        websiteHref={websiteHref}
        websiteLabel={prospect.website}
        intelligenceLabel={getProspectIntelligenceStatusLabel(
          messages,
          intelligenceReadiness,
        )}
        intelligenceStatus={intelligenceReadiness}
        ready={ready}
        hasDiscussion={Boolean(discussion)}
        askAthenaLabel={copy.detail.askAthena}
        addObservationLabel={copy.detail.addObservation}
        editProfileLabel={copy.detail.editProfile}
        showAskAthena={showSyncAi}
        showAddObservation={showRegenerate}
        showEditProfile={showMeaningfulEdit}
        openWebsiteLabel={copy.detail.openWebsite}
        completenessScore={
          <ProspectIntelligenceScore
            score={completeness.score}
            messages={copy.score}
          />
        }
        generateActions={generateActions}
        createAudienceAction={
          showSyncAi &&
          shouldShowProspectCreateAudience(freeAudience.presentation) ? (
          <ProspectCreateAudienceButton
            prospectId={prospect.id}
            canCreate={hasCurrentVersion}
            chrome={{
              createAudienceFromProspect: copy.detail.createAudienceFromProspect,
              creatingAudienceFromProspect:
                copy.detail.creatingAudienceFromProspect,
              createAudienceFromProspectFailed:
                copy.detail.createAudienceFromProspectFailed,
              createAudienceRequiresIntelligence:
                copy.detail.createAudienceRequiresIntelligence,
            }}
          />
          ) : null
        }
        intelligenceGroupLabel={copy.detail.intelligence}
        prospectToolsLabel={copy.detail.prospectTools}
        directoryGroupLabel={copy.detail.getoblicDirectory}
        researchAction={
          showDeepScrape && hasCurrentVersion && Boolean(prospect.website) ? (
            <ProspectDeepScrapeWebsiteButton
              prospectId={prospect.id}
              initiallyAvailable={hasCurrentVersion && Boolean(prospect.website)}
              messages={copy.deepScrape}
              locale={locale}
            />
          ) : null
        }
        clientConversionAction={
          showConvertToClient ? (
          <ProspectConvertToClientAction
            prospectId={prospect.id}
            businessName={prospect.business_name}
            conversionStatus={conversionState.status}
            canConvertProspectToClient={canConvertProspectToClient}
            isGetOblicDerivedProspect={getoblicDerived}
            hasActiveGetOblicOwnership={hasActiveGetOblicOwnership}
          />
          ) : null
        }
        lifecycleAction={
          <ProspectLifecycleStatusControl
            prospect={prospect}
            messages={messages}
            compact
          />
        }
        directoryAction={
          showGetOblicOutbound || showGetOblicRelease ? (
            <>
              {showGetOblicOutbound ? (
                <GetOblicListingOutboundControls
                  prospectId={prospect.id}
                  hasGeneratedDescription={Boolean(
                    prospect.generated_listing_description?.description.trim(),
                  )}
                  hasCurrentKnowledgeBase={hasCurrentKnowledgeBaseAsset(
                    versionState.current?.intelligence,
                  )}
                  messages={messages}
                />
              ) : null}
              {showGetOblicRelease &&
              (activeGetOblicLink?.relationship_status === "linked" ||
                activeGetOblicLink?.relationship_status === "claiming") ? (
                <GetOblicListingReleaseControl
                  prospectId={prospect.id}
                  relationshipStatus={activeGetOblicLink.relationship_status}
                  messages={messages}
                />
              ) : null}
            </>
          ) : null
        }
        funnelGroupLabel={copy.detail.getoblicFunnel}
        funnelAction={
          getOblicFunnel ? (
            <GetOblicFunnelControls
              aiAgentsHref={getOblicFunnel.aiAgentsHref}
              virtualPhoneHref={getOblicFunnel.virtualPhoneHref}
              calendarHref={getOblicFunnel.calendarHref}
              aiAgentsLabel={copy.detail.getoblicFunnelAiAgents}
              virtualPhoneLabel={copy.detail.getoblicFunnelVirtualPhone}
              calendarLabel={copy.detail.getoblicFunnelCalendar}
            />
          ) : null
        }
      />

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
            showConversation={showSyncAi}
            assetChrome={getSharedAssetChrome(messages)}
            tenantMessages={messages}
            afterProspectRecommendation={
              hasCurrentVersion ? (
                <div className="mt-8 space-y-8">
                  {identityGlance}
                  {websiteResearch}
                  {getoblicDescription}
                </div>
              ) : null
            }
            afterBlueprint={
              <div className="mt-8 space-y-8">
                {!hasCurrentVersion ? identityGlance : null}
                {!hasCurrentVersion ? websiteResearch : null}
                {!hasCurrentVersion ? getoblicDescription : null}
                {profileEditor}
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
          <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-8">
            <p className="max-w-3xl text-sm leading-7 text-white/50">
              {offerFullIntelligence
                ? copy.detail.noDiscussion
                : copy.websiteCompletion.addWebsiteToStartResearch}
            </p>
          </div>
          {identityGlance}
          {websiteResearch}
          {getoblicDescription}
          {profileEditor}
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
