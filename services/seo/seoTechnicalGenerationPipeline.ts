/**
 * Technical SEO generation pipeline.
 * Deterministic analyzer + dedicated AI stages. Separate from strategic SEO.
 */

import { generateReview } from "@/services/aiService";
import { buildSeoTechnicalActionPlanPrompt } from "@/services/ai/prompts/seo/seoTechnicalActionPlanPrompt";
import { buildSeoTechnicalExecutivePrompt } from "@/services/ai/prompts/seo/seoTechnicalExecutivePrompt";
import { buildSeoTechnicalRecommendationsPrompt } from "@/services/ai/prompts/seo/seoTechnicalRecommendationsPrompt";
import {
  composeSeoOrganizationContext,
  loadOrganizationDeepWebsiteIntelligence,
  type ComposeSeoOrganizationContextDeps,
  type SeoOrganizationContext,
} from "@/services/seo/seoContextComposer";
import {
  SeoGenerationPipelineError,
  type SeoGenerationPipelineDeps,
  type SeoPipelineStageCallback,
} from "@/services/seo/seoGenerationPipeline";
import { resolveBriefGenerationType } from "@/services/seo/seoReportBrief";
import {
  SEO_TECHNICAL_REPORT_DISCLAIMER,
  type SeoReportBrief,
  type SeoReportGenerationStage,
  type SeoTechnicalArchitectureFindings,
  type SeoTechnicalContentHtmlFindings,
  type SeoTechnicalCrawlFindings,
  type SeoTechnicalExecutiveEvaluation,
  type SeoTechnicalImageFindings,
  type SeoTechnicalPackage,
  type SeoTechnicalPageMetadataRecommendation,
  type SeoTechnicalSchemaFindings,
} from "@/services/seo/seoReportTypes";
import {
  analyzeTechnicalSeoEvidence,
  formatTechnicalEvidenceForPrompt,
} from "@/services/seo/seoTechnicalAnalyzer";
import {
  assessTechnicalSeoEvidenceSufficiency,
  TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE,
} from "@/services/seo/seoTechnicalEvidence";
import { validateSeoTechnicalPackage } from "@/services/seo/seoTechnicalValidation";
import { SeoReportPackageValidationError } from "@/services/seo/seoReportValidation";

export type SeoTechnicalGenerationPipelineDeps = SeoGenerationPipelineDeps & {
  loadDeepIntelligence?: typeof loadOrganizationDeepWebsiteIntelligence;
};

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
      message: `Technical SEO generation produced malformed JSON at stage ${stage}.`,
      stage,
      retryable: true,
    });
  }
}

async function invokeJsonStage(input: {
  stage: SeoReportGenerationStage;
  prompt: string;
  generate: typeof generateReview;
  reasoningProfile: "EXECUTIVE" | "BALANCED";
}): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await input.generate(input.prompt, {
      stage: `seo.technical.${input.stage}`,
      promptSource: "services/seo/seoTechnicalGenerationPipeline.ts",
      athenaStage: "seo_section_analysis",
      reasoningProfile: input.reasoningProfile,
      systemPrompt:
        "You are Athena. Generate organization-level Technical SEO as strict JSON only. Ground every factual claim in deterministic Website Intelligence evidence. Do not invent PageSpeed, CWV, rankings, traffic, backlinks, or GSC metrics.",
    });
  } catch (error) {
    throw new SeoGenerationPipelineError({
      code: "LLM_CALL_FAILED",
      message:
        error instanceof Error
          ? error.message
          : `Technical SEO LLM call failed at stage ${input.stage}.`,
      stage: input.stage,
      retryable: true,
    });
  }

  return parseJsonObject(raw, input.stage);
}

