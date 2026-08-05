import type { SeoPillarScore } from "@/services/seo/seoReportPresentation";
import { formatStarRating } from "@/services/seo/seoReportPresentation";

type SeoStrengthIndicatorProps = {
  label: string;
  score: SeoPillarScore;
  compact?: boolean;
};

export function SeoStrengthIndicator({
  label,
  score,
  compact = false,
}: SeoStrengthIndicatorProps) {
  return (
    <div
      className={
        compact
          ? "space-y-2"
          : "rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
          {label}
        </div>
        <div className="text-xs text-white/55">{score.label}</div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span
          className="text-sm tracking-[0.12em] text-[var(--athena-orange)]"
          aria-label={`${score.stars} of 5 stars`}
        >
          {formatStarRating(score.stars)}
        </span>
        <span className="text-sm font-semibold tabular-nums text-white/80">
          {score.value}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--athena-orange)] transition-all"
          style={{ width: `${score.value}%` }}
        />
      </div>
    </div>
  );
}
