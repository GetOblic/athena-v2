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

export function SeoReportDetailView({ report }: SeoReportDetailViewProps) {
  if (
    report.generationType === "technical" ||
    isSeoTechnicalPackage(report.package)
  ) {
    return <SeoTechnicalReportDetailView report={report} />;
  }
  return <SeoIntelligenceReportDetailView report={report} />;
}

function SeoIntelligenceReportDetailView({
  report,
}: SeoReportDetailViewProps) {
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg =
    report.package && !isSeoTechnicalPackage(report.package)
      ? report.package
      : null;
  const presentation = pkg ? buildPresentation(pkg) : null;

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
        setError(payload.error?.message || "Failed to regenerate SEO report.");
        return;
      }
      router.push(`/seo/${payload.report.id}`);
      router.refresh();
    } catch {
      setError("Failed to regenerate SEO report.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/seo" className="text-sm text-[var(--athena-orange)]">
        ← SEO Intelligence
      </Link>

      <div className="mb-8 mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
              SEO Intelligence
            </div>
            <SeoGenerationTypeBadge generationType="intelligence" />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            {report.name}
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Status: {report.status}
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
              {regenerating ? "Starting…" : "Regenerate"}
            </button>
          )}
          <SeoReportHeaderDeleteButton reportId={report.id} />
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
      />

      {pkg && presentation ? (
        <div className="space-y-6">
          <SeoExecutiveOverview model={presentation.overview} />

          <SeoReportSection
            title="Executive Assessment"
            eyebrow="1"
            defaultOpen={false}
            summary={pkg.executiveAssessment.summary}
            stars={presentation.overview.overallScore.stars}
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
                label: "Overall assessment",
                value: pkg.executiveAssessment.overallAssessment,
              },
              {
                label: "Strengths",
                value: joinLines(pkg.executiveAssessment.strengths),
              },
              {
                label: "Weaknesses",
                value: joinLines(pkg.executiveAssessment.weaknesses),
              },
              {
                label: "SEO readiness",
                value: pkg.executiveAssessment.seoReadiness,
              },
              {
                label: "Business visibility",
                value: pkg.executiveAssessment.businessVisibilityAssessment,
              },
            ]}
          />

          <SeoReportSection
            title="Content Coverage Analysis"
            eyebrow="2"
            defaultOpen={false}
            summary={pkg.contentCoverage.analysis}
            stars={presentation.overview.contentCoverage.stars}
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
              label="Coverage strength"
              score={presentation.overview.contentCoverage}
              compact
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <NarrativeBlock
                label="Well covered"
                value={joinLines(pkg.contentCoverage.wellCoveredServices)}
              />
              <NarrativeBlock
                label="Weakly covered"
                value={joinLines(pkg.contentCoverage.weaklyCoveredServices)}
              />
              <NarrativeBlock
                label="Missing services"
                value={joinLines(pkg.contentCoverage.missingServices)}
              />
              <NarrativeBlock
                label="Missing customer questions"
                value={joinLines(pkg.contentCoverage.missingCustomerQuestions)}
              />
              <NarrativeBlock
                label="Missing trust content"
                value={joinLines(pkg.contentCoverage.missingTrustContent)}
              />
              <NarrativeBlock
                label="Missing educational content"
                value={joinLines(
                  pkg.contentCoverage.missingEducationalContent,
                )}
              />
              <NarrativeBlock
                label="Missing conversion content"
                value={joinLines(pkg.contentCoverage.missingConversionContent)}
              />
            </div>
            <NarrativeBlock
              label="Analysis"
              value={pkg.contentCoverage.analysis}
            />
            {presentation.contentEvidence.length > 0 ? (
              <NarrativeBlock
                label="Athena evidence"
                value={joinLines(presentation.contentEvidence)}
              />
            ) : null}
          </SeoReportSection>

          <SeoReportSection
            title="Customer Intent Analysis"
            eyebrow="3"
            defaultOpen={false}
            summary={pkg.customerIntent.buyerIntentSummary}
            stars={presentation.overview.commercialReadiness.stars}
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
              label="Buyer intent summary"
              value={pkg.customerIntent.buyerIntentSummary}
            />
            <NarrativeBlock
              label="Represented intents"
              value={joinLines(pkg.customerIntent.representedIntents)}
            />
            <NarrativeBlock
              label="Pain point gaps"
              value={joinLines(pkg.customerIntent.painPointGaps)}
            />
            <div className="space-y-4">
              {presentation.intentGaps.map((gap) => (
                <SeoRecommendationCard
                  key={`${gap.intent}-${gap.source}`}
                  title={gap.recommendation}
                  why={`${gap.intent} — ${gap.websiteGap}`}
                  meta={`Source · ${gap.source}`}
                  evidence={[]}
                  futureActionKinds={gap.futureActionKinds}
                />
              ))}
            </div>
            {presentation.intentEvidence.length > 0 ? (
              <NarrativeBlock
                label="Athena evidence"
                value={joinLines(presentation.intentEvidence)}
              />
            ) : null}
          </SeoReportSection>

          <SeoReportSection
            title="Commercial Opportunity Analysis"
            eyebrow="4"
            defaultOpen={false}
            summary={pkg.commercialOpportunities.summary}
            stars={presentation.overview.commercialReadiness.stars}
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
              label="Opportunity strength"
              score={presentation.overview.commercialReadiness}
              compact
            />
            <NarrativeBlock
              label="Summary"
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
                />
              ))}
            </div>
          </SeoReportSection>

          <SeoReportSection
            title="Trust & Authority Analysis"
            eyebrow="5"
            defaultOpen={false}
            summary={pkg.trustAndAuthority.authorityMessaging}
            stars={presentation.overview.trustAuthority.stars}
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
              label="Authority strength"
              score={presentation.overview.trustAuthority}
              compact
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <NarrativeBlock
                label="Trust signals"
                value={pkg.trustAndAuthority.trustSignals}
              />
              <NarrativeBlock
                label="Testimonials"
                value={pkg.trustAndAuthority.testimonials}
              />
              <NarrativeBlock
                label="Case studies"
                value={pkg.trustAndAuthority.caseStudies}
              />
              <NarrativeBlock
                label="Expert positioning"
                value={pkg.trustAndAuthority.expertPositioning}
              />
              <NarrativeBlock
                label="Authority messaging"
                value={pkg.trustAndAuthority.authorityMessaging}
              />
              <NarrativeBlock
                label="Differentiation"
                value={pkg.trustAndAuthority.differentiation}
              />
              <NarrativeBlock
                label="Calls to action"
                value={pkg.trustAndAuthority.callsToAction}
              />
              <NarrativeBlock
                label="Consistency"
                value={pkg.trustAndAuthority.consistency}
              />
            </div>
            <div className="space-y-4">
              {pkg.trustAndAuthority.recommendations.map((recommendation) => (
                <SeoRecommendationCard
                  key={recommendation}
                  title={recommendation}
                  why="Strengthens buyer confidence where proof and authority are currently thin."
                  futureActionKinds={[
                    "generate_trust_page",
                    "generate_article",
                  ]}
                />
              ))}
            </div>
            {presentation.trustEvidence.length > 0 ? (
              <NarrativeBlock
                label="Athena evidence"
                value={joinLines(presentation.trustEvidence)}
              />
            ) : null}
          </SeoReportSection>

          <SeoReportSection
            title="90-Day SEO Roadmap"
            eyebrow="6"
            defaultOpen={false}
            summary={pkg.ninetyDayRoadmap.overview}
            stars={presentation.overview.overallScore.stars}
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
              label="Overview"
              value={pkg.ninetyDayRoadmap.overview}
            />
            <div className="space-y-4">
              {presentation.roadmapItems.map((item) => (
                <SeoRecommendationCard
                  key={`${item.priority}-${item.recommendation}`}
                  title={item.recommendation}
                  why={item.reason}
                  impact={item.expectedBusinessImpact}
                  priorityVisual={item.visual}
                  meta={`Effort · ${item.estimatedEffort}`}
                  evidence={item.athenaEvidence}
                  futureActionKinds={item.futureActionKinds}
                />
              ))}
            </div>
            <NarrativeBlock label="Disclaimer" value={pkg.disclaimer} />
          </SeoReportSection>

          <SeoWebsitePagesAnalyzedSection
            inventory={pkg.websitePagesAnalyzed}
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
