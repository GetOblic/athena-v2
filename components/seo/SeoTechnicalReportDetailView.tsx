"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SeoCoverageMeter } from "@/components/seo/SeoCoverageMeter";
import { SeoGenerationTypeBadge } from "@/components/seo/SeoGenerationTypeBadge";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { SeoReportSection } from "@/components/seo/SeoReportSection";
import { SeoReportStatusPanel } from "@/components/seo/SeoReportStatusPanel";
import { SeoWebsitePagesAnalyzedSection } from "@/components/seo/SeoWebsitePagesAnalyzedSection";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  getLocalizedSeoGenerationTypeLabel,
  getLocalizedSeoReportStatusLabel,
  getLocalizedSeoTechnicalPriorityLabel,
  getSeoConfirmDeleteChrome,
  getSeoReportSectionChrome,
  getSeoWebsitePagesChrome,
} from "@/lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { PublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import {
  isSeoTechnicalPackage,
  type SeoTechnicalPackage,
  type SeoTechnicalPriority,
} from "@/services/seo/seoReportTypes";

type SeoTechnicalReportDetailViewProps = {
  report: PublicSeoReportDetail;
  messages?: TenantMessages;
};

function priorityClass(priority: SeoTechnicalPriority): string {
  if (priority === "Critical") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }
  if (priority === "High") {
    return "border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 text-[var(--athena-orange)]";
  }
  return "border-[var(--athena-success)]/30 bg-[var(--athena-success)]/10 text-[var(--athena-success)]";
}

function joinLines(values: string[], emptyValue: string): string {
  return values.length ? values.map((item) => `• ${item}`).join("\n") : emptyValue;
}

function field(
  template: string,
  fallback: string,
  value: string,
): string {
  return interpolateTenantMessage(
    template.includes("{value}") ? template : fallback,
    { value },
  );
}

