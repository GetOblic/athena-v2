"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Brain,
  Braces,
  Code2,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Info,
  Layers,
  ListChecks,
  ScanSearch,
  Wrench,
} from "lucide-react";
import { SeoCoverageMeter } from "@/components/seo/SeoCoverageMeter";
import { SeoGenerationTypeBadge } from "@/components/seo/SeoGenerationTypeBadge";
import { SeoRecommendationCard } from "@/components/seo/SeoRecommendationCard";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { SeoReportSection } from "@/components/seo/SeoReportSection";
import { SeoReportStatusPanel } from "@/components/seo/SeoReportStatusPanel";
import { SeoScoreCard } from "@/components/seo/SeoScoreCard";
import { SeoWebsitePagesAnalyzedSection } from "@/components/seo/SeoWebsitePagesAnalyzedSection";
import {
  SEO_TECHNICAL_CATEGORY_SURFACE,
  SEO_TECHNICAL_ICON,
  SEO_TECHNICAL_PRIORITY_PILL,
  SEO_TECHNICAL_SURFACE,
  technicalCoverageMeterAccent,
  type SeoTechnicalPriorityAccent,
} from "@/components/seo/seoTechnicalReportPresentation";
import { VisibilityPageHeader } from "@/components/seo/VisibilityPageHeader";
import { computeTechnicalCompletenessScoreFromPackage } from "@/lib/seo/seoScorePresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { en } from "@/lib/tenantI18n/messages/en";
import {
  formatLocalizedSeoProvenance,
  getLocalizedSeoLensLabel,
  getLocalizedSeoReportStatusLabel,
  getLocalizedSeoTechnicalPriorityLabel,
  getSeoConfirmDeleteChrome,
  getSeoRecommendationCardChrome,
  getSeoReportSectionChrome,
  getSeoWebsitePagesChrome,
} from "@/lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { PublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import {
  isSeoTechnicalPackage,
  type SeoTechnicalPackage,
  type SeoTechnicalPriority,
} from "@/services/seo/seoReportTypes";

type SeoTechnicalReportDetailViewProps = {
  report: PublicSeoReportDetail;
  messages?: TenantMessages;
  language?: OrganizationLanguage;
};

function priorityClass(priority: SeoTechnicalPriority): string {
  if (priority === "Critical") {
    return SEO_TECHNICAL_PRIORITY_PILL.critical;
  }
  if (priority === "High") {
    return SEO_TECHNICAL_PRIORITY_PILL.high;
  }
  return SEO_TECHNICAL_PRIORITY_PILL.improvement;
}

