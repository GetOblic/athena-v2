import Link from "next/link";
import { AnalyzeDiscussionButton } from "@/components/discussions/AnalyzeDiscussionButton";
import { getCommunityById } from "@/services/communityService";
import { getDiscussionById } from "@/services/discussionService";
import { getLatestDiscussionAnalysis } from "@/services/discussionAnalysisService";

export default async function DiscussionDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const discussion = await getDiscussionById(id);

  if (!discussion) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <Link href="/discussions" className="text-sm text-[var(--athena-orange)]">
          ← Back to Discussions
        </Link>

        <h1 className="mt-8 text-4xl font-semibold">Discussion not found</h1>
      </main>
    );
  }

  const community = discussion.community_id
    ? await getCommunityById(discussion.community_id)
    : null;

  const latestAnalysis = await getLatestDiscussionAnalysis(id);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/discussions" className="text-sm text-[var(--athena-orange)]">
        ← Back to Discussions
      </Link>

      <div className="mt-10 flex flex-colap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Discussion Intelligence
          </div>

          <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
            {discussion.title}
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
            Operational analysis for this captured community discussion.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-4">
        <Metric label="Platform" value={discussion.platform} />
        <Metric label="Status" value={discussion.status} highlight="warning" />
        <Metric label="Priority" value={String(discussion.priority)} />
        <Metric
          label="Opportunity Score"
          value={String(discussion.opportunity_score)}
          highlight="orange"
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <section className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 lg:col-span-2">
          <h2 className="text-xl font-semibold">Discussion Content</h2>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Field label="Author" value={discussion.author} />
            <Field label="Community" value={community?.group_name} />
            <Field label="Original Sentiment" value={discussion.sentiment} />
            <Field label="URL" value={discussion.url} />
          </div>

          <div className="mt-8">
            <div className="text-sm text-white/40">Body</div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/70">
              {discussion.body || "No body captured."}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">Latest Athena Analysis</h2>

            {latestAnalysis && (
              <div className="text-sm text-white/40">
                Status:{" "}
                <span className="text-[var(--athena-orange)]">
                  {latestAnalysis.status}
                </span>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-7">
            {latestAnalysis ? (
              <>
                <Field label="Summary" value={latestAnalysis.summary} />
                <Field label="Sentiment" value={latestAnalysis.sentiment} />
                <Field label="Intent" value={latestAnalysis.intent} />
                <Field label="Buyer Stage" value={latestAnalysis.buyer_stage} />
                <Field label="Pain Points" value={latestAnalysis.pain_points} />
                <Field
                  label="Opportunity Detected"
                  value={latestAnalysis.opportunity_detected ? "Yes" : "No"}
                />
                <Field
                  label="Opportunity Title"
                  value={latestAnalysis.opportunity_title}
                />
                <Field
                  label="Opportunity Reason"
                  value={latestAnalysis.opportunity_reason}
                />
                <Field
                  label="Strategic Recommendation"
                  sublabel="Recommended Action"
                  value={latestAnalysis.recommended_action}
                  helper="Guidance for internal decision-making."
                />
                <Field
                  label="Copy-Paste Output"
                  sublabel="Suggested CTA"
                  value={latestAnalysis.suggested_cta}
                  helper="Ready to copy into external communications."
                />
                <Field label="Risk Level" value={latestAnalysis.risk_level} />
                <Field label="Confidence" value={`${latestAnalysis.confidence}%`} />
              </>
            ) : (
              <div className="text-white/50">
                No generated Athena analysis has been saved for this discussion yet.
              </div>
            )}

            <AnalyzeDiscussionButton discussionId={discussion.id} />
          </div>
        </section>
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
  highlight?: "success" | "warning" | "orange";
}) {
  const color =
    highlight === "success"
      ? "text-[var(--athena-success)]"
      : highlight === "warning"
        ? "text-[var(--athena-warning)]"
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
      <div className="text-sm text-white/40">
        {label}
        {sublabel && (
          <span className="ml-2 text-xs text-white/30">({sublabel})</span>
        )}
      </div>
      {helper && (
        <div className="mt-1 text-xs leading-5 text-white/30">{helper}</div>
      )}
      <div className="mt-2 text-base leading-7 text-white/80">{value || "—"}</div>
    </div>
  );
}
