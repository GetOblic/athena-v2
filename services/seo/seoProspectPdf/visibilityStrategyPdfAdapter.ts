import {
  computeContentCoverageScoreFromPackage,
} from "@/lib/seo/seoScorePresentation";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type {
  SeoIntelligencePackage,
  SeoRoadmapEffort,
  SeoRoadmapPriority,
} from "@/services/seo/seoReportTypes";
import { prospectSafeDisclaimerBody } from "@/services/seo/seoProspectPdf/seoProspectPdfDisclaimer";
import type {
  SeoProspectPdfBlock,
  SeoProspectPdfDocumentModel,
  SeoProspectPdfField,
  SeoProspectPdfListVariant,
  SeoProspectPdfPriorityTone,
  SeoProspectPdfSection,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

function text(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function fields(
  entries: Array<[string, string | null | undefined]>,
): SeoProspectPdfField[] {
  return entries
    .map(([label, value]) => ({ label, value: text(value) }))
    .filter((entry) => entry.value);
}

function roadmapTone(priority: SeoRoadmapPriority): SeoProspectPdfPriorityTone {
  if (priority === "P0") return "critical";
  if (priority === "P1") return "high";
  if (priority === "P2") return "medium";
  return "low";
}

function roadmapPriorityLabel(
  priority: SeoRoadmapPriority,
  messages: TenantMessages,
): string {
  const copy = messages.seo.detail;
  if (priority === "P0") return copy.priorityHighest;
  if (priority === "P1") return copy.priorityHigh;
  if (priority === "P2") return copy.priorityMedium;
  return copy.priorityLower;
}

function effortLabel(
  effort: SeoRoadmapEffort,
  messages: TenantMessages,
): string {
  return messages.seo.effort[effort] ?? effort;
}

function categoryList(
  variant: SeoProspectPdfListVariant,
  label: string,
  items: string[],
): SeoProspectPdfBlock[] {
  const usable = items.map((item) => text(item)).filter(Boolean);
  if (!usable.length) return [];
  return [{ type: "categoryList", variant, label, items: usable }];
}

function labeledNarrative(
  label: string,
  value: string | null | undefined,
): SeoProspectPdfBlock[] {
  const body = text(value);
  if (!body) return [];
  return [
    { type: "subsection", title: label },
    { type: "paragraph", text: body },
  ];
}

export function buildVisibilityStrategyPdfModel(input: {
  pkg: SeoIntelligencePackage;
  messages: TenantMessages;
  language: OrganizationLanguage;
  reportDateIso: string;
}): SeoProspectPdfDocumentModel {
  const { pkg, messages, language, reportDateIso } = input;
  const copy = messages.seo;
  const pages = pkg.websitePagesAnalyzed;
  const score = computeContentCoverageScoreFromPackage(pkg);
  const lead =
    text(pkg.executiveAssessment.summary) ||
    text(pkg.executiveAssessment.overallAssessment);
  const capturedAt = pages.scrapedAt
    ? formatTenantDate(pages.scrapedAt, language)
    : "";

  const sections: SeoProspectPdfSection[] = [
    {
      id: "opening",
      title: copy.prospectPdf.executiveSummary,
      role: "snapshot",
      blocks: lead ? [{ type: "lede", text: lead }] : [],
    },
    {
      id: "score",
      title: copy.visibility.contentCoverageScore,
      role: "snapshot",
      blocks: [
        {
          type: "score",
          label: copy.visibility.contentCoverageScore,
          value:
            score == null
              ? copy.visibility.scoreUnavailable
              : `${score}`,
          help: copy.prospectPdf.scoreBasedOnAthena,
          max: 100,
        },
        { type: "note", text: copy.visibility.contentCoverageScoreHelp },
      ],
    },
    {
      id: "executive",
      title: copy.detail.executiveAssessment,
      blocks: [
        ...labeledNarrative(
          copy.detail.overallAssessment,
          pkg.executiveAssessment.overallAssessment,
        ),
        ...(text(pkg.executiveAssessment.seoReadiness)
          ? [
              {
                type: "callout" as const,
                tone: "neutral" as const,
                label: copy.detail.seoReadiness,
                text: pkg.executiveAssessment.seoReadiness,
              },
            ]
          : []),
        ...(text(pkg.executiveAssessment.businessVisibilityAssessment)
          ? [
              {
                type: "callout" as const,
                tone: "neutral" as const,
                label: copy.detail.businessVisibility,
                text: pkg.executiveAssessment.businessVisibilityAssessment,
              },
            ]
          : []),
        ...categoryList(
          "positive",
          copy.detail.strengths,
          pkg.executiveAssessment.strengths,
        ),
        ...categoryList(
          "attention",
          copy.detail.weaknesses,
          pkg.executiveAssessment.weaknesses,
        ),
      ],
    },
    {
      id: "roadmap",
      title: copy.prospectPdf.recommendedImprovements,
      blocks: [
        ...(text(pkg.ninetyDayRoadmap.overview)
          ? [
              {
                type: "paragraph" as const,
                text: pkg.ninetyDayRoadmap.overview,
              },
            ]
          : []),
        ...pkg.ninetyDayRoadmap.items.map((item) => ({
          type: "priorityItem" as const,
          tone: roadmapTone(item.priority),
          eyebrow: roadmapPriorityLabel(item.priority, messages),
          title: item.recommendation,
          entries: fields([
            [copy.prospectPdf.reason, item.reason],
            [copy.detail.expectedBusinessImpact, item.expectedBusinessImpact],
            [
              copy.prospectPdf.estimatedEffort,
              effortLabel(item.estimatedEffort, messages),
            ],
          ]),
        })),
      ],
    },
    {
      id: "coverage",
      title: copy.detail.contentCoverageV2,
      blocks: [
        ...(text(pkg.contentCoverage.analysis)
          ? [{ type: "paragraph" as const, text: pkg.contentCoverage.analysis }]
          : []),
        ...categoryList(
          "positive",
          copy.detail.wellCovered,
          pkg.contentCoverage.wellCoveredServices,
        ),
        ...categoryList(
          "opportunity",
          copy.detail.weaklyCovered,
          pkg.contentCoverage.weaklyCoveredServices,
        ),
        ...categoryList(
          "missing",
          copy.detail.missingServices,
          pkg.contentCoverage.missingServices,
        ),
        ...categoryList(
          "missing",
          copy.detail.missingCustomerQuestions,
          pkg.contentCoverage.missingCustomerQuestions,
        ),
        ...categoryList(
          "missing",
          copy.detail.missingTrustContent,
          pkg.contentCoverage.missingTrustContent,
        ),
        ...categoryList(
          "missing",
          copy.detail.missingEducationalContent,
          pkg.contentCoverage.missingEducationalContent,
        ),
        ...categoryList(
          "missing",
          copy.detail.missingConversionContent,
          pkg.contentCoverage.missingConversionContent,
        ),
      ],
    },
    {
      id: "intent",
      title: copy.detail.customerIntentV2,
      blocks: [
        ...(text(pkg.customerIntent.buyerIntentSummary)
          ? [
              {
                type: "paragraph" as const,
                text: pkg.customerIntent.buyerIntentSummary,
              },
            ]
          : []),
        ...categoryList(
          "positive",
          copy.detail.representedIntents,
          pkg.customerIntent.representedIntents,
        ),
        ...categoryList(
          "attention",
          copy.detail.painPointGaps,
          pkg.customerIntent.painPointGaps,
        ),
        ...pkg.customerIntent.missingIntents.map((gap) => ({
          type: "pageCard" as const,
          variant: "opportunity" as const,
          title: gap.intent,
          entries: fields([
            [copy.prospectPdf.source, gap.source],
            [copy.prospectPdf.websiteGap, gap.websiteGap],
            [copy.prospectPdf.recommendation, gap.recommendation],
          ]),
        })),
      ],
    },
    {
      id: "commercial",
      title: copy.detail.commercialOpportunitiesV2,
      blocks: [
        ...(text(pkg.commercialOpportunities.summary)
          ? [
              {
                type: "paragraph" as const,
                text: pkg.commercialOpportunities.summary,
              },
            ]
          : []),
        ...pkg.commercialOpportunities.opportunities.map((opportunity) => ({
          type: "pageCard" as const,
          variant: "opportunity" as const,
          title: opportunity.title,
          badge: text(opportunity.contentType) || undefined,
          entries: fields([
            [copy.prospectPdf.rationale, opportunity.rationale],
            [copy.prospectPdf.expectedImpact, opportunity.expectedImpact],
          ]),
        })),
      ],
    },
    {
      id: "trust",
      title: copy.detail.trustAndAuthorityV2,
      blocks: [
        ...labeledNarrative(
          copy.detail.trustSignals,
          pkg.trustAndAuthority.trustSignals,
        ),
        ...labeledNarrative(
          copy.detail.testimonials,
          pkg.trustAndAuthority.testimonials,
        ),
        ...labeledNarrative(
          copy.detail.caseStudies,
          pkg.trustAndAuthority.caseStudies,
        ),
        ...labeledNarrative(
          copy.detail.expertPositioning,
          pkg.trustAndAuthority.expertPositioning,
        ),
        ...labeledNarrative(
          copy.detail.authorityMessaging,
          pkg.trustAndAuthority.authorityMessaging,
        ),
        ...labeledNarrative(
          copy.detail.differentiation,
          pkg.trustAndAuthority.differentiation,
        ),
        ...labeledNarrative(
          copy.detail.callsToAction,
          pkg.trustAndAuthority.callsToAction,
        ),
        ...labeledNarrative(
          copy.detail.consistency,
          pkg.trustAndAuthority.consistency,
        ),
        ...categoryList(
          "opportunity",
          copy.detail.recommendedImprovements,
          pkg.trustAndAuthority.recommendations,
        ),
      ],
    },
    {
      id: "pages",
      title: copy.prospectPdf.websitePagesAnalyzed,
      role: "appendix",
      eyebrow: copy.prospectPdf.appendix,
      blocks: pages.pages.map((page) => ({
        type: "pageCard" as const,
        variant: "inventory" as const,
        title: text(page.title) || copy.prospectPdf.untitledPage,
        entries: fields([
          [copy.prospectPdf.url, page.url],
          [copy.prospectPdf.pageType, page.pageType],
        ]),
      })),
    },
    {
      id: "disclaimer",
      title: copy.prospectPdf.disclaimerHeading,
      role: "methodology",
      blocks: [
        { type: "note", text: copy.prospectPdf.disclaimerWrapper },
        {
          type: "paragraph",
          text: prospectSafeDisclaimerBody({
            persisted: pkg.disclaimer,
            messages,
            generationType: "intelligence",
          }),
        },
      ],
    },
  ];

  return {
    lens: copy.lenses.intelligence,
    generationType: "intelligence",
    analyzedDomain: pages.sourceUrl,
    reportDateIso,
    reportDateLabel: formatTenantDate(reportDateIso, language),
    capturedAtLabel: capturedAt || null,
    title: text(pkg.reportName) || copy.lenses.intelligence,
    sections: sections.map((section) => ({
      ...section,
      blocks: section.blocks.filter((block) => {
        if (block.type === "fields" || block.type === "metricRows") {
          return block.entries.length > 0;
        }
        if (block.type === "bullets" || block.type === "categoryList") {
          return block.items.length > 0;
        }
        if (
          block.type === "paragraph" ||
          block.type === "lede" ||
          block.type === "note" ||
          block.type === "code" ||
          block.type === "callout"
        ) {
          return Boolean(text("text" in block ? block.text : ""));
        }
        if (block.type === "subsection") return Boolean(text(block.title));
        return true;
      }),
    })),
  };
}

export function visibilityStrategyPdfContainsForbidden(textCorpus: string): boolean {
  const haystack = textCorpus.toLowerCase();
  return (
    haystack.includes("athenaevidence") ||
    haystack.includes("signals athena used") ||
    haystack.includes("brief_json") ||
    haystack.includes("futureactionkinds") ||
    haystack.includes("generation_stage")
  );
}
