import type { Discussion } from "@/services/discussionService";
import type { Opportunity } from "@/services/opportunityService";
import type { AthenaReview } from "@/services/reviewService";
import {
  DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS,
  DEPLOYMENT_ASSETS_QUALITY_INSTRUCTIONS,
} from "@/services/ai/prompts/deploymentAssetsInstructions";
import {
  isDeepV1WebsiteIntelligenceProvider,
  KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES,
  KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES,
} from "@/services/ai/prompts/knowledgeBaseEnhancementConstraints";
import {
  PROSPECT_DEPLOYMENT_CHANNEL_GUIDE,
  PROSPECT_DEPLOYMENT_SECTION_LABELS,
} from "@/services/ai/prompts/prospectDeploymentAssetsConstraints";
import {
  PERSONA_ANALYSIS_CHANNEL_GUIDE,
  PERSONA_ANALYSIS_EVIDENCE_DISCIPLINE,
  PERSONA_ANALYSIS_SECTION_LABELS,
} from "@/services/ai/prompts/personaDeploymentAssetsConstraints";
import {
  PERSONA_PUBLISHABLE_CONTEXTUAL_REASONING,
  PERSONA_PUBLISHABLE_DEPLOYMENT_EVIDENCE_DISCIPLINE,
  PERSONA_PUBLISHABLE_DEPLOYMENT_TARGETING,
} from "@/services/ai/prompts/personaPublishableDeploymentAssetsConstraints";
import { HIDDEN_GEMS_GENERATION_RULES } from "@/services/ai/prompts/hiddenGemsConstraints";
import { REDDIT_POST_GENERATION_RULES } from "@/services/ai/prompts/redditPostConstraints";
import { SKOOL_COURSE_IDEA_GENERATION_RULES } from "@/services/ai/prompts/skoolCourseIdeaConstraints";
import { SKOOL_POST_GENERATION_RULES } from "@/services/ai/prompts/skoolPostConstraints";
import { SOCIAL_VOICE_POST_GENERATION_RULES } from "@/services/ai/prompts/socialVoicePostConstraints";
import { SUBSTACK_NOTE_GENERATION_RULES } from "@/services/ai/prompts/substackNoteConstraints";
import { SUBSTACK_POST_GENERATION_RULES } from "@/services/ai/prompts/substackPostConstraints";
import { LINKEDIN_PROSPECT_ASSET_GENERATION_RULES } from "@/services/ai/prompts/linkedinProspectAssetConstraints";
import {
  LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES,
  SHORT_VIDEO_PROMPT_GENERATION_RULES,
  VISUAL_DEPLOYMENT_ASSETS_SHARED_RULES,
  VISUAL_MESSAGE_PROMPT_GENERATION_RULES,
} from "@/services/ai/prompts/visualDeploymentAssetsConstraints";
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
import type { OrganizationBrandIdentity } from "@/services/identity/brandIdentity";
import { formatVisualBrandCreativeDirectionBlock } from "@/services/identity/visualBrandCreativeDirection";
import { PERSONA_INTELLIGENCE_PLATFORM } from "@/services/personas/personaBridgeMarker";
import { PROSPECT_INTELLIGENCE_PLATFORM } from "@/services/prospects/prospectService";

export { buildDeploymentAssetsRequiredOutputInstructions } from "@/services/brain/generationContracts/deploymentAssetsRequiredOutput";

type PromptAssemblyOptions = {
  regenerationRunId?: string;
};

export type PersonaDeploymentPromptPackageKind =
  | "publishable_deployment"
  | "analysis";

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

