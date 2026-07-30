/**
 * Persona-specific Deployment Asset section labels and generation guide.
 * Used only when discussion.platform === persona_intelligence.
 *
 * Stage 4 decision: optional Persona extras are omitted entirely to keep
 * prompt size and parser risk bounded. Ready/publication completeness uses
 * exactly the 14 required keys below — optional keys must never enter the gate.
 */

export const PERSONA_DEPLOYMENT_SECTION_LABELS = `
PERSONA_EXECUTIVE_PROFILE:
MESSAGING_FRAMEWORK:
VALUE_PROPOSITION:
OBJECTION_HANDLING:
LANGUAGE_AND_TONE_GUIDE:
OFFER_POSITIONING:
CHANNEL_STRATEGY:
CAMPAIGN_CONCEPTS:
CONTENT_THEMES:
ADVERTISEMENT_CONCEPTS:
LANDING_PAGE_DIRECTION:
VISUAL_AND_IMAGE_PROMPT_DIRECTION:
CUSTOMER_EXPERIENCE_GUIDANCE:
VALIDATION_AND_LEARNING_PLAN:
`.trim();

export const PERSONA_DEPLOYMENT_CHANNEL_GUIDE = `
PERSONA_EXECUTIVE_PROFILE — concise archetype description; primary needs and motivations; behavioral and decision patterns; evidence strength; contradictions; unknowns and confidence gaps. Do not invent demographic certainty.
MESSAGING_FRAMEWORK — core message pillars; proof angles; language to use; language to avoid; sample message lines; trust-building principles.
VALUE_PROPOSITION — Persona-specific value proposition; why it matters to them; why now; differentiators; evidence basis.
OBJECTION_HANDLING — objection-response pairs. Clearly distinguish evidenced objections, user-observed objections, and inferred/hypothesized objections.
LANGUAGE_AND_TONE_GUIDE — tone; vocabulary; phrases to use; phrases to avoid; communication sensitivities; cultural or linguistic considerations only where evidence exists. Do not invent slang, dialect, or cultural traits.
OFFER_POSITIONING — packaging; positioning; value framing; pricing sensitivity considerations; offer hierarchy; risk-reduction mechanisms. Use caution when financial profile data is missing.
CHANNEL_STRATEGY — prioritized channels; channel rationale; content/interaction role by channel; evidence or assumptions behind the ranking. Prefer explicitly supplied preferred_channels.
CAMPAIGN_CONCEPTS — 2–3 actionable campaign concepts. Each: insight, hook, message, activation, CTA, validation signal. Do not produce one-to-one cold outreach assets.
CONTENT_THEMES — repeatable editorial themes; purpose; likely Persona interest; suitable formats; funnel or journey role.
ADVERTISEMENT_CONCEPTS — multiple advertisement directions; audience insight; concept; copy direction; CTA; creative considerations. Use ads_content as evidence when present.
LANDING_PAGE_DIRECTION — page narrative; hero direction; proof; objection reduction; section sequence; CTA; trust elements; visual considerations.
VISUAL_AND_IMAGE_PROMPT_DIRECTION — visual tone; credible environments; people/subject direction; composition; imagery to avoid; at least one paste-ready image-generation prompt (preferably two when evidence supports distinct concepts). Avoid stereotypes and visual clichés.
CUSTOMER_EXPERIENCE_GUIDANCE — journey stages; moments of truth; sensitivities; friction reduction; trust and reassurance; service adaptations; follow-up considerations.
VALIDATION_AND_LEARNING_PLAN — weak assumptions; highest-value missing information; hypotheses; inexpensive tests; success/failure signals; how future real-world evidence should refine the Persona.
`.trim();

