export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { DiscussionAgeBadge } from "@/components/discussions/DiscussionAgeBadge";
import { DiscussionLifecycleBadge } from "@/components/discussions/DiscussionLifecycleBadge";
import { QueueSectionHeader } from "@/components/queues/QueueSectionHeader";
import { getAnalyzedDiscussionIds } from "@/services/discussionAnalysisService";
import { getIntelligenceDomains } from "@/services/intelligenceDomainService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getDiscussionQueues } from "@/services/queueService";

const listGridClass =
  "grid grid-cols-[1.1fr_1.8fr_90px_120px_100px_120px_120px] items-center gap-4";

function formatLastActivity(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DiscussionsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();

  const [queues, domains, analyzedDiscussionIds] = await Promise.all([
    getDiscussionQueues(organizationId),
    getIntelligenceDomains(organizationId),
    getAnalyzedDiscussionIds(organizationId),
  ]);

  const domainById = new Map(domains.map((d) => [d.id, d]));
  const totalCount = queues.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />

      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Operator Inbox
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Athena Inbox
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Prioritized discussion queues with clear workflow state. New threads
          need analysis, In Review threads have fresh updates, and Processed
          means Athena has generated intelligence you can act on.
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">No discussions in queue.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            Capture a discussion from the inbox to start building your
            intelligence pipeline.
          </p>
          <Link
            href="/inbox"
            className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            Open Capture Inbox
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div
            className={`${listGridClass} border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35`}
          >
            <div>Intelligence Domain</div>
            <div>Title</div>
            <div>Score</div>
            <div>Workflow</div>
            <div>Age</div>
            <div>Last Activity</div>
            <div></div>
          </div>

          {queues.map((section) => {
            if (section.items.length === 0) {
              return null;
            }

            return (
              <div key={section.key}>
                <QueueSectionHeader
                  title={section.title}
                  count={section.items.length}
                />

                {section.items.map((discussion) => {
                  const domain = discussion.community_id
                    ? domainById.get(discussion.community_id)
                    : undefined;
                  const hasAnalysis = analyzedDiscussionIds.has(discussion.id);

                  return (
                    <div
                      key={discussion.id}
                      className={`${listGridClass} border-b border-white/5 px-6 py-5 text-sm last:border-b-0`}
                    >
                      <div className="text-white/50">
                        {domain?.group_name ?? "—"}
                      </div>

                      <div className="font-medium text-white">
                        {discussion.title}
                      </div>

                      <div className="text-2xl font-semibold text-[var(--athena-orange)]">
                        {discussion.opportunity_score}
                      </div>

                      <div>
                        <DiscussionLifecycleBadge
                          discussion={discussion}
                          hasAnalysis={hasAnalysis}
                        />
                      </div>

                      <div>
                        <DiscussionAgeBadge discussion={discussion} />
                      </div>

                      <div className="text-white/50">
                        {formatLastActivity(discussion.last_activity)}
                      </div>

                      <Link
                        href={`/discussions/${discussion.id}`}
                        className="inline-flex shrink-0 rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                      >
                        {section.key === "new" ? "Analyze" : "Review"}
                      </Link>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
