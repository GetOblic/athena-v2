"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SeoRecommendationCard } from "@/components/seo/SeoRecommendationCard";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { SeoReportSection } from "@/components/seo/SeoReportSection";
import { SeoReportStatusPanel } from "@/components/seo/SeoReportStatusPanel";
import { SeoWebsitePagesAnalyzedSection } from "@/components/seo/SeoWebsitePagesAnalyzedSection";
import { VisibilityPageHeader } from "@/components/seo/VisibilityPageHeader";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatLocalizedSeoProvenance,
  getLocalizedSeoEffortLabel,
  getLocalizedSeoLensLabel,
  getLocalizedSeoReportStatusLabel,
  getLocalizedSeoRoadmapPriorityLabel,
  getSeoConfirmDeleteChrome,
  getSeoRecommendationCardChrome,
  getSeoReportSectionChrome,
  getSeoWebsitePagesChrome,
} from "@/lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import {
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
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type SeoReportDetailViewProps = {
  report: PublicSeoReportDetail;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
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
  const takeEvidence = createEvidenceDeduper();
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
  language = "en",
}: SeoReportDetailViewProps) {
  if (
    report.generationType === "technical" ||
    isSeoTechnicalPackage(report.package)
  ) {
    return (
      <SeoTechnicalReportDetailView
        report={report}
        messages={messages}
        language={language}
      />
    );
  }
  return (
    <SeoIntelligenceReportDetailView
      report={report}
      messages={messages}
      language={language}
    />
  );
}

