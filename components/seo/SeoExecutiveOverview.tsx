import { SeoStrengthIndicator } from "@/components/seo/SeoStrengthIndicator";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { SeoExecutiveOverviewModel } from "@/services/seo/seoReportPresentation";
import { formatStarRating } from "@/services/seo/seoReportPresentation";

type SeoExecutiveOverviewProps = {
  model: SeoExecutiveOverviewModel;
};

function InsightCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <p
        className={`mt-2 text-sm leading-6 ${
          accent ? "text-white/90" : "text-white/70"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function SeoExecutiveOverview({ model }: SeoExecutiveOverviewProps) {
  return (
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] px-6 py-6 sm:px-8 sm:py-7`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Executive Overview
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            SEO Intelligence at a glance
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            {model.summary}
          </p>
        </div>
        <div className="rounded-2xl border border-[rgba(255,102,0,0.28)] bg-[rgba(255,102,0,0.08)] px-5 py-4 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Overall SEO Intelligence Score
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums text-[var(--athena-orange)]">
            {model.overallScore.value}
          </div>
          <div className="mt-1 text-sm tracking-[0.12em] text-[var(--athena-orange)]">
            {formatStarRating(model.overallScore.stars)}
          </div>
          <div className="mt-1 text-xs text-white/50">
            {model.overallScore.label}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SeoStrengthIndicator
          label="Commercial Readiness"
          score={model.commercialReadiness}
        />
        <SeoStrengthIndicator
          label="Content Coverage"
          score={model.contentCoverage}
        />
        <SeoStrengthIndicator
          label="Trust & Authority"
          score={model.trustAuthority}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightCell
          label="Biggest Opportunity"
          value={model.biggestOpportunity}
          accent
        />
        <InsightCell label="Biggest Risk" value={model.biggestRisk} />
        <InsightCell label="Fastest Win" value={model.fastestWin} accent />
        <InsightCell
          label="Recommended Next Action"
          value={model.recommendedNextAction}
          accent
        />
      </div>
    </section>
  );
}