function buildProspectQualityStandard(input: {
  knowledgeBaseRules: string;
  visualAssetsBlock: string;
}): string {
  return `
=== DEPLOYMENT ASSETS (PROSPECT) ===
${SHARED_ANTI_GENERIC_RULES}

${PROSPECT_DEPLOYMENT_CHANNEL_GUIDE}

Use exact section labels:
${PROSPECT_DEPLOYMENT_SECTION_LABELS}

${LINKEDIN_PROSPECT_ASSET_GENERATION_RULES}

${WHATSAPP_OUTREACH_GENERATION_RULES}

${input.knowledgeBaseRules}

${HIDDEN_GEMS_GENERATION_RULES}

${SUBSTACK_POST_GENERATION_RULES}

${SUBSTACK_NOTE_GENERATION_RULES}

${REDDIT_POST_GENERATION_RULES}

${SKOOL_POST_GENERATION_RULES}

${SKOOL_COURSE_IDEA_GENERATION_RULES}

${SOCIAL_VOICE_POST_GENERATION_RULES}

${input.visualAssetsBlock}

Channel isolation is mandatory:
- Email must read like email; WhatsApp must read like WhatsApp; LinkedIn must read like LinkedIn.
- Substack Post must be publication-ready long-form editorial content — not SEO or sales copy.
- Substack Note must be a concise feed-native note — not a full newsletter or Substack Post.
- Reddit must be transparent and community-native.
- Skool Post must be discussion-oriented community content — not a cold sales post.
- Skool Course Idea must be prospect-specific and teachable — not a generic category course.
- Hidden Gems must be non-obvious analyst findings from the complete learned website corpus — not a website summary and not Knowledge Base Enhancement.
- Knowledge Base Enhancement must be factual operational knowledge — never invent facts; omit unknowns.
- Social Voice Post must be first-person in the client's Athena Brain Voice — not outreach email, not Discussion SOCIAL_POST, not a sales template.
- Short Video Prompt, Visual Message Prompt, and Local Outreach Image Prompt are generator prompts only — never scripts, strategies, or explanations.
Do not let one asset format leak into another.
Newsletter Idea and Blog Post Idea are for the Athena client's audience, using prospect/homepage/ads as market evidence — not outreach emails.
Substack Post, Substack Note, Reddit Post, Skool Post, and Social Voice Post must be materially different from each other and from Newsletter/Blog Idea.
Do not generate LOCAL_OUTREACH_IMAGE_PROMPT for non-Prospect sources.

${SHARED_OUTPUT_DIVERSITY_RULES}
`.trim();
}

function buildPersonaPublishableQualityStandard(input: {
  knowledgeBaseRules: string;
  visualAssetsBlock: string;
}): string {
  return `
=== PERSONA DEPLOYMENT ASSETS (PUBLISH-READY) ===
${SHARED_ANTI_GENERIC_RULES}

${PERSONA_PUBLISHABLE_DEPLOYMENT_TARGETING}

${PERSONA_PUBLISHABLE_CONTEXTUAL_REASONING}

${PERSONA_PUBLISHABLE_DEPLOYMENT_EVIDENCE_DISCIPLINE}

Reuse the Prospect channel guide and exact Prospect section labels for full channel parity:

${PROSPECT_DEPLOYMENT_CHANNEL_GUIDE}

Use exact section labels:
${PROSPECT_DEPLOYMENT_SECTION_LABELS}

${LINKEDIN_PROSPECT_ASSET_GENERATION_RULES}

${WHATSAPP_OUTREACH_GENERATION_RULES}

${input.knowledgeBaseRules}

${HIDDEN_GEMS_GENERATION_RULES}

${SUBSTACK_POST_GENERATION_RULES}

${SUBSTACK_NOTE_GENERATION_RULES}

${REDDIT_POST_GENERATION_RULES}

${SKOOL_POST_GENERATION_RULES}

${SKOOL_COURSE_IDEA_GENERATION_RULES}

${SOCIAL_VOICE_POST_GENERATION_RULES}

${input.visualAssetsBlock}

Channel isolation is mandatory (same Prospect rules, Persona targeting):
- Email must read like email; WhatsApp must read like WhatsApp; LinkedIn must read like LinkedIn.
- Substack Post must be publication-ready long-form editorial content — not SEO or sales copy.
- Substack Note must be a concise feed-native note — not a full newsletter or Substack Post.
- Reddit must be transparent and community-native.
- Skool Post must be discussion-oriented community content — not a cold sales post.
- Skool Course Idea must be Persona-market-specific and teachable — not a generic category course.
- Hidden Gems must be non-obvious analyst findings from available contextual evidence — not a website summary and not Knowledge Base Enhancement.
- Knowledge Base Enhancement must be factual operational knowledge — never invent facts; omit unknowns.
- Social Voice Post must be first-person in the client's Athena Brain Voice — speaking to this Persona market.
- Short Video Prompt, Visual Message Prompt, and Local Outreach Image Prompt are generator prompts only — never scripts, strategies, or explanations.
- Local Outreach Image Prompt may use Persona location fields when available.
Do not let one asset format leak into another.
Newsletter Idea and Blog Post Idea are for the Athena client's audience, using Persona/market evidence — not one-to-one lead emails.
Emit OBJECTION_ANTICIPATION only (never OBJECTION_HANDLING) in this publish-ready package.
Do not emit Persona Analysis headings in this response.

${SHARED_OUTPUT_DIVERSITY_RULES}
`.trim();
}