function SeoIntelligenceReportDetailView({
  report,
  messages,
  language = "en",
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
  const scrapedAt = pkg?.websitePagesAnalyzed.scrapedAt;
  const provenanceDate = scrapedAt
    ? formatTenantDate(scrapedAt, language)
    : "";
  const createdDate = formatTenantDate(report.createdAt, language);
  const summary = pkg?.executiveAssessment.summary.trim() ?? "";
  const overall = pkg?.executiveAssessment.overallAssessment.trim() ?? "";
  const showOverall = Boolean(overall && overall !== summary);
  const lensLabel = getLocalizedSeoLensLabel(dictionary, "intelligence");

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
    <div className="min-w-0 text-white">
      <Link
        href="/seo"
        className="text-sm text-[var(--athena-orange)] underline-offset-2 hover:underline"
      >
        {copy.visibility.backToLanding}
      </Link>

      <div className="mb-8 mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <VisibilityPageHeader
          eyebrow={copy.visibility.eyebrow}
          title={report.name}
          subtitle=""
          badge={
            <SeoGenerationTypeBadge
              generationType="intelligence"
              label={lensLabel}
            />
          }
        >
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
            <span className="text-sm text-white/50">
              {getLocalizedSeoReportStatusLabel(dictionary, report.status)}
            </span>
            {createdDate ? (
              <span className="text-sm text-white/50">{createdDate}</span>
            ) : null}
          </div>
          {provenanceDate ? (
            <p className="mt-4 text-sm leading-6 text-white/55">
              {formatLocalizedSeoProvenance(dictionary, provenanceDate)}
            </p>
          ) : null}
        </VisibilityPageHeader>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          {(report.status === "Ready" ||
            report.status === "Processing Failed") && (
            <button
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 disabled:opacity-60 sm:w-auto"
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
        <p className="mb-6 break-words text-sm text-rose-200">{error}</p>
      ) : null}

      <SeoReportStatusPanel
        reportId={report.id}
        initialStatus={report.status}
        initialStage={report.generationStage}
        initialErrorMessage={report.errorMessage}
        initialErrorCode={report.errorCode}
        messages={dictionary}
      />

      {pkg && presentation ? (
        <div className="space-y-6">
          <section className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-orange)]">
              {copy.detail.athenasAssessment}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/80">
              {pkg.executiveAssessment.summary}
            </p>
            {showOverall ? (
              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                  {copy.detail.overallAssessment}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white/70">
                  {pkg.executiveAssessment.overallAssessment}
                </p>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">
                {copy.detail.recommendedImprovements}
              </h2>
              {pkg.ninetyDayRoadmap.overview ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/70">
                  {pkg.ninetyDayRoadmap.overview}
                </p>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-white/45">
                {copy.detail.priorityAssignedNote}
              </p>
            </div>
            <div className="space-y-4">
              {presentation.roadmapItems.map((item, index) => (
                <SeoRecommendationCard
                  key={`${item.priority}-${item.recommendation}`}
                  title={item.recommendation}
                  why={item.reason}
                  impact={item.expectedBusinessImpact}
                  priorityLabel={getLocalizedSeoRoadmapPriorityLabel(
                    dictionary,
                    item.priority,
                  )}
                  effort={getLocalizedSeoEffortLabel(
                    dictionary,
                    item.estimatedEffort,
                  )}
                  evidence={item.athenaEvidence}
                  futureActionKinds={item.futureActionKinds}
                  chrome={cardChrome}
                  defaultOpen={index === 0}
                  evidenceDefaultOpen={false}
                />
              ))}
            </div>
          </section>

          <SeoReportSection
            title={copy.detail.supportingIntelligence}
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.executiveAssessment.summary}
            readingCorpus={sectionReadingCorpus([
              pkg.executiveAssessment.overallAssessment,
              pkg.contentCoverage.analysis,
              pkg.customerIntent.buyerIntentSummary,
              pkg.commercialOpportunities.summary,
              pkg.trustAndAuthority.authorityMessaging,
            ])}
          >
            <SeoReportSection
              title={copy.detail.executiveAssessment}
              defaultOpen={false}
              chrome={sectionChrome}
              summary={pkg.executiveAssessment.summary}
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
              title={copy.detail.contentCoverageV2}
              defaultOpen={false}
              chrome={sectionChrome}
              summary={pkg.contentCoverage.analysis}
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
                  label={copy.detail.signalsAthenaUsed}
                  value={joinLines(presentation.contentEvidence)}
                />
              ) : null}
            </SeoReportSection>

            <SeoReportSection
              title={copy.detail.customerIntentV2}
              defaultOpen={false}
              chrome={sectionChrome}
              summary={pkg.customerIntent.buyerIntentSummary}
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
                    noticed={[gap.intent, gap.websiteGap]
                      .filter(Boolean)
                      .join(" — ")}
                    noticedLabel={copy.detail.whatAthenaNoticed}
                    futureActionKinds={gap.futureActionKinds}
                    chrome={cardChrome}
                    defaultOpen={false}
                  />
                ))}
              </div>
              {presentation.intentEvidence.length > 0 ? (
                <NarrativeBlock
                  label={copy.detail.signalsAthenaUsed}
                  value={joinLines(presentation.intentEvidence)}
                />
              ) : null}
            </SeoReportSection>

            <SeoReportSection
              title={copy.detail.commercialOpportunitiesV2}
              defaultOpen={false}
              chrome={sectionChrome}
              summary={pkg.commercialOpportunities.summary}
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
                    defaultOpen={false}
                    evidenceDefaultOpen={false}
                  />
                ))}
              </div>
            </SeoReportSection>

            <SeoReportSection
              title={copy.detail.trustAndAuthorityV2}
              defaultOpen={false}
              chrome={sectionChrome}
              summary={pkg.trustAndAuthority.authorityMessaging}
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
              <div className="space-y-3">
                {pkg.trustAndAuthority.recommendations.map((recommendation) => (
                  <div
                    key={recommendation}
                    className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-sm leading-7 text-white/80"
                    data-future-action-kinds="generate_trust_page,generate_article"
                  >
                    {recommendation}
                  </div>
                ))}
              </div>
              {presentation.trustEvidence.length > 0 ? (
                <NarrativeBlock
                  label={copy.detail.signalsAthenaUsed}
                  value={joinLines(presentation.trustEvidence)}
                />
              ) : null}
            </SeoReportSection>
          </SeoReportSection>

          <SeoWebsitePagesAnalyzedSection
            inventory={pkg.websitePagesAnalyzed}
            chrome={getSeoWebsitePagesChrome(dictionary)}
          />

          <p className="text-xs leading-6 text-white/35">{pkg.disclaimer}</p>
        </div>
      ) : null}
    </div>
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
      <div className="whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/80">
        {value}
      </div>
    </div>
  );
}
