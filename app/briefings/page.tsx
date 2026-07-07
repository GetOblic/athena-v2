export const dynamic = "force-dynamic";

import Link from "next/link";
import { getBriefingListSummary } from "@/lib/briefingDisplay";
import { formatBriefingStatus } from "@/lib/briefingStatus";
import { getReviews } from "@/services/reviewService";

const listGridClass =
  "grid grid-cols-[minmax(0,1fr)_140px_140px_160px]";

export default async function BriefingsPage() {
  const briefings = await getReviews();

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Executive Intelligence
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Briefings
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Executive summaries and strategic decision reports generated from
          analyzed opportunities.
        </p>
      </div>

      {briefings.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/10 bg-[var(--athena-card)] p-14 text-center">
          <h2 className="text-2xl font-semibold">
            No briefings generated yet.
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/40">
            Executive briefings will appear here after Athena analyzes
            opportunities.
          </p>

          <Link
            href="/opportunities"
            className="mt-8 inline-block rounded-full bg-[var(--athena-orange)] px-7 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            View Opportunities
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-[var(--athena-border)] bg-[var(--athena-card)]">
          <div
            className={`${listGridClass} border-b border-[var(--athena-border)] px-6 py-4 text-xs uppercase tracking-[0.25em] text-white/35`}
          >
            <div className="pr-4">Summary</div>
            <div>Status</div>
            <div>Confidence</div>
            <div>Action</div>
          </div>

          {briefings.map((briefing) => (
            <div
              key={briefing.id}
              className={`${listGridClass} items-center border-b border-white/5 px-6 py-5 text-sm last:border-b-0`}
            >
              <div className="line-clamp-2 pr-4 font-medium leading-6 text-white">
                {getBriefingListSummary(briefing)}
              </div>

              <div className="text-[var(--athena-warning)]">
                {formatBriefingStatus(briefing.status)}
              </div>

              <div className="font-semibold text-[var(--athena-orange)]">
                {briefing.confidence}%
              </div>

              <div>
                <Link
                  href={`/briefings/${briefing.id}`}
                  className="inline-flex rounded-full bg-[var(--athena-orange)] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
                >
                  Open Briefing
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
