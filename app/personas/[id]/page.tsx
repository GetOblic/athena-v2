export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { PersonaGenerateIntelligenceButton } from "@/components/personas/PersonaGenerateIntelligenceButton";
import { PersonaGenerationProgress } from "@/components/personas/PersonaGenerationProgress";
import { PersonaLifecycleStatusControl } from "@/components/personas/PersonaLifecycleStatusControl";
import { PersonaMetadataEditor } from "@/components/personas/PersonaMetadataEditor";
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
  normalizeWebsiteUrl,
  resolvePersonaDisplayLabel,
} from "@/services/personas/personaUtils";

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const persona = await getPersonaById(id, organizationId);

  if (!persona) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/personas" className="text-sm text-[var(--athena-orange)]">
          ← Personas
        </Link>
        <h1 className="mt-8 text-4xl font-semibold">Persona not found</h1>
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
      <AthenaBrandLink className="mb-8" />
      <Link href="/personas" className="text-sm text-[var(--athena-orange)]">
        ← Personas
      </Link>

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Persona
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
          />
          <PersonaLifecycleStatusControl persona={persona} />
        </div>
      </div>

      <div
        className={`mt-10 rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
      >
        <h2 className="text-lg font-semibold">Summary</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <SummaryItem label="Category" value={persona.category} />
          <SummaryItem label="Location" value={location} />
          <SummaryItem label="Languages" value={persona.languages} />
          <SummaryItem label="Lifecycle" value={lifecycle} />
          <SummaryItem label="Readiness" value={readiness} />
          <SummaryItem
            label="Opportunity Score"
            value={scoreLabel === "—" ? null : scoreLabel}
          />
          <SummaryItem label="Source" value={persona.source} />
          <SummaryItem label="Created" value={formatDate(persona.created_at)} />
          <SummaryItem label="Updated" value={formatDate(persona.updated_at)} />
          {referenceDisplay ? (
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">
                Reference Website
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
        />
      </div>

      <div className="mt-8">
        <PersonaMetadataEditor persona={persona} />
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
            afterBlueprint={null}
            afterDetailedReasoning={null}
            originalDiscussionSection={
              <div className="space-y-4">
                <p className="text-sm leading-6 text-white/45">
                  Persona profile fields and Reference Website context used for
                  this archetype. Profile fields are managed in Persona Details
                  above.
                </p>
                {persona.ads_content?.trim() ? (
                  <div>
                    <div className="text-sm text-white/40">Ads Content</div>
                    <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
                      {persona.ads_content}
                    </div>
                  </div>
                ) : null}
                {persona.preferred_channels?.trim() ? (
                  <div>
                    <div className="text-sm text-white/40">
                      Preferred Channels
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
        <div
          className={`mt-8 rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
        >
          <h2 className="text-lg font-semibold">Persona Intelligence</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/45">
            {readiness === "Profile Created"
              ? "This Persona profile is ready. Use Generate Intelligence to enqueue durable publication through Athena’s shared pipeline."
              : regenerationInFlight
                ? "Athena is generating Persona intelligence in the background."
                : readiness === "Processing Failed"
                  ? "The last generation attempt failed. Use Retry Generate Intelligence to try again."
                  : "Persona intelligence generation is in progress or awaiting completion."}
          </p>
        </div>
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
    >
      {pageBody}
    </DiscussionRegenerationProvider>
  );
}
