import Link from "next/link";
import type { TodaysIntelligence } from "@/services/todaysIntelligenceService";

type TodaysIntelligenceProps = {
  summary: TodaysIntelligence;
};

export function TodaysIntelligence({ summary }: TodaysIntelligenceProps) {
  return (
    <div className="mb-10 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Today&apos;s Intelligence
        </div>
        <h2 className="mt-3 text-3xl font-semibold">Your executive snapshot</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
          What needs attention right now across discussions, opportunities,
          briefings, and reusable assets.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryTile
          label="New discussions"
          value={summary.newDiscussions}
          href="/discussions"
          hint="Threads awaiting first analysis"
        />
        <SummaryTile
          label="Immediate action"
          value={summary.immediateActionOpportunities}
          href="/opportunities"
          hint="High-intent opportunities to pursue"
        />
        <SummaryTile
          label="Briefings awaiting approval"
          value={summary.briefingsAwaitingApproval}
          href="/briefings"
          hint="Executive memos needing review"
        />
        <SummaryTile
          label="Reusable assets created"
          value={summary.reusableAssetsCreated}
          href="/briefings"
          hint="Strategic blueprints ready to deploy"
        />
        <HighestOpportunityTile opportunity={summary.highestOpportunity} />
        <ConfidenceTile
          confidence={summary.knowledgeConfidence}
          delta={summary.knowledgeConfidenceDelta}
        />
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number;
  href: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[22px] border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/40 hover:bg-white/[0.03]"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
      <div className="mt-3 text-4xl font-semibold tabular-nums text-[var(--athena-orange)]">
        {value}
      </div>
      <div className="mt-2 text-sm text-white/45 group-hover:text-white/55">
        {hint}
      </div>
    </Link>
  );
}

function HighestOpportunityTile({
  opportunity,
}: {
  opportunity: TodaysIntelligence["highestOpportunity"];
}) {
  if (!opportunity) {
    return (
      <div className="rounded-[22px] border border-white/10 bg-black/20 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
          Highest opportunity
        </div>
        <div className="mt-3 text-sm text-white/45">
          No opportunities detected yet.
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/opportunities/${opportunity.id}`}
      className="group rounded-[22px] border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/40 hover:bg-white/[0.03]"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        Highest opportunity
      </div>
      <div className="mt-3 line-clamp-2 text-lg font-semibold text-white group-hover:text-[var(--athena-orange)]">
        {opportunity.title}
      </div>
      <div className="mt-2 text-sm text-[var(--athena-orange)]">
        Score {opportunity.score}
      </div>
    </Link>
  );
}

function ConfidenceTile({
  confidence,
  delta,
}: {
  confidence: number | null;
  delta: number | null;
}) {
  return (
    <Link
      href="/intelligence-domains"
      className="group rounded-[22px] border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/40 hover:bg-white/[0.03]"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        Knowledge confidence
      </div>
      <div className="mt-3 text-4xl font-semibold tabular-nums text-white group-hover:text-[var(--athena-orange)]">
        {confidence != null ? `${confidence}%` : "Learning"}
      </div>
      <div className="mt-2 text-sm text-white/45 group-hover:text-white/55">
        {delta != null
          ? `${delta >= 0 ? "+" : ""}${delta}% since last intelligence refresh`
          : "Confidence movement will appear as Athena learns."}
      </div>
    </Link>
  );
}
