export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { OpportunityStatusBadge } from "@/components/queues/OpportunityStatusBadge";
import { QueueSectionHeader } from "@/components/queues/QueueSectionHeader";
import { AthenaIntelligenceListRow } from "@/components/ui/AthenaIntelligenceListRow";
import { getOpportunityWorkQueues } from "@/services/queueService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

const listGridClass =
  "grid grid-cols-[minmax(0,1fr)_160px_100px_120px_120px] items-center gap-4";

export default async function OpportunitiesPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const queues = await getOpportunityWorkQueues(organizationId);
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
          Sales Queue
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Opportunities
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Action-oriented work queues — pursue immediate opportunities first,
          then high intent, monitor, and low priority threads.
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
            <div>Opportunity</div>
            <div>Sales Status</div>
            <div>Score</div>
            <div>Urgency</div>
            <div>Action</div>
          </div>

          {queues.map((section) => {
            if (section.items.length === 0) {
              return null;
            }

            return (
              <div key={section.key}>
                <div className="px-6 pt-8 first:pt-4">
                  <QueueSectionHeader
                    title={section.title}
                    count={section.items.length}
                  />
                  <p className="mt-1 pb-3 text-sm text-white/40">
                    {section.description}
                  </p>
                </div>

                {section.items.map((opportunity) => (
                  <AthenaIntelligenceListRow
                    key={opportunity.id}
                    href={`/opportunities/${opportunity.id}`}
                    ariaLabel={`Open opportunity ${opportunity.title}`}
                    className={`${listGridClass} px-6 py-5 text-sm transition hover:bg-white/[0.03]`}
                  >
                    <div className="font-medium text-white">
                      {opportunity.title}
                    </div>

                    <div>
                      <OpportunityStatusBadge status={opportunity.status} />
                    </div>

                    <div className="font-semibold text-[var(--athena-orange)]">
                      {opportunity.score}
                    </div>

                    <div className="text-white/70">
                      {opportunity.urgency || "—"}
                    </div>

                    <div>
                      <Link
                        href={`/opportunities/${opportunity.id}`}
                        className="inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                      >
                        Open
                      </Link>
                    </div>
                  </AthenaIntelligenceListRow>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
