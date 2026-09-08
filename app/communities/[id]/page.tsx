import Link from "next/link";
import type { ReactNode } from "react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { GenerateCommunityIntelligenceButton } from "@/components/communities/GenerateCommunityIntelligenceButton";
import { IntelligenceDomainHeaderActions } from "@/components/intelligenceDomains/IntelligenceDomainHeaderActions";
import { DomainHealthCard } from "@/components/intelligenceDomains/DomainHealthCard";
import { DomainIntelligenceSections } from "@/components/intelligenceDomains/DomainIntelligenceSections";
import { DomainLearningEmptyState } from "@/components/intelligenceDomains/DomainLearningEmptyState";
import { IntelligenceDomainStatusBadge } from "@/components/intelligenceDomains/IntelligenceDomainStatusBadge";
import { LearningTimeline } from "@/components/intelligenceDomains/LearningTimeline";
import { TenantBackLink } from "@/components/navigation/TenantBackLink";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getLocalizedDomainHealthLabel } from "@/lib/tenantI18n/intelligenceDomainPresentation";
import { getLocalizedIntelligenceDomainStatus } from "@/lib/tenantI18n/intelligenceDomainStatus";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { getCommunityById } from "@/services/communityService";
import {
  getCommunityIntelligenceHistory,
  getLatestCommunityIntelligenceByCommunityId,
} from "@/services/communityIntelligenceService";
import { getDiscussionsByCommunityId } from "@/services/discussionService";
import {
  getDomainHealth,
  getDomainLearningTimeline,
  getIntelligenceDomainDiscussionCount,
  getIntelligenceDomainStats,
} from "@/services/intelligenceDomainService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export const dynamic = "force-dynamic";

