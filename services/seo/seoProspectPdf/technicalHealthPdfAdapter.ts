import {
  computeTechnicalCompletenessScoreFromPackage,
} from "@/lib/seo/seoScorePresentation";
import { formatTenantDate } from "@/lib/tenantI18n/format";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type {
  SeoTechnicalPackage,
  SeoTechnicalPageMetadataRecommendation,
  SeoTechnicalPriority,
  SeoWebsitePageAnalyzed,
} from "@/services/seo/seoReportTypes";
import { prospectSafeDisclaimerBody } from "@/services/seo/seoProspectPdf/seoProspectPdfDisclaimer";
import type {
  SeoProspectPdfBlock,
  SeoProspectPdfComparison,
  SeoProspectPdfDocumentModel,
  SeoProspectPdfField,
  SeoProspectPdfListVariant,
  SeoProspectPdfPageRecord,
  SeoProspectPdfPriorityTone,
  SeoProspectPdfSection,
} from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";
import { parseSeoProspectPdfPercent } from "@/services/seo/seoProspectPdf/seoProspectPdfText";

function text(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

function fields(
  entries: Array<[string, string | number | null | undefined]>,
): SeoProspectPdfField[] {
  return entries
    .map(([label, value]) => ({ label, value: text(value) }))
    .filter((entry) => entry.value);
}

function percentLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `${Math.round(value)}%`;
}

function priorityTone(
  priority: SeoTechnicalPriority,
): SeoProspectPdfPriorityTone {
  if (priority === "Critical") return "critical";
  if (priority === "High") return "high";
  return "medium";
}

function priorityLabel(
  priority: SeoTechnicalPriority,
  messages: TenantMessages,
): string {
  if (priority === "Critical") return messages.seo.technicalPriority.critical;
  if (priority === "High") return messages.seo.technicalPriority.high;
  return messages.seo.technicalPriority.improvement;
}

function listSection(
  title: string,
  items: string[],
  variant: SeoProspectPdfListVariant = "neutral",
): SeoProspectPdfSection["blocks"] {
  const usable = items.map((item) => text(item)).filter(Boolean);
  if (!usable.length) return [];
  return [{ type: "categoryList", variant, label: title, items: usable }];
}

function labeledNarrative(
  label: string,
  value: string | number | null | undefined,
): SeoProspectPdfBlock[] {
  const body = text(value);
  if (!body) return [];
  return [
    { type: "subsection", title: label },
    { type: "paragraph", text: body },
  ];
}

function metricRow(
  label: string,
  value: string,
): { label: string; value: string; percent: number | null } | null {
  if (!value) return null;
  return { label, value, percent: parseSeoProspectPdfPercent(value) };
}