export async function runSeoTechnicalGenerationPipeline(input: {
  organizationId: string;
  brief?: SeoReportBrief;
  onStage?: SeoPipelineStageCallback;
  deps?: SeoTechnicalGenerationPipelineDeps;
}): Promise<{
  package: SeoTechnicalPackage;
  context: SeoOrganizationContext;
}> {
  const onStage = input.onStage ?? (async () => undefined);
  const compose = input.deps?.composeContext ?? composeSeoOrganizationContext;
  const generate = input.deps?.generateReview ?? generateReview;
  const loadDeep =
    input.deps?.loadDeepIntelligence ?? loadOrganizationDeepWebsiteIntelligence;

  if (resolveBriefGenerationType(input.brief) !== "technical") {
    throw new SeoGenerationPipelineError({
      code: "INVALID_GENERATION_TYPE",
      message: "Technical SEO pipeline requires generationType=technical.",
      stage: "failed",
      retryable: false,
    });
  }

  await onStage("assembling_context");
  const context = await compose({
    organizationId: input.organizationId,
    brief: input.brief,
    deps: input.deps?.contextDeps as ComposeSeoOrganizationContextDeps | undefined,
  });

  await onStage("analyzing_technical_evidence");
  const deepIntelligence = await loadDeep(input.organizationId);
  const sufficiency = assessTechnicalSeoEvidenceSufficiency(deepIntelligence);
  if (!sufficiency.sufficient || !deepIntelligence) {
    throw new SeoGenerationPipelineError({
      code: TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE,
      message:
        sufficiency.message ??
        "Website Intelligence lacks V23 technical evidence for Technical SEO.",
      stage: "analyzing_technical_evidence",
      retryable: false,
    });
  }

  const technicalCoverage = analyzeTechnicalSeoEvidence(deepIntelligence);
  const technicalEvidenceBlock =
    formatTechnicalEvidenceForPrompt(technicalCoverage);

  await onStage("technical_executive_evaluation");
  const executiveEvaluation = (await invokeJsonStage({
    stage: "technical_executive_evaluation",
    prompt: buildSeoTechnicalExecutivePrompt({
      organizationContext: context.composedPromptContext,
      technicalEvidence: technicalEvidenceBlock,
      briefMode: context.briefMode,
    }),
    generate,
    reasoningProfile: "EXECUTIVE",
  })) as unknown as SeoTechnicalExecutiveEvaluation;

  await onStage("technical_recommendations");
  const recommendations = await invokeJsonStage({
    stage: "technical_recommendations",
    prompt: buildSeoTechnicalRecommendationsPrompt({
      organizationContext: context.composedPromptContext,
      technicalEvidence: technicalEvidenceBlock,
      executiveEvaluation,
    }),
    generate,
    reasoningProfile: "BALANCED",
  });

  const pageMetadata =
    recommendations.pageMetadata as unknown as SeoTechnicalPageMetadataRecommendation[];
  const siteArchitecture =
    recommendations.siteArchitecture as unknown as SeoTechnicalArchitectureFindings;
  const contentHtmlFindings =
    recommendations.contentHtmlFindings as unknown as SeoTechnicalContentHtmlFindings;
  const structuredData =
    recommendations.structuredData as unknown as SeoTechnicalSchemaFindings;
  const imageSeo =
    recommendations.imageSeo as unknown as SeoTechnicalImageFindings;
  const crawlFindings =
    recommendations.crawlFindings as unknown as SeoTechnicalCrawlFindings;

  await onStage("technical_action_plan");
  const actionRaw = await invokeJsonStage({
    stage: "technical_action_plan",
    prompt: buildSeoTechnicalActionPlanPrompt({
      organizationContext: context.composedPromptContext,
      technicalEvidence: technicalEvidenceBlock,
      briefMode: context.briefMode,
      suggestedReportName:
        context.brief.name?.trim() || "Technical SEO Report",
      priorSections: {
        executiveEvaluation,
        pageMetadata,
        siteArchitecture,
        contentHtmlFindings,
        structuredData,
        imageSeo,
        crawlFindings,
      },
    }),
    generate,
    reasoningProfile: "EXECUTIVE",
  });

  const reportName =
    typeof actionRaw.reportName === "string" && actionRaw.reportName.trim()
      ? actionRaw.reportName.trim()
      : context.brief.name?.trim() || "Technical SEO Report";
  const disclaimer =
    typeof actionRaw.disclaimer === "string" && actionRaw.disclaimer.trim()
      ? actionRaw.disclaimer.trim()
      : SEO_TECHNICAL_REPORT_DISCLAIMER;

  await onStage("validating");
  try {
    const pkg = validateSeoTechnicalPackage({
      generationType: "technical",
      reportName,
      briefMode: context.briefMode,
      executiveEvaluation,
      technicalCoverage,
      pageMetadata,
      siteArchitecture,
      contentHtmlFindings,
      structuredData,
      imageSeo,
      crawlFindings,
      actionPlan: actionRaw.actionPlan,
      implementationAssets: actionRaw.implementationAssets,
      disclaimer,
      websitePagesAnalyzed: context.websitePagesAnalyzed,
    });
    await onStage("completed");
    return { package: pkg, context };
  } catch (error) {
    const details =
      error instanceof SeoReportPackageValidationError
        ? error.details.join("; ")
        : error instanceof Error
          ? error.message
          : "Technical package validation failed.";
    throw new SeoGenerationPipelineError({
      code: "INVALID_PACKAGE",
      message: details,
      stage: "validating",
      retryable: true,
    });
  }
}
