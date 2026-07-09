import {
  SHARED_ANTI_GENERIC_RULES,
  SHARED_JSON_OUTPUT_RULES,
  SHARED_OUTPUT_DIVERSITY_RULES,
} from "@/services/ai/prompts/sharedPromptConstraints";

export const ASSET_BLUEPRINT_PROMPT_VERSION =
  "asset_blueprint_v7_executive_consultant";

export const ASSET_BLUEPRINT_OUTPUT_SCHEMA = `
{
  "asset_title": "Insight-led title — names the commercial problem, not the format.",
  "asset_type": "readiness_scorecard | diagnostic_assessment | decision_matrix | business_readiness_audit | roi_calculator | implementation_teardown | comparison_framework | objection_proof_asset | market_myth_teardown | launch_roadmap | authority_manifesto | consultation_qualification_tool | benchmark_report | mistake_map | confidence_audit | playbook | buyer_guide | email_course | challenge | workshop | webinar | pdf_guide | checklist | carousel | framework | lead_magnet | landing_page | video_script | social_post | image",
  "asset_objective": "What buyer decision this asset advances.",
  "business_objective": "Commercial outcome for the organization.",
  "target_audience": "Specific audience, sophistication, and current uncertainty.",
  "buyer_stage": "Buyer stage.",
  "primary_pain_point": "Real uncertainty or objection from the discussion.",
  "core_message": "Single commercial message.",
  "desired_transformation": "From current uncertainty to confident next action.",
  "executive_rationale": "Why this asset matters, why now, and which business objective it advances.",
  "why_this_asset": "Why this beats alternatives for THIS discussion and expected commercial outcome.",
  "supporting_evidence": ["Evidence from discussion and context"],
  "sophistication_level": "beginner | intermediate | advanced | executive",
  "strategic_angle": "Non-obvious angle competitors would miss in this market.",
  "priority": "low | medium | high",
  "estimated_reuse": 1,
  "production_specs": {
    "output_format": "Primary format.",
    "page_or_slide_count": "Count.",
    "visual_direction": "Visual direction.",
    "editorial_direction": "Editorial direction.",
    "content_depth": "Depth.",
    "brand_tone": "Brand tone from Business Context.",
    "cta_objective": "CTA objective.",
    "distribution_channel": "Channel.",
    "reuse_strategy": "How this asset will be reused across channels."
  },
  "business_goal": "trust | qualification | conversion | objection_removal",
  "image_prompt": "Standalone visual production prompt.",
  "pdf_prompt": "Standalone PDF/asset production prompt with structure and CTA.",
  "social_prompt": "Standalone social campaign prompt with hook and CTA.",
  "notes": "WHY NOW: ... | BUSINESS OBJECTIVE: ... | COMMERCIAL OUTCOME: ... | REJECTED: ... | ANGLE: ..."
}`.trim();

const BLUEPRINT_INSTRUCTIONS = `
=== OBJECTIVE ===
Act as an experienced executive strategy consultant. Select ONE highest-leverage strategic asset for this discussion, then write three channel-specific production prompts (image, PDF/asset, social).

The asset must be reusable, commercially valuable, educational, differentiated, and channel-specific.

=== STRATEGIC SELECTION ===
You must decide asset_type yourself after evaluating:
- buyer uncertainty
- hidden objection
- commercial objective
- best conversion mechanism
- reusable value across channels

Compare multiple asset structures internally. Do not accept a pre-decided format from context signals.
Do not default to webinar, generic guide, checklist, or framework unless reasoning clearly justifies them as strongest.

Every blueprint must explain in executive_rationale and notes:
- Why this asset matters
- Why now
- Which business objective it advances
- Expected commercial outcome

=== PRODUCTION PROMPTS ===
- image_prompt, pdf_prompt, and social_prompt must each be independently paste-ready.
- pdf_prompt: self-diagnosis or decision asset — not a generic ebook outline.
- social_prompt: belief-shift or tension-led campaign — not filler carousel instructions.

=== QUALITY STANDARD ===
${SHARED_ANTI_GENERIC_RULES}

${SHARED_OUTPUT_DIVERSITY_RULES}

${SHARED_JSON_OUTPUT_RULES}
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
