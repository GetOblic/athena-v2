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
import type { PublicSeoReportDetail } from "@/services/seo/seoReportPublic";
import {
  isSeoTechnicalPackage,
  type SeoTechnicalPackage,
  type SeoTechnicalPriority,
} from "@/services/seo/seoReportTypes";

type SeoTechnicalReportDetailViewProps = {
  report: PublicSeoReportDetail;
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

function joinLines(values: string[]): string {
  return values.length ? values.map((item) => `• ${item}`).join("\n") : "—";
}

function TechnicalCoveragePanel({ pkg }: { pkg: SeoTechnicalPackage }) {
  const coverage = pkg.technicalCoverage.coverage;
  const pageTypes = Object.entries(
    pkg.technicalCoverage.crawl.pageTypeDistribution,
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-[24px] border border-white/10 bg-[var(--athena-card)] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--athena-success)]">
        Technical Coverage
      </div>
      <p className="mt-3 text-sm text-white/55">
        {pkg.technicalCoverage.analyzedPageCount} pages analyzed from Website
        Intelligence technical evidence.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SeoCoverageMeter
          label="Title coverage"
          percent={coverage.titleCoveragePercent}
        />
        <SeoCoverageMeter
          label="Meta description"
          percent={coverage.descriptionCoveragePercent}
        />
        <SeoCoverageMeter
          label="H1 coverage"
          percent={coverage.h1CoveragePercent}
        />
        <SeoCoverageMeter
          label="Canonical coverage"
          percent={coverage.canonicalCoveragePercent}
        />
        <SeoCoverageMeter
          label="Schema coverage"
          percent={coverage.schemaCoveragePercent}
        />
        <SeoCoverageMeter
          label="Image alt coverage"
          percent={coverage.imageAltCoveragePercent}
          detail={
            pkg.technicalCoverage.images.totalImages > 0
              ? `${pkg.technicalCoverage.images.imagesMissingAlt} images missing alt`
              : "No image alt evidence captured"
          }
        />
      </div>
      {pageTypes.length > 0 ? (
        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
            Page-type distribution
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
}: SeoTechnicalReportDetailViewProps) {
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
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-success)]">
              Technical SEO
            </div>
            <SeoGenerationTypeBadge generationType="technical" />
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

      {pkg ? (
        <div className="mt-6 space-y-6">
          <TechnicalCoveragePanel pkg={pkg} />

          <SeoReportSection
            title="Executive Evaluation"
            eyebrow="A"
            defaultOpen
            summary={pkg.executiveEvaluation.summary}
            fields={[
              {
                label: "Overall assessment",
                value: pkg.executiveEvaluation.overallAssessment,
              },
              {
                label: "Strengths",
                value: joinLines(pkg.executiveEvaluation.strengths),
              },
              {
                label: "Critical issues",
                value: joinLines(pkg.executiveEvaluation.criticalIssues),
              },
              {
                label: "Warnings",
                value: joinLines(pkg.executiveEvaluation.warnings),
              },
              {
                label: "Remediation priorities",
                value: joinLines(pkg.executiveEvaluation.remediationPriorities),
              },
            ]}
          />

          <SeoReportSection
            title="Page-Level Metadata"
            eyebrow="C"
            defaultOpen={false}
            summary={
              pkg.pageMetadata.length
                ? `${pkg.pageMetadata.length} analyzed page(s) · ${
                    pkg.pageMetadata.filter(
                      (page) =>
                        page.recommendedTitle ||
                        page.recommendedDescription ||
                        page.recommendedH1,
                    ).length
                  } with AI recommendations`
                : "No analyzed pages in metadata matrix"
            }
            fields={
              pkg.pageMetadata.length === 0
                ? [
                    {
                      label: "Notes",
                      value:
                        "No analyzed pages were available for the metadata matrix.",
                    },
                  ]
                : pkg.pageMetadata.map((page) => ({
                    label: page.url,
                    value: [
                      `HTTP status: ${page.httpStatus ?? "—"}`,
                      `Current title: ${page.currentTitle ?? "—"}`,
                      `Recommended title: ${page.recommendedTitle ?? "— (healthy / no rewrite)"}`,
                      `Current description: ${page.currentDescription ?? "—"}`,
                      `Recommended description: ${page.recommendedDescription ?? "— (healthy / no rewrite)"}`,
                      `H1: ${page.h1Observation ?? "—"}`,
                      `Recommended H1: ${page.recommendedH1 ?? "— (healthy / no rewrite)"}`,
                      `Canonical: ${page.canonicalObservation ?? "—"}`,
                      `Robots: ${page.robotsObservation ?? "—"}`,
                      page.issueFlags && page.issueFlags.length > 0
                        ? `Issue flags: ${page.issueFlags.join(", ")}`
                        : "Issue flags: none",
                    ].join("\n"),
                  }))
            }
          />

          <SeoReportSection
            title="Site Architecture & Internal Linking"
            eyebrow="D"
            defaultOpen={false}
            summary={pkg.siteArchitecture.summary}
            fields={[
              {
                label: "Architecture findings",
                value: joinLines(pkg.siteArchitecture.architectureFindings),
              },
              {
                label: "Linking evidence",
                value: joinLines(pkg.siteArchitecture.linkingEvidence),
              },
              {
                label: "Weakly linked candidates",
                value: joinLines(pkg.siteArchitecture.weaklyLinkedCandidates),
              },
              {
                label: "Recommended links",
                value: pkg.siteArchitecture.recommendedLinks.length
                  ? pkg.siteArchitecture.recommendedLinks
                      .map(
                        (link) =>
                          `• ${link.fromUrl} → ${link.toUrl} (“${link.recommendedAnchor}”) — ${link.rationale}`,
                      )
                      .join("\n")
                  : "—",
              },
            ]}
          />

          <SeoReportSection
            title="Content / HTML Findings"
            eyebrow="E"
            defaultOpen={false}
            summary={pkg.contentHtmlFindings.summary}
            fields={[
              {
                label: "Heading findings",
                value: joinLines(pkg.contentHtmlFindings.headingFindings),
              },
              {
                label: "Metadata findings",
                value: joinLines(pkg.contentHtmlFindings.metadataFindings),
              },
              {
                label: "Content-size findings",
                value: joinLines(pkg.contentHtmlFindings.contentSizeFindings),
              },
              {
                label: "Structural recommendations",
                value: joinLines(
                  pkg.contentHtmlFindings.structuralRecommendations,
                ),
              },
            ]}
          />

          <SeoReportSection
            title="Structured Data"
            eyebrow="F"
            defaultOpen={false}
            summary={pkg.structuredData.summary}
            fields={[
              {
                label: "Opportunity assessment",
                value: pkg.structuredData.missingOpportunityAssessment,
              },
              {
                label: "Detected schema evidence",
                value: joinLines(pkg.structuredData.detectedSchemaEvidence),
              },
              {
                label: "Recommended schema types",
                value: joinLines(pkg.structuredData.recommendedSchemaTypes),
              },
              {
                label: "Implementation guidance",
                value: joinLines(pkg.structuredData.implementationGuidance),
              },
              {
                label: "Example snippets",
                value: pkg.structuredData.exampleSnippets.length
                  ? pkg.structuredData.exampleSnippets.join("\n\n")
                  : "—",
              },
            ]}
          />

          <SeoReportSection
            title="Image SEO"
            eyebrow="G"
            defaultOpen={false}
            summary={pkg.imageSeo.summary}
            fields={[
              {
                label: "Alt coverage",
                value: pkg.imageSeo.altCoverageSummary,
              },
              {
                label: "Missing-alt findings",
                value: joinLines(pkg.imageSeo.missingAltFindings),
              },
              {
                label: "Remediation guidance",
                value: joinLines(pkg.imageSeo.remediationGuidance),
              },
            ]}
          />

          <SeoReportSection
            title="Crawl Findings"
            eyebrow="H"
            defaultOpen={false}
            summary={pkg.crawlFindings.summary}
            fields={[
              {
                label: "Status findings",
                value: joinLines(pkg.crawlFindings.statusFindings),
              },
              {
                label: "Redirect findings",
                value: joinLines(pkg.crawlFindings.redirectFindings),
              },
              {
                label: "Canonical findings",
                value: joinLines(pkg.crawlFindings.canonicalFindings),
              },
              {
                label: "Robots findings",
                value: joinLines(pkg.crawlFindings.robotsFindings),
              },
            ]}
          />

          <SeoReportSection
            title="Technical SEO Action Plan"
            eyebrow="I"
            defaultOpen={false}
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
                      {item.priority}
                    </span>
                    <div className="text-sm font-semibold">{item.title}</div>
                  </div>
                  <p className="mt-3 text-sm text-white/70">{item.reason}</p>
                  <p className="mt-2 text-sm text-white/55">
                    Evidence: {item.evidence}
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    Action: {item.recommendedAction}
                  </p>
                  {item.affectedPages.length > 0 ? (
                    <p className="mt-2 text-xs text-white/40">
                      Pages: {item.affectedPages.join(", ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </SeoReportSection>

          <SeoReportSection
            title="Implementation Assets"
            eyebrow="J"
            defaultOpen={false}
            summary={pkg.implementationAssets.metadataTableNotes}
            fields={[
              {
                label: "Heading recommendations",
                value: joinLines(
                  pkg.implementationAssets.headingRecommendations,
                ),
              },
              {
                label: "Internal-link plan",
                value: joinLines(pkg.implementationAssets.internalLinkPlan),
              },
              {
                label: "Schema recommendations",
                value: joinLines(
                  pkg.implementationAssets.schemaRecommendations,
                ),
              },
              {
                label: "Redirect recommendations",
                value: joinLines(
                  pkg.implementationAssets.redirectRecommendations,
                ),
              },
              {
                label: "Developer remediation instructions",
                value: joinLines(
                  pkg.implementationAssets.developerRemediationInstructions,
                ),
              },
            ]}
          />

          <SeoWebsitePagesAnalyzedSection
            inventory={pkg.websitePagesAnalyzed}
          />

          <p className="text-xs leading-6 text-white/35">{pkg.disclaimer}</p>
        </div>
      ) : null}
    </main>
  );
}
