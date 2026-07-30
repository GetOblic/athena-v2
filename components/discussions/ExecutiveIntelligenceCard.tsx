import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import { buildWhyAthenaBullets } from "@/lib/discussionExecutiveIntel";
import {
  formatConfidenceLabel,
  formatConfidencePercent,
} from "@/lib/confidenceDisplay";
import { WhyAthenaMatters } from "@/components/discussions/WhyAthenaMatters";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";

type ExecutiveIntelligenceCardProps = {
  analysis: DiscussionAnalysis;
  /** Isolated source wording. Defaults to discussion labels. */
  sourceKind?: "discussion" | "prospect" | "persona";
};

export function ExecutiveIntelligenceCard({
  analysis,
  sourceKind = "discussion",
}: ExecutiveIntelligenceCardProps) {
  const display = normalizeAnalysisForDisplay(analysis);
  const confidence = Math.max(0, Math.min(100, display.confidence ?? 0));
  const confidenceLabel = formatConfidenceLabel(confidence);
  const whyBullets = buildWhyAthenaBullets({
    ...analysis,
    ...display,
  });
  const isProspect = sourceKind === "prospect";
  const isPersona = sourceKind === "persona";
  const assessmentLabel = isProspect
    ? "Prospect Assessment"
    : isPersona
      ? "Persona Assessment"
      : "Executive Insight";
  const concernLabel = isProspect
    ? "Primary Business Concern"
    : isPersona
      ? "Primary Persona Concern"
      : "Primary Buyer Concern";
  const strategyLabel = isProspect
    ? "Outreach Strategy"
    : isPersona
      ? "Engagement Strategy"
      : "Recommended Strategy";

  return (
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8 lg:p-10`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Executive Intelligence
      </div>

      <h2 className="mt-3 text-2xl font-semibold tracking-tight">
        What matters in 30 seconds
      </h2>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-7">
          <IntelBlock
            label={assessmentLabel}
            value={display.summary}
            prominent
          />
          <IntelBlock label={concernLabel} value={display.pain_points} />
          <IntelBlock
            label={strategyLabel}
            value={display.recommended_action}
          />
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Confidence
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <span className="text-4xl font-semibold tabular-nums text-[var(--athena-orange)]">
                {formatConfidencePercent(confidence)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white/70">
                {confidenceLabel}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[var(--athena-orange)] transition-all"
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>

          <StatPill label="Buyer Stage" value={display.buyer_stage} />
          <StatPill label="Intent" value={display.intent} />
          <StatPill label="Risk" value={display.risk_level} />
        </div>
      </div>

      <div className="mt-8">
        <WhyAthenaMatters bullets={whyBullets} />
      </div>
    </section>
  );
}

function IntelBlock({
  label,
  value,
  prominent,
}: {
  label: string;
  value?: string | null;
  prominent?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <p
        className={`mt-2 leading-7 ${
          prominent
            ? "text-lg text-white/90"
            : "text-base text-white/75"
        }`}
      >
        {value?.trim() || "—"}
      </p>
    </div>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
      <span className="text-sm text-white/45">{label}</span>
      <span className="text-sm font-medium capitalize text-white/85">
        {value?.trim() || "—"}
      </span>
    </div>
  );
}
