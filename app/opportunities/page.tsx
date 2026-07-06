import Link from "next/link";
import { getOpportunities } from "@/services/opportunityService";

export default async function OpportunitiesPage() {
  const opportunities = await getOpportunities();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Opportunity Engine
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Opportunities
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Actionable business opportunities generated from monitored
          discussions and community intelligence.
        </p>
      </div>

      <div className="rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
        <div className="grid grid-cols-7 border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35">
          <div>Type</div>
          <div className="col-span-2">Opportunity</div>
          <div>Status</div>
          <div>Score</div>
          <div>Urgency</div>
          <div>Assigned</div>
        </div>

        {opportunities.length === 0 ? (
          <div className="p-10 text-center text-white/40">
            No opportunities found.
          </div>
        ) : (
          opportunities.map((opportunity) => (
            <div
              key={opportunity.id}
              className="grid grid-cols-7 border-b border-white/5 px-6 py-5 text-sm last:border-b-0"
            >
              <div className="text-white/70">{opportunity.type}</div>

              <Link
                href={`/opportunities/${opportunity.id}`}
                className="col-span-2 font-medium text-white transition hover:text-[var(--athena-orange)]"
              >
                {opportunity.title}
              </Link>

              <div className="text-[var(--athena-warning)]">
                {opportunity.status}
              </div>

              <div className="font-semibold text-[var(--athena-orange)]">
                {opportunity.score}
              </div>

              <div>{opportunity.urgency || "—"}</div>

              <div className="text-white/50">
                {opportunity.assigned_to || "—"}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