function buildPersonaAnalysisQualityStandard(): string {
  return `
=== PERSONA ANALYSIS ASSETS ===
${SHARED_ANTI_GENERIC_RULES}

${PERSONA_ANALYSIS_EVIDENCE_DISCIPLINE}

${PERSONA_ANALYSIS_CHANNEL_GUIDE}

Use exact section labels:
${PERSONA_ANALYSIS_SECTION_LABELS}

Treat the subject as an archetype or audience segment — not an identifiable lead.
Do not assume the Reference Website is owned by the Persona.
Do not invent demographic certainty, slang, dialect, or cultural traits without evidence.
Do not emit Prospect Deployment headings (including OBJECTION_ANTICIPATION) in this Analysis response.
Do not collapse output into PRIMARY_REPLY or unlabeled prose.

${SHARED_OUTPUT_DIVERSITY_RULES}
`.trim();
}

export function assembleDeploymentAssetsPrompt(input: {
  bundle: GenerationBundle;
  discussion: Discussion;
  analysis: Record<string, unknown>;
  opportunity?: Opportunity | Record<string, unknown>;
  briefing?: AthenaReview | Record<string, unknown>;
  regenerationRunId?: string;
  brandIdentity?: OrganizationBrandIdentity | null;
  websiteIntelligence?: Record<string, unknown> | null;
  /**
   * Optional authoritative Strategic Blueprint for this generation.
   * Omitted by Standard callers — prompt remains unchanged.
   * Think Differently passes the newly generated blueprint so Deployment Assets
   * stay coherent with that direction (not a prior Standard blueprint).
   */
  strategicBlueprint?: Record<string, unknown> | null;
  /**
   * Persona-only V15 package selector. Ignored for Prospect/Discussion.
   * Defaults to analysis for backward-compatible call sites.
   */
  personaPackageKind?: PersonaDeploymentPromptPackageKind;
}): string {
  const executiveContextBlock = buildDeploymentExecutiveContext(input.bundle, {
    regenerationRunId: input.regenerationRunId,
    discussion: input.discussion,
    analysis: input.analysis,
    opportunity: input.opportunity as Record<string, unknown> | undefined,
  });

  const deepWebsiteIntelligence = isDeepV1WebsiteIntelligenceProvider(
    input.websiteIntelligence,
  )
    ? input.websiteIntelligence
    : null;

  const sourceIntelligence = JSON.stringify(
    {
      discussion: {
        id: input.discussion.id,
        title: input.discussion.title,
        body: input.discussion.body ?? null,
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
      website_intelligence: deepWebsiteIntelligence
        ? {
            provider: deepWebsiteIntelligence.provider,
            url: deepWebsiteIntelligence.url,
            pages_analyzed: deepWebsiteIntelligence.pages_analyzed,
            crawl_summary: deepWebsiteIntelligence.crawl_summary,
            business_knowledge: deepWebsiteIntelligence.business_knowledge,
            pages: Array.isArray(deepWebsiteIntelligence.pages)
              ? deepWebsiteIntelligence.pages.slice(0, 25)
              : [],
          }
        : input.websiteIntelligence
          ? {
              provider:
                (input.websiteIntelligence as Record<string, unknown>).provider ??
                null,
              url: (input.websiteIntelligence as Record<string, unknown>).url ?? null,
            }
          : null,
      ...(input.strategicBlueprint
        ? { strategic_blueprint: input.strategicBlueprint }
        : {}),
    },
    null,
    2,
  );

  const isProspectSource =
    input.discussion.platform === PROSPECT_INTELLIGENCE_PLATFORM;
  const isPersonaSource =
    !isProspectSource &&
    input.discussion.platform === PERSONA_INTELLIGENCE_PLATFORM;
  const personaPackageKind: PersonaDeploymentPromptPackageKind =
    input.personaPackageKind ?? "analysis";

  const knowledgeBaseRules = deepWebsiteIntelligence
    ? KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES
    : KNOWLEDGE_BASE_ENHANCEMENT_GENERATION_RULES;

  const requiredOutput = buildDeploymentAssetsRequiredOutputInstructions({
    isProspectSource,
    isPersonaSource,
    personaPackageKind: isPersonaSource ? personaPackageKind : undefined,
  });

  const visualBrandBlock = formatVisualBrandCreativeDirectionBlock(
    input.brandIdentity,
  );

  const includeLocalOutreachVisual =
    isProspectSource ||
    (isPersonaSource && personaPackageKind === "publishable_deployment");

  const visualAssetsBlock = [
    visualBrandBlock,
    VISUAL_DEPLOYMENT_ASSETS_SHARED_RULES,
    SHORT_VIDEO_PROMPT_GENERATION_RULES,
    VISUAL_MESSAGE_PROMPT_GENERATION_RULES,
    includeLocalOutreachVisual ? LOCAL_OUTREACH_IMAGE_PROMPT_GENERATION_RULES : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const qualityStandard = isProspectSource
    ? buildProspectQualityStandard({ knowledgeBaseRules, visualAssetsBlock })
    : isPersonaSource
      ? personaPackageKind === "publishable_deployment"
        ? buildPersonaPublishableQualityStandard({
            knowledgeBaseRules,
            visualAssetsBlock,
          })
        : buildPersonaAnalysisQualityStandard()
      : `
${
  input.opportunity
    ? DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS
    : DEPLOYMENT_ASSETS_QUALITY_INSTRUCTIONS
}

${visualAssetsBlock}
`.trim();

  const blueprintAuthorityBlock = input.strategicBlueprint
    ? isPersonaSource
      ? `
=== STRATEGIC BLUEPRINT (AUTHORITATIVE FOR THIS GENERATION) ===
This alternative Strategic Blueprint supersedes prior execution strategy.
Persona evidence below is factual grounding only — do not preserve a previous campaign structure merely because evidence is unchanged.
${
  personaPackageKind === "publishable_deployment"
    ? "Persona publish-ready Deployment Assets must operationalize this blueprint direction."
    : "Persona Analysis Assets must operationalize this blueprint direction."
} Do not revert to a prior blueprint or invent a conflicting strategy.
${JSON.stringify(input.strategicBlueprint, null, 2)}
`.trim()
      : `
=== STRATEGIC BLUEPRINT (AUTHORITATIVE FOR THIS GENERATION) ===
This alternative Strategic Blueprint supersedes prior execution strategy.
Prospect facts below are factual grounding only — do not preserve a previous campaign structure merely because facts are unchanged.
Deployment Assets must operationalize this blueprint direction. Do not revert to a prior blueprint or invent a conflicting strategy.
${JSON.stringify(input.strategicBlueprint, null, 2)}
`.trim()
    : "";

  const sourceTypeLine = isProspectSource
    ? "Source type: Prospect Intelligence. Prefer prospect outreach assets over community discussion assets."
    : isPersonaSource
      ? personaPackageKind === "publishable_deployment"
        ? "Source type: Persona Intelligence. Generate publish-ready Deployment Assets that attract, engage, and convert this Persona — full Prospect channel catalog with Persona targeting."
        : "Source type: Persona Intelligence. Generate strategic Persona Analysis Assets — not publish-ready channel Deployment Assets."
      : "";

  const objectiveVerb =
    isPersonaSource && personaPackageKind === "analysis"
      ? "Generate strategic Persona Analysis Assets only from the source intelligence below. Do not repeat executive analysis."
      : "Generate paste-ready deployment assets only from the source intelligence below. Do not repeat executive analysis.";

  const tdObjectiveVerb =
    isPersonaSource && personaPackageKind === "analysis"
      ? "Generate strategic Persona Analysis Assets that operationalize the authoritative alternative Strategic Blueprint. Upstream analysis is factual grounding only — not a mandate to reuse the prior execution package."
      : "Generate paste-ready deployment assets that operationalize the authoritative alternative Strategic Blueprint. Upstream analysis is factual grounding only — not a mandate to reuse the prior execution package.";

  // When a Think Differently blueprint is present, place it above unchanged analysis.
  const objectiveAndSources = input.strategicBlueprint
    ? `
=== OBJECTIVE ===
${tdObjectiveVerb}
${sourceTypeLine}

${blueprintAuthorityBlock}

=== SOURCE INTELLIGENCE (FACTUAL GROUNDING) ===
${sourceIntelligence}

=== REQUIRED OUTPUT ===
${requiredOutput}

=== QUALITY STANDARD ===
${qualityStandard}
`.trim()
    : `
=== OBJECTIVE ===
${objectiveVerb}
${sourceTypeLine}

=== SOURCE INTELLIGENCE ===
${sourceIntelligence}

=== REQUIRED OUTPUT ===
${requiredOutput}

=== QUALITY STANDARD ===
${qualityStandard}
`.trim();

  return [executiveContextBlock, objectiveAndSources].join("\n\n");
}

/** Persona Call 1 — publish-ready 26-asset Prospect catalog with Persona targeting. */
export function assemblePersonaPublishableDeploymentAssetsPrompt(
  input: Omit<Parameters<typeof assembleDeploymentAssetsPrompt>[0], "personaPackageKind">,
): string {
  return assembleDeploymentAssetsPrompt({
    ...input,
    personaPackageKind: "publishable_deployment",
  });
}

/** Persona Call 2 — 14 strategic Analysis Assets. */
export function assemblePersonaAnalysisAssetsPrompt(
  input: Omit<Parameters<typeof assembleDeploymentAssetsPrompt>[0], "personaPackageKind">,
): string {
  return assembleDeploymentAssetsPrompt({
    ...input,
    personaPackageKind: "analysis",
  });
}
