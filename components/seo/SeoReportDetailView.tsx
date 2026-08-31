"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SeoExecutiveOverview } from "@/components/seo/SeoExecutiveOverview";
import { SeoRecommendationCard } from "@/components/seo/SeoRecommendationCard";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { SeoReportSection } from "@/components/seo/SeoReportSection";
import { SeoReportStatusPanel } from "@/components/seo/SeoReportStatusPanel";
import { SeoStrengthIndicator } from "@/components/seo/SeoStrengthIndicator";
import { SeoWebsitePagesAnalyzedSection } from "@/components/seo/SeoWebsitePagesAnalyzedSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  getLocalizedSeoEffortLabel,
  getLocalizedSeoGenerationTypeLabel,
  getLocalizedSeoReportStatusLabel,
  getSeoConfirmDeleteChrome,
  getSeoExecutiveOverviewChrome,
  getSeoRecommendationCardChrome,
  getSeoReportSectionChrome,
  getSeoWebsitePagesChrome,
  localizeSeoExecutiveOverview,
  localizeSeoPriorityVisual,
} from "@/lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
  buildSeoExecutiveOverview,
  createEvidenceDeduper,
  groupCommercialOpportunities,
  groupIntentGaps,
  groupRoadmapItems,
  sectionReadingCorpus,
} from "@/services/seo/seoReportPresentation";
import { SeoGenerationTypeBadge } from "@/components/seo/SeoGenerationTypeBadge";
import { SeoTechnicalReportDetailView } from "@/components/seo/SeoTechnicalReportDetailView";
import type { PublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import { isSeoTechnicalPackage } from "@/services/seo/seoReportTypes";

type SeoReportDetailViewProps = {
  report: PublicSeoReportDetail;
  messages?: TenantMessages;
};

function joinLines(values: string[]): string {
  return values.join("\n");
}

function buildPresentation(
  pkg: Extract<
    NonNullable<PublicSeoReportDetail["package"]>,
    { executiveAssessment: unknown }
  >,
) {
  const overview = buildSeoExecutiveOverview(pkg);
  const takeEvidence = createEvidenceDeduper();
  // Dedup in render order so earlier sections keep primary citations.
  const contentEvidence = takeEvidence(pkg.contentCoverage.athenaEvidence);
  const intentEvidence = takeEvidence(pkg.customerIntent.athenaEvidence);
  const intentGaps = groupIntentGaps(pkg.customerIntent.missingIntents);
  const opportunities = groupCommercialOpportunities(
    pkg.commercialOpportunities.opportunities,
  ).map((opportunity) => ({
    ...opportunity,
    athenaEvidence: takeEvidence(opportunity.athenaEvidence),
  }));
  const trustEvidence = takeEvidence(pkg.trustAndAuthority.athenaEvidence);
  const roadmapItems = groupRoadmapItems(pkg.ninetyDayRoadmap.items).map(
    (item) => ({
      ...item,
      athenaEvidence: takeEvidence(item.athenaEvidence),
    }),
  );

  return {
    overview,
    opportunities,
    intentGaps,
    roadmapItems,
    contentEvidence,
    intentEvidence,
    trustEvidence,
  };
}

export function SeoReportDetailView({
  report,
  messages,
}: SeoReportDetailViewProps) {
  if (
    report.generationType === "technical" ||
    isSeoTechnicalPackage(report.package)
  ) {
    return (
      <SeoTechnicalReportDetailView report={report} messages={messages} />
    );
  }
  return <SeoIntelligenceReportDetailView report={report} messages={messages} />;
}

function SeoIntelligenceReportDetailView({
  report,
  messages,
}: SeoReportDetailViewProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.seo;
  const sectionChrome = getSeoReportSectionChrome(dictionary);
  const cardChrome = getSeoRecommendationCardChrome(dictionary);
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg =
    report.package && !isSeoTechnicalPackage(report.package)
      ? report.package
      : null;
  const presentation = pkg ? buildPresentation(pkg) : null;
  const overview = presentation
    ? localizeSeoExecutiveOverview(dictionary, presentation.overview)
    : null;

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/seo/${report.id}/regenerate`, {
        method: "POST",
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        report?: { id?: string };
        error?: { message?: string };
      }>(response);
      if (!payload.ok || !payload.report?.id) {
        setError(payload.error?.message || copy.detail.regenerateFailed);
        return;
      }
      router.push(`/seo/${payload.report.id}`);
      router.refresh();
    } catch {
      setError(copy.detail.regenerateFailed);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/seo" className="text-sm text-[var(--athena-orange)]">
        {copy.backToSeo}
      </Link>

      <div className="mb-8 mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              {copy.detail.eyebrow}
            </div>
            <SeoGenerationTypeBadge
              generationType="intelligence"
              label={getLocalizedSeoGenerationTypeLabel(
                dictionary,
                "intelligence",
              )}
            />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            {report.name}
          </h1>
          <p className="mt-3 text-sm text-white/50">
            {copy.detail.statusLabel}:{" "}
            {getLocalizedSeoReportStatusLabel(dictionary, report.status)}
            {report.summary ? ` · ${report.summary}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {(report.status === "Ready" ||
            report.status === "Processing Failed") && (
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 disabled:opacity-60"
            >
              {regenerating ? copy.detail.starting : copy.detail.regenerate}
            </button>
          )}
          <SeoReportHeaderDeleteButton
            reportId={report.id}
            confirmMessage={copy.delete.confirm}
            errorFallback={copy.delete.failed}
            chrome={getSeoConfirmDeleteChrome(dictionary)}
          />
        </div>
      </div>

      {error ? (
        <p className="mb-6 text-sm text-rose-200">{error}</p>
      ) : null}

      <SeoReportStatusPanel
        reportId={report.id}
        initialStatus={report.status}
        initialStage={report.generationStage}
        initialErrorMessage={report.errorMessage}
        messages={dictionary}
      />

      {pkg && presentation && overview ? (
        <div className="space-y-6">
          <SeoExecutiveOverview
            model={overview}
            chrome={getSeoExecutiveOverviewChrome(dictionary)}
          />

          <SeoReportSection
            title={copy.detail.executiveAssessment}
            eyebrow="1"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.executiveAssessment.summary}
            stars={overview.overallScore.stars}
            readingCorpus={sectionReadingCorpus([
              pkg.executiveAssessment.overallAssessment,
              pkg.executiveAssessment.summary,
              pkg.executiveAssessment.seoReadiness,
              pkg.executiveAssessment.businessVisibilityAssessment,
              ...pkg.executiveAssessment.strengths,
              ...pkg.executiveAssessment.weaknesses,
            ])}
            fields={[
              {
                label: copy.detail.overallAssessment,
                value: pkg.executiveAssessment.overallAssessment,
              },
              {
                label: copy.detail.strengths,
                value: joinLines(pkg.executiveAssessment.strengths),
              },
              {
                label: copy.detail.weaknesses,
                value: joinLines(pkg.executiveAssessment.weaknesses),
              },
              {
                label: copy.detail.seoReadiness,
                value: pkg.executiveAssessment.seoReadiness,
              },
              {
                label: copy.detail.businessVisibility,
                value: pkg.executiveAssessment.businessVisibilityAssessment,
              },
            ]}
          />

          <SeoReportSection
            title={copy.detail.contentCoverageAnalysis}
            eyebrow="2"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.contentCoverage.analysis}
            stars={overview.contentCoverage.stars}
            readingCorpus={sectionReadingCorpus([
              pkg.contentCoverage.analysis,
              ...pkg.contentCoverage.wellCoveredServices,
              ...pkg.contentCoverage.weaklyCoveredServices,
              ...pkg.contentCoverage.missingServices,
              ...pkg.contentCoverage.missingCustomerQuestions,
              ...pkg.contentCoverage.missingTrustContent,
              ...pkg.contentCoverage.missingEducationalContent,
              ...pkg.contentCoverage.missingConversionContent,
              ...presentation.contentEvidence,
            ])}
          >
            <SeoStrengthIndicator
              label={copy.detail.coverageStrength}
              score={overview.contentCoverage}
              compact
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <NarrativeBlock
                label={copy.detail.wellCovered}
                value={joinLines(pkg.contentCoverage.wellCoveredServices)}
              />
              <NarrativeBlock
                label={copy.detail.weaklyCovered}
                value={joinLines(pkg.contentCoverage.weaklyCoveredServices)}
              />
              <NarrativeBlock
                label={copy.detail.missingServices}
                value={joinLines(pkg.contentCoverage.missingServices)}
              />
              <NarrativeBlock
                label={copy.detail.missingCustomerQuestions}
                value={joinLines(pkg.contentCoverage.missingCustomerQuestions)}
              />
              <NarrativeBlock
                label={copy.detail.missingTrustContent}
                value={joinLines(pkg.contentCoverage.missingTrustContent)}
              />
              <NarrativeBlock
                label={copy.detail.missingEducationalContent}
                value={joinLines(
                  pkg.contentCoverage.missingEducationalContent,
                )}
              />
              <NarrativeBlock
                label={copy.detail.missingConversionContent}
                value={joinLines(pkg.contentCoverage.missingConversionContent)}
              />
            </div>
            <NarrativeBlock
              label={copy.detail.analysis}
              value={pkg.contentCoverage.analysis}
            />
            {presentation.contentEvidence.length > 0 ? (
              <NarrativeBlock
                label={copy.detail.athenaEvidence}
                value={joinLines(presentation.contentEvidence)}
              />
            ) : null}
          </SeoReportSection>

          <SeoReportSection
            title={copy.detail.customerIntentAnalysis}
            eyebrow="3"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.customerIntent.buyerIntentSummary}
            stars={overview.commercialReadiness.stars}
            readingCorpus={sectionReadingCorpus([
              pkg.customerIntent.buyerIntentSummary,
              ...pkg.customerIntent.representedIntents,
              ...pkg.customerIntent.painPointGaps,
              ...presentation.intentGaps.flatMap((gap) => [
                gap.intent,
                gap.websiteGap,
                gap.recommendation,
              ]),
              ...presentation.intentEvidence,
            ])}
          >
            <NarrativeBlock
              label={copy.detail.buyerIntentSummary}
              value={pkg.customerIntent.buyerIntentSummary}
            />
            <NarrativeBlock
              label={copy.detail.representedIntents}
              value={joinLines(pkg.customerIntent.representedIntents)}
            />
            <NarrativeBlock
              label={copy.detail.painPointGaps}
              value={joinLines(pkg.customerIntent.painPointGaps)}
            />
            <div className="space-y-4">
              {presentation.intentGaps.map((gap) => (
                <SeoRecommendationCard
                  key={`${gap.intent}-${gap.source}`}
                  title={gap.recommendation}
                  why={`${gap.intent} — ${gap.websiteGap}`}
                  meta={interpolateTenantMessage(
                    copy.detail.sourceMeta.includes("{source}")
                      ? copy.detail.sourceMeta
                      : en.seo.detail.sourceMeta,
                    { source: gap.source },
                  )}
                  evidence={[]}
                  futureActionKinds={gap.futureActionKinds}
                  chrome={cardChrome}
                />
              ))}
            </div>
            {presentation.intentEvidence.length > 0 ? (
              <NarrativeBlock
                label={copy.detail.athenaEvidence}
                value={joinLines(presentation.intentEvidence)}
              />
            ) : null}
          </SeoReportSection>

          <SeoReportSection
            title={copy.detail.commercialOpportunityAnalysis}
            eyebrow="4"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.commercialOpportunities.summary}
            stars={overview.commercialReadiness.stars}
            readingCorpus={sectionReadingCorpus([
              pkg.commercialOpportunities.summary,
              ...presentation.opportunities.flatMap((opportunity) => [
                opportunity.title,
                opportunity.rationale,
                opportunity.expectedImpact,
                ...opportunity.athenaEvidence,
              ]),
            ])}
          >
            <SeoStrengthIndicator
              label={copy.detail.opportunityStrength}
              score={overview.commercialReadiness}
              compact
            />
            <NarrativeBlock
              label={copy.detail.summary}
              value={pkg.commercialOpportunities.summary}
            />
            <div className="space-y-4">
              {presentation.opportunities.map((opportunity) => (
                <SeoRecommendationCard
                  key={`${opportunity.contentType}-${opportunity.title}`}
                  title={opportunity.title}
                  why={opportunity.rationale}
                  impact={opportunity.expectedImpact}
                  meta={opportunity.contentType}
                  evidence={opportunity.athenaEvidence}
                  futureActionKinds={opportunity.futureActionKinds}
                  chrome={cardChrome}
                />
              ))}
            </div>
          </SeoReportSection>

          <SeoReportSection
            title={copy.detail.trustAuthorityAnalysis}
            eyebrow="5"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.trustAndAuthority.authorityMessaging}
            stars={overview.trustAuthority.stars}
            readingCorpus={sectionReadingCorpus([
              pkg.trustAndAuthority.trustSignals,
              pkg.trustAndAuthority.testimonials,
              pkg.trustAndAuthority.caseStudies,
              pkg.trustAndAuthority.expertPositioning,
              pkg.trustAndAuthority.authorityMessaging,
              pkg.trustAndAuthority.differentiation,
              pkg.trustAndAuthority.callsToAction,
              pkg.trustAndAuthority.consistency,
              ...pkg.trustAndAuthority.recommendations,
              ...presentation.trustEvidence,
            ])}
          >
            <SeoStrengthIndicator
              label={copy.detail.authorityStrength}
              score={overview.trustAuthority}
              compact
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <NarrativeBlock
                label={copy.detail.trustSignals}
                value={pkg.trustAndAuthority.trustSignals}
              />
              <NarrativeBlock
                label={copy.detail.testimonials}
                value={pkg.trustAndAuthority.testimonials}
              />
              <NarrativeBlock
                label={copy.detail.caseStudies}
                value={pkg.trustAndAuthority.caseStudies}
              />
              <NarrativeBlock
                label={copy.detail.expertPositioning}
                value={pkg.trustAndAuthority.expertPositioning}
              />
              <NarrativeBlock
                label={copy.detail.authorityMessaging}
                value={pkg.trustAndAuthority.authorityMessaging}
              />
              <NarrativeBlock
                label={copy.detail.differentiation}
                value={pkg.trustAndAuthority.differentiation}
              />
              <NarrativeBlock
                label={copy.detail.callsToAction}
                value={pkg.trustAndAuthority.callsToAction}
              />
              <NarrativeBlock
                label={copy.detail.consistency}
                value={pkg.trustAndAuthority.consistency}
              />
            </div>
            <div className="space-y-4">
              {pkg.trustAndAuthority.recommendations.map((recommendation) => (
                <SeoRecommendationCard
                  key={recommendation}
                  title={recommendation}
                  why={copy.detail.trustRecommendationWhy}
                  futureActionKinds={[
                    "generate_trust_page",
                    "generate_article",
                  ]}
                  chrome={cardChrome}
                />
              ))}
            </div>
            {presentation.trustEvidence.length > 0 ? (
              <NarrativeBlock
                label={copy.detail.athenaEvidence}
                value={joinLines(presentation.trustEvidence)}
              />
            ) : null}
          </SeoReportSection>

          <SeoReportSection
            title={copy.detail.ninetyDayRoadmap}
            eyebrow="6"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.ninetyDayRoadmap.overview}
            stars={overview.overallScore.stars}
            readingCorpus={sectionReadingCorpus([
              pkg.ninetyDayRoadmap.overview,
              ...presentation.roadmapItems.flatMap((item) => [
                item.recommendation,
                item.reason,
                item.expectedBusinessImpact,
                ...item.athenaEvidence,
              ]),
              pkg.disclaimer,
            ])}
          >
            <NarrativeBlock
              label={copy.detail.overview}
              value={pkg.ninetyDayRoadmap.overview}
            />
            <div className="space-y-4">
              {presentation.roadmapItems.map((item) => (
                <SeoRecommendationCard
                  key={`${item.priority}-${item.recommendation}`}
                  title={item.recommendation}
                  why={item.reason}
                  impact={item.expectedBusinessImpact}
                  priorityVisual={localizeSeoPriorityVisual(
                    dictionary,
                    item.visual,
                  )}
                  meta={interpolateTenantMessage(
                    copy.detail.effortMeta.includes("{effort}")
                      ? copy.detail.effortMeta
                      : en.seo.detail.effortMeta,
                    {
                      effort: getLocalizedSeoEffortLabel(
                        dictionary,
                        item.estimatedEffort,
                      ),
                    },
                  )}
                  evidence={item.athenaEvidence}
                  futureActionKinds={item.futureActionKinds}
                  chrome={cardChrome}
                />
              ))}
            </div>
            <NarrativeBlock
              label={copy.detail.disclaimer}
              value={pkg.disclaimer}
            />
          </SeoReportSection>

          <SeoWebsitePagesAnalyzedSection
            inventory={pkg.websitePagesAnalyzed}
            chrome={getSeoWebsitePagesChrome(dictionary)}
          />
        </div>
      ) : null}
    </main>
  );
}

function NarrativeBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!value.trim()) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
        {label}
      </div>
      <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
        {value}
      </div>
    </div>
  );
}