export const PERSONA_DEPLOYMENT_EVIDENCE_DISCIPLINE = `
=== PERSONA EVIDENCE DISCIPLINE (MANDATORY) ===
Treat the subject as an archetype / audience segment — never as an identifiable individual lead.
Classify every claim as: fact from Persona fields, user observation, source-derived evidence, or inference.
Identify unknowns and confidence gaps instead of fabricating certainty.
Do not invent demographic, financial, cultural, slang, or dialect traits without evidence.
Do not assume the Reference Website belongs to or is owned by the Persona — it is contextual market/reference evidence only.
Do not treat one interaction or observation as universally representative of the entire Persona.
Do not produce one-to-one cold outreach assets (connection notes, personalized cold emails to a named lead).
Do not reuse Prospect LinkedIn character limits or Prospect lead-outreach framing.
Avoid stereotypes and visual clichés.
`.trim();

export const PERSONA_DEPLOYMENT_ASSET_KEYS = [
  "PERSONA_EXECUTIVE_PROFILE",
  "MESSAGING_FRAMEWORK",
  "VALUE_PROPOSITION",
  "OBJECTION_HANDLING",
  "LANGUAGE_AND_TONE_GUIDE",
  "OFFER_POSITIONING",
  "CHANNEL_STRATEGY",
  "CAMPAIGN_CONCEPTS",
  "CONTENT_THEMES",
  "ADVERTISEMENT_CONCEPTS",
  "LANDING_PAGE_DIRECTION",
  "VISUAL_AND_IMAGE_PROMPT_DIRECTION",
  "CUSTOMER_EXPERIENCE_GUIDANCE",
  "VALIDATION_AND_LEARNING_PLAN",
] as const;

export type PersonaDeploymentAssetKey =
  (typeof PERSONA_DEPLOYMENT_ASSET_KEYS)[number];

export const PERSONA_DEPLOYMENT_ASSET_META: Record<
  PersonaDeploymentAssetKey,
  { title: string; objective: string }
> = {
  PERSONA_EXECUTIVE_PROFILE: {
    title: "Persona Executive Profile",
    objective:
      "Concise archetype profile with needs, patterns, evidence strength, and unknowns.",
  },
  MESSAGING_FRAMEWORK: {
    title: "Messaging Framework",
    objective: "Message pillars, proof angles, language guidance, and sample lines.",
  },
  VALUE_PROPOSITION: {
    title: "Value Proposition",
    objective: "Persona-specific value proposition with why-now and evidence basis.",
  },
  OBJECTION_HANDLING: {
    title: "Objection Handling",
    objective:
      "Objection-response pairs distinguishing evidenced, observed, and inferred objections.",
  },
  LANGUAGE_AND_TONE_GUIDE: {
    title: "Language and Tone Guide",
    objective: "Tone, vocabulary, phrases, and communication sensitivities.",
  },
  OFFER_POSITIONING: {
    title: "Offer Positioning",
    objective: "Packaging, positioning, pricing sensitivity, and risk reduction.",
  },
  CHANNEL_STRATEGY: {
    title: "Channel Strategy",
    objective: "Prioritized channels with rationale and evidence/assumptions.",
  },
  CAMPAIGN_CONCEPTS: {
    title: "Campaign Concepts",
    objective: "2–3 actionable campaign concepts with validation signals.",
  },
  CONTENT_THEMES: {
    title: "Content Themes",
    objective: "Repeatable editorial themes with formats and journey role.",
  },
  ADVERTISEMENT_CONCEPTS: {
    title: "Advertisement Concepts",
    objective: "Multiple ad directions with insight, copy, CTA, and creative notes.",
  },
  LANDING_PAGE_DIRECTION: {
    title: "Landing Page Direction",
    objective: "Page narrative, proof, objection reduction, CTA, and trust elements.",
  },
  VISUAL_AND_IMAGE_PROMPT_DIRECTION: {
    title: "Visual and Image Prompt Direction",
    objective:
      "Visual tone, composition guidance, and paste-ready image-generation prompts.",
  },
  CUSTOMER_EXPERIENCE_GUIDANCE: {
    title: "Customer Experience Guidance",
    objective: "Journey stages, moments of truth, friction reduction, and follow-up.",
  },
  VALIDATION_AND_LEARNING_PLAN: {
    title: "Validation and Learning Plan",
    objective:
      "Weak assumptions, missing information, cheap tests, and refinement signals.",
  },
};
