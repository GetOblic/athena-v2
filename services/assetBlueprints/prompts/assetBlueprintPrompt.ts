export const ASSET_BLUEPRINT_PROMPT_VERSION = "asset_blueprint_v3_asset_standards";

const BLUEPRINT_JSON_SCHEMA = `
{
  "asset_title": "Specific, distinctive title — not generic.",
  "asset_type": "pdf_guide | checklist | carousel | framework | lead_magnet | email_sequence | landing_page | video_script | webinar | blog_article | social_post | faq | image",
  "asset_objective": "What this executable asset achieves for the audience.",
  "business_objective": "Business outcome this asset supports.",
  "target_audience": "Specific audience segment including sophistication level.",
  "buyer_stage": "Buyer stage this asset addresses.",
  "primary_pain_point": "Primary pain point the asset resolves.",
  "core_message": "Single core message aligned to Executive Understanding.",
  "desired_transformation": "Audience transformation after consuming the asset.",
  "executive_rationale": "Why this asset is the right strategic choice now.",
  "supporting_evidence": ["Evidence point 1", "Evidence point 2"],
  "sophistication_level": "beginner | intermediate | advanced | executive",
  "strategic_angle": "The strategic angle used for differentiation.",
  "priority": "low | medium | high",
  "estimated_reuse": 1,
  "production_specs": {
    "output_format": "Primary output format.",
    "page_or_slide_count": "Exact page/slide/screen count.",
    "visual_direction": "Visual direction for designers or image AI.",
    "editorial_direction": "Editorial and copy direction.",
    "content_depth": "Depth expectations.",
    "brand_tone": "Brand tone requirements.",
    "cta_objective": "CTA objective.",
    "distribution_channel": "Primary distribution channel.",
    "reuse_strategy": "How to reuse across channels."
  },
  "business_goal": "Concise business goal combining asset and business objectives.",
  "image_prompt": "COMPLETE paste-ready prompt for cover/visual generation including style, composition, typography, color palette, and cover copy.",
  "pdf_prompt": "COMPLETE paste-ready prompt for PDF/guide/checklist/framework generation including layout, section hierarchy, diagrams, tables, callouts, icons, cover page, and CTA page.",
  "social_prompt": "COMPLETE paste-ready prompt for social/carousel generation including slide-by-slide or post-by-post structure, hooks, copy blocks, and CTA.",
  "notes": "Internal operator notes: when to deploy, channel strategy, and alignment confirmation with Executive Understanding."
}`.trim();

const BLUEPRINT_GENERATION_RULES = `
CRITICAL RULES:
- Return ONLY valid JSON. No markdown. No code fences.
- Describe executable marketing assets, not abstract content ideas.
- Do not use generic phrases like "comprehensive guide" without specific structure.
- Do not duplicate the same wording across image_prompt, pdf_prompt, and social_prompt.
- Each prompt must be independently paste-ready for downstream AI tools (ChatGPT, Claude, Gemini, Canva AI, Gamma, HeyGen, Midjourney, etc.).
- Follow the Production Specifications, Executive Asset Standards, and strategic angle exactly.
- Align with Executive Understanding — no strategic contradictions.
- Match sophistication level to buyer stage and terminology depth.
- Use business identity voice, expertise, and constraints.
- Do not invent credentials, guarantees, income promises, or unsupported claims.
- estimated_reuse must be an integer from 1 to 5.
- Phrase the asset as recommended; do not claim it already exists.
- Materially differentiate output using the provided strategic angle — not a generic rewrite.
- For PDF prompts: include layout, section hierarchy, design direction, diagrams, comparison tables, callout boxes, icons, and cover page instructions.
- For carousel/social prompts: include slide-by-slide breakdown with hooks and CTAs.
- For video/webinar prompts: include scene or agenda breakdown inside pdf_prompt or social_prompt as appropriate.
- supporting_evidence must reference provided evidence; do not hallucinate proof.
`.trim();

export function buildAssetBlueprintPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  assetStandardPrompt: string;
  discussion: Record<string, unknown>;
  opportunity: Record<string, unknown>;
  briefing: Record<string, unknown>;
}) {
  return `
You are Athena's Senior Strategic Asset Architect.

Your job is to produce a production-ready Strategic Asset Blueprint — not a content description.

Another operator will paste your prompts directly into AI tools to generate the actual asset.

=== EXECUTIVE STRATEGY AND GENERATION CONTRACT ===
${input.executiveContextPrompt}

=== ASSET PRODUCTION SPECIFICATIONS ===
${input.productionSpecsPrompt}

=== EXECUTIVE ASSET STANDARDS ===
${input.assetStandardPrompt}

=== SOURCE: DISCUSSION ===
${JSON.stringify(input.discussion, null, 2)}

=== SOURCE: OPPORTUNITY ===
${JSON.stringify(input.opportunity, null, 2)}

=== SOURCE: BRIEFING ===
${JSON.stringify(input.briefing, null, 2)}

Return exactly this JSON structure:

${BLUEPRINT_JSON_SCHEMA}

${BLUEPRINT_GENERATION_RULES}
`.trim();
}

export function buildAssetBlueprintFromAnalysisPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  assetStandardPrompt: string;
  discussion: Record<string, unknown>;
  analysis: Record<string, unknown>;
}) {
  return `
You are Athena's Senior Strategic Asset Architect.

Your job is to produce a production-ready Strategic Asset Blueprint — not a content description.

Another operator will paste your prompts directly into AI tools to generate the actual asset.

=== EXECUTIVE STRATEGY AND GENERATION CONTRACT ===
${input.executiveContextPrompt}

=== ASSET PRODUCTION SPECIFICATIONS ===
${input.productionSpecsPrompt}

=== EXECUTIVE ASSET STANDARDS ===
${input.assetStandardPrompt}

=== SOURCE: DISCUSSION ===
${JSON.stringify(input.discussion, null, 2)}

=== SOURCE: DISCUSSION ANALYSIS ===
${JSON.stringify(input.analysis, null, 2)}

Return exactly this JSON structure:

${BLUEPRINT_JSON_SCHEMA}

${BLUEPRINT_GENERATION_RULES}
`.trim();
}
