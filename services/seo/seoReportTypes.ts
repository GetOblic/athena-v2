/**
 * Organization-level SEO report types (Athena V19 Phase 1 + V23 Technical SEO).
 * SEO reports belong to the organization — never to Discussion/Prospect/Persona/EV.
 * Consumes existing Athena intelligence only; does not modify Deep Scrape policy.
 */

import type { SeoGenerationType } from "@/services/seo/seoGenerationType";
import type { SeoTechnicalDeterministicEvidence } from "@/services/seo/seoTechnicalAnalyzer";

export type { SeoGenerationType } from "@/services/seo/seoGenerationType";

export const SEO_REPORT_STATUSES = [
  "Queued",
  "Processing",
  "Ready",
  "Processing Failed",
] as const;

export type SeoReportStatus = (typeof SEO_REPORT_STATUSES)[number];

export const SEO_REPORT_GENERATION_STAGES = [
  "assembling_context",
  "executive_assessment",
  "content_coverage",
  "customer_intent",
  "commercial_opportunities",
  "trust_and_authority",
  "ninety_day_roadmap",
  // Technical SEO stages (additive)
  "analyzing_technical_evidence",
  "technical_executive_evaluation",
  "technical_recommendations",
  "technical_action_plan",
  "validating",
  "completed",
  "failed",
] as const;

export type SeoReportGenerationStage =
  (typeof SEO_REPORT_GENERATION_STAGES)[number];

export type SeoReportBrief = {
  name?: string;
  guidance?: string;
  focusArea?: string;
  geography?: string;
  constraints?: string;
  /**
   * Discriminator persisted in brief_json.
   * Historical briefs without this field normalize to "intelligence".
   */
  generationType?: SeoGenerationType;
};

export type SeoReportBriefMode = "inferred" | "guided";

export type SeoExecutiveAssessment = {
  overallAssessment: string;
  strengths: string[];
  weaknesses: string[];
  seoReadiness: string;
  businessVisibilityAssessment: string;
  summary: string;
};

export type SeoContentCoverageAnalysis = {
  wellCoveredServices: string[];
  weaklyCoveredServices: string[];
  missingServices: string[];
  missingCustomerQuestions: string[];
  missingTrustContent: string[];
  missingEducationalContent: string[];
  missingConversionContent: string[];
  analysis: string;
  athenaEvidence: string[];
};

export type SeoCustomerIntentGap = {
  intent: string;
  source: string;
  websiteGap: string;
  recommendation: string;
};

export type SeoCustomerIntentAnalysis = {
  representedIntents: string[];
  missingIntents: SeoCustomerIntentGap[];
  painPointGaps: string[];
  buyerIntentSummary: string;
  athenaEvidence: string[];
};

export type SeoCommercialOpportunity = {
  contentType: string;
  title: string;
  rationale: string;
  expectedImpact: string;
  athenaEvidence: string[];
};

export type SeoCommercialOpportunityAnalysis = {
  opportunities: SeoCommercialOpportunity[];
  summary: string;
};

export type SeoTrustAuthorityAnalysis = {
  trustSignals: string;
  testimonials: string;
  caseStudies: string;
  expertPositioning: string;
  authorityMessaging: string;
  differentiation: string;
  callsToAction: string;
  consistency: string;
  recommendations: string[];
  athenaEvidence: string[];
};

export type SeoRoadmapPriority = "P0" | "P1" | "P2" | "P3";

export type SeoRoadmapEffort = "low" | "medium" | "high";

export type SeoRoadmapItem = {
  priority: SeoRoadmapPriority;
  recommendation: string;
  reason: string;
  expectedBusinessImpact: string;
  estimatedEffort: SeoRoadmapEffort;
  athenaEvidence: string[];
};

export type SeoNinetyDayRoadmap = {
  overview: string;
  items: SeoRoadmapItem[];
};

/**
 * Immutable snapshot of Deep Website Intelligence pages used as SEO evidence.
 * Persisted inside package_json — no separate DB column / migration.
 * Ordering matches website_intelligence.pages[] at generation time.
 */
export type SeoWebsitePageAnalyzed = {
  title: string | null;
  url: string;
  pageType: string | null;
};

export type SeoWebsitePagesAnalyzed = {
  pagesAnalyzedCount: number;
  sourceUrl: string | null;
  scrapedAt: string | null;
  pages: SeoWebsitePageAnalyzed[];
};

export const SEO_WEBSITE_PAGES_ANALYZED_MAX = 50 as const;

export const SEO_REPORT_DISCLAIMER =
  "This SEO Intelligence report is inferred from Athena's organization intelligence (Brain, Deep Website Intelligence, Personas, Communities, Discussions, and Opportunities). It is not based on Search Console, Analytics, Semrush, Ahrefs, PageSpeed, crawl technical audits, or live keyword databases." as const;

export const SEO_TECHNICAL_REPORT_DISCLAIMER =
  "This Technical SEO report is inferred from Athena Website Intelligence technical evidence and deterministic on-page analysis. It is not based on Search Console, Analytics, Semrush, Ahrefs, PageSpeed, Core Web Vitals lab data, backlink indexes, or live keyword databases." as const;

