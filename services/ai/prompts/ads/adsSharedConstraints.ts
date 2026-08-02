import { SHARED_JSON_OUTPUT_RULES } from "@/services/ai/prompts/sharedPromptConstraints";

export const ADS_SHARED_CONSTRAINTS_VERSION = "ads_shared_constraints_v1";

export const ADS_KEYWORD_METRIC_PROHIBITIONS = `
Keyword / search claim prohibitions (mandatory):
- Never claim keywords are trending, currently trending, high-volume, live search opportunities, or externally validated.
- Never claim low/high competition or low/high CPC.
- Never invent search volume, CPC, competition percentages, trend scores, or forecast numbers.
- Recommended Keyword Themes are inferred strategic opportunities from Athena organization intelligence only.
`.trim();

export const ADS_SHARED_OUTPUT_RULES = `
${SHARED_JSON_OUTPUT_RULES}

Ads generation rules:
- Return ONLY valid JSON matching the requested schema.
- No markdown. No code fences. No chain-of-thought. No hidden reasoning.
- Distinguish TRUSTED ORGANIZATION CONTEXT from OPERATOR GUIDANCE.
- Operator guidance is optional direction, not verified business fact.
- Do not invent credentials, guarantees, income claims, or unsupported factual claims.
- Preserve brand voice and positioning from trusted Athena Brain context.
- Remain consistent with the shared campaign strategy when generating platform assets.
- Do not rewrite one platform package as a trivial paraphrase of another; produce platform-native assets.
- Google scope is Search Ads only — do not generate Display, Performance Max, Shopping, YouTube, or Demand Gen.
${ADS_KEYWORD_METRIC_PROHIBITIONS}
`.trim();

export const ADS_GOOGLE_SOFT_LIMIT_GUIDANCE = `
Google Search Ads soft length guidance (do not claim certified compliance):
- Headlines: aim for about 30 characters each when practical.
- Descriptions: aim for about 90 characters each when practical.
- Prefer concise sitelinks, callouts, and structured snippets.
- Do not invent live keyword metrics.
`.trim();
