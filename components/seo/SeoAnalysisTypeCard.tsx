import Link from "next/link";
import { Gauge, Telescope } from "lucide-react";
import { SeoScoreCard } from "@/components/seo/SeoScoreCard";
import {
  SEO_OPEN_ANALYSIS_CLASS,
  SEO_TYPE_CARD_ICON,
  SEO_TYPE_CARD_SURFACE,
} from "@/components/seo/seoPagePresentation";
import type { VisibilityTypeCardState } from "@/lib/seo/visibilityTypeCards";
import { scoreSourceForTypeCard } from "@/lib/seo/visibilityTypeCards";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getLocalizedSeoReportStatusLabel } from "@/lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

type SeoAnalysisTypeCardProps = {
  generationType: SeoGenerationType;
  state: VisibilityTypeCardState;
  score: number | null;
  insight?: string | null;
  analyzedPageCount?: number | null;
  messages: TenantMessages;
  language: OrganizationLanguage;
};

export function SeoAnalysisTypeCard({
  generationType,
  state,
  score,
  insight,
  analyzedPageCount,
  messages,
  language,
}: SeoAnalysisTypeCardProps) {
  const copy = messages.seo.visibility;
  const isTechnical = generationType === "technical";
  const family = isTechnical ? "technical" : "strategy";
  const title = isTechnical
    ? messages.seo.lenses.technical
    : messages.seo.lenses.intelligence;
  const description = isTechnical ? copy.healthCardHelp : copy.strategyCardHelp;
  const scoreLabel = isTechnical
    ? copy.technicalCompleteness
    : copy.contentCoverageScore;
  const scoreHelp = isTechnical
    ? copy.technicalCompletenessHelp
    : copy.contentCoverageScoreHelp;
  const latest = state.latest;
  const lastReady = state.lastReady;
  const source = scoreSourceForTypeCard(state);
  const displayDate = formatTenantDate(
    latest?.createdAt ?? lastReady?.createdAt ?? "",
    language,
  );
  const statusLabel = latest
    ? getLocalizedSeoReportStatusLabel(messages, latest.status)
    : copy.noAnalysisYet;
  const scoreNote =
    source === "previousReady"
      ? copy.previousReadyScoreNote
      : source === "lastReady"
        ? copy.lastReadyScoreNote
        : undefined;
  const pagesContext =
    isTechnical && analyzedPageCount != null
      ? interpolateTenantMessage(
          copy.pagesAnalyzedContext.includes("{count}")
            ? copy.pagesAnalyzedContext
            : "{count}",
          { count: analyzedPageCount },
        )
      : null;
  const openHref = latest ? `/seo/${latest.id}` : null;

  return (
    <section className={SEO_TYPE_CARD_SURFACE[family]}>
      <div className="flex items-start gap-4">
        <div className={SEO_TYPE_CARD_ICON[family]} aria-hidden="true">
          {isTechnical ? <Gauge size={20} /> : <Telescope size={20} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/55">{description}</p>
        </div>
      </div>

      <div className="mt-6">
        <SeoScoreCard
          family={family}
          score={score}
          label={scoreLabel}
          help={scoreHelp}
          unavailableLabel={copy.scoreUnavailable}
          unavailableHelp={copy.scoreUnavailableHelp}
          context={scoreNote}
          messages={copy}
        />
      </div>

      <div className="mt-5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-white/70">{statusLabel}</span>
        {displayDate ? (
          <span className="text-white/45">{displayDate}</span>
        ) : null}
        {pagesContext ? (
          <span className="text-white/45">{pagesContext}</span>
        ) : null}
      </div>

      {insight ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/55">
          {insight}
        </p>
      ) : null}

      {openHref ? (
        <div className="mt-6">
          <Link href={openHref} className={SEO_OPEN_ANALYSIS_CLASS}>
            {copy.openAnalysis}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
