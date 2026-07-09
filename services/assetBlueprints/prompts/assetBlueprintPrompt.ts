export const ASSET_BLUEPRINT_PROMPT_VERSION =
  "asset_blueprint_v5_output_quality";

export const ASSET_BLUEPRINT_OUTPUT_SCHEMA = `
{
  "asset_title": "Specific, commercially sharp title — must name the strategic insight, not the format.",
  "asset_type": "diagnostic_assessment | readiness_scorecard | implementation_teardown | comparison_framework | objection_proof_asset | case_study_sequence | decision_matrix | business_readiness_audit | roi_calculator | launch_roadmap | authority_manifesto | market_myth_teardown | offer_positioning_asset | consultation_qualification_tool | pdf_guide | checklist | carousel | framework | lead_magnet | email_sequence | landing_page | video_script | webinar | blog_article | social_post | faq | image",
  "asset_objective": "What this asset achieves for the buyer's decision — not generic education.",
  "business_objective": "The commercial outcome this asset must drive.",
  "target_audience": "Specific audience segment with sophistication level and current uncertainty.",
  "buyer_stage": "Buyer stage this asset addresses.",
  "primary_pain_point": "The real uncertainty or hidden objection this asset resolves.",
  "core_message": "Single core commercial message aligned to Executive Understanding.",
  "desired_transformation": "Buyer transformation: from uncertainty to confident action.",
  "executive_rationale": "Why this is the highest-leverage move right now.",
  "why_this_asset": "Explicitly why this asset beats webinar, guide, PDF, checklist, carousel, and generic social post for THIS discussion.",
  "supporting_evidence": ["Evidence point 1 from discussion or analysis", "Evidence point 2"],
  "sophistication_level": "beginner | intermediate | advanced | executive",
  "strategic_angle": "The non-obvious strategic angle that generic competitors would miss.",
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
  "business_goal": "Commercial goal: what revenue, trust, or conversion outcome this asset must produce — not 'educate audience'.",
  "image_prompt": "COMPLETE production-ready visual prompt: format, composition, emotional hierarchy, typography direction, visual metaphor, brand tone, background, color palette, subject matter, cover copy, and explicit AVOID list (stock clichés, fake medical imagery, income promises).",
  "pdf_prompt": "COMPLETE production-ready PDF/asset prompt: title, audience, strategic angle, page-by-page structure with section headlines, self-diagnosis flow, voice instructions, design tone, CTA page, and explicit what-NOT-to-include list. This is a conversion asset — not a generic guide.",
  "social_prompt": "COMPLETE campaign-ready prompt: platform, hook, post/carousel/video structure slide-by-slide, emotional trigger, core insight, caption direction, visual direction, CTA, and reuse plan. Must be specific (e.g. belief-shift carousel), not 'Create a 5-slide carousel about...'.",
  "notes": "REJECTED GENERIC OPTION: [what you rejected]. REJECTION REASON: [why]. SELECTED STRATEGIC ANGLE: [angle]. PRIMARY CTA: [exact CTA]. REUSE PLAN: [how to redeploy]. COMMERCIAL STRENGTH: [why this asset beats obvious webinar/guide/social post for THIS discussion]."
}`.trim();

