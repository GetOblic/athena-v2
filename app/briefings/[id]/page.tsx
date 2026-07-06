import Link from "next/link";
import { notFound } from "next/navigation";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { ReviewStatusActions } from "@/components/opportunities/ReviewStatusActions";
import { buildBriefingDeploymentAssets } from "@/lib/deploymentAssets";
import { getReviewById } from "@/services/reviewService";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BriefingPage({ params }: Props) {
  const { id } = await params;

  const review = await getReviewById(id);

  if (!review) {
    notFound();
  }

  const deploymentAssets = buildBriefingDeploymentAssets(review);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-8 text-white">
      <Link href="/briefings" className="text-sm text-[var(--athena-orange)]">
        ← Back to Briefings
      </Link>

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Executive Briefing
          </div>

          <h1 className="mt-4 text-5xl font-semibold">Executive Briefing</h1>

          <p className="mt-4 text-white/50">
            Human supervised intelligence report.
          </p>
        </div>

        <ReviewStatusActions
          reviewId={review.id}
          currentStatus={review.status}
        />
      </div>

      <div className="mt-10 grid grid-cols-4 gap-6">
        <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-white/40">Status</div>

          <div className="mt-4 text-4xl font-semibold text-[var(--athena-warning)]">
            {review.status}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-white/40">Buyer Stage</div>

          <div className="mt-4 text-2xl">{review.buyer_stage || "—"}</div>
        </div>

        <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-white/40">Confidence</div>

          <div className="mt-4 text-4xl font-semibold text-[var(--athena-orange)]">
            {review.confidence}%
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="text-white/40">Discussion</div>

          <div className="mt-4 break-all text-sm">
            {review.discussion_id || "—"}
          </div>
        </div>
      </div>

      {deploymentAssets.length > 0 && (
        <div className="mt-8">
          <DeploymentAssets assets={deploymentAssets} />
        </div>
      )}

      <div className="mt-8 rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="mb-2 text-3xl font-semibold">Executive Briefing</h2>
        <p className="mb-8 text-sm text-white/45">
          Decision support — strategic context for operator review.
        </p>

        <div className="space-y-8">
          <Field label="Executive Summary" value={review.summary} />
          <Field label="Pain Points" value={review.pain_points} />
          <Field label="Buyer Stage" value={review.buyer_stage} />
        </div>
      </div>

      {review.opportunity_id && (
        <div className="mt-8">
          <Link
            href={`/opportunities/${review.opportunity_id}`}
            className="text-sm text-[var(--athena-orange)]"
          >
            ← Back to Opportunity
          </Link>
        </div>
      )}
    </main>
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
      <p className="leading-7 text-white/80">{value || "—"}</p>
    </div>
  );
}
