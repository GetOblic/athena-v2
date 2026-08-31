import Link from "next/link";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { TodaysIntelligence } from "@/services/todaysIntelligenceService";

type TodaysIntelligenceProps = {
  summary: TodaysIntelligence;
  messages: TenantMessages["dashboard"];
};

export function TodaysIntelligence({
  summary,
  messages,
}: TodaysIntelligenceProps) {
  return (
    <div className="mb-10 rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          {messages.todaysEyebrow}
        </div>
        <h2 className="mt-3 text-3xl font-semibold">{messages.todaysTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
          {messages.todaysSubtitle}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryTile
          label={messages.newDiscussions}
          value={summary.newDiscussions}
          href="/discussions"
          hint={messages.newDiscussionsHint}
        />
        <SummaryTile
          label={messages.immediateAction}
          value={summary.immediateActionOpportunities}
          href="/opportunities"
          hint={messages.immediateActionHint}
        />
        <SummaryTile
          label={messages.briefingsAwaiting}
          value={summary.briefingsAwaitingApproval}
          href="/briefings"
          hint={messages.briefingsAwaitingHint}
        />
        <SummaryTile
          label={messages.strategicBlueprints}
          value={summary.strategicBlueprints}
          href="/briefings"
          hint={messages.strategicBlueprintsHint}
        />
        <HighestOpportunityTile
          opportunity={summary.highestOpportunity}
          messages={messages}
        />
        <ConfidenceTile
          confidence={summary.knowledgeConfidence}
          delta={summary.knowledgeConfidenceDelta}
          messages={messages}
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
  messages,
}: {
  opportunity: TodaysIntelligence["highestOpportunity"];
  messages: TenantMessages["dashboard"];
}) {
  if (!opportunity) {
    return (
      <div className="rounded-[22px] border border-white/10 bg-black/20 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-white/40">
          {messages.highestOpportunity}
        </div>
        <div className="mt-3 text-sm text-white/45">
          {messages.noOpportunities}
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
        {messages.highestOpportunity}
      </div>
      <div className="mt-3 line-clamp-2 text-lg font-semibold text-white group-hover:text-[var(--athena-orange)]">
        {opportunity.title}
      </div>
      <div className="mt-2 text-sm text-[var(--athena-orange)]">
        {interpolateTenantMessage(messages.scoreLabel, {
          score: opportunity.score,
        })}
      </div>
    </Link>
  );
}

function ConfidenceTile({
  confidence,
  delta,
  messages,
}: {
  confidence: number | null;
  delta: number | null;
  messages: TenantMessages["dashboard"];
}) {
  const signedDelta =
    delta == null ? null : `${delta >= 0 ? "+" : ""}${delta}`;

  return (
    <Link
      href="/intelligence-domains"
      className="group rounded-[22px] border border-white/10 bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-[var(--athena-orange)]/40 hover:bg-white/[0.03]"
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        {messages.knowledgeConfidence}
      </div>
      <div className="mt-3 text-4xl font-semibold tabular-nums text-white group-hover:text-[var(--athena-orange)]">
        {confidence != null ? `${confidence}%` : messages.learning}
      </div>
      <div className="mt-2 text-sm text-white/45 group-hover:text-white/55">
        {signedDelta != null
          ? interpolateTenantMessage(messages.confidenceDelta, {
              delta: signedDelta,
            })
          : messages.confidenceDeltaEmpty}
      </div>
    </Link>
  );
}
