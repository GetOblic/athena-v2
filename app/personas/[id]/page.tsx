export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { PersonaAppendInteraction } from "@/components/personas/PersonaAppendInteraction";
import { PersonaAppendInteractionTracked } from "@/components/personas/PersonaAppendInteractionTracked";
import { PersonaConversationPanel } from "@/components/personas/PersonaConversationPanel";
import { PersonaDeepScrapeWebsiteButton } from "@/components/personas/PersonaDeepScrapeWebsiteButton";
import { PersonaGenerateIntelligenceButton } from "@/components/personas/PersonaGenerateIntelligenceButton";
import { PersonaGenerationProgress } from "@/components/personas/PersonaGenerationProgress";
import { PersonaHeaderDeleteButton } from "@/components/personas/PersonaHeaderDeleteButton";
import { PersonaLifecycleStatusControl } from "@/components/personas/PersonaLifecycleStatusControl";
import { PersonaMetadataEditor } from "@/components/personas/PersonaMetadataEditor";
import { PersonaAudienceJourney } from "@/components/personas/PersonaAudienceJourney";
import { PersonaDetailHeader } from "@/components/personas/PersonaDetailHeader";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { buildPersonaJourneyChrome } from "@/lib/personas/personaDetailPresentation";
import { PERSONA_NESTED_CARD_CLASS } from "@/lib/personas/personaPagePresentation";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getDiscussionById } from "@/services/discussionService";
import {
  getExecutiveVersionsForDiscussionPage,
  loadLiveExecutiveIntelligence,
} from "@/services/executiveVersions/executiveVersionService";
import {
  getActiveGenerationJobForDiscussion,
  getLatestGenerationJobForDiscussion,
} from "@/services/generationJobs/generationJobService";
import { getOrganizationAiWorkspacePreferences } from "@/services/identity/aiWorkspacePreferences";
import { getOrganizationBrandIdentity } from "@/services/identity/brandIdentityService";
import { toBlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import {
  formatPersonaLocation,
  formatPersonaReferenceWebsiteDisplay,
  resolvePersonaDisplayStatus,
} from "@/services/personas/personaDisplay";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getPersonaById } from "@/services/personas/personaService";
import {
  normalizePersonaReferenceWebsite,
  normalizeWebsiteUrl,
  resolvePersonaDisplayLabel,
} from "@/services/personas/personaUtils";
import { normalizeRootWebsiteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getSharedAssetChrome } from "@/lib/tenantI18n/opportunityPresentation";
import {
  getAudienceIntelligenceStatusLabel,
  isAudienceIntelligenceFailed,
  isAudienceIntelligenceProcessing,
} from "@/lib/personas/audienceReadinessPresentation";