function normalizePdfUrlKey(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function inventoryByUrl(
  pages: SeoWebsitePageAnalyzed[],
): Map<string, SeoWebsitePageAnalyzed> {
  const map = new Map<string, SeoWebsitePageAnalyzed>();
  for (const page of pages) {
    const key = normalizePdfUrlKey(page.url);
    if (key) map.set(key, page);
  }
  return map;
}

function comparisonField(
  label: string,
  current: string | number | null | undefined,
  recommended: string | number | null | undefined,
): SeoProspectPdfComparison | null {
  const currentText = text(current);
  const recommendedText = text(recommended);
  if (!currentText && !recommendedText) return null;
  return {
    label,
    ...(currentText ? { current: currentText } : {}),
    ...(recommendedText ? { recommended: recommendedText } : {}),
  };
}

function buildTechnicalAppendixRecords(input: {
  pageMetadata: SeoTechnicalPageMetadataRecommendation[];
  pages: SeoWebsitePageAnalyzed[];
  untitledPage: string;
  titleLabel: string;
  descriptionLabel: string;
  h1Label: string;
}): SeoProspectPdfPageRecord[] {
  const inventory = inventoryByUrl(input.pages);
  const source: SeoTechnicalPageMetadataRecommendation[] =
    input.pageMetadata.length > 0
      ? input.pageMetadata
      : input.pages.map((page) => ({
          url: page.url,
          currentTitle: page.title,
          recommendedTitle: null,
          currentDescription: null,
          recommendedDescription: null,
          h1Observation: null,
          recommendedH1: null,
          canonicalObservation: null,
          robotsObservation: null,
          httpStatus: null,
          issueFlags: [],
        }));

  return source.map((page) => {
    const match = inventory.get(normalizePdfUrlKey(page.url));
    const title =
      text(match?.title) || text(page.currentTitle) || input.untitledPage;
    const comparisons = [
      comparisonField(input.titleLabel, page.currentTitle, page.recommendedTitle),
      comparisonField(
        input.descriptionLabel,
        page.currentDescription,
        page.recommendedDescription,
      ),
      comparisonField(input.h1Label, page.h1Observation, page.recommendedH1),
    ].filter((entry): entry is SeoProspectPdfComparison => Boolean(entry));

    return {
      type: "pageRecord",
      title,
      url: text(page.url),
      meta: [
        text(match?.pageType),
        text(page.httpStatus),
        text(page.robotsObservation),
        text(page.canonicalObservation),
      ].filter(Boolean),
      issues: (page.issueFlags ?? []).map((flag) => text(flag)).filter(Boolean),
      comparisons,
    };
  });
}

export function buildTechnicalHealthPdfModel(input: {
  pkg: SeoTechnicalPackage;
  messages: TenantMessages;
  language: OrganizationLanguage;
  reportDateIso: string;
}): SeoProspectPdfDocumentModel {
  const { pkg, messages, language, reportDateIso } = input;
  const copy = messages.seo;
  const pages = pkg.websitePagesAnalyzed;
  const coverage = pkg.technicalCoverage.coverage;
  const score = computeTechnicalCompletenessScoreFromPackage(pkg);
  const lead =
    text(pkg.executiveEvaluation.summary) ||
    text(pkg.executiveEvaluation.overallAssessment);
  const capturedAt = pages.scrapedAt
    ? formatTenantDate(pages.scrapedAt, language)
    : "";
  const assets = pkg.implementationAssets;

  const appendixRecords = buildTechnicalAppendixRecords({
    pageMetadata: pkg.pageMetadata,
    pages: pages.pages,
    untitledPage: copy.prospectPdf.untitledPage,
    titleLabel: copy.prospectPdf.title,
    descriptionLabel: copy.prospectPdf.currentDescription,
    h1Label: copy.prospectPdf.h1,
  });

  const sections: SeoProspectPdfSection[] = [
    {
      id: "opening",
      number: 1,
      title: copy.prospectPdf.executiveSummary,
      role: "snapshot",
      blocks: lead ? [{ type: "lede", text: lead }] : [],
    },
    {
      id: "completeness",
      number: 2,
      title: copy.visibility.technicalCompleteness,
      role: "snapshot",
      blocks: [
        {
          type: "score",
          label: copy.visibility.technicalCompleteness,
          value:
            score == null
              ? copy.visibility.scoreUnavailable
              : `${score}`,
          help: copy.prospectPdf.scoreBasedOnAthena,
          max: 100,
        },
        { type: "note", text: copy.visibility.technicalCompletenessHelp },
        {
          type: "metricRows",
          entries: [
            metricRow(
              copy.prospectPdf.coverageTitles,
              percentLabel(coverage.titleCoveragePercent),
            ),
            metricRow(
              copy.prospectPdf.coverageDescriptions,
              percentLabel(coverage.descriptionCoveragePercent),
            ),
            metricRow(
              copy.prospectPdf.coverageH1,
              percentLabel(coverage.h1CoveragePercent),
            ),
            metricRow(
              copy.prospectPdf.coverageCanonical,
              percentLabel(coverage.canonicalCoveragePercent),
            ),
            metricRow(
              copy.prospectPdf.coverageSchema,
              percentLabel(coverage.schemaCoveragePercent),
            ),
            metricRow(
              copy.prospectPdf.coverageAlt,
              percentLabel(coverage.imageAltCoveragePercent),
            ),
          ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        },
      ],
    },
    {
      id: "executive",
      number: 3,
      title: copy.technical.executiveEvaluation,
      blocks: [
        ...labeledNarrative(
          copy.technical.overallAssessment,
          pkg.executiveEvaluation.overallAssessment,
        ),
        ...listSection(
          copy.technical.strengths,
          pkg.executiveEvaluation.strengths,
          "positive",
        ),
        ...listSection(
          copy.technical.criticalIssues,
          pkg.executiveEvaluation.criticalIssues,
          "attention",
        ),
        ...listSection(
          copy.technical.warnings,
          pkg.executiveEvaluation.warnings,
          "opportunity",
        ),
        ...listSection(
          copy.technical.remediationPriorities,
          pkg.executiveEvaluation.remediationPriorities,
          "missing",
        ),
      ],
    },
    {
      id: "action-plan",
      number: 4,
      title: copy.prospectPdf.recommendedTechnicalImprovements,
      blocks: [
        ...(text(pkg.actionPlan.overview)
          ? [{ type: "paragraph" as const, text: pkg.actionPlan.overview }]
          : []),
        ...pkg.actionPlan.items.map((item) => ({
          type: "priorityItem" as const,
          tone: priorityTone(item.priority),
          eyebrow: priorityLabel(item.priority, messages),
          title: item.title,
          entries: fields([
            [copy.technical.affectedPages, item.affectedPages.join("\n")],
            [copy.detail.evidence, item.evidence],
            [copy.prospectPdf.reason, item.reason],
            [copy.technical.recommendedAction, item.recommendedAction],
          ]),
        })),
      ],
    },
    {
      id: "found",
      number: 5,
      title: copy.prospectPdf.whatAthenaFound,
      blocks: [
        {
          type: "paragraph",
          text: interpolateTenantMessage(
            copy.technical.pagesAnalyzedFromEvidence,
            { count: pkg.technicalCoverage.analyzedPageCount },
          ),
        },
        { type: "note", text: copy.technical.coverageScope },
        {
          type: "metricRows",
          entries: [
            metricRow(
              copy.technical.pagesWithTitle,
              percentLabel(coverage.titleCoveragePercent),
            ),
            metricRow(
              copy.technical.pagesWithDescription,
              percentLabel(coverage.descriptionCoveragePercent),
            ),
            metricRow(
              copy.technical.pagesWithMainHeading,
              percentLabel(coverage.h1CoveragePercent),
            ),
            metricRow(
              copy.technical.pagesWithPreferredUrl,
              percentLabel(coverage.canonicalCoveragePercent),
            ),
            metricRow(
              copy.technical.pagesWithStructuredInfo,
              percentLabel(coverage.schemaCoveragePercent),
            ),
            metricRow(
              copy.technical.imagesWithTextDescription,
              percentLabel(coverage.imageAltCoveragePercent),
            ),
          ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        },
      ],
    },
    {
      id: "architecture",
      number: 7,
      title: copy.technical.siteArchitectureV2,
      blocks: [
        ...(text(pkg.siteArchitecture.summary)
          ? [{ type: "paragraph" as const, text: pkg.siteArchitecture.summary }]
          : []),
        ...listSection(
          copy.technical.architectureFindings,
          pkg.siteArchitecture.architectureFindings,
        ),
        ...listSection(
          copy.technical.linkingEvidence,
          pkg.siteArchitecture.linkingEvidence,
        ),
        ...listSection(
          copy.technical.weaklyLinkedCandidates,
          pkg.siteArchitecture.weaklyLinkedCandidates,
        ),
        ...pkg.siteArchitecture.recommendedLinks.map((link) => ({
          type: "pageCard" as const,
          variant: "link" as const,
          title: copy.technical.recommendedLinks,
          entries: fields([
            [copy.prospectPdf.from, link.fromUrl],
            [copy.prospectPdf.to, link.toUrl],
            [copy.prospectPdf.recommendedAnchor, link.recommendedAnchor],
            [copy.prospectPdf.rationale, link.rationale],
          ]),
        })),
      ],
    },
    {
      id: "html",
      number: 8,
      title: copy.technical.contentHtmlFindingsV2,
      blocks: [
        ...(text(pkg.contentHtmlFindings.summary)
          ? [
              {
                type: "paragraph" as const,
                text: pkg.contentHtmlFindings.summary,
              },
            ]
          : []),
        ...listSection(
          copy.technical.headingFindings,
          pkg.contentHtmlFindings.headingFindings,
        ),
        ...listSection(
          copy.technical.metadataFindings,
          pkg.contentHtmlFindings.metadataFindings,
        ),
        ...listSection(
          copy.technical.contentSizeFindings,
          pkg.contentHtmlFindings.contentSizeFindings,
        ),
        ...listSection(
          copy.technical.structuralRecommendations,
          pkg.contentHtmlFindings.structuralRecommendations,
        ),
      ],
    },
    {
      id: "schema",
      number: 9,
      title: copy.technical.structuredDataV2,
      blocks: [
        ...(text(pkg.structuredData.summary)
          ? [{ type: "paragraph" as const, text: pkg.structuredData.summary }]
          : []),
        ...(text(pkg.structuredData.missingOpportunityAssessment)
          ? [
              {
                type: "fields" as const,
                entries: fields([
                  [
                    copy.technical.opportunityAssessment,
                    pkg.structuredData.missingOpportunityAssessment,
                  ],
                ]),
              },
            ]
          : []),
        ...listSection(
          copy.technical.detectedSchemaEvidence,
          pkg.structuredData.detectedSchemaEvidence,
        ),
        ...listSection(
          copy.technical.recommendedSchemaTypes,
          pkg.structuredData.recommendedSchemaTypes,
        ),
        ...listSection(
          copy.technical.implementationGuidance,
          pkg.structuredData.implementationGuidance,
        ),
      ],
    },
    {
      id: "images",
      number: 10,
      title: copy.technical.imageSeoV2,
      blocks: [
        ...(text(pkg.imageSeo.summary)
          ? [{ type: "paragraph" as const, text: pkg.imageSeo.summary }]
          : []),
        ...(text(pkg.imageSeo.altCoverageSummary)
          ? [
              {
                type: "fields" as const,
                entries: fields([
                  [copy.technical.altCoverage, pkg.imageSeo.altCoverageSummary],
                ]),
              },
            ]
          : []),
        ...listSection(
          copy.technical.missingAltFindings,
          pkg.imageSeo.missingAltFindings,
        ),
        ...listSection(
          copy.technical.remediationGuidance,
          pkg.imageSeo.remediationGuidance,
        ),
      ],
    },
    {
      id: "crawl",
      number: 11,
      title: copy.technical.crawlFindingsV2,
      blocks: [
        ...(text(pkg.crawlFindings.summary)
          ? [{ type: "paragraph" as const, text: pkg.crawlFindings.summary }]
          : []),
        ...listSection(
          copy.technical.statusFindings,
          pkg.crawlFindings.statusFindings,
        ),
        ...listSection(
          copy.technical.redirectFindings,
          pkg.crawlFindings.redirectFindings,
        ),
        ...listSection(
          copy.technical.canonicalFindings,
          pkg.crawlFindings.canonicalFindings,
        ),
        ...listSection(
          copy.technical.robotsFindings,
          pkg.crawlFindings.robotsFindings,
        ),
      ],
    },
    {
      id: "implementation",
      number: 12,
      title: copy.prospectPdf.implementationNotes,
      role: "notes",
      blocks: [
        ...(text(assets.metadataTableNotes)
          ? [
              {
                type: "fields" as const,
                entries: fields([
                  [copy.prospectPdf.metadataNotes, assets.metadataTableNotes],
                ]),
              },
            ]
          : []),
        ...listSection(
          copy.technical.headingRecommendations,
          assets.headingRecommendations,
        ),
        ...listSection(copy.technical.internalLinkPlan, assets.internalLinkPlan),
        ...listSection(
          copy.technical.schemaRecommendations,
          assets.schemaRecommendations,
        ),
        ...listSection(
          copy.technical.redirectRecommendations,
          assets.redirectRecommendations,
        ),
        ...listSection(
          copy.technical.developerRemediation,
          assets.developerRemediationInstructions,
        ),
        ...pkg.structuredData.exampleSnippets.flatMap((snippet) =>
          text(snippet)
            ? [
                {
                  type: "paragraph" as const,
                  text: copy.prospectPdf.exampleSnippets,
                },
                { type: "code" as const, text: snippet },
              ]
            : [],
        ),
      ],
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
            generationType: "technical",
          }),
        },
      ],
    },
    ...(appendixRecords.length
      ? [
          {
            id: "page-analysis",
            title: copy.prospectPdf.pageLevelTechnicalAnalysis,
            role: "appendix" as const,
            eyebrow: copy.prospectPdf.appendix,
            subtitle: interpolateTenantMessage(
              copy.visibility.pagesAnalyzedContext,
              { count: appendixRecords.length },
            ),
            blocks: [
              {
                type: "note" as const,
                text: copy.prospectPdf.pageLevelTechnicalAnalysisLead,
              },
              ...appendixRecords,
            ],
          },
        ]
      : []),
  ];

  return {
    lens: copy.lenses.technical,
    generationType: "technical",
    analyzedDomain: pages.sourceUrl,
    reportDateIso,
    reportDateLabel: formatTenantDate(reportDateIso, language),
    capturedAtLabel: capturedAt || null,
    title: text(pkg.reportName) || copy.lenses.technical,
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
        if (block.type === "pageRecord") {
          return Boolean(text(block.title) || text(block.url));
        }
        return true;
      }),
    })),
  };
}

export function technicalHealthPdfContainsForbidden(textCorpus: string): boolean {
  const haystack = textCorpus.toLowerCase();
  return (
    haystack.includes("athenaevidence") ||
    haystack.includes("signals athena used") ||
    haystack.includes("brief_json") ||
    haystack.includes("futureactionkinds") ||
    haystack.includes("generation_stage") ||
    haystack.includes("technicalcoverage.pages")
  );
}
