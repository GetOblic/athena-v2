export const dynamic = "force-dynamic";

import Link from "next/link";
import { OpportunityStatusBadge } from "@/components/queues/OpportunityStatusBadge";
import { QueueSectionHeader } from "@/components/queues/QueueSectionHeader";
import { getOpportunityQueues } from "@/services/queueService";

const listGridClass =
  "grid grid-cols-[120px_minmax(0,1fr)_160px_100px_120px_120px] items-center gap-4";

export default async function OpportunitiesPage() {
  const queues = await getOpportunityQueues();
  const totalCount = queues.reduce(
    (count, section) => count + section.items.length,
    0,
  );

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Sales Queue
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Opportunities
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Sales pipeline grouped by pursuit stage — sorted by score, urgency,
          and briefing confidence.
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">No opportunities in queue.</h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            Opportunities appear after Athena analyzes discussions with detected
            business potential.
          </p>
          <Link
            href="/discussions"
            className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            View Discussion Inbox
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div
            className={`${listGridClass} border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35`}
          >
            <div>Type</div>
            <div>Opportunity</div>
            <div>Status</div>
            <div>Score</div>
            <div>Urgency</div>
            <div>Assigned</div>
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

                {section.items.map((opportunity) => (
                  <div
                    key={opportunity.id}
                    className={`${listGridClass} border-b border-white/5 px-6 py-5 text-sm last:border-b-0`}
                  >
                    <div className="text-white/70">{opportunity.type}</div>

                    <Link
                      href={`/opportunities/${opportunity.id}`}
                      className="font-medium text-white transition hover:text-[var(--athena-orange)]"
                    >
                      {opportunity.title}
                    </Link>

                    <div>
                      <OpportunityStatusBadge status={opportunity.status} />
                    </div>

                    <div className="font-semibold text-[var(--athena-orange)]">
                      {opportunity.score}
                    </div>

                    <div className="text-white/70">
                      {opportunity.urgency || "—"}
                    </div>

                    <div className="text-white/50">
                      {opportunity.assigned_to || "—"}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
