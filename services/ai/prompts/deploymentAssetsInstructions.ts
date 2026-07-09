import {
  SHARED_ANTI_GENERIC_RULES,
  SHARED_DEPLOYMENT_QUALITY,
  SHARED_FORBIDDEN_PHRASES,
  DEPLOYMENT_SECTION_LABELS,
  DEPLOYMENT_CHANNEL_GUIDE,
} from "@/services/ai/prompts/sharedPromptConstraints";

export const DEPLOYMENT_ASSETS_ANTI_GENERIC_RULES = SHARED_ANTI_GENERIC_RULES;

export const DEPLOYMENT_ASSETS_SELF_CHECK = `
Before returning, verify each deployment section scores 9/10 on specificity, commercial leverage, differentiation, persona fit, and non-generic insight. Rewrite weak sections.
`.trim();

export const DEPLOYMENT_ASSETS_FORMAT = `
Use exact section labels:

${DEPLOYMENT_SECTION_LABELS}
`.trim();

export const DEPLOYMENT_ASSETS_QUALITY_INSTRUCTIONS = `
=== DEPLOYMENT ASSETS ===
${SHARED_DEPLOYMENT_QUALITY}
`.trim();

export const DEPLOYMENT_ASSETS_BRIEFING_QUALITY_INSTRUCTIONS = `
=== DEPLOYMENT ASSETS ===
${SHARED_DEPLOYMENT_QUALITY}
Briefing summary stays analytical. recommended_response holds deployment copy; cta holds one exact CTA sentence.
`.trim();

export { DEPLOYMENT_CHANNEL_GUIDE, SHARED_FORBIDDEN_PHRASES };