export default async function CommunityDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, locale, messages }, community] = await Promise.all([
    getTenantLocalization(),
    getCommunityById(id, organizationId),
  ]);
  const copy = messages.intelligenceDomains.detail;

  if (!community) {
    return (
      <TenantAppShell currentPath={`/communities/${id}`} messages={messages}>
        <TenantBackLink href="/intelligence-domains" label={copy.backToDomains} />

        <h1 className="mt-8 text-4xl font-semibold">{copy.notFound}</h1>
      </TenantAppShell>
    );
  }

  const [latestIntelligence, discussions, intelligenceHistory, learningTimeline, discussionCount] =
    await Promise.all([
      getLatestCommunityIntelligenceByCommunityId(id, organizationId),
      getDiscussionsByCommunityId(id, organizationId),
      getCommunityIntelligenceHistory(id, organizationId),
      getDomainLearningTimeline(id, organizationId),
      getIntelligenceDomainDiscussionCount(id, organizationId),
    ]);

  const stats = await getIntelligenceDomainStats(
    id,
    organizationId,
    latestIntelligence?.confidence ?? null,
  );

  const domainHealth = getDomainHealth({
    domain: community,
    stats,
    intelligenceHistory,
  });

  const hasDiscussions = discussions.length > 0;
  const hasAnalyzedDiscussions = stats.discussionsAnalyzed > 0;
  const capturedHelp =
    stats.discussionsCaptured === 1
      ? copy.discussionsCapturedHelpOne
      : copy.discussionsCapturedHelpMany;

  return (
    <TenantAppShell currentPath={`/communities/${id}`} messages={messages}>
      <TenantBackLink href="/intelligence-domains" label={copy.backToDomains} />

      <div className="mt-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            {copy.eyebrow}
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            {community.group_name}
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            {copy.subtitle}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 xl:w-auto xl:max-w-md xl:items-end">
          <IntelligenceDomainHeaderActions
            domain={community}
            discussionCount={discussionCount}
            messages={messages.intelligenceDomains}
          />
          <div className="w-full xl:flex xl:justify-end">
            <GenerateCommunityIntelligenceButton
              communityId={community.id}
              chrome={{
                refreshIntelligence: copy.refreshIntelligence,
                refreshingIntelligence: copy.refreshingIntelligence,
                refreshFailed: copy.refreshFailed,
                unknownError: copy.unknownError,
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <StatCard label={copy.statDiscussionsCaptured} value={stats.discussionsCaptured} />
        <StatCard label={copy.statDiscussionsAnalyzed} value={stats.discussionsAnalyzed} />
        <StatCard label={copy.statHighIntent} value={stats.highIntentDiscussions} />
        <StatCard label={copy.statOpportunities} value={stats.opportunitiesDetected} />
        <StatCard label={copy.statBriefings} value={stats.briefingsGenerated} />
        <StatCard label={copy.statAssetBlueprints} value={stats.assetBlueprintsGenerated} />
        <StatCard
          label={copy.statKnowledgeConfidence}
          value={
            stats.knowledgeConfidence != null
              ? `${stats.knowledgeConfidence}%`
              : getLocalizedDomainHealthLabel(messages, "Learning")
          }
        />
      </div>

      <div className="mt-8">
        <DomainHealthCard
          health={domainHealth}
          copy={copy}
          healthLabel={getLocalizedDomainHealthLabel(
            messages,
            domainHealth.healthLabel,
          )}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Metric label={copy.labelPlatform} value={community.platform} />
        <Metric label={messages.intelligenceDomains.status}>
          <IntelligenceDomainStatusBadge
            status={community.status}
            size="lg"
            label={getLocalizedIntelligenceDomainStatus(messages, community.status)}
          />
        </Metric>
        <Metric
          label={messages.intelligenceDomains.priority}
          value={String(community.priority)}
        />
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-semibold">{copy.understandingTitle}</h2>

          {latestIntelligence && (
            <div className="text-sm text-white/40">
              {copy.confidenceLabel}{" "}
              <span className="text-[var(--athena-orange)]">
                {latestIntelligence.confidence}%
              </span>
            </div>
          )}
        </div>

        {hasAnalyzedDiscussions ? (
          latestIntelligence?.executive_summary ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/75">
              {latestIntelligence.executive_summary}
            </div>
          ) : (
            <div className="mt-6 text-white/50">{copy.noExecutiveSummary}</div>
          )
        ) : hasDiscussions ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/60">
            {interpolateTenantMessage(capturedHelp, {
              count: stats.discussionsCaptured,
            })}
          </div>
        ) : (
          <DomainLearningEmptyState copy={copy} />
        )}

        <DomainIntelligenceSections
          intelligence={latestIntelligence}
          messages={messages}
        />
      </div>

      <LearningTimeline
        events={learningTimeline}
        messages={messages}
        language={language}
        locale={locale}
      />

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">{copy.capturedDiscussions}</h2>

        {discussions.length === 0 ? (
          <div className="mt-8 text-white/50">{copy.capturedDiscussionsEmpty}</div>
        ) : (
          <div className="mt-8 space-y-4">
            {discussions.map((discussion) => (
              <div
                key={discussion.id}
                className="rounded-[18px] border border-white/10 bg-black/20 p-5"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold">{discussion.title}</div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/40">
                      <span>
                        {copy.opportunityScore}{" "}
                        <span className="font-semibold text-[var(--athena-orange)]">
                          {discussion.opportunity_score}
                        </span>
                      </span>
                      <span className="text-[var(--athena-warning)]">
                        {discussion.status}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/discussions/${discussion.id}`}
                    className="shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                  >
                    {messages.intelligenceDomains.open}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">{copy.profileTitle}</h2>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Field
            label={messages.intelligenceDomains.marketNiche}
            value={community.niche}
            emptyValue={copy.emptyValue}
          />
          <Field
            label={copy.labelMemberCount}
            value={community.member_count?.toString()}
            emptyValue={copy.emptyValue}
          />
          <Field
            label={copy.labelOwner}
            value={community.owner}
            emptyValue={copy.emptyValue}
          />
          <Field
            label={copy.labelUrl}
            value={community.group_url}
            emptyValue={copy.emptyValue}
          />
        </div>
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">{copy.notesTitle}</h2>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/60">
          {community.notes || copy.notesEmpty}
        </div>
      </div>
    </TenantAppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[20px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-[var(--athena-orange)]">
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-sm text-white/40">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">
        {children ?? value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  emptyValue,
}: {
  label: string;
  value?: string | number | null;
  emptyValue: string;
}) {
  return (
    <div>
      <div className="text-sm text-white/40">{label}</div>
      <div className="mt-2 text-base leading-7 text-white/80">
        {value || emptyValue}
      </div>
    </div>
  );
}
