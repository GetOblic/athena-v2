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
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
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
import { normalizePersonaLifecycleStatus } from "@/services/personas/personaLifecycle";
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
  getAudienceWorkingStatusLabel,
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
  const lifecycle = normalizePersonaLifecycleStatus(persona.lifecycle_status);
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
    <div className="mt-8 space-y-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <Link href="/ads/new" className="block">
        <div className="text-sm font-semibold text-white">
          {copy.traction.createAdvertising}
        </div>
        <p className="mt-1 text-sm leading-6 text-white/50">
          {copy.traction.createAdvertisingHelp}
        </p>
      </Link>
      <Link
        href="/social-planner"
        className="block text-sm font-semibold text-white"
      >
        {copy.traction.planSocial}
      </Link>
    </div>
  );

  const pageBody = (
    <TenantAppShell currentPath={`/personas/${id}`} messages={messages}>
      <Link
        href="/personas"
        className="mb-6 inline-flex text-sm text-[var(--athena-orange)]"
      >
        {copy.backToPersonas}
      </Link>

      <TractionPageHeader
        eyebrow={copy.detail.eyebrow}
        title={displayLabel}
        subtitle={persona.short_description ?? undefined}
        badge={
          <span className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--athena-orange)]">
            {getAudienceIntelligenceStatusLabel(messages, readiness)}
          </span>
        }
      >
        <p className="mt-3 hidden text-sm text-white/40 lg:block">
          {copy.traction.workingStatus}:{" "}
          {getAudienceWorkingStatusLabel(messages, lifecycle)}
        </p>
        {(location || referenceDisplay) && (
          <p className="mt-2 text-sm text-white/45">
            {[persona.category, location].filter(Boolean).join(" · ")}
            {referenceHref ? (
              <>
                {persona.category || location ? " · " : null}
                <a
                  href={referenceHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--athena-orange)] underline underline-offset-2"
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
        )}
      </TractionPageHeader>

      {intelligenceProcessing ? (
        <div className="mb-6 rounded-[24px] border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 p-5">
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
        <div className="mb-6 rounded-[24px] border border-rose-400/30 bg-rose-500/10 p-5">
          <p className="text-sm leading-6 text-rose-100/80">
            {copy.traction.failedBanner}
          </p>
        </div>
      ) : null}

      {!hasCurrentExecutiveVersion && !intelligenceProcessing && !intelligenceFailed ? (
        <div className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm leading-6 text-white/65">
            {copy.traction.savedBanner}
          </p>
        </div>
      ) : null}

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <PersonaGenerateIntelligenceButton
          personaId={persona.id}
          initialStatus={readiness}
          initialInFlight={regenerationInFlight}
          hasCurrentExecutiveVersion={hasCurrentExecutiveVersion}
          chrome={copy.detail}
        />
        <PersonaDeepScrapeWebsiteButton
          personaId={persona.id}
          initiallyAvailable={deepScrapeAvailable}
          messages={copy.deepScrape}
          locale={locale}
        />
        <PersonaLifecycleStatusControl persona={persona} messages={messages} />
        <PersonaHeaderDeleteButton
          personaId={persona.id}
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
            afterBlueprint={null}
            afterDetailedReasoning={
              <div className="mt-8 space-y-8">
                {conversationPanel}
                {profileEditor}
                <PersonaAppendInteractionTracked
                  personaId={persona.id}
                  discussionId={discussion.id}
                  initialNotes={persona.notes}
                  chrome={copy.append}
                />
                {crossLinks}
              </div>
            }
            originalDiscussionSection={
              <div className="space-y-4">
                <p className="text-sm leading-6 text-white/45">
                  {copy.detail.sourceContextHelp}
                </p>
                {persona.ads_content?.trim() ? (
                  <div>
                    <div className="text-sm text-white/40">
                      {copy.detail.adsContent}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
                      {persona.ads_content}
                    </div>
                  </div>
                ) : null}
                {persona.preferred_channels?.trim() ? (
                  <div>
                    <div className="text-sm text-white/40">
                      {copy.detail.preferredChannels}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-white/70">
                      {persona.preferred_channels}
                    </div>
                  </div>
                ) : null}
              </div>
            }
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
          <div className="mt-8 space-y-8">
            {profileEditor}
            <PersonaAppendInteraction
              personaId={persona.id}
              discussionId={null}
              initialNotes={persona.notes}
              chrome={copy.append}
            />
            <PersonaConversationPanel
              personaId={persona.id}
              executiveVersionId={null}
              versionState="none"
              versionLabel={null}
              chrome={copy.conversation}
            />
            {crossLinks}
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
