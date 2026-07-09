import { callOpenRouter } from "@/lib/openrouter";
import {
  getReasoningProfileForGeneration,
  resolveReasoningAttachment,
  type AthenaGenerationKind,
  type ReasoningProfileType,
} from "@/lib/reasoningProfiles";
import {
  logLlmCallEnd,
  logLlmCallStart,
  type LlmCallMeta,
} from "@/lib/regenerationDiagnostics";

export type GenerateReviewOptions = LlmCallMeta & {
  generationKind?: AthenaGenerationKind;
  reasoningProfile?: ReasoningProfileType;
  systemPrompt?: string;
  regenerationNonce?: string;
  discussionId?: string;
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

export async function generateReview(
  prompt: string,
  meta?: GenerateReviewOptions,
) {
  const reasoningProfile = resolveReasoningProfile(meta);
  const model = process.env.OPENROUTER_MODEL ?? "";
  const attachment = resolveReasoningAttachment({
    model,
    profile: reasoningProfile,
  });

  const startedAt = meta
    ? logLlmCallStart({
        ...meta,
        generationKind: meta.generationKind,
        reasoningProfile,
        reasoningAttached: attachment.attach,
      })
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
      regenerationNonce: meta?.regenerationNonce,
      discussionId: meta?.discussionId,
      stage: meta?.stage,
    },
  );

  if (meta) {
    logLlmCallEnd(meta, startedAt, content.length);
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
