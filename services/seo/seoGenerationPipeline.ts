/**
 * Staged organization-level SEO Intelligence generation pipeline.
 * Persist only after full validation. Never mutates Deep Scrape or Brain.
 */

import { generateReview } from "@/services/aiService";
import {
  composeSeoOrganizationContext,
  type ComposeSeoOrganizationContextDeps,
  type SeoOrganizationContext,
} from "@/services/seo/seoContextComposer";
import {
  validateSeoIntelligencePackage,
  SeoReportPackageValidationError,
} from "@/services/seo/seoReportValidation";
import type {
  SeoCommercialOpportunityAnalysis,
  SeoContentCoverageAnalysis,
  SeoCustomerIntentAnalysis,
  SeoExecutiveAssessment,
  SeoIntelligencePackage,
  SeoNinetyDayRoadmap,
  SeoReportBrief,
  SeoReportGenerationStage,
  SeoTrustAuthorityAnalysis,
} from "@/services/seo/seoReportTypes";
import { SEO_REPORT_DISCLAIMER } from "@/services/seo/seoReportTypes";
import { buildSeoCommercialOpportunitiesPrompt } from "@/services/ai/prompts/seo/seoCommercialOpportunitiesPrompt";
import { buildSeoContentCoveragePrompt } from "@/services/ai/prompts/seo/seoContentCoveragePrompt";
import { buildSeoCustomerIntentPrompt } from "@/services/ai/prompts/seo/seoCustomerIntentPrompt";
import { buildSeoExecutiveAssessmentPrompt } from "@/services/ai/prompts/seo/seoExecutiveAssessmentPrompt";
import { buildSeoNinetyDayRoadmapPrompt } from "@/services/ai/prompts/seo/seoNinetyDayRoadmapPrompt";
import { buildSeoTrustAuthorityPrompt } from "@/services/ai/prompts/seo/seoTrustAuthorityPrompt";

export type SeoPipelineStageCallback = (
  stage: SeoReportGenerationStage,
) => Promise<void> | void;

export type SeoGenerationPipelineDeps = {
  composeContext?: typeof composeSeoOrganizationContext;
  generateReview?: typeof generateReview;
  contextDeps?: ComposeSeoOrganizationContextDeps;
};

export class SeoGenerationPipelineError extends Error {
  readonly code: string;
  readonly stage: SeoReportGenerationStage;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    message: string;
    stage: SeoReportGenerationStage;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "SeoGenerationPipelineError";
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable ?? true;
  }
}

function stripJsonFence(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonObject(
  rawText: string,
  stage: SeoReportGenerationStage,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stripJsonFence(rawText));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new SeoGenerationPipelineError({
      code: "MALFORMED_JSON",
      message: `SEO generation produced malformed JSON at stage ${stage}.`,
      stage,
      retryable: true,
    });
  }
}

async function invokeJsonStage(input: {
  stage: SeoReportGenerationStage;
  athenaStage:
    | "seo_executive_assessment"
    | "seo_section_analysis"
    | "seo_roadmap";
  prompt: string;
  generate: typeof generateReview;
  reasoningProfile: "EXECUTIVE" | "BALANCED";
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: `seo.${input.stage}`,
      promptSource: "services/seo/seoGenerationPipeline.ts",
      athenaStage: input.athenaStage,
      reasoningProfile: input.reasoningProfile,
      systemPrompt:
        "You are Athena. Generate organization-level SEO Intelligence as strict JSON only. Focus on content strategy, customer intent, authority, and commercial opportunity — not technical crawl audits.",
    });
  } catch (error) {
    throw new SeoGenerationPipelineError({
      code: "LLM_CALL_FAILED",
      message:
        error instanceof Error
          ? error.message
          : `SEO LLM call failed at stage ${input.stage}.`,
      stage: input.stage,
      retryable: true,
    });
  }

  return parseJsonObject(raw, input.stage);
}

