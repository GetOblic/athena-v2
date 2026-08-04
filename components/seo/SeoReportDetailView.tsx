"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SeoReportHeaderDeleteButton } from "@/components/seo/SeoReportHeaderDeleteButton";
import { SeoReportSection } from "@/components/seo/SeoReportSection";
import { SeoReportStatusPanel } from "@/components/seo/SeoReportStatusPanel";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicSeoReportDetail } from "@/services/seo/seoReportPublic";

type SeoReportDetailViewProps = {
  report: PublicSeoReportDetail;
};

function joinLines(values: string[]): string {
  return values.join("\n");
}

export function SeoReportDetailView({ report }: SeoReportDetailViewProps) {
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg = report.package;

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
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            SEO Intelligence
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
        <div className="space-y-6">
          <SeoReportSection
            title="Executive SEO Assessment"
            eyebrow="1"
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
              { label: "Summary", value: pkg.executiveAssessment.summary },
            ]}
          />

          <SeoReportSection
            title="Content Coverage Analysis"
            eyebrow="2"
            fields={[
              {
                label: "Well-covered services",
                value: joinLines(pkg.contentCoverage.wellCoveredServices),
              },
              {
                label: "Weakly covered services",
                value: joinLines(pkg.contentCoverage.weaklyCoveredServices),
              },
              {
                label: "Missing services",
                value: joinLines(pkg.contentCoverage.missingServices),
              },
              {
                label: "Missing customer questions",
                value: joinLines(pkg.contentCoverage.missingCustomerQuestions),
              },
              {
                label: "Missing trust content",
                value: joinLines(pkg.contentCoverage.missingTrustContent),
              },
              {
                label: "Missing educational content",
                value: joinLines(pkg.contentCoverage.missingEducationalContent),
              },
              {
                label: "Missing conversion content",
                value: joinLines(pkg.contentCoverage.missingConversionContent),
              },
              { label: "Analysis", value: pkg.contentCoverage.analysis },
              {
                label: "Athena evidence",
                value: joinLines(pkg.contentCoverage.athenaEvidence),
              },
            ]}
          />

          <SeoReportSection
            title="Customer Intent Analysis"
            eyebrow="3"
            fields={[
              {
                label: "Represented intents",
                value: joinLines(pkg.customerIntent.representedIntents),
              },
              {
                label: "Buyer intent summary",
                value: pkg.customerIntent.buyerIntentSummary,
              },
              {
                label: "Pain point gaps",
                value: joinLines(pkg.customerIntent.painPointGaps),
              },
              ...pkg.customerIntent.missingIntents.flatMap((gap, index) => [
                {
                  label: `Missing intent ${index + 1}`,
                  value: gap.intent,
                },
                {
                  label: `Missing intent ${index + 1} source`,
                  value: gap.source,
                },
                {
                  label: `Missing intent ${index + 1} website gap`,
                  value: gap.websiteGap,
                },
                {
                  label: `Missing intent ${index + 1} recommendation`,
                  value: gap.recommendation,
                },
              ]),
              {
                label: "Athena evidence",
                value: joinLines(pkg.customerIntent.athenaEvidence),
              },
            ]}
          />

          <SeoReportSection
            title="Commercial Opportunity Analysis"
            eyebrow="4"
            fields={[
              {
                label: "Summary",
                value: pkg.commercialOpportunities.summary,
              },
              ...pkg.commercialOpportunities.opportunities.flatMap(
                (opportunity, index) => [
                  {
                    label: `Opportunity ${index + 1} type`,
                    value: opportunity.contentType,
                  },
                  {
                    label: `Opportunity ${index + 1} title`,
                    value: opportunity.title,
                  },
                  {
                    label: `Opportunity ${index + 1} rationale`,
                    value: opportunity.rationale,
                  },
                  {
                    label: `Opportunity ${index + 1} expected impact`,
                    value: opportunity.expectedImpact,
                  },
                  {
                    label: `Opportunity ${index + 1} evidence`,
                    value: joinLines(opportunity.athenaEvidence),
                  },
                ],
              ),
            ]}
          />

          <SeoReportSection
            title="Trust & Authority Analysis"
            eyebrow="5"
            fields={[
              {
                label: "Trust signals",
                value: pkg.trustAndAuthority.trustSignals,
              },
              {
                label: "Testimonials",
                value: pkg.trustAndAuthority.testimonials,
              },
              {
                label: "Case studies",
                value: pkg.trustAndAuthority.caseStudies,
              },
              {
                label: "Expert positioning",
                value: pkg.trustAndAuthority.expertPositioning,
              },
              {
                label: "Authority messaging",
                value: pkg.trustAndAuthority.authorityMessaging,
              },
              {
                label: "Differentiation",
                value: pkg.trustAndAuthority.differentiation,
              },
              {
                label: "Calls to action",
                value: pkg.trustAndAuthority.callsToAction,
              },
              {
                label: "Consistency",
                value: pkg.trustAndAuthority.consistency,
              },
              {
                label: "Recommendations",
                value: joinLines(pkg.trustAndAuthority.recommendations),
              },
              {
                label: "Athena evidence",
                value: joinLines(pkg.trustAndAuthority.athenaEvidence),
              },
            ]}
          />

          <SeoReportSection
            title="90-Day SEO Roadmap"
            eyebrow="6"
            fields={[
              {
                label: "Overview",
                value: pkg.ninetyDayRoadmap.overview,
              },
              ...pkg.ninetyDayRoadmap.items.flatMap((item, index) => [
                {
                  label: `Item ${index + 1} priority`,
                  value: item.priority,
                },
                {
                  label: `Item ${index + 1} recommendation`,
                  value: item.recommendation,
                },
                {
                  label: `Item ${index + 1} reason`,
                  value: item.reason,
                },
                {
                  label: `Item ${index + 1} expected impact`,
                  value: item.expectedBusinessImpact,
                },
                {
                  label: `Item ${index + 1} effort`,
                  value: item.estimatedEffort,
                },
                {
                  label: `Item ${index + 1} evidence`,
                  value: joinLines(item.athenaEvidence),
                },
              ]),
              { label: "Disclaimer", value: pkg.disclaimer },
            ]}
          />
        </div>
      ) : null}
    </main>
  );
}
