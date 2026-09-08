import type { ReactNode } from "react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { AppendDiscussionUpdateForm } from "@/components/discussions/AppendDiscussionUpdateForm";
import {
  DiscussionRegenerationProgress,
  DiscussionRegenerationProvider,
} from "@/components/discussions/DiscussionRegenerationProvider";
import { DiscussionAgeBadge } from "@/components/discussions/DiscussionAgeBadge";
import { DiscussionHeaderActions } from "@/components/discussions/DiscussionHeaderActions";
import { DiscussionLifecycleBadge } from "@/components/discussions/DiscussionLifecycleBadge";
import { DiscussionStatusControl } from "@/components/discussions/DiscussionStatusControl";
import { DiscussionWorkflowStrip } from "@/components/discussions/DiscussionWorkflowStrip";
import { ExecutiveIntelligenceWorkspace } from "@/components/discussions/ExecutiveIntelligenceWorkspace";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import {
  getOriginalDiscussionBody,
  getThreadUpdatesForDisplay,
} from "@/lib/discussionContent";
import {
  DISCUSSION_STATUS_OPTIONS,
  getDiscussionLifecycle,
  type DiscussionLifecycleKey,
  type DiscussionStatusOption,
} from "@/lib/discussionStatus";
import { getDiscussionAgeKey } from "@/lib/discussionAge";
import { buildDiscussionWorkflowSteps } from "@/lib/discussionWorkflow";
import { fillChromeTemplate } from "@/lib/discussionExecutiveChrome";
import {
  getLocalizedDiscussionAgeLabel,
  getLocalizedDiscussionLifecycleLabel,
  getLocalizedDiscussionStatusOptionLabel,
  getLocalizedDiscussionStoredStatusLabel,
} from "@/lib/tenantI18n/discussionPresentation";
import { formatTenantDateTime } from "@/lib/tenantI18n/format";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getSharedAssetChrome } from "@/lib/tenantI18n/opportunityPresentation";
import { getDisplayAssetBlueprintByDiscussionId } from "@/services/assetBlueprints/assetBlueprintService";
import { getCommunityById } from "@/services/communityService";
import { getDiscussionById } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";
import { getOpportunityByDiscussionId } from "@/services/opportunityService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";
import { getOrganizationAiWorkspacePreferences } from "@/services/identity/aiWorkspacePreferences";
import {
  getOrganizationBrandIdentity,
} from "@/services/identity/brandIdentityService";
import { toBlueprintBrandDirectionInput } from "@/services/identity/blueprintBrandDirection";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getDiscussionUpdatesByDiscussionId } from "@/services/discussionUpdateService";
import {
  getIntelligenceDomainName,
  getIntelligenceDomains,
} from "@/services/intelligenceDomainService";
import {
  getExecutiveVersionsForDiscussionPage,
  loadLiveExecutiveIntelligence,
} from "@/services/executiveVersions/executiveVersionService";

export const dynamic = "force-dynamic";

