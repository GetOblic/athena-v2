/**
 * Organization-level SEO Intelligence report types (Athena V19 Phase 1).
 * SEO reports belong to the organization — never to Discussion/Prospect/Persona/EV.
 * Consumes existing Athena intelligence only; does not modify Deep Scrape.
 */

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

export type SeoIntelligencePackage = {
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

export type SeoReport = {
  id: string;
  organization_id: string;
  user_id: string | null;
  name: string;
  brief_json: SeoReportBrief;
  status: SeoReportStatus;
  generation_stage: SeoReportGenerationStage | null;
  package_json: SeoIntelligencePackage | null;
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
