/**
 * Staged organization-level Ads generation pipeline.
 * One strategy call + specialized platform calls. Persist only after full validation.
 */

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

export class AdsGenerationPipelineError extends Error {
  readonly code: string;
  readonly stage: AdCampaignGenerationStage;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    message: string;
    stage: AdCampaignGenerationStage;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "AdsGenerationPipelineError";
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

function parseJsonObject(rawText: string, stage: AdCampaignGenerationStage): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stripJsonFence(rawText));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AdsGenerationPipelineError({
      code: "MALFORMED_JSON",
      message: `Ads generation produced malformed JSON at stage ${stage}.`,
      stage,
      retryable: true,
    });
  }
}

async function invokeJsonStage(input: {
  stage: AdCampaignGenerationStage;
  athenaStage: "ad_campaign_strategy" | "ad_platform_assets" | "ad_keyword_themes";
  prompt: string;
  generate: typeof generateReview;
  reasoningProfile: "EXECUTIVE" | "BALANCED";
}): Promise<Record<string, unknown>> {
  let raw: string;
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

  return parseJsonObject(raw, input.stage);
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