export default async function PersonaDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ locale, messages }, persona] = await Promise.all([
    getTenantLocalization(),
    getPersonaById(id, organizationId),
  ]);
  const copy = messages.personas;
  const executive = messages.personas.executive;
  const journeyChrome = buildPersonaJourneyChrome(copy);

  if (!persona) {
    return (
      <TenantAppShell currentPath={`/personas/${id}`} messages={messages}>
        <Link
          href="/personas"
          className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
        >
          {copy.backToPersonas}
        </Link>
        <h1 className="text-4xl font-semibold">{copy.notFound}</h1>
      </TenantAppShell>
    );
  }

  const discussionId = persona.linked_discussion_id;
  const discussion = discussionId
    ? await getDiscussionById(discussionId, organizationId)
    : null;

  const [
    activeJob,
    latestJob,
    latestAnalysis,
    versionState,
    liveIntelligence,
    organizationBrand,
    continuationPreferences,
  ] = discussion
    ? await Promise.all([
        getActiveGenerationJobForDiscussion(discussion.id, organizationId),
        getLatestGenerationJobForDiscussion(discussion.id, organizationId),
        getLatestDiscussionAnalysis(discussion.id, organizationId),
        getExecutiveVersionsForDiscussionPage(discussion.id, organizationId),
        loadLiveExecutiveIntelligence(discussion.id, organizationId),
        getOrganizationBrandIdentity(organizationId).catch(() => null),
        getOrganizationAiWorkspacePreferences(organizationId),
      ])
    : [
        null,
        null,
        null,
        { versions: [], current: null },
        null,
        null,
        null,
      ];

  const hasGeneratedAnalysis = Boolean(latestAnalysis);
  const hasCurrentExecutiveVersion = Boolean(versionState.current?.id);
  const regenerationInFlight = Boolean(
    activeJob &&
      (activeJob.status === "queued" ||
        activeJob.status === "processing" ||
        activeJob.status === "retryable"),
  );
  const hasTerminalJobFailure = Boolean(
    !activeJob && latestJob?.status === "failed" && !hasCurrentExecutiveVersion,
  );

  const displayLabel = resolvePersonaDisplayLabel(persona);
  const location = formatPersonaLocation(persona);
  const readiness = resolvePersonaDisplayStatus({
    personaStatus: persona.status,
    jobStatus: activeJob?.status ?? null,
    jobStage: activeJob?.current_stage ?? null,
    hasGeneratedAnalysis,
    hasCurrentExecutiveVersion,
    hasTerminalJobFailure,
  });
  const referenceDisplay = formatPersonaReferenceWebsiteDisplay(
    persona.reference_website,
  );
  const referenceHref = normalizeWebsiteUrl(persona.reference_website);
  const brandDirection = organizationBrand
    ? toBlueprintBrandDirectionInput(organizationBrand)
    : null;

  const deepScrapeAvailable = Boolean(
    normalizeRootWebsiteUrl(
      normalizePersonaReferenceWebsite(persona.reference_website)
        .referenceWebsite ?? "",
    ),
  );
  const conversationVersionState = versionState.current
    ? ("current" as const)
    : ("none" as const);
  const intelligenceFailed = isAudienceIntelligenceFailed(readiness);
  const intelligenceProcessing = isAudienceIntelligenceProcessing(readiness);

  const initialRegenerationSnapshot = {
    latestAnalysisId: latestAnalysis?.id ?? null,
    latestAnalysisCreatedAt: latestAnalysis?.created_at ?? null,
    latestAnalysisUpdatedAt: latestAnalysis?.updated_at ?? null,
    blueprintUpdatedAt:
      versionState.current?.intelligence.blueprint?.updated_at ?? null,
    regenerationInFlight,
  };

  const profileEditor = (
    <PersonaMetadataEditor
      persona={persona}
      chrome={copy.metadata}
      emptyValue={copy.emptyValue}
      defaultOpen={!hasCurrentExecutiveVersion}
    />
  );

  const conversationPanel = (
    <PersonaConversationPanel
      personaId={persona.id}
      executiveVersionId={versionState.current?.id ?? null}
      versionState={conversationVersionState}
      versionLabel={
        versionState.current ? copy.detail.currentExecutiveVersion : null
      }
      chrome={copy.conversation}
    />
  );

  const crossLinks = (
    <div
      data-persona-traction-next="true"
      className="relative space-y-3 overflow-hidden rounded-[24px] border border-[rgba(255,102,0,0.24)] bg-[var(--athena-card)] bg-[linear-gradient(180deg,rgba(255,102,0,0.07),transparent_70%)] p-5 shadow-[0_0_22px_rgba(255,102,0,0.04)] before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.68)]"
    >
      <Link href="/ads/new" className="block pl-2">
        <div className="text-sm font-semibold tracking-tight text-white">
          {copy.traction.createAdvertising}
        </div>
        <p className="mt-1 text-sm leading-6 text-white/50">
          {copy.traction.createAdvertisingHelp}
        </p>
      </Link>
      <Link
        href="/social-planner"
        className="block pl-2 text-sm font-semibold tracking-tight text-white"
      >
        {copy.traction.planSocial}
      </Link>
    </div>
  );

  const evidenceExtra = (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-white/45">
        {copy.detail.sourceContextHelp}
      </p>
      {persona.ads_content?.trim() ? (
        <div data-persona-field="ads_content">
          <div className="text-sm text-white/40">{copy.detail.adsContent}</div>
          <div className={`mt-2 whitespace-pre-wrap text-sm leading-7 text-white/70 ${PERSONA_NESTED_CARD_CLASS}`}>
            {persona.ads_content}
          </div>
        </div>
      ) : null}
      {persona.preferred_channels?.trim() ? (
        <div data-persona-field="preferred_channels">
          <div className="text-sm text-white/40">
            {copy.detail.preferredChannels}
          </div>
          <div className="mt-2 text-sm leading-7 text-white/70">
            {persona.preferred_channels}
          </div>
        </div>
      ) : null}
    </div>
  );

  const headerMeta = (location || referenceDisplay) ? (
    <p>
      {[persona.category, location].filter(Boolean).join(" · ")}
      {referenceHref ? (
        <>
          {persona.category || location ? " · " : null}
          <a
            href={referenceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-200 underline underline-offset-2"
          >
            {referenceDisplay}
          </a>
        </>
      ) : referenceDisplay ? (
        <>
          {persona.category || location ? " · " : null}
          {referenceDisplay}
        </>
      ) : null}
    </p>
  ) : null;

  const header = (
    <PersonaDetailHeader
      backLabel={copy.backToPersonas}
      eyebrow={copy.detail.eyebrow}
      title={displayLabel}
      subtitle={persona.short_description}
      intelligenceLabel={getAudienceIntelligenceStatusLabel(messages, readiness)}
      intelligenceStatus={readiness}
      metaLine={headerMeta}
      discussLabel={journeyChrome.discussWithAthena}
      observationLabel={journeyChrome.addObservation}
      primaryActions={
        <PersonaGenerateIntelligenceButton
          personaId={persona.id}
          initialStatus={readiness}
          initialInFlight={regenerationInFlight}
          hasCurrentExecutiveVersion={hasCurrentExecutiveVersion}
          chrome={copy.detail}
        />
      }
      utilityActions={
        <>
          <PersonaLifecycleStatusControl
            persona={persona}
            messages={messages}
            compact
          />
          <PersonaDeepScrapeWebsiteButton
            personaId={persona.id}
            initiallyAvailable={deepScrapeAvailable}
            messages={copy.deepScrape}
            locale={locale}
          />
        </>
      }
      destructiveAction={
        <PersonaHeaderDeleteButton
          personaId={persona.id}
          confirmMessage={copy.detail.deleteConfirm}
          errorFallback={copy.detail.deleteFailed}
          chrome={messages.common}
        />
      }
    />
  );

  const pageBody = (
    <TenantAppShell currentPath={`/personas/${id}`} messages={messages}>
      {header}

      {intelligenceProcessing ? (
        <div className="relative mb-6 overflow-hidden rounded-[24px] border border-[var(--athena-orange)]/30 bg-[linear-gradient(180deg,rgba(255,102,0,0.10),transparent_72%)] p-5 before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(255,102,0,0.68)]">
          <p className="text-sm leading-6 text-white/80">
            {copy.traction.processingBanner}
          </p>
          <PersonaGenerationProgress
            personaId={persona.id}
            initialStatus={readiness}
            messages={messages}
          />
        </div>
      ) : null}

      {intelligenceFailed ? (
        <div className="relative mb-6 overflow-hidden rounded-[24px] border border-rose-400/30 bg-[linear-gradient(180deg,rgba(251,113,133,0.10),transparent_72%)] p-5 before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(251,113,133,0.62)]">
          <p className="text-sm leading-6 text-rose-100/80">
            {copy.traction.failedBanner}
          </p>
        </div>
      ) : null}

      {!hasCurrentExecutiveVersion && !intelligenceProcessing && !intelligenceFailed ? (
        <div className="relative mb-6 overflow-hidden rounded-[24px] border border-[rgba(167,139,250,0.18)] bg-[linear-gradient(180deg,rgba(167,139,250,0.06),transparent_72%)] p-5 before:pointer-events-none before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[rgba(167,139,250,0.38)]">
          <p className="text-sm leading-6 text-white/65">
            {copy.traction.savedBanner}
          </p>
        </div>
      ) : null}

      {discussion ? (
        <>
          <DiscussionRegenerationProgress />
          <ExecutiveIntelligenceWorkspace
            discussionId={discussion.id}
            personaId={persona.id}
            sourceKind="persona"
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
            personaSectionTitles={copy.traction}
            persona={persona}
            personaJourneyChrome={journeyChrome}
            personaLibraryMessages={copy}
            personaProfileEditor={profileEditor}
            personaCrossLinks={crossLinks}
            afterBlueprint={null}
            afterDetailedReasoning={
              <div className="mt-8 space-y-8">
                {conversationPanel}
                <PersonaAppendInteractionTracked
                  personaId={persona.id}
                  discussionId={discussion.id}
                  initialNotes={persona.notes}
                  chrome={copy.append}
                />
              </div>
            }
            originalDiscussionSection={evidenceExtra}
          />
        </>
      ) : (
        <>
          <div
            className={`rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
          >
            <h2 className="text-lg font-semibold">{copy.detail.noDiscussionTitle}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/45">
              {readiness === "Profile Created"
                ? copy.detail.noDiscussionProfileCreated
                : regenerationInFlight
                  ? copy.detail.noDiscussionInFlight
                  : readiness === "Processing Failed"
                    ? copy.detail.noDiscussionFailed
                    : copy.detail.noDiscussionOther}
            </p>
          </div>
          <PersonaAudienceJourney
            persona={persona}
            analysis={null}
            analysisAssets={[]}
            deploymentAssets={[]}
            chrome={journeyChrome}
            messages={copy}
            profileEditor={profileEditor}
            crossLinks={crossLinks}
            previousIntelligence={null}
            evidenceExtra={evidenceExtra}
            blueprint={null}
          />
          <div className="mt-8 space-y-8">
            <PersonaConversationPanel
              personaId={persona.id}
              executiveVersionId={null}
              versionState="none"
              versionLabel={null}
              chrome={copy.conversation}
            />
            <PersonaAppendInteraction
              personaId={persona.id}
              discussionId={null}
              initialNotes={persona.notes}
              chrome={copy.append}
            />
          </div>
        </>
      )}
    </TenantAppShell>
  );

  if (!discussion) {
    return pageBody;
  }

  return (
    <DiscussionRegenerationProvider
      discussionId={discussion.id}
      initialSnapshot={initialRegenerationSnapshot}
      chrome={executive}
    >
      {pageBody}
    </DiscussionRegenerationProvider>
  );
}
