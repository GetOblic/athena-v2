import Link from "next/link";
import type { ReactNode } from "react";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { GenerateCommunityIntelligenceButton } from "@/components/communities/GenerateCommunityIntelligenceButton";
import { IntelligenceDomainHeaderActions } from "@/components/intelligenceDomains/IntelligenceDomainHeaderActions";
import { DomainHealthCard } from "@/components/intelligenceDomains/DomainHealthCard";
import { DomainIntelligenceSections } from "@/components/intelligenceDomains/DomainIntelligenceSections";
import { DomainLearningEmptyState } from "@/components/intelligenceDomains/DomainLearningEmptyState";
import { IntelligenceDomainStatusBadge } from "@/components/intelligenceDomains/IntelligenceDomainStatusBadge";
import { LearningTimeline } from "@/components/intelligenceDomains/LearningTimeline";
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
  const community = await getCommunityById(id, organizationId);

  if (!community) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />

        <Link href="/intelligence-domains" className="text-sm text-[var(--athena-orange)]">
          ← Back to Intelligence Domains
        </Link>

        <h1 className="mt-8 text-4xl font-semibold">Intelligence Domain not found</h1>
      </main>
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

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/intelligence-domains" className="text-sm text-[var(--athena-orange)]">
        ← Back to Intelligence Domains
      </Link>

      <div className="mt-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Intelligence Domain
          </div>

          <h1 className="mt-4 text-5xl font-semibold tracking-tight">
            {community.group_name}
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Executive intelligence for this monitored market domain.
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 xl:w-auto xl:max-w-md xl:items-end">
          <IntelligenceDomainHeaderActions
            domain={community}
            discussionCount={discussionCount}
          />
          <div className="w-full xl:flex xl:justify-end">
            <GenerateCommunityIntelligenceButton communityId={community.id} />
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <StatCard label="Discussions captured" value={stats.discussionsCaptured} />
        <StatCard label="Discussions analyzed" value={stats.discussionsAnalyzed} />
        <StatCard label="High-intent discussions" value={stats.highIntentDiscussions} />
        <StatCard label="Opportunities detected" value={stats.opportunitiesDetected} />
        <StatCard label="Briefings generated" value={stats.briefingsGenerated} />
        <StatCard label="Asset blueprints" value={stats.assetBlueprintsGenerated} />
        <StatCard
          label="Knowledge confidence"
          value={
            stats.knowledgeConfidence != null
              ? `${stats.knowledgeConfidence}%`
              : "Learning"
          }
        />
      </div>

      <div className="mt-8">
        <DomainHealthCard health={domainHealth} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Metric label="Platform" value={community.platform} />
        <Metric label="Status">
          <IntelligenceDomainStatusBadge status={community.status} size="lg" />
        </Metric>
        <Metric label="Priority" value={String(community.priority)} />
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-semibold">Athena&apos;s Understanding</h2>

          {latestIntelligence && (
            <div className="text-sm text-white/40">
              Confidence:{" "}
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
            <div className="mt-6 text-white/50">
              No executive summary yet. Generate domain intelligence to help Athena
              understand this market.
            </div>
          )
        ) : hasDiscussions ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/60">
            {stats.discussionsCaptured} discussion
            {stats.discussionsCaptured === 1 ? "" : "s"} captured for this domain.
            Run Athena analysis on each thread, then refresh intelligence to build
            executive understanding.
          </div>
        ) : (
          <DomainLearningEmptyState />
        )}

        <DomainIntelligenceSections intelligence={latestIntelligence} />
      </div>

      <LearningTimeline events={learningTimeline} />

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">Captured Discussions</h2>

        {discussions.length === 0 ? (
          <div className="mt-8 text-white/50">
            No discussions captured for this domain yet.
          </div>
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
                        Opportunity Score{" "}
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
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">Domain Profile</h2>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Field label="Market / Niche" value={community.niche} />
          <Field label="Member Count" value={community.member_count?.toString()} />
          <Field label="Owner" value={community.owner} />
          <Field label="URL" value={community.group_url} />
        </div>
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">Notes</h2>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/60">
          {community.notes || "No notes yet."}
        </div>
      </div>
    </main>
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

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-sm text-white/40">{label}</div>
      <div className="mt-2 text-base leading-7 text-white/80">{value || "—"}</div>
    </div>
  );
}
