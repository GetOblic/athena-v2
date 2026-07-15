import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import {
  DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS,
  DEPLOYMENT_ASSETS_QUALITY_INSTRUCTIONS,
} from "@/services/ai/prompts/deploymentAssetsInstructions";
import { KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES } from "@/services/ai/prompts/knowledgeBaseEnhancementConstraints";
import {
  PROSPECT_DEPLOYMENT_CHANNEL_GUIDE,
  PROSPECT_DEPLOYMENT_SECTION_LABELS,
} from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";
import { REDDIT_POST_GENERATION_RULES } from "@/services/ai/prompts/redditPostConstraints";
import { SOCIAL_VOICE_POST_GENERATION_RULES } from "@/services/ai/prompts/socialVoicePostConstraints";
import { SUBSTACK_POST_GENERATION_RULES } from "@/services/ai/prompts/substackPostConstraints";
import { LINKEDIN_PROSPECT_ASSET_GENERATION_RULES } from "@/services/ai/prompts/linkedinProspectAssetConstraints";
import { WHATSAPP_OUTREACH_GENERATION_RULES } from "@/services/ai/prompts/whatsappOutreachConstraints";
import {
  SHARED_ANTI_GENERIC_RULES,
  SHARED_OUTPUT_DIVERSITY_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";
import { formatStructuredBusinessContext } from "@/services/brain/generationContracts/businessContextBlock";
import { assembleExecutiveGenerationContextBlock } from "@/services/brain/generationContracts/contractPromptFormatting";
import { buildDeploymentAssetsRequiredOutputInstructions } from "@/services/brain/generationContracts/deploymentAssetsRequiredOutput";
import {
  formatReasoningPipelineCompactForPrompt,
} from "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import { formatRegenerationRunStamp } from "@/lib/regenerationDiagnostics";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectService";

export { buildDeploymentAssetsRequiredOutputInstructions } from "@/services/brain/generationContracts/deploymentAssetsRequiredOutput";

type PromptAssemblyOptions = {
  regenerationRunId?: string;
};

function buildDeploymentExecutiveContext(
  bundle: GenerationBundle,
  options?: PromptAssemblyOptions & {
    discussion?: {
      title?: string | null;
      body?: string | null;
      content?: string | null;
    };
    analysis?: Record<string, unknown>;
    opportunity?: Record<string, unknown>;
  },
): string {
  const businessContext = formatStructuredBusinessContext({
    bundle,
    discussion: options?.discussion,
    analysis: options?.analysis,
    opportunity: options?.opportunity,
  });
  const decisionSignals = formatReasoningPipelineCompactForPrompt(
    bundle.reasoningPipeline,
  );
  const strategyBlock = assembleExecutiveGenerationContextBlock({
    executiveStrategy: bundle.executiveStrategy,
    generationContract: bundle.generationContract,
    compact: true,
  });

  return [
    businessContext,
    decisionSignals,
    strategyBlock,
    formatRegenerationRunStamp(options?.regenerationRunId),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function assembleDeploymentAssetsPrompt(input: {
  bundle: GenerationBundle;
  discussion: Discussion;
  analysis: Record<string, unknown>;
  opportunity?: Opportunity | Record<string, unknown>;
  briefing?: AthenaReview | Record<string, unknown>;
  regenerationRunId?: string;
}): string {
  const executiveContextBlock = buildDeploymentExecutiveContext(input.bundle, {
    regenerationRunId: input.regenerationRunId,
    discussion: input.discussion,
    analysis: input.analysis,
    opportunity: input.opportunity as Record<string, unknown> | undefined,
  });

  const sourceIntelligence = JSON.stringify(
    {
      discussion: {
        id: input.discussion.id,
        title: input.discussion.title,
      },
      analysis: input.analysis,
      opportunity: input.opportunity ?? null,
      briefing: input.briefing
        ? {
            summary: (input.briefing as AthenaReview).summary,
            pain_points: (input.briefing as AthenaReview).pain_points,
            buyer_stage: (input.briefing as AthenaReview).buyer_stage,
          }
        : null,
    },
    null,
    2,
  );

  const isProspectSource =
    input.discussion.platform === PROSPECT_INTELLIGENCE_PLATFORM;

  const requiredOutput = buildDeploymentAssetsRequiredOutputInstructions({
    isProspectSource,
  });

  const qualityStandard = isProspectSource
    ? `
=== DEPLOYMENT ASSETS (PROSPECT) ===
${SHARED_ANTI_GENERIC_RULES}

${PROSPECT_DEPLOYMENT_CHANNEL_GUIDE}

Use exact section labels:
${PROSPECT_DEPLOYMENT_SECTION_LABELS}

${LINKEDIN_PROSPECT_ASSET_GENERATION_RULES}

${WHATSAPP_OUTREACH_GENERATION_RULES}

${KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES}

${SUBSTACK_POST_GENERATION_RULES}

${REDDIT_POST_GENERATION_RULES}

${SOCIAL_VOICE_POST_GENERATION_RULES}

Channel isolation is mandatory:
- Email must read like email; WhatsApp must read like WhatsApp; LinkedIn must read like LinkedIn.
- Substack must be publication-ready long-form editorial content — not SEO or sales copy.
- Reddit must be transparent and community-native.
- Knowledge Base Enhancement must be factual operational knowledge — never invent facts; omit unknowns.
- Social Voice Post must be first-person in the client's Athena Brain Voice — not outreach email, not Discussion SOCIAL_POST, not a sales template.
Do not let one asset format leak into another.
Newsletter Idea and Blog Post Idea are for the Athena client's audience, using prospect/homepage/ads as market evidence — not outreach emails.
Substack Post, Reddit Post, and Social Voice Post must be materially different from each other and from Newsletter/Blog Idea.

${SHARED_OUTPUT_DIVERSITY_RULES}
`.trim()
    : input.opportunity
      ? DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS
      : DEPLOYMENT_ASSETS_QUALITY_INSTRUCTIONS;

  return [
    executiveContextBlock,
    `
=== OBJECTIVE ===
Generate paste-ready deployment assets only from the source intelligence below. Do not repeat executive analysis.
${isProspectSource ? "Source type: Prospect Intelligence. Prefer prospect outreach assets over community discussion assets." : ""}

=== SOURCE INTELLIGENCE ===
${sourceIntelligence}

=== REQUIRED OUTPUT ===
${requiredOutput}

=== QUALITY STANDARD ===
${qualityStandard}
`.trim(),
  ].join("\n\n");
}