export type SeoIntelligencePackage = {
  /** Present on newly generated packages; historical packages omit this and normalize to intelligence. */
  generationType?: "intelligence";
  reportName: string;
  briefMode: SeoReportBriefMode;
  executiveAssessment: SeoExecutiveAssessment;
  contentCoverage: SeoContentCoverageAnalysis;
  customerIntent: SeoCustomerIntentAnalysis;
  commercialOpportunities: SeoCommercialOpportunityAnalysis;
  trustAndAuthority: SeoTrustAuthorityAnalysis;
  ninetyDayRoadmap: SeoNinetyDayRoadmap;
  disclaimer: string;
  /** Snapshot of deep_v1 pages used at generation; empty when unavailable. */
  websitePagesAnalyzed: SeoWebsitePagesAnalyzed;
};

export type SeoTechnicalPriority = "Critical" | "High" | "Improvement";

export type SeoTechnicalExecutiveEvaluation = {
  overallAssessment: string;
  strengths: string[];
  criticalIssues: string[];
  warnings: string[];
  remediationPriorities: string[];
  summary: string;
};

export type SeoTechnicalPageMetadataRecommendation = {
  url: string;
  currentTitle: string | null;
  recommendedTitle: string | null;
  currentDescription: string | null;
  recommendedDescription: string | null;
  h1Observation: string | null;
  recommendedH1: string | null;
  canonicalObservation: string | null;
  robotsObservation: string | null;
};

export type SeoTechnicalInternalLinkRecommendation = {
  fromUrl: string;
  toUrl: string;
  recommendedAnchor: string;
  rationale: string;
};

export type SeoTechnicalArchitectureFindings = {
  architectureFindings: string[];
  linkingEvidence: string[];
  weaklyLinkedCandidates: string[];
  recommendedLinks: SeoTechnicalInternalLinkRecommendation[];
  summary: string;
};

export type SeoTechnicalContentHtmlFindings = {
  headingFindings: string[];
  metadataFindings: string[];
  contentSizeFindings: string[];
  structuralRecommendations: string[];
  summary: string;
};

export type SeoTechnicalSchemaFindings = {
  detectedSchemaEvidence: string[];
  missingOpportunityAssessment: string;
  recommendedSchemaTypes: string[];
  implementationGuidance: string[];
  exampleSnippets: string[];
  summary: string;
};

export type SeoTechnicalImageFindings = {
  altCoverageSummary: string;
  missingAltFindings: string[];
  remediationGuidance: string[];
  summary: string;
};

export type SeoTechnicalCrawlFindings = {
  statusFindings: string[];
  redirectFindings: string[];
  canonicalFindings: string[];
  robotsFindings: string[];
  summary: string;
};

export type SeoTechnicalActionItem = {
  priority: SeoTechnicalPriority;
  title: string;
  affectedPages: string[];
  evidence: string;
  reason: string;
  recommendedAction: string;
};

export type SeoTechnicalActionPlan = {
  overview: string;
  items: SeoTechnicalActionItem[];
};

export type SeoTechnicalImplementationAssets = {
  metadataTableNotes: string;
  headingRecommendations: string[];
  internalLinkPlan: string[];
  schemaRecommendations: string[];
  redirectRecommendations: string[];
  developerRemediationInstructions: string[];
};

export type SeoTechnicalPackage = {
  generationType: "technical";
  reportName: string;
  briefMode: SeoReportBriefMode;
  executiveEvaluation: SeoTechnicalExecutiveEvaluation;
  technicalCoverage: SeoTechnicalDeterministicEvidence;
  pageMetadata: SeoTechnicalPageMetadataRecommendation[];
  siteArchitecture: SeoTechnicalArchitectureFindings;
  contentHtmlFindings: SeoTechnicalContentHtmlFindings;
  structuredData: SeoTechnicalSchemaFindings;
  imageSeo: SeoTechnicalImageFindings;
  crawlFindings: SeoTechnicalCrawlFindings;
  actionPlan: SeoTechnicalActionPlan;
  implementationAssets: SeoTechnicalImplementationAssets;
  disclaimer: string;
  websitePagesAnalyzed: SeoWebsitePagesAnalyzed;
};

export type SeoReportPackage = SeoIntelligencePackage | SeoTechnicalPackage;

export function isSeoTechnicalPackage(
  value: SeoReportPackage | null | undefined,
): value is SeoTechnicalPackage {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as SeoTechnicalPackage).generationType === "technical",
  );
}

export function isSeoIntelligencePackage(
  value: SeoReportPackage | null | undefined,
): value is SeoIntelligencePackage {
  if (!value || typeof value !== "object") return false;
  if (isSeoTechnicalPackage(value)) return false;
  return "executiveAssessment" in value;
}

export type SeoReport = {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  brief_json: SeoReportBrief;
  status: SeoReportStatus;
  generation_stage: SeoReportGenerationStage | null;
  package_json: SeoReportPackage | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function isSeoReportStatus(value: unknown): value is SeoReportStatus {
  return (
    typeof value === "string" &&
    (SEO_REPORT_STATUSES as readonly string[]).includes(value)
  );
}

export function isSeoReportGenerationStage(
  value: unknown,
): value is SeoReportGenerationStage {
  return (
    typeof value === "string" &&
    (SEO_REPORT_GENERATION_STAGES as readonly string[]).includes(value)
  );
}
