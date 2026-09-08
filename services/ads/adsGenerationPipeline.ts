/**
 * Staged organization-level Ads generation pipeline.
 * One strategy call + specialized platform calls. Persist only after full validation.
 */

import { resolveModelForStage } from "@/lib/llm/modelRouting";
import { generateReview } from "@/services/aiService";
import {
  composeAdsOrganizationContext,
  type AdsOrganizationContext,
  type ComposeAdsOrganizationContextDeps,
} from "@/services/ads/adsContextComposer";
import {
  validateAdCampaignPackage,
  AdCampaignPackageValidationError,
} from "@/services/ads/adCampaignValidation";
import type {
  AdCampaignBrief,
  AdCampaignGenerationStage,
  AdCampaignPackage,
  AdCampaignStrategy,
  FacebookAdAssets,
  GoogleSearchAdAssets,
  InstagramAdAssets,
  RecommendedKeywordThemes,
  TikTokAdAssets,
} from "@/services/ads/adCampaignTypes";
import { KEYWORD_THEMES_DISCLAIMER, KEYWORD_THEMES_LABEL } from "@/services/ads/adCampaignTypes";
import { buildAdsFacebookPrompt } from "@/services/ai/prompts/ads/adsFacebookPrompt";
import { buildAdsGoogleSearchPrompt } from "@/services/ai/prompts/ads/adsGoogleSearchPrompt";
import { buildAdsInstagramPrompt } from "@/services/ai/prompts/ads/adsInstagramPrompt";
import { buildAdsKeywordThemesPrompt } from "@/services/ai/prompts/ads/adsKeywordThemesPrompt";
import { buildAdsStrategyPrompt } from "@/services/ai/prompts/ads/adsStrategyPrompt";
import { buildAdsTikTokPrompt } from "@/services/ai/prompts/ads/adsTikTokPrompt";

export type AdsPipelineStageCallback = (
  stage: AdCampaignGenerationStage,
) => Promise<void> | void;

export type AdsGenerationPipelineDeps = {
  composeContext?: typeof composeAdsOrganizationContext;
  generateReview?: typeof generateReview;
  contextDeps?: ComposeAdsOrganizationContextDeps;
};

export type AdsParseCategory =
  | "empty_content"
  | "unexpected_content_shape"
  | "syntax_error"
  | "json_array"
  | "not_object"
  | "truncated"
  | "multiple_json_values";

export type AdsContentShape =
  | "empty"
  | "non_string"
  | "json_array"
  | "json_null"
  | "json_primitive"
  | "fenced_text"
  | "object_like"
  | "prose"
  | "unknown";

export type AdsGenerationErrorMetadata = {
  stage: AdCampaignGenerationStage;
  errorCode: string;
  parseCategory?: AdsParseCategory;
  contentShape?: AdsContentShape;
  contentLength?: number;
  startsWithFence?: boolean;
  containsFence?: boolean;
  firstNonWhitespace?: string | null;
  lastNonWhitespace?: string | null;
  braceDepthAtEnd?: number;
  looksTruncated?: boolean;
  routedAthenaStage?: string;
  routedRole?: string;
  routedModel?: string;
  reasoningProfile?: string;
  innerAttempt?: number;
  innerAttemptMax?: number;
  head?: string;
  tail?: string;
  omittedMiddle?: boolean;
  finishReason?: string | null;
};

const ADS_JSON_STAGE_INNER_ATTEMPT_MAX = 2;
const EXCERPT_PART_MAX = 80;
const EXCERPT_TOTAL_MAX = 160;

export class AdsGenerationPipelineError extends Error {
  readonly code: string;
  readonly stage: AdCampaignGenerationStage;
  readonly retryable: boolean;
  readonly metadata: AdsGenerationErrorMetadata | null;

  constructor(input: {
    code: string;
    message: string;
    stage: AdCampaignGenerationStage;
    retryable?: boolean;
    metadata?: AdsGenerationErrorMetadata | null;
  }) {
    super(input.message);
    this.name = "AdsGenerationPipelineError";
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable ?? true;
    this.metadata = input.metadata ?? null;
  }
}

