import type { ReactNode } from "react";
import { Brain, ScanSearch } from "lucide-react";
import {
  PROSPECT_DETAIL_ANCHORS,
  PROSPECT_DETAIL_ICON,
  PROSPECT_SNAPSHOT_SURFACE,
} from "@/lib/prospects/prospectDetailPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import { normalizeAnalysisForDisplay } from "@/services/executiveVersions/analysisNormalization";
import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";

type ProspectExecutiveSnapshotProps = {
  analysis: DiscussionAnalysis;
  convert: TenantMessages["prospects"]["convert"];
  executive: TenantMessages["prospects"]["executive"];
};

function hasText(value?: string | null): value is string {
  return Boolean(value && value.trim());
}

function isUsefulSentiment(analysis: DiscussionAnalysis, value: string): boolean {
  const raw =
    typeof analysis.sentiment === "string" ? analysis.sentiment.trim() : "";
  if (!raw) return false;
  if (value === "neutral" && raw.toLowerCase() === "neutral") {
    return true;
  }
  return value !== "neutral" || raw.toLowerCase() !== "neutral"
    ? ["positive", "negative", "mixed", "neutral"].includes(value)
    : false;
}

export function ProspectExecutiveSnapshot({
  analysis,
  convert,
  executive,
}: ProspectExecutiveSnapshotProps) {
  const display = normalizeAnalysisForDisplay(analysis);
  const sentiment = display.sentiment?.trim().toLowerCase() ?? "";
  const showSentiment = isUsefulSentiment(analysis, sentiment);
  const showOpportunityTitle = hasText(display.opportunity_title);
  const showWhy = hasText(display.opportunity_reason);
  const showConfidence =
    typeof display.confidence === "number" && display.confidence > 0;

  const hasBody =
    hasText(display.summary) ||
    hasText(display.pain_points) ||
    showWhy ||
    showOpportunityTitle ||
    showSentiment ||
    showConfidence;

  if (!hasBody) return null;

  return (
    <section
      id={PROSPECT_DETAIL_ANCHORS.snapshot}
      data-prospect-detail="executive-snapshot"
      className={`rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${PROSPECT_SNAPSHOT_SURFACE}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${PROSPECT_DETAIL_ICON.violet}`}
          aria-hidden="true"
        >
          <Brain className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200/80">
            {convert.executiveSnapshot}
          </div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {executive.whatMatters}
          </h2>
        </div>
      </div>

      {(showOpportunityTitle || showSentiment || showConfidence) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {showOpportunityTitle ? (
            <span className="inline-flex max-w-full items-center rounded-full border border-[rgba(196,146,92,0.34)] bg-[rgba(196,146,92,0.10)] px-3 py-1.5 text-sm text-amber-100">
              {display.opportunity_title.trim()}
            </span>
          ) : null}
          {showSentiment ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm capitalize text-white/70">
              {executive.sentiment}: {sentiment}
            </span>
          ) : null}
          {showConfidence ? (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/55">
              {executive.confidence} {display.confidence}%
            </span>
          ) : null}
        </div>
      )}

      <div className="mt-8 space-y-6">
        <SnapshotBlock
          icon={<ScanSearch className="size-3.5" />}
          label={executive.executiveInsight}
          value={display.summary}
          prominent
        />
        <SnapshotBlock
          icon={<Brain className="size-3.5" />}
          label={executive.primaryBuyerConcern}
          value={display.pain_points}
        />
        {showWhy ? (
          <SnapshotBlock
            label={executive.whyMatters}
            value={display.opportunity_reason}
          />
        ) : null}
      </div>
    </section>
  );
}

function SnapshotBlock({
  label,
  value,
  prominent,
  icon,
}: {
  label: string;
  value?: string | null;
  prominent?: boolean;
  icon?: ReactNode;
}) {
  if (!hasText(value)) return null;
  return (
    <div>
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55">
            {icon}
          </span>
        ) : null}
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {label}
        </div>
      </div>
      <p
        className={`mt-2 leading-7 ${
          prominent ? "text-lg text-white/90" : "text-base text-white/75"
        }`}
      >
        {value.trim()}
      </p>
    </div>
  );
}
