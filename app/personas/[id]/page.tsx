export const dynamic = "force-dynamic";

import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { PersonaAppendInteraction } from "@/components/personas/PersonaAppendInteraction";
import { PersonaAppendInteractionTracked } from "@/components/personas/PersonaAppendInteractionTracked";
import { PersonaConversationPanel } from "@/components/personas/PersonaConversationPanel";
import { PersonaDeepScrapeWebsiteButton } from "@/components/personas/PersonaDeepScrapeWebsiteButton";
import { PersonaGenerateIntelligenceButton } from "@/components/personas/PersonaGenerateIntelligenceButton";
import { PersonaGenerationProgress } from "@/components/personas/PersonaGenerationProgress";
import { PersonaHeaderDeleteButton } from "@/components/personas/PersonaHeaderDeleteButton";
import { PersonaLifecycleStatusControl } from "@/components/personas/PersonaLifecycleStatusControl";
import { PersonaMetadataEditor } from "@/components/personas/PersonaMetadataEditor";
import { AthenaCollapsibleSection } from "@/components/ui/AthenaCollapsibleSection";
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
  formatPersonaOpportunityScore,
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
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  getLocalizedPersonaLifecycleLabel,
  getLocalizedPersonaReadinessLabel,
} from "@/lib/tenantI18n/personaPresentation";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

function formatDate(
  value: string | null | undefined,
  language: OrganizationLanguage,
) {
  if (!value) return null;
  return formatTenantDate(value, language);
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-white/35">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/75">{value}</div>
    </div>
  );
}

export default async function PersonaDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, locale, messages }, persona] = await Promise.all([
    getTenantLocalization(),
    getPersonaById(id, organizationId),
  ]);
  const copy = messages.personas;
  const executive = messages.personas.executive;

  if (!persona) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink
          className="mb-8"
          tagline={messages.chrome.tagline}
          logoutLabel={messages.chrome.logOut}
          sessionActionsLabel={messages.chrome.sessionActions}
        />
        <TenantBackLink href="/personas" label={copy.backToPersonas} />
        <h1 className="mt-8 text-4xl font-semibold">{copy.notFound}</h1>
      </main>
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
  const scoreLabel = formatPersonaOpportunityScore(persona.opportunity_score);
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

  const initialRegenerationSnapshot = {
    latestAnalysisId: latestAnalysis?.id ?? null,
    latestAnalysisCreatedAt: latestAnalysis?.created_at ?? null,
    latestAnalysisUpdatedAt: latestAnalysis?.updated_at ?? null,
    blueprintUpdatedAt:
      versionState.current?.intelligence.blueprint?.updated_at ?? null,
    regenerationInFlight,
  };

  const pageBody = (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink
        className="mb-8"
        tagline={messages.chrome.tagline}
        logoutLabel={messages.chrome.logOut}
        sessionActionsLabel={messages.chrome.sessionActions}
      />
      <TenantBackLink href="/personas" label={copy.backToPersonas} />

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.detail.eyebrow}
          </div>
          <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
            {displayLabel}
          </h1>
          {persona.short_description ? (
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              {persona.short_description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
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
      </div>

      <AthenaCollapsibleSection
        title={copy.detail.summary}
        defaultOpen={false}
        className="mt-10"
      >
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <SummaryItem label={copy.detail.category} value={persona.category} />
          <SummaryItem label={copy.detail.location} value={location} />
          <SummaryItem label={copy.detail.languages} value={persona.languages} />
          <SummaryItem
            label={copy.detail.lifecycle}
            value={getLocalizedPersonaLifecycleLabel(messages, lifecycle)}
          />
          <SummaryItem
            label={copy.detail.readiness}
            value={getLocalizedPersonaReadinessLabel(messages, readiness)}
          />
          <SummaryItem
            label={copy.detail.opportunityScore}
            value={scoreLabel === "—" ? null : scoreLabel}
          />
          <SummaryItem label={copy.detail.source} value={persona.source} />
          <SummaryItem
            label={copy.detail.created}
            value={formatDate(persona.created_at, language)}
          />
          <SummaryItem
            label={copy.detail.updated}
            value={formatDate(persona.updated_at, language)}
          />
          {referenceDisplay ? (
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">
                {copy.detail.referenceWebsite}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/75">
                {referenceHref ? (
                  <a
                    href={referenceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--athena-orange)] underline underline-offset-2"
                  >
                    {referenceDisplay}
                  </a>
                ) : (
                  referenceDisplay
                )}
              </div>
            </div>
          ) : null}
        </div>

        <PersonaGenerationProgress
          personaId={persona.id}
          initialStatus={readiness}
          messages={messages}
        />
      </AthenaCollapsibleSection>

      <div className="mt-8">
        <PersonaMetadataEditor
          persona={persona}
          chrome={copy.metadata}
          emptyValue={copy.emptyValue}
        />
      </div>

      {discussion ? (
        <>
          <div className="mt-8">
            <DiscussionRegenerationProgress />
          </div>
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
            afterBlueprint={null}
            afterDetailedReasoning={
              <div className="mt-8 space-y-8">
                <PersonaAppendInteractionTracked
                  personaId={persona.id}
                  discussionId={discussion.id}
                  initialNotes={persona.notes}
                  chrome={copy.append}
                />
                {/*
                  Discuss with Athena coordination (asset reference, open, scroll/focus,
                  selected Executive Version) is provided by ExecutiveIntelligenceWorkspace
                  via PersonaDiscussProvider. Props below are the no-context fallback.
                */}
                <PersonaConversationPanel
                  personaId={persona.id}
                  executiveVersionId={versionState.current?.id ?? null}
                  versionState={conversationVersionState}
                  versionLabel={
                    versionState.current
                      ? copy.detail.currentExecutiveVersion
                      : null
                  }
                  chrome={copy.conversation}
                />
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
            className={`mt-8 rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
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
          </div>
        </>
      )}
    </main>
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
