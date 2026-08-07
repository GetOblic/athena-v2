import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const SEO_TECHNICAL_SHARED_CONSTRAINTS_VERSION =
  "seo_technical_shared_constraints_v1";

/**
 * Technical SEO is allowed to discuss on-page technical topics grounded in
 * Athena deterministic evidence. It must NOT invent unsupported metrics.
 * Intentionally does NOT include SEO_TECHNICAL_AUDIT_PROHIBITIONS.
 */
export const SEO_TECHNICAL_UNSUPPORTED_METRIC_PROHIBITIONS = `
Unsupported metric prohibitions (mandatory for Technical SEO):
- Never claim Core Web Vitals, PageSpeed scores, LCP, CLS, INP, or lab performance scores.
- Never claim Search Console, Google Analytics, Semrush, Ahrefs, backlink, domain authority, or index-coverage evidence.
- Never invent rankings, search volumes, traffic measurements, or keyword-database stats.
- Ground every factual finding in the provided DETERMINISTIC TECHNICAL SEO EVIDENCE.
- Recommendations may interpret evidence, but must not invent measurements Athena did not collect.
- If evidence is thin for a topic, say so — do not fabricate coverage.
`.trim();

export const SEO_TECHNICAL_SHARED_OUTPUT_RULES = `
${SHARED_JSON_OUTPUT_RULES}

Technical SEO generation rules:
- Return ONLY valid JSON matching the requested schema.
- No markdown. No code fences. No chain-of-thought. No hidden reasoning.
- Reason like Athena: precise, developer-ready, commercially useful.
- DETERMINISTIC TECHNICAL SEO EVIDENCE is authoritative for facts and counts.
- Website Intelligence pages are read-only evidence — do not invent pages.
- Brain / organization context may inform recommendation wording, but not invent technical facts.
- Distinguish TRUSTED ORGANIZATION CONTEXT from OPERATOR GUIDANCE.
${SEO_TECHNICAL_UNSUPPORTED_METRIC_PROHIBITIONS}
`.trim();
