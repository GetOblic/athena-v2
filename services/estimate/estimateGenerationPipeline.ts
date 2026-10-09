/**
 * Athena Estimate generation pipeline (V26 L5).
 * Single bounded LLM call → validate/normalize package → optional delivery email.
 * Authorization recheck and methodology gate belong in the executor (before this runs).
 */

import { generateReview } from "@/services/aiService";
import { ESTIMATE_SYSTEM_PROMPT } from "@/services/ai/prompts/estimate/estimateSystemPrompt";
import { buildEstimateUserPrompt } from "@/services/ai/prompts/estimate/estimateUserPrompt";
import type { EstimateRequest } from "@/services/estimate/athenaEstimateTypes";
import type { AthenaEstimatePackage } from "@/services/estimate/athenaEstimateTypes";
import type { AthenaEstimateGenerationStage } from "@/services/estimate/athenaEstimateTypes";
import {
  validateEstimateDeliveryEmail,
  type EstimateDeliveryEmailV1,
} from "@/services/estimate/estimateDeliveryEmail";
import { resolveEstimateOutputLanguage } from "@/services/estimate/estimateOutputLanguage";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import {
  composeEstimateOrganizationContext,
  type ComposeEstimateOrganizationContextDeps,
  type EstimateOrganizationContext,
} from "@/services/estimate/estimateContextComposer";
import {
  normalizeAndValidateEstimatePackage,
} from "@/services/estimate/estimatePackageNormalization";
import type { ActiveEstimatePricingMethodologyInstruction } from "@/services/estimate/estimatePricingMethodologyInstruction";
import { AthenaEstimatePackageValidationError } from "@/services/estimate/athenaEstimateValidation";

export type EstimatePipelineStageCallback = (
  stage: AthenaEstimateGenerationStage | string,
) => Promise<void> | void;

export type EstimateGenerationPipelineDeps = {
  composeContext?: typeof composeEstimateOrganizationContext;
  generateReview?: typeof generateReview;
  contextDeps?: ComposeEstimateOrganizationContextDeps;
};

export class EstimateGenerationPipelineError extends Error {
  readonly code: string;
  readonly stage: AthenaEstimateGenerationStage | string;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    message: string;
    stage: AthenaEstimateGenerationStage | string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "EstimateGenerationPipelineError";
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
  stage: AthenaEstimateGenerationStage | string,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stripJsonFence(rawText));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new EstimateGenerationPipelineError({
      code: "ESTIMATE_INVALID_MODEL_OUTPUT",
      message: `Estimate generation produced malformed JSON at stage ${stage}.`,
      stage,
      retryable: true,
    });
  }
}

/**
 * Compose context, call OpenRouter once, validate/normalize package.
 * Caller must already have asserted relationship + configured methodology.
 *
 * Optional prospectCommercialTargetIntelligence is the exact Prospect block
 * composed by the executor before generation (L15). Org-only leaves it null —
 * no empty Prospect heading is emitted.
 */
