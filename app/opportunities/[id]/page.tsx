import Link from "next/link";
import { notFound } from "next/navigation";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { GenerateReviewButton } from "@/components/opportunities/GenerateReviewButton";
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

  const latestReview = await getLatestReviewByOpportunityId(id);
  const deploymentAssets = buildOpportunityDeploymentAssets(
    opportunity,
    latestReview,
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

        <GenerateReviewButton opportunityId={opportunity.id} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-4">
        <Metric label="Type" value={opportunity.type} />
        <Metric label="Status" value={opportunity.status} tone="warning" />
        <Metric label="Score" value={String(opportunity.score)} tone="orange" />
        <Metric label="Urgency" value={opportunity.urgency || "—"} />
      </div>

      <nav className="mt-8 flex flex-wrap gap-4 text-sm">
        {opportunity.discussion_id && (
          <Link
            href={`/discussions/${opportunity.discussion_id}`}
            className="text-[var(--athena-orange)]"
          >
            View Source Discussion
          </Link>
        )}
        {latestReview && (
          <Link
            href={`/briefings/${latestReview.id}`}
            className="text-[var(--athena-orange)]"
          >
            Open Executive Briefing
          </Link>
        )}
      </nav>

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
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Latest Executive Briefing</h2>
            <p className="mt-2 text-sm text-white/45">
              Strategic summary for this opportunity. Open the full briefing for
              complete context and status controls.
            </p>
          </div>

          {latestReview && (
            <Link
              href={`/briefings/${latestReview.id}`}
              className="rounded-full border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/10 px-6 py-3 text-sm font-semibold text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20"
            >
              Open Full Briefing
            </Link>
          )}
        </div>

        {latestReview ? (
          <div className="space-y-6">
            <Field label="Summary" value={latestReview.summary} />
            <Field label="Pain Points" value={latestReview.pain_points} />
            <Field label="Buyer Stage" value={latestReview.buyer_stage} />
            <Field label="Confidence" value={`${latestReview.confidence}%`} />
            <Field
              label="Status"
              value={latestReview.status.replace(/_/g, " ")}
            />
          </div>
        ) : (
          <div className="text-white/50">
            No Executive Briefing has been generated for this opportunity yet.
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
}: {
  label: string;
  value: string;
  tone?: "warning" | "orange";
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
      <div className={`mt-4 text-2xl font-semibold capitalize ${color}`}>
        {value}
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
