import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const ESTIMATE_SHARED_CONSTRAINTS_VERSION = "estimate_shared_constraints_v1";

/**
 * Static security / evidence / grounding constraints (code-controlled).
 * Distinct from Super Admin commercial methodology (dynamic).
 */
export const ESTIMATE_GROUNDING_RULES = `
INPUT CLASSES (mandatory distinction):
1. TRUSTED ATHENA EVIDENCE — facts Athena knows about the selected client organization.
2. OPERATOR PROJECT GUIDANCE — Licensee-entered project description. May describe requested work; must NOT silently become trusted business fact.
3. GETOBLIC ESTIMATE PRICING METHODOLOGY — commercial reasoning instructions. Not client evidence.

GROUNDING RULES:
- Client/business facts may only come from TRUSTED ATHENA EVIDENCE.
- Project scope may come from OPERATOR PROJECT GUIDANCE.
- Pricing philosophy may come from GETOBLIC ESTIMATE PRICING METHODOLOGY.
- General pricing/market priors may come from model knowledge.
- Never fabricate missing client facts.
- Never fabricate competitor quotes.
- Never fabricate agency surveys.
- Never claim a pricing database was queried.
- Never claim live market/web research occurred.
- Never claim current external market data was fetched.
- Never infer unsupported client revenue, headcount, or budget.
- Never treat operator-entered geography as trusted client geography.
- Never override the FIXED currency/geography resolution provided by the server.
`.trim();

export const ESTIMATE_FORBIDDEN_RESEARCH_RULES = `
FORBIDDEN CLAIMS (mandatory):
- marketResearchClaimed must be false.
- competitorQuotesFabricated must be false.
- Do not claim live market research, competitor quotation databases, Semrush/Ahrefs, web scraping of competitors, or FX/API lookups.
- Do not invent competitor quotes or survey results.
`.trim();

export const ESTIMATE_SHARED_OUTPUT_RULES = `
${SHARED_JSON_OUTPUT_RULES}

Athena Estimate rules:
- Return ONLY valid JSON matching the requested schemaVersion "estimate_v1".
- No markdown. No code fences. No chain-of-thought. No commentary outside JSON.
- You are producing commercial pricing intelligence for a Licensee to charge THEIR client.
- This is NOT a GetOblic fulfillment quote, invoice, binding valuation, or live market research product.
${ESTIMATE_GROUNDING_RULES}
${ESTIMATE_FORBIDDEN_RESEARCH_RULES}
`.trim();
