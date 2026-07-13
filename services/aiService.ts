import { callOpenRouter } from "@/lib/openrouter";
import {
  resolveAthenaStageFromGenerationKind,
  resolveModelForStage,
  resolveOpenRouterFallbackModel,
  type AthenaExtendedLLMStage,
} from "@/lib/llm/modelRouting";
import {
  getReasoningProfileForGeneration,
  resolveReasoningAttachment,
  type AthenaGenerationKind,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";
import {
  hashContent,
  logLlmCallEnd,
  logLlmCallStart,
  type LlmCallMeta,
} from "@/lib/regenerationDiagnostics";

export type GenerateReviewOptions = LlmCallMeta & {
  generationKind?: AthenaGenerationKind;
  athenaStage?: AthenaExtendedLLMStage;
  reasoningProfile?: ReasoningProfileType;
  systemPrompt?: string;
};

const DEFAULT_SYSTEM_PROMPTS: Partial<Record<AthenaGenerationKind, string>> = {
  discussion_analysis:
    "You are Athena. Produce executive intelligence and deployment-ready copy from the provided business context. Reason strategically within constraints.",
  executive_briefing:
    "You are Athena. Produce an executive briefing and deployment-ready copy from the provided business context.",
  opportunity_review:
    "You are Athena. Produce an executive briefing and deployment-ready copy from the provided business context.",
  strategic_blueprint:
    "You are Athena's executive strategy consultant. Select and specify one commercially valuable, differentiated strategic asset with production-ready prompts.",
  community_intelligence:
    "You are Athena. Summarize domain intelligence from provided organizational context.",
  production_intelligence:
    "You are Athena. Summarize production intelligence from provided organizational context.",
  identity_profile:
    "You are Athena. Extract structured business identity from provided inputs.",
  generic_review:
    "You are Athena. Produce concise, professional business intelligence.",
};

function resolveSystemPrompt(options?: GenerateReviewOptions): string {
  if (options?.systemPrompt?.trim()) {
    return options.systemPrompt.trim();
  }

  if (options?.generationKind) {
    return (
      DEFAULT_SYSTEM_PROMPTS[options.generationKind] ??
      DEFAULT_SYSTEM_PROMPTS.generic_review!
    );
  }

  return DEFAULT_SYSTEM_PROMPTS.generic_review!;
}

function resolveReasoningProfile(
  options?: GenerateReviewOptions,
): ReasoningProfileType {
  if (options?.reasoningProfile) {
    return options.reasoningProfile;
  }

  if (options?.generationKind) {
    return getReasoningProfileForGeneration(options.generationKind);
  }

  return "BALANCED";
}

function resolveRunId(meta?: GenerateReviewOptions): string | undefined {
  return meta?.regenerationRunId ?? meta?.regenerationNonce;
}

function resolveCallStage(
  meta?: GenerateReviewOptions,
): AthenaExtendedLLMStage | undefined {
  if (meta?.athenaStage) {
    return meta.athenaStage;
  }

  if (meta?.generationKind) {
    return resolveAthenaStageFromGenerationKind(meta.generationKind);
  }

  return undefined;
}

export async function generateReview(
  prompt: string,
  meta?: GenerateReviewOptions,
) {
  const reasoningProfile = resolveReasoningProfile(meta);
  const athenaStage = resolveCallStage(meta);
  const routedModel = athenaStage
    ? resolveModelForStage(athenaStage)
    : null;
  const model = routedModel?.model ?? resolveOpenRouterFallbackModel();
  const attachment = resolveReasoningAttachment({
    model,
    profile: reasoningProfile,
  });

  const startedAt = meta
    ? logLlmCallStart(
        {
          ...meta,
          generationKind: meta.generationKind,
          athenaStage,
          resolvedModel: routedModel?.model ?? null,
          llmRole: routedModel?.role ?? null,
          reasoningProfile,
          reasoningAttached: attachment.attach,
        },
        prompt,
      )
    : 0;

  const content = await callOpenRouter(
    [
      {
        role: "system",
        content: resolveSystemPrompt(meta),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    {
      reasoningProfile,
      generationKind: meta?.generationKind,
      athenaStage,
      regenerationRunId: resolveRunId(meta),
      discussionId: meta?.discussionId,
      stage: meta?.stage,
    },
  );

  if (meta) {
    logLlmCallEnd(meta, startedAt, content, hashContent(content));
  }

  return content;
}

export {
  getReasoningProfile,
  getReasoningProfileForGeneration,
  getReasoningProfileForOutputType,
  isReasoningSupportedByModel,
  resolveReasoningAttachment,
  type AthenaGenerationKind,
  type AthenaOutputType,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";

export {
  resolveModelForGenerationKind,
  resolveModelForStage,
  resolveDeploymentAssetsStage,
  type AthenaExtendedLLMStage,
  type AthenaLLMRole,
  type AthenaLLMStage,
} from "@/lib/llm/modelRouting";