function priorityAccent(
  priority: SeoTechnicalPriority,
): SeoTechnicalPriorityAccent {
  if (priority === "Critical") return "critical";
  if (priority === "High") return "high";
  return "improvement";
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
    <div className={SEO_TECHNICAL_SURFACE.evidence}>
      <div className="flex items-start gap-4">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-2xl ${SEO_TECHNICAL_ICON.cyan}`}
          aria-hidden="true"
        >
          <ScanSearch size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">
            {copy.whatAthenaFound}
          </div>
          <p className="mt-3 max-w-3xl text-sm text-white/55">
            {interpolateTenantMessage(
              copy.pagesAnalyzedFromEvidence.includes("{count}")
                ? copy.pagesAnalyzedFromEvidence
                : en.seo.technical.pagesAnalyzedFromEvidence,
              { count: pkg.technicalCoverage.analyzedPageCount },
            )}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            {copy.coverageScope}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SeoCoverageMeter
          label={copy.pagesWithTitle}
          percent={coverage.titleCoveragePercent}
          accent={technicalCoverageMeterAccent(coverage.titleCoveragePercent)}
        />
        <SeoCoverageMeter
          label={copy.pagesWithDescription}
          percent={coverage.descriptionCoveragePercent}
          accent={technicalCoverageMeterAccent(
            coverage.descriptionCoveragePercent,
          )}
        />
        <SeoCoverageMeter
          label={copy.pagesWithMainHeading}
          percent={coverage.h1CoveragePercent}
          accent={technicalCoverageMeterAccent(coverage.h1CoveragePercent)}
        />
        <SeoCoverageMeter
          label={copy.pagesWithPreferredUrl}
          percent={coverage.canonicalCoveragePercent}
          accent={technicalCoverageMeterAccent(
            coverage.canonicalCoveragePercent,
          )}
        />
        <SeoCoverageMeter
          label={copy.pagesWithStructuredInfo}
          percent={coverage.schemaCoveragePercent}
          accent={technicalCoverageMeterAccent(coverage.schemaCoveragePercent)}
        />
        <SeoCoverageMeter
          label={copy.imagesWithTextDescription}
          percent={coverage.imageAltCoveragePercent}
          accent={technicalCoverageMeterAccent(
            coverage.imageAltCoveragePercent,
          )}
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
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(56,189,248,0.18)] bg-sky-400/10 px-3 py-1 text-xs"
              >
                <Layers size={12} className="text-sky-300" aria-hidden="true" />
                <span className="font-medium text-white/80">{type}</span>
                <span className="tabular-nums text-white/50">{count}</span>
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
  language = "en",
}: SeoTechnicalReportDetailViewProps) {
  const dictionary = messages ?? en;
  const copy = dictionary.seo;
  const technical = copy.technical;
  const emptyValue = copy.emptyValue;
  const sectionChrome = getSeoReportSectionChrome(dictionary);
  const cardChrome = {
    ...getSeoRecommendationCardChrome(dictionary),
    evidenceLabel: technical.whatAthenaFound,
    actionLabel: technical.recommendedAction,
    pagesLabel: technical.affectedPages,
  };
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg =
    report.package && isSeoTechnicalPackage(report.package)
      ? report.package
      : null;
  const scrapedAt = pkg?.websitePagesAnalyzed.scrapedAt;
  const provenanceDate = scrapedAt
    ? formatTenantDate(scrapedAt, language)
    : "";
  const createdDate = formatTenantDate(report.createdAt, language);
  const summary = pkg?.executiveEvaluation.summary.trim() ?? "";
  const overall = pkg?.executiveEvaluation.overallAssessment.trim() ?? "";
  const leadAssessment = summary || overall;
  const technicalCompletenessScore =
    computeTechnicalCompletenessScoreFromPackage(pkg);
  const lensLabel = getLocalizedSeoLensLabel(dictionary, "technical");

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
            <span className="inline-flex items-center gap-2">
              <span
                className={`grid size-8 place-items-center rounded-xl ${SEO_TECHNICAL_ICON.cyan}`}
                aria-hidden="true"
              >
                <Gauge size={16} />
              </span>
              <SeoGenerationTypeBadge
                generationType="technical"
                label={lensLabel}
              />
            </span>
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
              className="w-full rounded-2xl border border-white/12 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:text-white disabled:opacity-60 sm:w-auto"
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

      {pkg ? (
        <div className="mt-6 space-y-6">
          <SeoScoreCard
            family="technical"
            score={technicalCompletenessScore}
            label={copy.visibility.technicalCompleteness}
            help={copy.visibility.technicalCompletenessHelp}
            unavailableLabel={copy.visibility.scoreUnavailable}
            unavailableHelp={copy.visibility.scoreUnavailableHelp}
            messages={copy.visibility}
          />

          <section className={SEO_TECHNICAL_SURFACE.assessment}>
            <div className="flex items-start gap-4">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-2xl ${SEO_TECHNICAL_ICON.cyan}`}
                aria-hidden="true"
              >
                <Brain size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">
                  {copy.detail.athenasAssessment}
                </div>
                <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/80">
                  {leadAssessment}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl ${SEO_TECHNICAL_ICON.amber}`}
                aria-hidden="true"
              >
                <ListChecks size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {technical.recommendedImprovements}
                </h2>
                {pkg.actionPlan.overview ? (
                  <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/70">
                    {pkg.actionPlan.overview}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-4">
              {pkg.actionPlan.items.map((item, index) => (
                <SeoRecommendationCard
                  key={`${item.priority}-${item.title}`}
                  title={item.title}
                  why={item.reason}
                  evidence={item.evidence ? [item.evidence] : []}
                  recommendedAction={item.recommendedAction}
                  affectedPages={item.affectedPages}
                  priorityLabel={getLocalizedSeoTechnicalPriorityLabel(
                    dictionary,
                    item.priority,
                  )}
                  priorityClassName={priorityClass(item.priority)}
                  priorityAccent={priorityAccent(item.priority)}
                  chrome={cardChrome}
                  defaultOpen={index === 0}
                  evidenceDefaultOpen={false}
                  copyVariant="utility"
                />
              ))}
            </div>
          </section>

          <TechnicalCoveragePanel pkg={pkg} messages={dictionary} />

          <SeoReportSection
            title={technical.deeperDiagnostics}
            defaultOpen={false}
            chrome={sectionChrome}
            summary={pkg.executiveEvaluation.summary}
            tone="intelligence"
            icon={<Layers size={20} />}
            iconClassName={SEO_TECHNICAL_ICON.muted}
            className={SEO_TECHNICAL_SURFACE.diagnosticsParent}
            copyVariant="utility"
          >
            <SeoReportSection
              title={technical.pageLevelMetadataV2}
              defaultOpen={false}
              chrome={sectionChrome}
              tone="intelligence"
              iconSize="sm"
              icon={<FileText size={16} />}
              iconClassName={SEO_TECHNICAL_ICON.cyan}
              className={SEO_TECHNICAL_CATEGORY_SURFACE.cyan}
              copyVariant="utility"
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
              title={technical.siteArchitectureV2}
              defaultOpen={false}
              chrome={sectionChrome}
              tone="intelligence"
              iconSize="sm"
              icon={<GitBranch size={16} />}
              iconClassName={SEO_TECHNICAL_ICON.violet}
              className={SEO_TECHNICAL_CATEGORY_SURFACE.violet}
              copyVariant="utility"
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
              title={technical.contentHtmlFindingsV2}
              defaultOpen={false}
              chrome={sectionChrome}
              tone="intelligence"
              iconSize="sm"
              icon={<Code2 size={16} />}
              iconClassName={SEO_TECHNICAL_ICON.amber}
              className={SEO_TECHNICAL_CATEGORY_SURFACE.amber}
              copyVariant="utility"
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
              title={technical.structuredDataV2}
              defaultOpen={false}
              chrome={sectionChrome}
              tone="intelligence"
              iconSize="sm"
              icon={<Braces size={16} />}
              iconClassName={SEO_TECHNICAL_ICON.violet}
              className={SEO_TECHNICAL_CATEGORY_SURFACE.violet}
              copyVariant="utility"
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
              title={technical.imageSeoV2}
              defaultOpen={false}
              chrome={sectionChrome}
              tone="intelligence"
              iconSize="sm"
              icon={<ImageIcon size={16} />}
              iconClassName={SEO_TECHNICAL_ICON.green}
              className={SEO_TECHNICAL_CATEGORY_SURFACE.green}
              copyVariant="utility"
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
              title={technical.crawlFindingsV2}
              defaultOpen={false}
              chrome={sectionChrome}
              tone="intelligence"
              iconSize="sm"
              icon={<ScanSearch size={16} />}
              iconClassName={SEO_TECHNICAL_ICON.orange}
              className={SEO_TECHNICAL_CATEGORY_SURFACE.orange}
              copyVariant="utility"
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
          </SeoReportSection>

          <SeoReportSection
            title={technical.implementationGuidanceTitle}
            defaultOpen={false}
            chrome={sectionChrome}
            tone="intelligence"
            icon={<Wrench size={20} />}
            iconClassName={SEO_TECHNICAL_ICON.green}
            className={SEO_TECHNICAL_SURFACE.implementation}
            copyVariant="utility"
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
            tone="intelligence"
            icon={<Globe size={20} />}
            iconClassName={SEO_TECHNICAL_ICON.cyan}
            className={SEO_TECHNICAL_SURFACE.pages}
          />

          <div className={SEO_TECHNICAL_SURFACE.disclaimer}>
            <Info
              className="mt-0.5 size-4 shrink-0 text-white/35"
              aria-hidden="true"
            />
            <p className="max-w-3xl text-xs leading-6 text-white/40">
              {pkg.disclaimer}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
