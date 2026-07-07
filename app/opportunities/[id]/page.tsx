export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BriefingStatusBadge } from "@/components/briefings/BriefingStatusBadge";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { GenerateReviewButton } from "@/components/opportunities/GenerateReviewButton";
import { DeploymentReadinessBadge } from "@/components/queues/DeploymentReadinessBadge";
import { OpportunityStatusBadge } from "@/components/queues/OpportunityStatusBadge";
import { buildOpportunityDeploymentAssets } from "@/lib/deploymentAssets";
import { getOpportunityById } from "@/services/opportunityService";
import { getLatestReviewByOpportunityId } from "@/services/reviewService";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OpportunityPage({ params }: Props) {
  const { id } = await params;

  const opportunity = await getOpportunityById(id);

  if (!opportunity) {
    notFound();
  }

  const briefing = await getLatestReviewByOpportunityId(id);
  const deploymentAssets = buildOpportunityDeploymentAssets(
    opportunity,
    briefing,
  );

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-8 text-white">
      <Link
        href="/opportunities"
        className="text-sm text-[var(--athena-orange)] hover:underline"
      >
        ← Back to Opportunities
      </Link>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Opportunity
          </div>

          <h1 className="mt-4 text-5xl font-semibold">{opportunity.title}</h1>

          <p className="mt-4 max-w-3xl text-white/50">
            A business lead extracted from market conversation — decide whether
            to pursue and what action to take next.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          {opportunity.discussion_id ? (
            <Link
              href={`/discussions/${opportunity.discussion_id}`}
              className="rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
            >
              View Source Discussion
            </Link>
          ) : (
            <div className="text-sm text-white/45">No source discussion linked.</div>
          )}

          {briefing ? (
            <Link
              href={`/briefings/${briefing.id}`}
              className="rounded-full border border-white/15 px-7 py-4 text-sm font-semibold text-white/75 transition hover:border-[var(--athena-orange)]/40 hover:text-white"
            >
              Open Executive Briefing
            </Link>
          ) : (
            <div className="text-sm text-white/45">No executive briefing yet.</div>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-5">
        <Metric label="Type" value={opportunity.type} />
        <Metric label="Sales Status">
          <OpportunityStatusBadge status={opportunity.status} size="lg" />
        </Metric>
        <Metric label="Score" value={String(opportunity.score)} tone="orange" />
        <Metric label="Urgency" value={opportunity.urgency || "—"} />
        <Metric label="Deployment Readiness">
          <DeploymentReadinessBadge
            briefingStatus={briefing?.status ?? null}
            size="lg"
          />
        </Metric>
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-2xl font-semibold">Why This Is an Opportunity</h2>
        <p className="mt-4 leading-7 text-white/75">
          {opportunity.reason || "No opportunity reason captured yet."}
        </p>

        <div className="mt-8">
          <Field
            label="Recommended Action"
            value={opportunity.recommended_action}
            helper="What Athena recommends you do next."
          />
        </div>
      </div>

      {deploymentAssets.length > 0 && (
        <div className="mt-8">
          <DeploymentAssets assets={deploymentAssets} />
        </div>
      )}

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Executive Briefing</h2>
          <p className="mt-2 text-sm text-white/45">
            Supporting strategic intelligence for this opportunity. Approval and
            full memo live on the briefing page.
          </p>
        </div>

        {briefing ? (
          <div className="space-y-6">
            <Field label="Summary" value={briefing.summary} />
            <Field label="Pain Points" value={briefing.pain_points} />
            <Field label="Buyer Stage" value={briefing.buyer_stage} />
            <Field label="Confidence" value={`${briefing.confidence}%`} />
            <div>
              <div className="mb-2 text-white/40">Status</div>
              <BriefingStatusBadge status={briefing.status} />
            </div>
            <Link
              href={`/briefings/${briefing.id}`}
              className="inline-block text-sm text-[var(--athena-orange)]"
            >
              Open full executive briefing →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-white/50">No executive briefing yet.</div>
            <GenerateReviewButton opportunityId={opportunity.id} />
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value?: string;
  tone?: "warning" | "orange";
  children?: ReactNode;
}) {
  const color =
    tone === "warning"
      ? "text-[var(--athena-warning)]"
      : tone === "orange"
        ? "text-[var(--athena-orange)]"
        : "text-white";

  return (
    <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-white/40">{label}</div>
      <div className={`mt-4 ${children ? "" : `text-2xl font-semibold capitalize ${color}`}`}>
        {children ?? value}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  helper,
}: {
  label: string;
  value?: string | null;
  helper?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-white/40">{label}</div>
      {helper && (
        <div className="mb-2 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="leading-7 text-white/80">{value || "—"}</div>
    </div>
  );
}
