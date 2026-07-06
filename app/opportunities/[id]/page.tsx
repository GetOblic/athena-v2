import Link from "next/link";
import { notFound } from "next/navigation";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { GenerateReviewButton } from "@/components/opportunities/GenerateReviewButton";
import { ReviewStatusActions } from "@/components/opportunities/ReviewStatusActions";
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
            Opportunity Engine
          </div>

          <h1 className="mt-4 text-5xl font-semibold">{opportunity.title}</h1>

          <p className="mt-4 text-white/50">AI-generated business opportunity.</p>
        </div>

        <GenerateReviewButton opportunityId={opportunity.id} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-4">
        <Metric label="Type" value={opportunity.type} />
        <Metric label="Status" value={opportunity.status} tone="warning" />
        <Metric label="Score" value={String(opportunity.score)} tone="orange" />
        <Metric label="Urgency" value={opportunity.urgency || "—"} />
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="mb-6 text-2xl font-semibold">Athena Recommendation</h2>

        <div className="space-y-6">
          <Field label="Reason" value={opportunity.reason} />
          <Field
            label="Strategic Recommendation"
            sublabel="Recommended Action"
            value={opportunity.recommended_action}
            helper="Guidance for internal decision-making."
          />
          <Field label="AI Summary" value={opportunity.ai_summary} />
          <Field
            label="Strategic Recommendation"
            sublabel="AI Recommendation"
            value={opportunity.ai_recommendation}
            helper="Guidance for internal decision-making."
          />
        </div>
      </div>

      {deploymentAssets.length > 0 && (
        <div className="mt-8">
          <DeploymentAssets assets={deploymentAssets} />
        </div>
      )}

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <div className="mb-6 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-2xl font-semibold">Latest Executive Briefing</h2>

          {latestReview && (
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="text-sm text-white/40">
                Status:{" "}
                <span className="text-[var(--athena-orange)]">
                  {latestReview.status}
                </span>
              </div>

              <ReviewStatusActions
                reviewId={latestReview.id}
                currentStatus={latestReview.status}
              />
            </div>
          )}
        </div>

        {latestReview ? (
          <div className="space-y-6">
            <Field label="Summary" value={latestReview.summary} />
            <Field label="Pain Points" value={latestReview.pain_points} />
            <Field label="Buyer Stage" value={latestReview.buyer_stage} />
            <Field label="Confidence" value={`${latestReview.confidence}%`} />
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
      <div className={`mt-4 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  helper,
  sublabel,
}: {
  label: string;
  value?: string | null;
  helper?: string;
  sublabel?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-white/40">
        {label}
        {sublabel && (
          <span className="ml-2 text-xs text-white/30">({sublabel})</span>
        )}
      </div>
      {helper && (
        <div className="mb-2 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="leading-7 text-white/80">{value || "—"}</div>
    </div>
  );
}
