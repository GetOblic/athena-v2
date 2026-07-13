import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import {
  DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS,
  DEPLOYMENT_ASSETS_QUALITY_INSTRUCTIONS,
} from "@/services/ai/prompts/deploymentAssetsInstructions";
import {
  PROSPECT_DEPLOYMENT_CHANNEL_GUIDE,
  PROSPECT_DEPLOYMENT_SECTION_LABELS,
} from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";
import { WHATSAPP_OUTREACH_GENERATION_RULES } from "@/services/ai/prompts/whatsappOutreachConstraints";
import { KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES } from "@/services/ai/prompts/knowledgeBaseEnhancementConstraints";
import { SUBSTACK_POST_GENERATION_RULES } from "@/services/ai/prompts/substackPostConstraints";
import { REDDIT_POST_GENERATION_RULES } from "@/services/ai/prompts/redditPostConstraints";
import {
  SHARED_ANTI_GENERIC_RULES,
  SHARED_JSON_OUTPUT_RULES,
  SHARED_OUTPUT_DIVERSITY_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";
import { formatStructuredBusinessContext } from "@/services/brain/generationContracts/businessContextBlock";
import { assembleExecutiveGenerationContextBlock } from "@/services/brain/generationContracts/contractPromptFormatting";
import {
  formatReasoningPipelineCompactForPrompt,
} from "@/services/brain/reasoningPipeline/reasoningPipelinePromptFormatting";
import type { GenerationBundle } from "@/services/brain/generationContracts/generationContractTypes";
import { formatRegenerationRunStamp } from "@/lib/regenerationDiagnostics";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectService";

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

  const requiredOutput = isProspectSource
    ? `
${SHARED_JSON_OUTPUT_RULES}

{
  "suggested_cta": "PERSONALIZED_OUTREACH_EMAIL:\\n...\\n\\nFOLLOW_UP_EMAIL:\\n...\\n\\nLINKEDIN_CONNECTION:\\n...\\n\\nLINKEDIN_FOLLOW_UP:\\n...\\n\\nCOLD_CALL_OPENING:\\n...\\n\\nDISCOVERY_QUESTIONS:\\n...\\n\\nPERSONALIZED_VALUE_PROPOSITION:\\n...\\n\\nOBJECTION_ANTICIPATION:\\n...\\n\\nMEETING_PREPARATION:\\n...\\n\\nRECOMMENDED_CTA:\\n...\\n\\nFOLLOW_UP_SEQUENCE:\\n...\\n\\nPERSONALIZED_VIDEO_SCRIPT:\\n...\\n\\nNEWSLETTER_IDEA:\\n...\\n\\nBLOG_POST_IDEA:\\n...\\n\\nWHATSAPP_OUTREACH:\\nINITIAL MESSAGE\\n...\\n\\nFOLLOW-UP\\n...\\n\\nKNOWLEDGE_BASE_ENHANCEMENT:\\n...\\n\\nSUBSTACK_POST:\\nTITLE\\n...\\n\\nSUBTITLE\\n...\\n\\nPOST\\n...\\n\\nCLOSING CTA\\n...\\n\\nREDDIT_POST:\\nSUGGESTED TITLE\\n...\\n\\nPOST\\n...\\n\\nOPTIONAL DISCUSSION QUESTION\\n...",
  "recommended_response": "PERSONALIZED_OUTREACH_EMAIL:\\n...\\n\\nFOLLOW_UP_EMAIL:\\n...\\n\\nLINKEDIN_CONNECTION:\\n...\\n\\nLINKEDIN_FOLLOW_UP:\\n...\\n\\nCOLD_CALL_OPENING:\\n...\\n\\nDISCOVERY_QUESTIONS:\\n...\\n\\nPERSONALIZED_VALUE_PROPOSITION:\\n...\\n\\nOBJECTION_ANTICIPATION:\\n...\\n\\nMEETING_PREPARATION:\\n...\\n\\nRECOMMENDED_CTA:\\n...\\n\\nFOLLOW_UP_SEQUENCE:\\n...\\n\\nPERSONALIZED_VIDEO_SCRIPT:\\n...\\n\\nNEWSLETTER_IDEA:\\n...\\n\\nBLOG_POST_IDEA:\\n...\\n\\nWHATSAPP_OUTREACH:\\nINITIAL MESSAGE\\n...\\n\\nFOLLOW-UP\\n...\\n\\nKNOWLEDGE_BASE_ENHANCEMENT:\\n...\\n\\nSUBSTACK_POST:\\nTITLE\\n...\\n\\nSUBTITLE\\n...\\n\\nPOST\\n...\\n\\nCLOSING CTA\\n...\\n\\nREDDIT_POST:\\nSUGGESTED TITLE\\n...\\n\\nPOST\\n...\\n\\nOPTIONAL DISCUSSION QUESTION\\n...",
  "cta": "Exact paste-ready CTA sentence."
}
`.trim()
    : input.opportunity
      ? `
${SHARED_JSON_OUTPUT_RULES}

{
  "suggested_cta": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...\\n\\nCALL_TO_ACTION:\\n...\\n\\nNEWSLETTER_IDEA:\\n...\\n\\nBLOG_POST_IDEA:\\n...",
  "recommended_response": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...\\n\\nNEWSLETTER_IDEA:\\n...\\n\\nBLOG_POST_IDEA:\\n...",
  "cta": "Exact paste-ready CTA sentence."
}
`.trim()
      : `
${SHARED_JSON_OUTPUT_RULES}

{
  "suggested_cta": "COMMUNITY_REPLY:\\n...\\n\\nPRIVATE_MESSAGE:\\n...\\n\\nSOCIAL_POST:\\n...\\n\\nFOLLOW_UP:\\n...\\n\\nCALL_TO_ACTION:\\n...\\n\\nNEWSLETTER_IDEA:\\n...\\n\\nBLOG_POST_IDEA:\\n..."
}
`.trim();

  const qualityStandard = isProspectSource
    ? `
=== DEPLOYMENT ASSETS (PROSPECT) ===
${SHARED_ANTI_GENERIC_RULES}

${PROSPECT_DEPLOYMENT_CHANNEL_GUIDE}

Use exact section labels:
${PROSPECT_DEPLOYMENT_SECTION_LABELS}

${WHATSAPP_OUTREACH_GENERATION_RULES}

${KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES}

${SUBSTACK_POST_GENERATION_RULES}

${REDDIT_POST_GENERATION_RULES}

Channel isolation is mandatory:
- Email must read like email; WhatsApp must read like WhatsApp; LinkedIn must read like LinkedIn.
- Substack must be publication-ready long-form editorial content — not SEO or sales copy.
- Reddit must be transparent and community-native.
- Knowledge Base Enhancement must be factual operational knowledge — never invent facts; omit unknowns.
Do not let one asset format leak into another.
Newsletter Idea and Blog Post Idea are for the Athena client's audience, using prospect/homepage/ads as market evidence — not outreach emails.
Substack Post and Reddit Post must be materially different from each other and from Newsletter/Blog Idea.

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