export const ASSET_BLUEPRINT_GENERATION_RULES = `
CRITICAL RULES:
- Return ONLY valid JSON. No markdown. No code fences. No prose outside JSON.
- You are selecting a commercial weapon, not describing content marketing.
- Each prompt field must be independently paste-ready for downstream AI tools.
- Do not duplicate the same wording across image_prompt, pdf_prompt, and social_prompt.
- Follow Production Specifications and Executive Asset Standards unless a sharper commercial asset clearly wins — if you override, explain in why_this_asset and notes.
- Align with Executive Understanding, Business Decision, and Athena Brain identity — no strategic contradictions.
- Use the operator's voice, expertise, domain terminology, and constraints from context.
- Do not invent credentials, guarantees, income promises, or unsupported claims.
- estimated_reuse must be an integer from 1 to 5.
- Phrase the asset as recommended; do not claim it already exists.
- supporting_evidence must reference provided discussion, analysis, or briefing evidence.

FIELD QUALITY BAR:
- asset_title: Must be specific and commercially sharp — name the insight, not the format. FAIL if it could apply to any educator in the domain.
  Bad: "The Career Foundation Webinar"
  Good: "The Business Readiness Scorecard: Are You Actually Ready to Take Paying Clients?"
  Strong patterns: readiness scorecard, confidence audit, first-90-days roadmap, missing-half teardown, clinical-skill-is-not-a-business-plan, investment-recovery diagnosis.
- business_goal: Must state commercial outcome (trust, qualification, conversion, objection removal) — not 'educate audience' alone.
- why_this_asset: Must name at least one rejected generic alternative and why this asset wins commercially.
- image_prompt: Must specify format, composition, emotional hierarchy, typography, visual metaphor, palette, subject, brand tone, and what to avoid.
- pdf_prompt: Must include title, audience, angle, page-by-page structure, headlines, self-diagnosis flow, CTA, voice, design tone — conversion asset not generic guide.
- social_prompt: Must specify platform, hook, structure, emotional trigger, captions, visuals, CTA, reuse — campaign-ready not generic carousel outline.
- notes: Must include rejected generic option, rejection reason, selected angle, primary CTA, reuse plan, and commercial strength vs obvious assets.

HARD ANTI-GENERIC FAILURES (do not produce output that triggers these):
- If the output could be produced by a generic ChatGPT prompt with no discussion context, it FAILS.
- If the asset does not reveal a specific strategic insight from THIS discussion, it FAILS.
- If the title could apply to any operator in this domain without modification, it FAILS.
- If asset_type is webinar, guide, pdf_guide, checklist, carousel, or lead_magnet, why_this_asset MUST explain why diagnostic, scorecard, audit, proof, comparison, or decision assets would NOT be stronger.
- Ban empty filler: 'comprehensive guide', 'ultimate guide', 'valuable insights', 'take your business to the next level', 'help you succeed', 'learn everything you need', 'join our webinar', 'comment below', 'thought leadership', 'best practices', 'we are experts' unless directly quoting source context.
`.trim();

const PRODUCTION_PROMPT_FIELD_INSTRUCTIONS = `
PRODUCTION PROMPT FIELD INSTRUCTIONS:

image_prompt must include ALL of:
- Format (cover, hero, carousel slide 1, etc.)
- Composition and focal hierarchy
- Emotional tone (reassuring, clinical, premium — match brand)
- Typography direction
- Visual metaphor tied to strategic angle
- Background and color palette
- Subject matter specifics from discussion
- Cover/copy text direction
- AVOID list (stock smiling students, fake medical imagery, income promises, competitor attacks, exaggerated luxury)

pdf_prompt must include ALL of:
- Asset title and target audience
- Strategic angle and conversion objective
- Page-by-page or section-by-section structure with headlines
- Self-diagnosis or decision flow (reader identifies their gap)
- Voice and design tone from Athena Brain/persona
- Proof or credibility beats (no invented claims)
- Final CTA page driving consultation/application/next step
- Explicit what-NOT-to-include (generic guide filler, unsupported guarantees)

social_prompt must include ALL of:
- Target platform(s)
- Campaign hook and emotional trigger
- Slide/post/scene structure with belief-shift arc
- Core insight from discussion
- Caption direction per unit
- Visual direction per unit
- CTA and reuse plan across channels
- Must read like: "Create a 5-slide belief-shift carousel that reframes success from certification to client-readiness" — NOT "Create a carousel about training"
`.trim();

const BLUEPRINT_SELF_CHECK = `
SELF-CHECK (complete silently before returning — do not expose scores):
Score 1–10: Specificity, Commercial leverage, Differentiation, Voice/persona fit, Execution readiness, Non-generic insight, Title sharpness, Image prompt readiness, PDF prompt readiness, Social prompt readiness.
If ANY category is below 9/10, rewrite before returning.
`.trim();

const COMMERCIAL_STRATEGIST_PREAMBLE = `
You are not a content marketer.
You are a senior commercial strategist working inside Athena.

Your task is to select the single highest-leverage strategic asset for this exact discussion and produce paste-ready production prompts for it.

You are NOT creating the asset content.
You ARE choosing the commercial move that moves the buyer from uncertainty to action, then specifying how to produce it.

Do NOT default to:
- webinar
- guide
- PDF
- checklist
- carousel
- lead magnet
- generic social post

unless that format is clearly the strongest commercial move for THIS buyer and THIS objection.

Before selecting the asset, determine from the provided context:
1. The buyer's real uncertainty (what they cannot decide alone)
2. The hidden objection (what they fear but did not say directly)
3. The commercial leverage point (where trust or clarity unlocks action)
4. What would make this audience trust the business faster than competitors
5. What asset creates the shortest path to a qualified action

Prefer sharper commercial assets such as:
- diagnostic assessment
- readiness scorecard
- decision matrix
- business readiness audit
- objection-breaking proof asset
- implementation teardown
- market myth teardown
- ROI calculator
- launch roadmap / first-90-days roadmap
- authority manifesto
- consultation qualification tool
- comparison framework
- mistake map
- confidence audit
- operating system
- benchmark report

Use Athena Brain identity, persona, expertise, and Intelligence Domain context when present in the executive context blocks.
Use discussion title/body, executive intelligence/analysis, opportunity, and briefing when provided.
`.trim();

