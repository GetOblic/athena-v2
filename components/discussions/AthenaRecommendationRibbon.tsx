import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";
import {
  getAthenaVerdict,
  getResponseTiming,
  type AthenaVerdict,
} from "@/lib/discussionExecutiveIntel";
import type { DiscussionExecutiveChrome } from "@/lib/discussionExecutiveChrome";

type AthenaRecommendationRibbonProps = {
  analysis: DiscussionAnalysis;
  recommendationLabel?: string;
  timingLabel?: string;
  verdictLabel?: string;
  timingValue?: string;
  chrome?: DiscussionExecutiveChrome | null;
};

const verdictStyles: Record<
  AthenaVerdict,
  { border: string; bg: string; text: string }
> = {
  "Worth pursuing": {
    border: "border-[var(--athena-success)]/30",
    bg: "bg-[var(--athena-success)]/10",
    text: "text-[var(--athena-success)]",
  },
  Monitor: {
    border: "border-[var(--athena-warning)]/30",
    bg: "bg-[var(--athena-warning)]/10",
    text: "text-[var(--athena-warning)]",
  },
  "Low priority": {
    border: "border-white/15",
    bg: "bg-white/[0.03]",
    text: "text-white/55",
  },
};

export function AthenaRecommendationRibbon({
  analysis,
  recommendationLabel = "Athena Recommendation",
  timingLabel = "Recommended response timing",
  verdictLabel,
  timingValue,
  chrome = null,
}: AthenaRecommendationRibbonProps) {
  const verdict = getAthenaVerdict(analysis);
  const timing = getResponseTiming(analysis);
  const styles = verdictStyles[verdict];
  const presentedVerdict =
    verdictLabel ??
    (chrome
      ? verdict === "Worth pursuing"
        ? chrome.verdictWorthPursuing
        : verdict === "Monitor"
          ? chrome.verdictMonitor
          : chrome.verdictLowPriority
      : verdict);
  const presentedTiming =
    timingValue ??
    (chrome
      ? timing === "Respond within 12 hours"
        ? chrome.timingWithin12Hours
        : timing === "Respond today"
          ? chrome.timingRespondToday
          : chrome.timingMonitor
      : timing);

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border px-6 py-5 sm:flex-row sm:items-center sm:justify-between ${styles.border} ${styles.bg}`}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
          {recommendationLabel}
        </div>
        <div className={`mt-2 text-xl font-semibold ${styles.text}`}>
          {presentedVerdict}
        </div>
      </div>

      <div className="sm:text-right">
        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
          {timingLabel}
        </div>
        <div className="mt-1 text-sm font-medium text-white/75">
          {presentedTiming}
        </div>
      </div>
    </div>
  );
}
