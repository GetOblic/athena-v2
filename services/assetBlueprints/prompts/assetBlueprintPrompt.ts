import {
  SHARED_ANTI_GENERIC_RULES,
  SHARED_OUTPUT_DIVERSITY_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

export const ASSET_BLUEPRINT_PROMPT_VERSION =
  "asset_blueprint_v8_simple_json_strings";

export const ASSET_BLUEPRINT_OUTPUT_SCHEMA = `
{
  "asset_title": "Insight-led title naming the commercial problem.",
  "asset_type": "Single asset type you select after strategic evaluation.",
  "business_goal": "Primary commercial goal this asset advances.",
  "target_audience": "Specific audience and current uncertainty.",
  "priority": "low | medium | high",
  "estimated_reuse": "Estimated number of times this asset can be reused.",
  "image_prompt": "Standalone visual production prompt.",
  "pdf_prompt": "Standalone PDF or asset production prompt with structure and CTA.",
  "social_prompt": "Standalone social campaign prompt with hook and CTA.",
  "notes": "Why this asset, why now, business objective, and expected outcome."
}`.trim();

const BLUEPRINT_INSTRUCTIONS = `
=== OBJECTIVE ===
Act as an experienced executive strategy consultant. Select ONE highest-leverage strategic asset for this discussion, then write three channel-specific production prompts (image, PDF/asset, social).

=== OUTPUT CONTRACT (CRITICAL) ===
Return ONE JSON object only.
- No markdown fences
- No prose before or after the JSON
- No arrays
- No nested objects
- Every field value must be a plain string
- Include every required field exactly once

Required fields:
asset_title, asset_type, business_goal, target_audience, priority, estimated_reuse, image_prompt, pdf_prompt, social_prompt, notes

=== STRATEGIC SELECTION ===
Decide asset_type yourself after evaluating buyer uncertainty, objections, commercial objective, and conversion mechanism.
Do not default to webinar, generic guide, checklist, or framework unless clearly strongest.

=== PRODUCTION PROMPTS ===
image_prompt, pdf_prompt, and social_prompt must each be independently paste-ready production instructions.

=== QUALITY STANDARD ===
${SHARED_ANTI_GENERIC_RULES}

${SHARED_OUTPUT_DIVERSITY_RULES}
`.trim();

function formatDiscussionSourceContext(discussion: Record<string, unknown>): string {
  const title = String(discussion.title ?? "").trim();
  const body = String(discussion.body ?? discussion.content ?? "").trim();

  return [
    "=== DISCUSSION ===",
    title ? `Title: ${title}` : "",
    body ? `Thread:\n${body}` : JSON.stringify(discussion, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatSupplementalContext(
  label: string,
  source: Record<string, unknown>,
  secondary?: Record<string, unknown>,
): string {
  const primary = [
    "=== AVAILABLE DATA ===",
    `${label}:`,
    `- Summary: ${String(source.summary ?? source.ai_summary ?? "N/A")}`,
    `- Pain points: ${String(source.pain_points ?? "N/A")}`,
    `- Buyer stage: ${String(source.buyer_stage ?? "N/A")}`,
    `- Recommended action: ${String(source.recommended_action ?? source.recommended_response ?? "N/A")}`,
    `- Opportunity reason: ${String(source.opportunity_reason ?? source.reason ?? "N/A")}`,
  ].join("\n");

  if (!secondary) {
    return primary;
  }

  return [
    primary,
    "",
    "Briefing:",
    `- Summary: ${String(secondary.summary ?? "N/A")}`,
    `- CTA: ${String(secondary.cta ?? "N/A")}`,
  ].join("\n");
}

function buildBlueprintPromptBody(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  discussion: Record<string, unknown>;
  supplementalLabel: string;
  supplementalSource: Record<string, unknown>;
  supplementalSecondary?: Record<string, unknown>;
}): string {
  return `
${BLUEPRINT_INSTRUCTIONS}

=== BUSINESS CONTEXT ===
${input.executiveContextPrompt}

${input.productionSpecsPrompt}

${formatDiscussionSourceContext(input.discussion)}

${formatSupplementalContext(
  input.supplementalLabel,
  input.supplementalSource,
  input.supplementalSecondary,
)}

=== REQUIRED OUTPUT ===
${ASSET_BLUEPRINT_OUTPUT_SCHEMA}
`.trim();
}

export function buildAssetBlueprintPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  discussion: Record<string, unknown>;
  opportunity: Record<string, unknown>;
  briefing: Record<string, unknown>;
}) {
  return buildBlueprintPromptBody({
    executiveContextPrompt: input.executiveContextPrompt,
    productionSpecsPrompt: input.productionSpecsPrompt,
    discussion: input.discussion,
    supplementalLabel: "Opportunity",
    supplementalSource: input.opportunity,
    supplementalSecondary: input.briefing,
  });
}

export function buildAssetBlueprintFromAnalysisPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  discussion: Record<string, unknown>;
  analysis: Record<string, unknown>;
}) {
  return buildBlueprintPromptBody({
    executiveContextPrompt: input.executiveContextPrompt,
    productionSpecsPrompt: input.productionSpecsPrompt,
    discussion: input.discussion,
    supplementalLabel: "Executive Intelligence",
    supplementalSource: input.analysis,
  });
}

export function getAssetBlueprintOutputSchemaForDebug(): string {
  return `${BLUEPRINT_INSTRUCTIONS}\n\n${ASSET_BLUEPRINT_OUTPUT_SCHEMA}`;
}

export const ASSET_BLUEPRINT_GENERATION_RULES = BLUEPRINT_INSTRUCTIONS;