type AdsAthenaStage =
  | "ad_campaign_strategy"
  | "ad_platform_assets"
  | "ad_keyword_themes";

type AdsJsonParseContext = {
  stage: AdCampaignGenerationStage;
  athenaStage: AdsAthenaStage;
  routedRole: string;
  routedModel: string;
  reasoningProfile: "EXECUTIVE" | "BALANCED";
  innerAttempt: number;
  innerAttemptMax: number;
};

function firstNonWhitespaceChar(value: string): string | null {
  for (const char of value) {
    if (!/\s/.test(char)) return char;
  }
  return null;
}

function lastNonWhitespaceChar(value: string): string | null {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char && !/\s/.test(char)) return char;
  }
  return null;
}

function sanitizeAdsResponseExcerpt(rawText: string): {
  head: string;
  tail: string;
  omittedMiddle: boolean;
} {
  const sanitized = rawText
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized.length <= EXCERPT_TOTAL_MAX) {
    return { head: sanitized, tail: "", omittedMiddle: false };
  }

  return {
    head: sanitized.slice(0, EXCERPT_PART_MAX),
    tail: sanitized.slice(-EXCERPT_PART_MAX),
    omittedMiddle: true,
  };
}

function scanJsonStructure(text: string): {
  braceDepthAtEnd: number;
  looksTruncated: boolean;
} {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
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
    if (char === "}") depth -= 1;
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
  }

  const last = lastNonWhitespaceChar(text);
  const looksTruncated =
    inString ||
    depth > 0 ||
    last === "," ||
    last === ":" ||
    last === "{" ||
    last === "[";

  return { braceDepthAtEnd: depth, looksTruncated };
}

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
  if (extractBalancedJsonObject(trimmed)) return true;

  const first = trimmed[0];
  if (
    first === "[" ||
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
): { kind: "one"; json: string } | { kind: "multiple" } | { kind: "none" } {
  const extracted = extractBalancedJsonObject(rawText);
  if (!extracted) return { kind: "none" };
  const start = rawText.indexOf("{");
  const remainder = rawText.slice(start + extracted.length);
  if (remainderHasAdditionalJsonValue(remainder)) {
    return { kind: "multiple" };
  }
  return { kind: "one", json: extracted };
}

