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
import { buildCompletePageMetadataMatrix } from "@/services/seo/seoTechnicalPageMetadata";
import { validateSeoTechnicalPackage } from "@/services/seo/seoTechnicalValidation";
import { SeoReportPackageValidationError } from "@/services/seo/seoReportValidation";

export type SeoTechnicalGenerationPipelineDeps = SeoGenerationPipelineDeps & {
  loadDeepIntelligence?: typeof loadOrganizationDeepWebsiteIntelligence;
};

/**
 * Local JSON recovery for Technical SEO model output.
 * Repairs fences, one surrounding prose wrapper, smart double quotes,
 * trailing commas, and raw control characters inside strings.
 * Does not invent keys, close truncated values, or call the model again.
 */
function stripJsonFence(rawText: string): string {
  const trimmed = rawText.trim();
  return trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractBalancedJsonObject(rawText: string): string | null {
  const start = rawText.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return rawText.slice(start, index + 1);
    }
  }
  return null;
}

function remainderHasAdditionalJsonValue(remainder: string): boolean {
  const trimmed = remainder.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (extractBalancedJsonObject(trimmed)) return true;
  const first = trimmed[0];
  if (
    first === '"' ||
    first === "-" ||
    (first !== undefined && first >= "0" && first <= "9")
  ) {
    return true;
  }
  return /^(true|false|null)(\b|$)/.test(trimmed);
}

function extractExactlyOneBalancedJsonObject(
  rawText: string,
):
  | { kind: "one"; json: string }
  | { kind: "multiple" }
  | { kind: "non_object" }
  | { kind: "none" } {
  const extracted = extractBalancedJsonObject(rawText);
  if (!extracted) {
    if (rawText.trim().startsWith("[")) return { kind: "non_object" };
    return { kind: "none" };
  }
  const start = rawText.indexOf("{");
  if (rawText.slice(0, start).trimEnd().endsWith("[")) {
    return { kind: "non_object" };
  }
  const remainder = rawText.slice(start + extracted.length);
  if (remainderHasAdditionalJsonValue(remainder)) return { kind: "multiple" };
  return { kind: "one", json: extracted };
}

function normalizeSmartDoubleQuotes(rawText: string): string {
  if (!rawText.includes('"')) {
    return rawText.replace(/[\u201C\u201D]/g, '"');
  }
  let result = "";
  let inString = false;
  let escaped = false;
  for (const char of rawText) {
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === "\u201C" || char === "\u201D") {
      result += '"';
      continue;
    }
    result += char;
  }
  return result;
}

function removeTrailingCommasOutsideStrings(rawText: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < rawText.length && /\s/.test(rawText[lookahead] ?? "")) {
        lookahead += 1;
      }
      const next = rawText[lookahead];
      if (next === "}" || next === "]") continue;
    }
    result += char;
  }
  return result;
}

function escapeControlCharactersInJsonStrings(rawText: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const char of rawText) {
    if (!inString) {
      if (char === '"') inString = true;
      result += char;
      continue;
    }
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      result += char;
      inString = false;
      continue;
    }
    if (char === "\n") {
      result += "\\n";
      continue;
    }
    if (char === "\r") {
      result += "\\r";
      continue;
    }
    if (char === "\t") {
      result += "\\t";
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 0x20) {
      result += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    result += char;
  }
  return result;
}

function repairJsonText(rawText: string): string {
  return escapeControlCharactersInJsonStrings(
    removeTrailingCommasOutsideStrings(normalizeSmartDoubleQuotes(rawText)),
  );
}

function tryParseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function parsedRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

type TechnicalJsonParseAttempt =
  | { kind: "object"; value: Record<string, unknown> }
  | { kind: "non_object" }
  | { kind: "multiple" }
  | { kind: "fail" };

function attemptParseCandidate(text: string): TechnicalJsonParseAttempt {
  const parsed = tryParseJson(text);
  if (parsed.ok) {
    const record = parsedRecordOrNull(parsed.value);
    if (record) return { kind: "object", value: record };
    return { kind: "non_object" };
  }

  const extracted = extractExactlyOneBalancedJsonObject(text);
  if (extracted.kind === "multiple") return { kind: "multiple" };
  if (extracted.kind === "non_object") return { kind: "non_object" };
  if (extracted.kind === "one") {
    const extractedParsed = tryParseJson(extracted.json);
    if (extractedParsed.ok) {
      const record = parsedRecordOrNull(extractedParsed.value);
      if (record) return { kind: "object", value: record };
      return { kind: "non_object" };
    }
  }
  return { kind: "fail" };
}

function attemptRepairedCandidate(text: string): TechnicalJsonParseAttempt {
  const extracted = extractExactlyOneBalancedJsonObject(text);
  if (extracted.kind === "multiple") return { kind: "multiple" };
  if (extracted.kind === "non_object") return { kind: "non_object" };

  const repairedText = repairJsonText(text);
  if (repairedText !== text) {
    const repairedAttempt = attemptParseCandidate(repairedText);
    if (repairedAttempt.kind !== "fail") return repairedAttempt;
  }

  if (extracted.kind === "one") {
    const repairedExtracted = repairJsonText(extracted.json);
    if (repairedExtracted !== extracted.json) {
      const parsed = tryParseJson(repairedExtracted);
      if (parsed.ok) {
        const record = parsedRecordOrNull(parsed.value);
        if (record) return { kind: "object", value: record };
        return { kind: "non_object" };
      }
    }
  }

  return { kind: "fail" };
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function malformedTechnicalJson(
  stage: SeoReportGenerationStage,
): SeoGenerationPipelineError {
  return new SeoGenerationPipelineError({
    code: "MALFORMED_JSON",
    message: `Technical SEO generation produced malformed JSON at stage ${stage}.`,
    stage,
    retryable: true,
  });
}

function parseJsonObject(
  rawText: string,
  stage: SeoReportGenerationStage,
): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) throw malformedTechnicalJson(stage);

  const candidates = uniqueNonEmpty([stripJsonFence(trimmed), trimmed]);
  let sawNonObject = false;
  let sawMultiple = false;

  for (const candidate of candidates) {
    const result = attemptParseCandidate(candidate);
    if (result.kind === "object") return result.value;
    if (result.kind === "non_object") sawNonObject = true;
    if (result.kind === "multiple") sawMultiple = true;
  }

  if (!sawNonObject && !sawMultiple) {
    for (const candidate of candidates) {
      const result = attemptRepairedCandidate(candidate);
      if (result.kind === "object") return result.value;
      if (result.kind === "non_object") sawNonObject = true;
      if (result.kind === "multiple") sawMultiple = true;
    }
  }

  throw malformedTechnicalJson(stage);
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

  const pageMetadataOverlays = Array.isArray(recommendations.pageMetadata)
    ? (recommendations.pageMetadata as unknown as SeoTechnicalPageMetadataRecommendation[])
    : [];
  // Deterministic inventory is authoritative; AI rows are overlays only.
  const pageMetadata = buildCompletePageMetadataMatrix(
    technicalCoverage,
    pageMetadataOverlays,
  );
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
