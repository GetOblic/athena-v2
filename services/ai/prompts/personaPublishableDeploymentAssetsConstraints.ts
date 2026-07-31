/**
 * Persona-only overlay for publish-ready Deployment Assets (V15 Call 1).
 *
 * Reuses Prospect canonical keys, channel guide, formatting rules, validators,
 * and optional extras. Does not modify Prospect prompt modules.
 */

export const PERSONA_PUBLISHABLE_DEPLOYMENT_TARGETING = `
=== PERSONA TARGETING (PUBLISH-READY DEPLOYMENT ASSETS) ===
Create publish-ready assets for a business that wants to attract, engage, and convert this Persona.

Do NOT write assets as if contacting one named lead who is the Persona.
Write channel-ready copy a business would publish or send to reach people who match this Persona.

The Persona profile, Athena Brain / business context, and cautious broader contextual knowledge must shape the final copy so different Personas produce visibly different assets in:
- vocabulary and cadence
- emotional framing and examples
- trust mechanisms and objections
- offers and calls to action
- channel execution
- visual direction
`.trim();

export const PERSONA_PUBLISHABLE_CONTEXTUAL_REASONING = `
=== CONTEXTUAL REASONING (STRATEGIC HYPOTHESES, NOT CERTAINTIES) ===
Where relevant, enrich reasoning with cautious, non-stereotyped contextual knowledge relating to:
- cultural and regional communication norms
- generational patterns
- professional and industry norms
- media habits and digital maturity
- trust signals and buying psychology
- socioeconomic context
- common behavioral patterns
- persuasive communication principles and marketing best practices
- broader public-domain knowledge

Rules:
- Persona profile fields remain the primary grounding source.
- Use contextual patterns as strategic hypotheses, not verified facts.
- Do not restate Persona fields repeatedly.
- Do not make demographic assumptions sound like verified facts.
- Do not imitate accents or caricature slang.
- Do not use clichés or identity stereotypes.
- Do not override explicit Persona information with inferred patterns.
- Do not invent web research, live browsing, RAG, or external data sources.
`.trim();

export const PERSONA_PUBLISHABLE_DEPLOYMENT_EVIDENCE_DISCIPLINE = `
=== PERSONA PUBLISHABLE DEPLOYMENT DISCIPLINE (MANDATORY) ===
Treat the subject as an archetype / audience segment — never as an identifiable individual lead.
Classify claims as: fact from Persona fields, user observation, source-derived evidence, or contextual hypothesis.
Identify unknowns instead of fabricating certainty.
Do not assume the Reference Website is owned by the Persona — it is contextual market/reference evidence only.
Reuse Prospect channel formats, length limits, and section labels exactly — including LinkedIn 200-character limits and all optional extras.
Emit OBJECTION_ANTICIPATION for publish-ready objection copy. Do not emit OBJECTION_HANDLING in this Deployment response (that key is reserved for Persona Analysis Assets).
Avoid stereotypes and visual clichés.
`.trim();