function TechnicalCoveragePanel({
  pkg,
  messages,
}: {
  pkg: SeoTechnicalPackage;
  messages: TenantMessages;
}) {
  const copy = messages.seo.technical;
  const coverage = pkg.technicalCoverage.coverage;
  const pageTypes = Object.entries(
    pkg.technicalCoverage.crawl.pageTypeDistribution,
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-success)]">
        {copy.technicalCoverage}
      </div>
      <p className="mt-3 text-sm text-white/55">
        {interpolateTenantMessage(
          copy.pagesAnalyzedFromEvidence.includes("{count}")
            ? copy.pagesAnalyzedFromEvidence
            : en.seo.technical.pagesAnalyzedFromEvidence,
          { count: pkg.technicalCoverage.analyzedPageCount },
        )}
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SeoCoverageMeter
          label={copy.titleCoverage}
          percent={coverage.titleCoveragePercent}
        />
        <SeoCoverageMeter
          label={copy.metaDescription}
          percent={coverage.descriptionCoveragePercent}
        />
        <SeoCoverageMeter
          label={copy.h1Coverage}
          percent={coverage.h1CoveragePercent}
        />
        <SeoCoverageMeter
          label={copy.canonicalCoverage}
          percent={coverage.canonicalCoveragePercent}
        />
        <SeoCoverageMeter
          label={copy.schemaCoverage}
          percent={coverage.schemaCoveragePercent}
        />
        <SeoCoverageMeter
          label={copy.imageAltCoverage}
          percent={coverage.imageAltCoveragePercent}
          detail={
            pkg.technicalCoverage.images.totalImages > 0
              ? interpolateTenantMessage(
                  copy.imagesMissingAlt.includes("{count}")
                    ? copy.imagesMissingAlt
                    : en.seo.technical.imagesMissingAlt,
                  { count: pkg.technicalCoverage.images.imagesMissingAlt },
                )
              : copy.noImageAltEvidence
          }
        />
      </div>
      {pageTypes.length > 0 ? (
        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            {copy.pageTypeDistribution}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pageTypes.map(([type, count]) => (
              <span
                key={type}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70"
              >
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SeoTechnicalReportDetailView({
  report,
  messages,
}: SeoTechnicalReportDetailViewProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.seo;
  const technical = copy.technical;
  const emptyValue = copy.emptyValue;
  const sectionChrome = getSeoReportSectionChrome(dictionary);
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg =
    report.package && isSeoTechnicalPackage(report.package)
      ? report.package
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
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-success)]">
              {technical.eyebrow}
            </div>
            <SeoGenerationTypeBadge
              generationType="technical"
              label={getLocalizedSeoGenerationTypeLabel(dictionary, "technical")}
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

      {pkg ? (
        <div className="mt-6 space-y-6">
          <TechnicalCoveragePanel pkg={pkg} messages={dictionary} />

          <SeoReportSection
            title={technical.executiveEvaluation}
            eyebrow="A"
            defaultOpen
            chrome={sectionChrome}
            summary={pkg.executiveEvaluation.summary}
            fields={[
              {
                label: technical.overallAssessment,
                value: pkg.executiveEvaluation.overallAssessment,
              },
              {
                label: technical.strengths,
                value: joinLines(pkg.executiveEvaluation.strengths, emptyValue),
              },
              {
                label: technical.criticalIssues,
                value: joinLines(
                  pkg.executiveEvaluation.criticalIssues,
                  emptyValue,
                ),
              },
              {
                label: technical.warnings,
                value: joinLines(pkg.executiveEvaluation.warnings, emptyValue),
              },
              {
                label: technical.remediationPriorities,
                value: joinLines(
                  pkg.executiveEvaluation.remediationPriorities,
                  emptyValue,
                ),
              },
            ]}
          />

          <SeoReportSection
            title={technical.pageLevelMetadata}
            eyebrow="C"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={
              pkg.pageMetadata.length
                ? interpolateTenantMessage(
                    technical.analyzedPagesWithRecommendations.includes(
                      "{pages}",
                    )
                      ? technical.analyzedPagesWithRecommendations
                      : en.seo.technical.analyzedPagesWithRecommendations,
                    {
                      pages: pkg.pageMetadata.length,
                      recommended: pkg.pageMetadata.filter(
                        (page) =>
                          page.recommendedTitle ||
                          page.recommendedDescription ||
                          page.recommendedH1,
                      ).length,
                    },
                  )
                : technical.noAnalyzedPagesMatrix
            }
            fields={
              pkg.pageMetadata.length === 0
                ? [
                    {
                      label: technical.notes,
                      value: technical.noAnalyzedPagesNotes,
                    },
                  ]
                : pkg.pageMetadata.map((page) => ({
                    label: page.url,
                    value: [
                      field(
                        technical.httpStatus,
                        en.seo.technical.httpStatus,
                        page.httpStatus == null
                          ? emptyValue
                          : String(page.httpStatus),
                      ),
                      field(
                        technical.currentTitle,
                        en.seo.technical.currentTitle,
                        page.currentTitle ?? emptyValue,
                      ),
                      field(
                        technical.recommendedTitle,
                        en.seo.technical.recommendedTitle,
                        page.recommendedTitle ?? technical.healthyNoRewrite,
                      ),
                      field(
                        technical.currentDescription,
                        en.seo.technical.currentDescription,
                        page.currentDescription ?? emptyValue,
                      ),
                      field(
                        technical.recommendedDescription,
                        en.seo.technical.recommendedDescription,
                        page.recommendedDescription ??
                          technical.healthyNoRewrite,
                      ),
                      field(
                        technical.h1,
                        en.seo.technical.h1,
                        page.h1Observation ?? emptyValue,
                      ),
                      field(
                        technical.recommendedH1,
                        en.seo.technical.recommendedH1,
                        page.recommendedH1 ?? technical.healthyNoRewrite,
                      ),
                      field(
                        technical.canonical,
                        en.seo.technical.canonical,
                        page.canonicalObservation ?? emptyValue,
                      ),
                      field(
                        technical.robots,
                        en.seo.technical.robots,
                        page.robotsObservation ?? emptyValue,
                      ),
                      page.issueFlags && page.issueFlags.length > 0
                        ? interpolateTenantMessage(
                            technical.issueFlags.includes("{flags}")
                              ? technical.issueFlags
                              : en.seo.technical.issueFlags,
                            { flags: page.issueFlags.join(", ") },
                          )
                        : technical.issueFlagsNone,
                    ].join("\n"),
                  }))
            }
          />

          <SeoReportSection
            title={technical.siteArchitecture}
            eyebrow="D"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.siteArchitecture.summary}
            fields={[
              {
                label: technical.architectureFindings,
                value: joinLines(
                  pkg.siteArchitecture.architectureFindings,
                  emptyValue,
                ),
              },
              {
                label: technical.linkingEvidence,
                value: joinLines(
                  pkg.siteArchitecture.linkingEvidence,
                  emptyValue,
                ),
              },
              {
                label: technical.weaklyLinkedCandidates,
                value: joinLines(
                  pkg.siteArchitecture.weaklyLinkedCandidates,
                  emptyValue,
                ),
              },
              {
                label: technical.recommendedLinks,
                value: pkg.siteArchitecture.recommendedLinks.length
                  ? pkg.siteArchitecture.recommendedLinks
                      .map(
                        (link) =>
                          `• ${link.fromUrl} → ${link.toUrl} (“${link.recommendedAnchor}”) — ${link.rationale}`,
                      )
                      .join("\n")
                  : emptyValue,
              },
            ]}
          />

          <SeoReportSection
            title={technical.contentHtmlFindings}
            eyebrow="E"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.contentHtmlFindings.summary}
            fields={[
              {
                label: technical.headingFindings,
                value: joinLines(
                  pkg.contentHtmlFindings.headingFindings,
                  emptyValue,
                ),
              },
              {
                label: technical.metadataFindings,
                value: joinLines(
                  pkg.contentHtmlFindings.metadataFindings,
                  emptyValue,
                ),
              },
              {
                label: technical.contentSizeFindings,
                value: joinLines(
                  pkg.contentHtmlFindings.contentSizeFindings,
                  emptyValue,
                ),
              },
              {
                label: technical.structuralRecommendations,
                value: joinLines(
                  pkg.contentHtmlFindings.structuralRecommendations,
                  emptyValue,
                ),
              },
            ]}
          />

          <SeoReportSection
            title={technical.structuredData}
            eyebrow="F"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.structuredData.summary}
            fields={[
              {
                label: technical.opportunityAssessment,
                value: pkg.structuredData.missingOpportunityAssessment,
              },
              {
                label: technical.detectedSchemaEvidence,
                value: joinLines(
                  pkg.structuredData.detectedSchemaEvidence,
                  emptyValue,
                ),
              },
              {
                label: technical.recommendedSchemaTypes,
                value: joinLines(
                  pkg.structuredData.recommendedSchemaTypes,
                  emptyValue,
                ),
              },
              {
                label: technical.implementationGuidance,
                value: joinLines(
                  pkg.structuredData.implementationGuidance,
                  emptyValue,
                ),
              },
              {
                label: technical.exampleSnippets,
                value: pkg.structuredData.exampleSnippets.length
                  ? pkg.structuredData.exampleSnippets.join("\n\n")
                  : emptyValue,
              },
            ]}
          />

          <SeoReportSection
            title={technical.imageSeo}
            eyebrow="G"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.imageSeo.summary}
            fields={[
              {
                label: technical.altCoverage,
                value: pkg.imageSeo.altCoverageSummary,
              },
              {
                label: technical.missingAltFindings,
                value: joinLines(pkg.imageSeo.missingAltFindings, emptyValue),
              },
              {
                label: technical.remediationGuidance,
                value: joinLines(pkg.imageSeo.remediationGuidance, emptyValue),
              },
            ]}
          />

          <SeoReportSection
            title={technical.crawlFindings}
            eyebrow="H"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.crawlFindings.summary}
            fields={[
              {
                label: technical.statusFindings,
                value: joinLines(pkg.crawlFindings.statusFindings, emptyValue),
              },
              {
                label: technical.redirectFindings,
                value: joinLines(pkg.crawlFindings.redirectFindings, emptyValue),
              },
              {
                label: technical.canonicalFindings,
                value: joinLines(pkg.crawlFindings.canonicalFindings, emptyValue),
              },
              {
                label: technical.robotsFindings,
                value: joinLines(pkg.crawlFindings.robotsFindings, emptyValue),
              },
            ]}
          />

          <SeoReportSection
            title={technical.actionPlan}
            eyebrow="I"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.actionPlan.overview}
          >
            <div className="space-y-3">
              {pkg.actionPlan.items.map((item) => (
                <div
                  key={`${item.priority}-${item.title}`}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${priorityClass(item.priority)}`}
                    >
                      {getLocalizedSeoTechnicalPriorityLabel(
                        dictionary,
                        item.priority,
                      )}
                    </span>
                    <div className="text-sm font-semibold">{item.title}</div>
                  </div>
                  <p className="mt-3 text-sm text-white/70">{item.reason}</p>
                  <p className="mt-2 text-sm text-white/55">
                    {field(
                      technical.evidence,
                      en.seo.technical.evidence,
                      item.evidence,
                    )}
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    {field(
                      technical.action,
                      en.seo.technical.action,
                      item.recommendedAction,
                    )}
                  </p>
                  {item.affectedPages.length > 0 ? (
                    <p className="mt-2 text-xs text-white/40">
                      {field(
                        technical.pages,
                        en.seo.technical.pages,
                        item.affectedPages.join(", "),
                      )}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </SeoReportSection>

          <SeoReportSection
            title={technical.implementationAssets}
            eyebrow="J"
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.implementationAssets.metadataTableNotes}
            fields={[
              {
                label: technical.headingRecommendations,
                value: joinLines(
                  pkg.implementationAssets.headingRecommendations,
                  emptyValue,
                ),
              },
              {
                label: technical.internalLinkPlan,
                value: joinLines(
                  pkg.implementationAssets.internalLinkPlan,
                  emptyValue,
                ),
              },
              {
                label: technical.schemaRecommendations,
                value: joinLines(
                  pkg.implementationAssets.schemaRecommendations,
                  emptyValue,
                ),
              },
              {
                label: technical.redirectRecommendations,
                value: joinLines(
                  pkg.implementationAssets.redirectRecommendations,
                  emptyValue,
                ),
              },
              {
                label: technical.developerRemediation,
                value: joinLines(
                  pkg.implementationAssets.developerRemediationInstructions,
                  emptyValue,
                ),
              },
            ]}
          />

          <SeoWebsitePagesAnalyzedSection
            inventory={pkg.websitePagesAnalyzed}
            chrome={getSeoWebsitePagesChrome(dictionary)}
          />

          <p className="text-xs leading-6 text-white/35">{pkg.disclaimer}</p>
        </div>
      ) : null}
    </main>
  );
}