const ASSET_SELECTION_INSTRUCTIONS = `
ASSET SELECTION PROCESS (complete mentally before writing JSON):
Step 1 — Name the core commercial objective for this opportunity.
Step 2 — Name the buyer psychology (fear, confusion, comparison paralysis, readiness doubt, etc.).
Step 3 — Name the conversion mechanism (what action this asset must make feel safe and obvious).
Step 4 — List 2–3 obvious generic assets you are REJECTING (e.g. generic webinar, generic guide).
Step 5 — Select ONE asset that can actually help win this opportunity.
Step 6 — Make it specific to this Athena Brain, persona, domain, and discussion — not a template any competitor could copy.
Step 7 — Write production prompts that a senior operator can paste into AI tools immediately.
`.trim();

function formatDiscussionSourceContext(discussion: Record<string, unknown>): string {
  const title = String(discussion.title ?? "").trim();
  const body = String(discussion.body ?? discussion.content ?? "").trim();

  return [
    "=== SOURCE: DISCUSSION ===",
    title ? `Title: ${title}` : "",
    body ? `Body / thread:\n${body}` : JSON.stringify(discussion, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCommercialStrategicBlueprintPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  assetStandardPrompt: string;
  discussion: Record<string, unknown>;
  supplementalSourceLabel: string;
  supplementalSource: Record<string, unknown>;
  supplementalSourceSecondary?: Record<string, unknown>;
}): string {
  const secondaryBlock = input.supplementalSourceSecondary
    ? `\n\n=== ${input.supplementalSourceLabel} (EXECUTIVE INTELLIGENCE / ANALYSIS) ===\n${JSON.stringify(input.supplementalSource, null, 2)}\n\n=== SOURCE: BRIEFING ===\n${JSON.stringify(input.supplementalSourceSecondary, null, 2)}`
    : `\n\n=== ${input.supplementalSourceLabel} ===\n${JSON.stringify(input.supplementalSource, null, 2)}`;

  return `
${COMMERCIAL_STRATEGIST_PREAMBLE}

${ASSET_SELECTION_INSTRUCTIONS}

=== ATHENA EXECUTIVE CONTEXT (Brain, reasoning pipeline, strategy, contract) ===
${input.executiveContextPrompt}

=== ASSET PRODUCTION SPECIFICATIONS ===
${input.productionSpecsPrompt}

=== EXECUTIVE ASSET STANDARDS ===
${input.assetStandardPrompt}

${formatDiscussionSourceContext(input.discussion)}
${secondaryBlock}

${PRODUCTION_PROMPT_FIELD_INSTRUCTIONS}

${BLUEPRINT_SELF_CHECK}

Return exactly this JSON structure:

${ASSET_BLUEPRINT_OUTPUT_SCHEMA}

${ASSET_BLUEPRINT_GENERATION_RULES}
`.trim();
}

export function buildAssetBlueprintPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  assetStandardPrompt: string;
  discussion: Record<string, unknown>;
  opportunity: Record<string, unknown>;
  briefing: Record<string, unknown>;
}) {
  return buildCommercialStrategicBlueprintPrompt({
    executiveContextPrompt: input.executiveContextPrompt,
    productionSpecsPrompt: input.productionSpecsPrompt,
    assetStandardPrompt: input.assetStandardPrompt,
    discussion: input.discussion,
    supplementalSourceLabel: "SOURCE: OPPORTUNITY",
    supplementalSource: input.opportunity,
    supplementalSourceSecondary: input.briefing,
  });
}

export function buildAssetBlueprintFromAnalysisPrompt(input: {
  executiveContextPrompt: string;
  productionSpecsPrompt: string;
  assetStandardPrompt: string;
  discussion: Record<string, unknown>;
  analysis: Record<string, unknown>;
}) {
  return buildCommercialStrategicBlueprintPrompt({
    executiveContextPrompt: input.executiveContextPrompt,
    productionSpecsPrompt: input.productionSpecsPrompt,
    assetStandardPrompt: input.assetStandardPrompt,
    discussion: input.discussion,
    supplementalSourceLabel: "SOURCE: DISCUSSION ANALYSIS / EXECUTIVE INTELLIGENCE",
    supplementalSource: input.analysis,
  });
}

export function getAssetBlueprintOutputSchemaForDebug(): string {
  return `${ASSET_BLUEPRINT_OUTPUT_SCHEMA}\n\n${ASSET_BLUEPRINT_GENERATION_RULES}`;
}
