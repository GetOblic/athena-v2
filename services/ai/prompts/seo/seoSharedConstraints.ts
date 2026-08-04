import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const SEO_SHARED_CONSTRAINTS_VERSION = "seo_shared_constraints_v1";

export const SEO_TECHNICAL_AUDIT_PROHIBITIONS = `
Technical SEO audit prohibitions (mandatory for Phase 1):
- Do NOT discuss canonical tags, robots.txt, schema/structured data, hreflang, indexability, crawl budget, sitemap XML, duplicate meta descriptions, broken links, page speed scores, Core Web Vitals, or HTTP status codes.
- Do NOT produce a traditional crawler/technical SEO audit.
- Focus on business growth, organic visibility through content, authority, customer intent, and commercial opportunity.
`.trim();

export const SEO_EXTERNAL_DATA_PROHIBITIONS = `
External data prohibitions (mandatory):
- Never claim Search Console, Google Analytics, Semrush, Ahrefs, PageSpeed, or keyword-database evidence.
- Never invent search volume, CPC, competition percentages, ranking positions, traffic forecasts, or trend scores.
- Never claim keywords are trending, high-volume, low-competition, or externally validated.
- Ground every recommendation in Athena intelligence only (Brain, Deep Website Intelligence, Personas, Communities, Discussions, Opportunities, optional Ads keyword themes).
- If evidence is thin, say so — do not invent coverage or customer demand.
`.trim();

export const SEO_SHARED_OUTPUT_RULES = `
${SHARED_JSON_OUTPUT_RULES}

SEO Intelligence generation rules:
- Return ONLY valid JSON matching the requested schema.
- No markdown. No code fences. No chain-of-thought. No hidden reasoning.
- Reason like Athena: strategic, content-focused, grounded in organization intelligence.
- Distinguish TRUSTED ORGANIZATION CONTEXT from OPERATOR GUIDANCE.
- Operator guidance is optional direction, not verified business fact.
- Deep Website Intelligence is read-only evidence from prior Website Deep Scrape — do not invent pages that were not evidenced.
- Do not invent credentials, case results, testimonials, or unsupported factual claims.
- Preserve brand voice and positioning from trusted Athena Brain context.
- Every recommendation must cite Athena evidence sources when possible (Brain, Deep Scrape, Personas, Communities, Discussions, Opportunities).
${SEO_TECHNICAL_AUDIT_PROHIBITIONS}
${SEO_EXTERNAL_DATA_PROHIBITIONS}
`.trim();
