import Link from "next/link";
import { notFound } from "next/navigation";
import { StrategicAssetBlueprint } from "@/components/assetBlueprints/StrategicAssetBlueprint";
import { StrategicAssetBlueprintEmpty } from "@/components/assetBlueprints/StrategicAssetBlueprintEmpty";
import { DeploymentAssets } from "@/components/deployment/DeploymentAssets";
import { ReviewStatusActions } from "@/components/opportunities/ReviewStatusActions";
import { buildBriefingDeploymentAssets } from "@/lib/deploymentAssets";
import { getDisplayAssetBlueprintForBriefing } from "@/services/assetBlueprints/assetBlueprintService";
import { getReviewById } from "@/services/reviewService";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default async function BriefingPage({ params }: Props) {
  const { id } = await params;

  const review = await getReviewById(id);

  if (!review) {
    notFound();
  }

  const deploymentAssets = buildBriefingDeploymentAssets(review);
  const assetBlueprint = await getDisplayAssetBlueprintForBriefing({
    briefingId: id,
    discussionId: review.discussion_id,
  });

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

          <p className="mt-4 max-w-3xl text-white/50">
            Strategic decision report — understand the opportunity and recommended
            direction without operational controls.
          </p>
        </div>

        <ReviewStatusActions
          reviewId={review.id}
          currentStatus={review.status}
        />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Status" value={formatStatus(review.status)} highlight="warning" />
        <MetricCard label="Buyer Stage" value={review.buyer_stage || "—"} />
        <MetricCard
          label="Confidence"
          value={`${review.confidence}%`}
          highlight="orange"
        />
        <MetricCard
          label="Linked Discussion"
          value={
            review.discussion_id ? "Discussion linked" : "No discussion linked"
          }
          href={
            review.discussion_id
              ? `/discussions/${review.discussion_id}`
              : undefined
          }
        />
      </div>

      <nav className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/briefings" className="text-[var(--athena-orange)]">
          Back to Briefings
        </Link>
        {review.discussion_id && (
          <Link
            href={`/discussions/${review.discussion_id}`}
            className="text-[var(--athena-orange)]"
          >
            View Linked Discussion
          </Link>
        )}
        {review.opportunity_id && (
          <Link
            href={`/opportunities/${review.opportunity_id}`}
            className="text-[var(--athena-orange)]"
          >
            View Linked Opportunity
          </Link>
        )}
      </nav>

      {deploymentAssets.length > 0 && (
        <div className="mt-8">
          <DeploymentAssets assets={deploymentAssets} />
        </div>
      )}

      <div className="mt-8">
        {assetBlueprint ? (
          <StrategicAssetBlueprint blueprint={assetBlueprint} />
        ) : (
          <StrategicAssetBlueprintEmpty />
        )}
      </div>

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
    </main>
  );
}

function MetricCard({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: string;
  highlight?: "warning" | "orange";
  href?: string;
}) {
  const color =
    highlight === "warning"
      ? "text-[var(--athena-warning)]"
      : highlight === "orange"
        ? "text-[var(--athena-orange)]"
        : "text-white";

  const content = (
    <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-white/40">{label}</div>
      <div className={`mt-4 text-2xl font-semibold capitalize ${color}`}>
        {value}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="transition hover:opacity-90">
        {content}
      </Link>
    );
  }

  return content;
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <div className="mb-2 text-white/40">{label}</div>
      <p className="leading-7 text-white/80">{value || "—"}</p>
    </div>
  );
}