function repairJsonText(rawText: string): string {
  return rawText
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function parsedRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function classifyParsedNonObject(value: unknown): {
  parseCategory: AdsParseCategory;
  contentShape: AdsContentShape;
} {
  if (Array.isArray(value)) {
    return { parseCategory: "json_array", contentShape: "json_array" };
  }
  if (value === null) {
    return { parseCategory: "not_object", contentShape: "json_null" };
  }
  return { parseCategory: "not_object", contentShape: "json_primitive" };
}

function inferFailureContentShape(input: {
  empty: boolean;
  nonString: boolean;
  startsWithFence: boolean;
  firstNonWhitespace: string | null;
}): AdsContentShape {
  if (input.nonString) return "non_string";
  if (input.empty) return "empty";
  if (input.startsWithFence) return "fenced_text";
  if (input.firstNonWhitespace === "{") return "object_like";
  return "prose";
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function throwAdsMalformedJson(
  context: AdsJsonParseContext,
  parseCategory: AdsParseCategory,
  extras: {
    contentShape: AdsContentShape;
    contentLength: number;
    startsWithFence: boolean;
    containsFence: boolean;
    firstNonWhitespace: string | null;
    lastNonWhitespace: string | null;
    braceDepthAtEnd: number;
    looksTruncated: boolean;
    head: string;
    tail: string;
    omittedMiddle: boolean;
  },
): never {
  throw new AdsGenerationPipelineError({
    code: "MALFORMED_JSON",
    message: `Ads generation produced malformed JSON at stage ${context.stage}.`,
    stage: context.stage,
    retryable: true,
    metadata: {
      stage: context.stage,
      errorCode: "MALFORMED_JSON",
      parseCategory,
      contentShape: extras.contentShape,
      contentLength: extras.contentLength,
      startsWithFence: extras.startsWithFence,
      containsFence: extras.containsFence,
      firstNonWhitespace: extras.firstNonWhitespace,
      lastNonWhitespace: extras.lastNonWhitespace,
      braceDepthAtEnd: extras.braceDepthAtEnd,
      looksTruncated: extras.looksTruncated,
      routedAthenaStage: context.athenaStage,
      routedRole: context.routedRole,
      routedModel: context.routedModel,
      reasoningProfile: context.reasoningProfile,
      innerAttempt: context.innerAttempt,
      innerAttemptMax: context.innerAttemptMax,
      head: extras.head,
      tail: extras.tail,
      omittedMiddle: extras.omittedMiddle,
    },
  });
}

function parseAdsJsonObject(
  raw: unknown,
  context: AdsJsonParseContext,
): Record<string, unknown> {
  if (typeof raw !== "string") {
    throwAdsMalformedJson(context, "unexpected_content_shape", {
      contentShape: "non_string",
      contentLength: 0,
      startsWithFence: false,
      containsFence: false,
      firstNonWhitespace: null,
      lastNonWhitespace: null,
      braceDepthAtEnd: 0,
      looksTruncated: false,
      head: "",
      tail: "",
      omittedMiddle: false,
    });
  }

  const rawText: string = raw;
  const trimmed = rawText.trim();
  const excerpt = sanitizeAdsResponseExcerpt(rawText);
  const startsWithFence = trimmed.startsWith("```");
  const containsFence = trimmed.includes("```");
  const firstNonWhitespace = firstNonWhitespaceChar(rawText);
  const lastNonWhitespace = lastNonWhitespaceChar(rawText);
  const structure = scanJsonStructure(rawText);
  const baseExtras = {
    contentLength: rawText.length,
    startsWithFence,
    containsFence,
    firstNonWhitespace,
    lastNonWhitespace,
    braceDepthAtEnd: structure.braceDepthAtEnd,
    looksTruncated: structure.looksTruncated,
    head: excerpt.head,
    tail: excerpt.tail,
    omittedMiddle: excerpt.omittedMiddle,
  };

  if (!trimmed) {
    throwAdsMalformedJson(context, "empty_content", {
      ...baseExtras,
      contentShape: "empty",
    });
  }

  const stripped = stripJsonFence(rawText);
  const candidates = [stripped];
  if (stripped !== trimmed) candidates.push(trimmed);

  const attemptParseCandidate = (
    text: string,
  ):
    | { kind: "object"; value: Record<string, unknown> }
    | { kind: "non_object"; value: unknown }
    | { kind: "multiple" }
    | { kind: "fail" } => {
    const parsed = tryParseJson(text);
    if (parsed.ok) {
      const record = parsedRecordOrNull(parsed.value);
      if (record) return { kind: "object", value: record };
      return { kind: "non_object", value: parsed.value };
    }

    const extracted = extractExactlyOneBalancedJsonObject(text);
    if (extracted.kind === "multiple") return { kind: "multiple" };
    if (extracted.kind === "one") {
      const extractedParsed = tryParseJson(extracted.json);
      if (extractedParsed.ok) {
        const record = parsedRecordOrNull(extractedParsed.value);
        if (record) return { kind: "object", value: record };
        return { kind: "non_object", value: extractedParsed.value };
      }
    }
    return { kind: "fail" };
  };

  let sawMultiple = false;
  let sawNonObject: { value: unknown } | null = null;

  for (const candidate of candidates) {
    const result = attemptParseCandidate(candidate);
    if (result.kind === "object") return result.value;
    if (result.kind === "multiple") sawMultiple = true;
    if (result.kind === "non_object") sawNonObject = { value: result.value };
  }

  if (sawNonObject) {
    const classified = classifyParsedNonObject(sawNonObject.value);
    throwAdsMalformedJson(context, classified.parseCategory, {
      ...baseExtras,
      contentShape: classified.contentShape,
      looksTruncated: false,
    });
  }

  if (sawMultiple) {
    throwAdsMalformedJson(context, "multiple_json_values", {
      ...baseExtras,
      contentShape: inferFailureContentShape({
        empty: false,
        nonString: false,
        startsWithFence,
        firstNonWhitespace,
      }),
      looksTruncated: false,
    });
  }

  for (const candidate of candidates) {
    const repaired = repairJsonText(candidate);
    if (repaired === candidate) continue;
    const result = attemptParseCandidate(repaired);
    if (result.kind === "object") return result.value;
    if (result.kind === "multiple") sawMultiple = true;
    if (result.kind === "non_object") sawNonObject = { value: result.value };
  }

  if (sawNonObject) {
    const classified = classifyParsedNonObject(sawNonObject.value);
    throwAdsMalformedJson(context, classified.parseCategory, {
      ...baseExtras,
      contentShape: classified.contentShape,
      looksTruncated: false,
    });
  }

  if (sawMultiple) {
    throwAdsMalformedJson(context, "multiple_json_values", {
      ...baseExtras,
      contentShape: inferFailureContentShape({
        empty: false,
        nonString: false,
        startsWithFence,
        firstNonWhitespace,
      }),
      looksTruncated: false,
    });
  }

  const contentShape = inferFailureContentShape({
    empty: false,
    nonString: false,
    startsWithFence,
    firstNonWhitespace,
  });
  throwAdsMalformedJson(context, structure.looksTruncated ? "truncated" : "syntax_error", {
    ...baseExtras,
    contentShape,
  });
}

async function invokeJsonStage(input: {
  stage: AdCampaignGenerationStage;
  athenaStage: AdsAthenaStage;
  prompt: string;
  generate: typeof generateReview;
  reasoningProfile: "EXECUTIVE" | "BALANCED";
}): Promise<Record<string, unknown>> {
  const route = resolveModelForStage(input.athenaStage);
  let lastMalformed: AdsGenerationPipelineError | null = null;

  for (
    let innerAttempt = 1;
    innerAttempt <= ADS_JSON_STAGE_INNER_ATTEMPT_MAX;
    innerAttempt += 1
  ) {
    let raw: unknown;
    try {
      raw = await input.generate(input.prompt, {
        stage: `ads.${input.stage}`,
        promptSource: "services/ads/adsGenerationPipeline.ts",
        athenaStage: input.athenaStage,
        reasoningProfile: input.reasoningProfile,
        systemPrompt:
          "You are Athena. Generate organization-level advertising assets as strict JSON only.",
      });
    } catch (error) {
      throw new AdsGenerationPipelineError({
        code: "LLM_CALL_FAILED",
        message:
          error instanceof Error
            ? error.message
            : `Ads LLM call failed at stage ${input.stage}.`,
        stage: input.stage,
        retryable: true,
      });
    }

    try {
      return parseAdsJsonObject(raw, {
        stage: input.stage,
        athenaStage: input.athenaStage,
        routedRole: route.role,
        routedModel: route.model,
        reasoningProfile: input.reasoningProfile,
        innerAttempt,
        innerAttemptMax: ADS_JSON_STAGE_INNER_ATTEMPT_MAX,
      });
    } catch (error) {
      if (
        error instanceof AdsGenerationPipelineError &&
        error.code === "MALFORMED_JSON" &&
        innerAttempt < ADS_JSON_STAGE_INNER_ATTEMPT_MAX
      ) {
        lastMalformed = error;
        continue;
      }
      if (
        error instanceof AdsGenerationPipelineError &&
        error.code === "MALFORMED_JSON"
      ) {
        throw new AdsGenerationPipelineError({
          code: "MALFORMED_JSON",
          message: error.message,
          stage: error.stage,
          retryable: false,
          metadata: error.metadata,
        });
      }
      throw error;
    }
  }

  throw (
    lastMalformed ??
    new AdsGenerationPipelineError({
      code: "MALFORMED_JSON",
      message: `Ads generation produced malformed JSON at stage ${input.stage}.`,
      stage: input.stage,
      retryable: false,
    })
  );
}

export async function runAdsGenerationPipeline(input: {
  organizationId: string;
  brief?: AdCampaignBrief;
  onStage?: AdsPipelineStageCallback;
  deps?: AdsGenerationPipelineDeps;
}): Promise<{
  package: AdCampaignPackage;
  context: AdsOrganizationContext;
}> {
  const onStage = input.onStage ?? (async () => undefined);
  const compose =
    input.deps?.composeContext ?? composeAdsOrganizationContext;
  const generate = input.deps?.generateReview ?? generateReview;

  await onStage("assembling_context");
  const context = await compose({
    organizationId: input.organizationId,
    brief: input.brief,
    deps: input.deps?.contextDeps,
  });

  await onStage("strategy");
  const strategyRaw = await invokeJsonStage({
    stage: "strategy",
    athenaStage: "ad_campaign_strategy",
    prompt: buildAdsStrategyPrompt({
      organizationContext: context.composedPromptContext,
      briefMode: context.briefMode,
    }),
    generate,
    reasoningProfile: "EXECUTIVE",
  });
  strategyRaw.briefMode = context.briefMode;
  const strategy = strategyRaw as unknown as AdCampaignStrategy;

  await onStage("facebook");
  const facebook = (await invokeJsonStage({
    stage: "facebook",
    athenaStage: "ad_platform_assets",
    prompt: buildAdsFacebookPrompt({
      organizationContext: context.composedPromptContext,
      strategy,
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as FacebookAdAssets;

  await onStage("instagram");
  const instagram = (await invokeJsonStage({
    stage: "instagram",
    athenaStage: "ad_platform_assets",
    prompt: buildAdsInstagramPrompt({
      organizationContext: context.composedPromptContext,
      strategy,
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as InstagramAdAssets;

  await onStage("tiktok");
  const tiktok = (await invokeJsonStage({
    stage: "tiktok",
    athenaStage: "ad_platform_assets",
    prompt: buildAdsTikTokPrompt({
      organizationContext: context.composedPromptContext,
      strategy,
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as TikTokAdAssets;

  await onStage("google_search");
  const googleSearch = (await invokeJsonStage({
    stage: "google_search",
    athenaStage: "ad_platform_assets",
    prompt: buildAdsGoogleSearchPrompt({
      organizationContext: context.composedPromptContext,
      strategy,
    }),
    generate,
    reasoningProfile: "BALANCED",
  })) as unknown as GoogleSearchAdAssets;

  await onStage("keyword_themes");
  const keywordRaw = await invokeJsonStage({
    stage: "keyword_themes",
    athenaStage: "ad_keyword_themes",
    prompt: buildAdsKeywordThemesPrompt({
      organizationContext: context.composedPromptContext,
      strategy,
    }),
    generate,
    reasoningProfile: "BALANCED",
  });
  if (keywordRaw.label !== KEYWORD_THEMES_LABEL) {
    keywordRaw.label = KEYWORD_THEMES_LABEL;
  }
  if (
    typeof keywordRaw.disclaimer !== "string" ||
    !keywordRaw.disclaimer.trim()
  ) {
    keywordRaw.disclaimer = KEYWORD_THEMES_DISCLAIMER;
  }
  const keywordThemes = keywordRaw as unknown as RecommendedKeywordThemes;

  await onStage("validating");
  try {
    const pkg = validateAdCampaignPackage({
      strategy,
      facebook,
      instagram,
      tiktok,
      googleSearch,
      keywordThemes,
    });
    await onStage("completed");
    return { package: pkg, context };
  } catch (error) {
    const details =
      error instanceof AdCampaignPackageValidationError
        ? error.details.join("; ")
        : error instanceof Error
          ? error.message
          : "Package validation failed.";
    throw new AdsGenerationPipelineError({
      code: "INVALID_PACKAGE",
      message: details,
      stage: "validating",
      retryable: true,
    });
  }
}