export async function runSeoGenerationPipeline(input: {
  organizationId: string;
  brief?: SeoReportBrief;
  onStage?: SeoPipelineStageCallback;
  deps?: SeoGenerationPipelineDeps;
}): Promise<{
  package: SeoIntelligencePackage;
  context: SeoOrganizationContext;
}> {
  const onStage = input.onStage ?? (async () => undefined);
  const compose = input.deps?.composeContext ?? composeSeoOrganizationContext;
  const generate = input.deps?.generateReview ?? generateReview;

  await onStage("assembling_context");
  const context = await compose({
    organizationId: input.organizationId,
    brief: input.brief,
    deps: input.deps?.contextDeps,
  });

  await onStage("executive_assessment");
  const executiveAssessment = (await invokeJsonStage({
    stage: "executive_assessment",
    athenaStage: "seo_executive_assessment",
    prompt: buildSeoExecutiveAssessmentPrompt({
      organizationContext: context.composedPromptContext,
      briefMode: context.briefMode,
    }),
    generate,
    reasoningProfile: "EXECUTIVE",
  })) as unknown as SeoExecutiveAssessment;

  await onStage("content_coverage");
  const contentCoverage = (await invokeJsonStage({
    stage: "content_coverage",
    athenaStage: "seo_section_analysis",
    prompt: buildSeoContentCoveragePrompt({
      organizationContext: context.composedPromptContext,
      executiveAssessment,
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as SeoContentCoverageAnalysis;

  await onStage("customer_intent");
  const customerIntent = (await invokeJsonStage({
    stage: "customer_intent",
    athenaStage: "seo_section_analysis",
    prompt: buildSeoCustomerIntentPrompt({
      organizationContext: context.composedPromptContext,
      executiveAssessment,
      contentCoverage,
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as SeoCustomerIntentAnalysis;

  await onStage("commercial_opportunities");
  const commercialOpportunities = (await invokeJsonStage({
    stage: "commercial_opportunities",
    athenaStage: "seo_section_analysis",
    prompt: buildSeoCommercialOpportunitiesPrompt({
      organizationContext: context.composedPromptContext,
      priorSections: {
        executiveAssessment,
        contentCoverage,
        customerIntent,
      },
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as SeoCommercialOpportunityAnalysis;

  await onStage("trust_and_authority");
  const trustAndAuthority = (await invokeJsonStage({
    stage: "trust_and_authority",
    athenaStage: "seo_section_analysis",
    prompt: buildSeoTrustAuthorityPrompt({
      organizationContext: context.composedPromptContext,
      priorSections: {
        executiveAssessment,
        contentCoverage,
        customerIntent,
        commercialOpportunities,
      },
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as SeoTrustAuthorityAnalysis;

  await onStage("ninety_day_roadmap");
  const roadmapRaw = await invokeJsonStage({
    stage: "ninety_day_roadmap",
    athenaStage: "seo_roadmap",
    prompt: buildSeoNinetyDayRoadmapPrompt({
      organizationContext: context.composedPromptContext,
      briefMode: context.briefMode,
      priorSections: {
        executiveAssessment,
        contentCoverage,
        customerIntent,
        commercialOpportunities,
        trustAndAuthority,
      },
    }),
    generate,
    reasoningProfile: "EXECUTIVE",
  });

  const ninetyDayRoadmap = roadmapRaw.ninetyDayRoadmap as unknown as SeoNinetyDayRoadmap;
  const reportName =
    typeof roadmapRaw.reportName === "string" && roadmapRaw.reportName.trim()
      ? roadmapRaw.reportName.trim()
      : context.brief.name?.trim() || "SEO Intelligence Report";
  const disclaimer =
    typeof roadmapRaw.disclaimer === "string" && roadmapRaw.disclaimer.trim()
      ? roadmapRaw.disclaimer.trim()
      : SEO_REPORT_DISCLAIMER;

  await onStage("validating");
  try {
    const pkg = validateSeoIntelligencePackage({
      reportName,
      briefMode: context.briefMode,
      executiveAssessment,
      contentCoverage,
      customerIntent,
      commercialOpportunities,
      trustAndAuthority,
      ninetyDayRoadmap,
      disclaimer,
    });
    await onStage("completed");
    return { package: pkg, context };
  } catch (error) {
    const details =
      error instanceof SeoReportPackageValidationError
        ? error.details.join("; ")
        : error instanceof Error
          ? error.message
          : "Package validation failed.";
    throw new SeoGenerationPipelineError({
      code: "INVALID_PACKAGE",
      message: details,
      stage: "validating",
      retryable: true,
    });
  }
}
