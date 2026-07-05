import Link from "next/link";
import { GenerateCommunityIntelligenceButton } from "@/components/communities/GenerateCommunityIntelligenceButton";
import { getCommunityById } from "@/services/communityService";
import { getLatestCommunityIntelligenceByCommunityId } from "@/services/communityIntelligenceService";

export default async function CommunityDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const community = await getCommunityById(id);

  if (!community) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <Link href="/communities" className="text-sm text-[var(--athena-orange)]">
          ← Back to Communities
        </Link>

        <h1 className="mt-8 text-4xl font-semibold">Community not found</h1>
      </main>
    );
  }

  const latestIntelligence =
    await getLatestCommunityIntelligenceByCommunityId(id);

  return (
    <main className="mih-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/communities" className="text-sm text-[var(--athena-orange)]">
        ← Back to Communities
      </Link>

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Community Intelligence
          </div>

          <h1 className="mt-4 text-5xl font-semibold tracking-tight">
            {community.group_name}
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Executive intelligence for this monitored community.
          </p>
        </div>

        <GenerateCommunityIntelligenceButton communityId={community.id} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Metric label="Platform" value={community.platform} />
        <Metric label="Status" value={community.status} highlight="success" />
        <Metric label="Priority" value={String(community.priority)} />
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <h2 className="text-xl font-semibold">Community Profile</h2>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Field label="Niche" value={community.niche} />
          <Field label="Member Count" value={community.member_count?.toString()} />
          <Field label="Owner" value={community.owner} />
          <Field label="URL" value={community.group_url} />
        </div>

        <div className="mt-8">
          <div className="text-sm text-white/40">Notes</div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/60">
            {community.notes || "No notes yet."}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-semibold">Latest Community Intelligence</h2>

          {latestIntelligence && (
            <div className="text-sm text-white/40">
              Confidence:{" "}
              <span className="text-[var(--athena-orange)]">
                {latestIntelligence.confidence}%
              </span>
            </div>
          )}
        </div>

        {latestIntelligence ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <Field label="Executive Summary" value={latestIntelligence.executive_summary} />
            <Field label="Market Trends" value={latestIntelligence.market_trends} />
            <Field label="Recurring Pain Points" value={latestIntelligence.recurring_pain_points} />
            <Field label="Recurring Objections" value={latestIntelligence.recurring_objections} />
            <Field label="Recurring Questions" value={latestIntelligence.recurring_questions} />
            <Field label="Buyer Stage Distribution" value={latestIntelligence.buyer_stage_distribution} />
            <Field label="High-Value Opportunities" value={latestIntelligence.high_value_opportunities} />
            <Field label="Recommended Campaigns" value={latestIntelligence.recommended_campaigns} />
            <Field label="Recommended Content" value={latestIntelligence.recommended_content} />
            <Field label="Recommended Lead Magnets" value={latestIntelligence.recommended_lead_magnets} />
            <Field label="Recommended Webinars" value={latestIntelligence.recommended_webinars} />
            <Field label="Strategic Recommendations" value={latestIntelligence.strategic_recommendations} />
          </div>
        ) : (
          <div className="mt-8 text-white/50">
            No Community Intelligence has been generated yet.
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "success" | "orange";
}) {
  const color =
    highlight === "success"
      ? "text-[var(--athena-success)]"
      : highlight === "orange"
        ? "text-[var(--athena-orange)]"
        : "text-white";

  return (
    <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-sm text-white/40">{label}</div>
      <div className={`mt-3 text-2xl font-semibold ${color}`}>{value}</div>
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