export default async function DiscussionDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, locale, messages }, discussion] = await Promise.all([
    getTenantLocalization(),
    getDiscussionById(id, organizationId),
  ]);
  const copy = messages.discussions.detail;
  const executive = messages.discussions.executive;

  if (!discussion) {
    return (
      <TenantAppShell currentPath={`/discussions/${id}`} messages={messages}>
        <TenantBackLink href="/discussions" label={copy.backToDiscussions} />

        <h1 className="mt-8 text-4xl font-semibold">{copy.notFound}</h1>
      </TenantAppShell>
    );
  }

  const [
    community,
    latestAnalysis,
    assetBlueprint,
    threadUpdates,
    opportunity,
    domains,
    versionState,
    liveIntelligence,
    organizationBrand,
    continuationPreferences,
  ] = await Promise.all([
    discussion.community_id
      ? getCommunityById(discussion.community_id, organizationId)
      : Promise.resolve(null),
    getLatestDiscussionAnalysis(id, organizationId),
    getDisplayAssetBlueprintByDiscussionId(id, organizationId),
    getDiscussionUpdatesByDiscussionId(id, organizationId),
    getOpportunityByDiscussionId(id, organizationId),
    getIntelligenceDomains(organizationId),
    getExecutiveVersionsForDiscussionPage(id, organizationId),
    loadLiveExecutiveIntelligence(id, organizationId),
    getOrganizationBrandIdentity(organizationId).catch((error) => {
      console.error("[BRAND_DIRECTION] discussion_load_failed", error);
      return null;
    }),
    getOrganizationAiWorkspacePreferences(organizationId),
  ]);

  const brandDirection = toBlueprintBrandDirectionInput(organizationBrand);

  const briefing = opportunity
    ? await getLatestReviewByOpportunityId(opportunity.id, organizationId)
    : null;

  const originalBody = getOriginalDiscussionBody(discussion);
  const displayedUpdates = getThreadUpdatesForDisplay(
    discussion,
    threadUpdates,
  );
  const hasAnalysis = Boolean(
    versionState.current?.intelligence.analysis ?? latestAnalysis,
  );
  const workflowSteps = buildDiscussionWorkflowSteps({
    analysis:
      versionState.current?.intelligence.analysis ?? latestAnalysis,
    opportunity:
      versionState.current?.intelligence.opportunity ?? opportunity,
    briefing: versionState.current?.intelligence.briefing ?? briefing,
    assetBlueprint:
      versionState.current?.intelligence.blueprint ?? assetBlueprint,
    clientStatusLabel: discussion.status || "New",
  }).map((step) => {
    if (step.key === "outcome") {
      return {
        ...step,
        label: fillChromeTemplate(copy.workflowCurrentStatus, {
          status: getLocalizedDiscussionStoredStatusLabel(
            messages,
            discussion.status,
          ),
        }),
      };
    }
    const workflowLabels = {
      analysis: copy.workflowAnalysis,
      opportunity: copy.workflowOpportunity,
      briefing: copy.workflowBriefing,
      assets: copy.workflowAssets,
    } as const;
    return {
      ...step,
      label: workflowLabels[step.key] ?? step.label,
    };
  });

  const intelligenceDomainOptions = domains.map((domain) => ({
    id: domain.id,
    name: getIntelligenceDomainName(domain),
  }));

  const initialRegenerationSnapshot = {
    latestAnalysisId: latestAnalysis?.id ?? null,
    latestAnalysisCreatedAt: latestAnalysis?.created_at ?? null,
    latestAnalysisUpdatedAt: latestAnalysis?.updated_at ?? null,
    blueprintUpdatedAt: assetBlueprint?.updated_at ?? null,
    regenerationInFlight: false,
  };

  const lifecycleKey = getDiscussionLifecycle(discussion, hasAnalysis).key;
  const ageKey = getDiscussionAgeKey(discussion);
  const lifecycleLabels = {
    new: getLocalizedDiscussionLifecycleLabel(messages, "new"),
    reviewing: getLocalizedDiscussionLifecycleLabel(messages, "reviewing"),
    monitoring: getLocalizedDiscussionLifecycleLabel(messages, "monitoring"),
    completed: getLocalizedDiscussionLifecycleLabel(messages, "completed"),
  } satisfies Record<DiscussionLifecycleKey, string>;
  const statusLabels = Object.fromEntries(
    DISCUSSION_STATUS_OPTIONS.map((option) => [
      option,
      getLocalizedDiscussionStatusOptionLabel(messages, option),
    ]),
  ) as Record<DiscussionStatusOption, string>;

  return (
    <DiscussionRegenerationProvider
      discussionId={id}
      initialSnapshot={initialRegenerationSnapshot}
      chrome={executive}
    >
      <TenantAppShell currentPath={`/discussions/${id}`} messages={messages}>
      <TenantBackLink href="/discussions" label={copy.backToDiscussions} />

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.eyebrow}
          </div>

          <h1 className="mt-4 max-w-5xl text-3xl font-semibold tracking-tight sm:text-5xl">
            {discussion.title}
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            {copy.subtitle}
          </p>
        </div>

        <DiscussionHeaderActions
          discussion={discussion}
          originalBody={originalBody}
          intelligenceDomains={intelligenceDomainOptions}
          messages={copy}
          deleteChrome={{
            delete: messages.common.delete,
            cancel: messages.common.cancel,
            confirmDelete: messages.common.confirmDelete,
            deleting: messages.common.deleting,
            confirmDeletion: messages.common.confirmDeletion,
          }}
        />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeaderMetric label={copy.labelPlatform} value={discussion.platform} />
        <HeaderMetric
          label={copy.labelAuthor}
          value={discussion.author || copy.emptyValue}
        />
        <HeaderMetric
          label={copy.labelDomain}
          value={community?.group_name || copy.emptyValue}
        />
        <HeaderMetric label={copy.labelLifecycle}>
          <DiscussionLifecycleBadge
            discussion={discussion}
            hasAnalysis={hasAnalysis}
            label={getLocalizedDiscussionLifecycleLabel(messages, lifecycleKey)}
          />
        </HeaderMetric>
        <HeaderMetric
          label={copy.labelOpportunityScore}
          value={String(discussion.opportunity_score)}
          highlight="orange"
        />
        <HeaderMetric label={copy.labelThreadAge}>
          <DiscussionAgeBadge
            discussion={discussion}
            label={getLocalizedDiscussionAgeLabel(messages, ageKey)}
          />
        </HeaderMetric>
        <HeaderMetric label={copy.labelSourceUrl}>
          {discussion.url ? (
            <a
              href={discussion.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[var(--athena-orange)] underline"
            >
              {discussion.url}
            </a>
          ) : (
            copy.emptyValue
          )}
        </HeaderMetric>
      </div>

      <div className="mt-4 max-w-md">
        <DiscussionStatusControl
          discussion={discussion}
          hasAnalysis={hasAnalysis}
          label={copy.statusControlLabel}
          statusLabels={statusLabels}
          lifecycleLabels={lifecycleLabels}
          successMessage={copy.statusUpdated}
          errorFallback={copy.statusUpdateFailed}
        />
      </div>

      <DiscussionWorkflowStrip
        steps={workflowSteps}
        title={copy.workflowProgress}
      />

      <div className="mt-8">
        <DiscussionRegenerationProgress />
      </div>

      <ExecutiveIntelligenceWorkspace
        discussionId={discussion.id}
        versions={versionState.versions}
        fallbackIntelligence={
          versionState.current?.intelligence ?? liveIntelligence
        }
        brandDirection={brandDirection}
        continuationPreferences={continuationPreferences}
        chrome={executive}
        locale={locale}
        assetChrome={getSharedAssetChrome(messages)}
        afterBlueprint={null}
        afterDetailedReasoning={
          <div className="mt-8">
            <AppendDiscussionUpdateForm
              discussionId={discussion.id}
              messages={copy}
            />
          </div>
        }
        originalDiscussionSection={
          <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <Field
                label={copy.labelAuthor}
                value={discussion.author}
                emptyValue={copy.emptyValue}
              />
              <Field
                label={copy.labelDomain}
                value={community?.group_name}
                emptyValue={copy.emptyValue}
              />
              <Field
                label={copy.labelPlatform}
                value={discussion.platform}
                emptyValue={copy.emptyValue}
              />
              <Field
                label={copy.labelOriginalSentiment}
                value={discussion.sentiment}
                emptyValue={copy.emptyValue}
              />
              <Field
                label={copy.labelSourceUrl}
                value={discussion.url}
                link={discussion.url}
                emptyValue={copy.emptyValue}
              />
            </div>

            <div>
              <div className="text-sm text-white/40">{copy.labelDiscussion}</div>
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
                {originalBody || copy.emptyBody}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold">{copy.threadUpdatesTitle}</h3>

              {displayedUpdates.length === 0 ? (
                <div className="mt-4 text-sm text-white/45">
                  {copy.threadUpdatesEmpty}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {displayedUpdates.map((update) => (
                    <div
                      key={update.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-5"
                    >
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                        <span>
                          {formatTenantDateTime(update.capturedAt, language)}
                        </span>
                        {update.author ? <span>{update.author}</span> : null}
                        {update.url ? (
                          <a
                            href={update.url}
                            className="text-[var(--athena-orange)] underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {copy.sourceUrlLink}
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-3 text-sm leading-7 text-white/70">
                        {update.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      />
      </TenantAppShell>
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
      className={`rounded-[20px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-5`}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className={`mt-3 text-lg font-semibold ${children ? "" : color}`}>
        {children ?? value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  helper,
  sublabel,
  link,
  emptyValue = "—",
}: {
  label: string;
  value?: string | null;
  helper?: string;
  sublabel?: string;
  link?: string | null;
  emptyValue?: string;
}) {
  return (
    <div>
      <div className="text-sm text-white/40">
        {label}
        {sublabel && (
          <span className="ml-2 text-xs text-white/30">({sublabel})</span>
        )}
      </div>
      {helper && (
        <div className="mt-1 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="mt-2 text-base leading-7 text-white/80">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="break-all text-[var(--athena-orange)] underline"
          >
            {value || link}
          </a>
        ) : (
          value || emptyValue
        )}
      </div>
    </div>
  );
}