export async function runEstimateGenerationPipeline(input: {
  organizationId: string;
  request: EstimateRequest;
  methodology: ActiveEstimatePricingMethodologyInstruction;
  /**
   * Exact PROSPECT COMMERCIAL TARGET INTELLIGENCE block when Prospect-targeted.
   * Must be the same string later frozen as composedText.
   */
  prospectCommercialTargetIntelligence?: string | null;
  /**
   * Server-resolved Master output-language instruction.
   * Never derived from selected organization language or client input.
   */
  outputLanguageInstruction?: string | null;
  /**
   * Master language code. Wins over the instruction text when both are set.
   * Used for deliveryEmail.language validation. Does not change estimate_v1.
   */
  outputLanguage?: OrganizationLanguage | null;
  onStage?: EstimatePipelineStageCallback;
  deps?: EstimateGenerationPipelineDeps;
}): Promise<{
  package: AthenaEstimatePackage;
  /** Null when the sibling email is missing or fails validation. */
  deliveryEmail: EstimateDeliveryEmailV1 | null;
  context: EstimateOrganizationContext;
}> {
  if (!input.methodology.configured || !input.methodology.instructionText.trim()) {
    throw new EstimateGenerationPipelineError({
      code: "ESTIMATE_INSTRUCTION_NOT_CONFIGURED",
      message:
        "Estimate pricing methodology is not configured by GetOblic Super Admin.",
      stage: "loading_instruction",
      retryable: false,
    });
  }

  const onStage = input.onStage ?? (async () => undefined);
  const compose =
    input.deps?.composeContext ?? composeEstimateOrganizationContext;
  const generate = input.deps?.generateReview ?? generateReview;

  await onStage("assembling_context");
  let context: EstimateOrganizationContext;
  try {
    context = await compose({
      organizationId: input.organizationId,
      request: input.request,
      deps: input.deps?.contextDeps,
    });
  } catch (error) {
    throw new EstimateGenerationPipelineError({
      code: "ESTIMATE_CONTEXT_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Failed to compose Estimate organization context.",
      stage: "assembling_context",
      retryable: false,
    });
  }

  const outputLanguage = resolveEstimateOutputLanguage({
    outputLanguage: input.outputLanguage,
    outputLanguageInstruction: input.outputLanguageInstruction,
  });

  await onStage("generating_estimate");
  const userPrompt = buildEstimateUserPrompt({
    trustedContext: context.composedTrustedContext,
    operatorGuidanceBlock: context.operatorGuidanceBlock,
    methodologyInstructionText: input.methodology.instructionText,
    methodologyRevisionId: input.methodology.revisionId,
    geoCurrency: context.geoCurrency,
    request: input.request,
    prospectCommercialTargetIntelligence:
      input.prospectCommercialTargetIntelligence ?? null,
    outputLanguageInstruction: input.outputLanguageInstruction ?? null,
    outputLanguageCode: outputLanguage,
  });

  let raw: string;
  try {
    raw = await generate(userPrompt, {
      stage: "estimate.generating_estimate",
      promptSource: "services/estimate/estimateGenerationPipeline.ts",
      athenaStage: "estimate_package",
      reasoningProfile: "EXECUTIVE",
      systemPrompt: ESTIMATE_SYSTEM_PROMPT,
    });
  } catch (error) {
    throw new EstimateGenerationPipelineError({
      code: "ESTIMATE_GENERATION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Estimate OpenRouter generation failed.",
      stage: "generating_estimate",
      retryable: true,
    });
  }

  const parsed = parseJsonObject(raw, "generating_estimate");
  const deliveryEmailRaw = parsed.deliveryEmail;
  const estimateRaw: Record<string, unknown> = { ...parsed };
  delete estimateRaw.deliveryEmail;

  await onStage("validating");
  let estimatePackage: AthenaEstimatePackage;
  try {
    estimatePackage = normalizeAndValidateEstimatePackage({
      raw: estimateRaw,
      geoCurrency: context.geoCurrency,
      methodology: input.methodology,
    });
  } catch (error) {
    if (error instanceof AthenaEstimatePackageValidationError) {
      throw new EstimateGenerationPipelineError({
        code: "ESTIMATE_VALIDATION_FAILED",
        message: error.message,
        stage: "validating",
        retryable: true,
      });
    }
    throw new EstimateGenerationPipelineError({
      code: "ESTIMATE_VALIDATION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Estimate package validation failed.",
      stage: "validating",
      retryable: true,
    });
  }

  return {
    package: estimatePackage,
    deliveryEmail: acceptDeliveryEmail({
      raw: deliveryEmailRaw,
      language: outputLanguage,
      amount: estimatePackage.recommendedClientPrice.amount,
      currencyCode: estimatePackage.recommendedClientPrice.currencyCode,
    }),
    context,
  };
}

/**
 * Email failure must not fail a valid Estimate package.
 */
function acceptDeliveryEmail(input: {
  raw: unknown;
  language: OrganizationLanguage;
  amount: number;
  currencyCode: string;
}): EstimateDeliveryEmailV1 | null {
  try {
    return validateEstimateDeliveryEmail({
      raw: input.raw,
      language: input.language,
      recommendedClientPriceAmount: input.amount,
      currencyCode: input.currencyCode,
    });
  } catch {
    return null;
  }
}
