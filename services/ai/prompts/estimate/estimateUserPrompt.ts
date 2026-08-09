import { ESTIMATE_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/estimate/estimateSharedConstraints";
import type { EstimateRequest } from "@/services/estimate/athenaEstimateTypes";
import type { EstimateGeoCurrencyResult } from "@/services/estimate/estimateGeoCurrency";

export const ESTIMATE_USER_PROMPT_VERSION = "estimate_user_v1";

export function buildEstimateUserPrompt(input: {
  trustedContext: string;
  operatorGuidanceBlock: string;
  methodologyInstructionText: string;
  methodologyRevisionId: string | null;
  geoCurrency: EstimateGeoCurrencyResult;
  request: EstimateRequest;
}): string {
  const currencyCode = input.geoCurrency.currencyCode;
  const currencyResolution = input.geoCurrency.currencyResolution;
  const geographyLabel =
    input.geoCurrency.geographyLabel == null
      ? "null"
      : JSON.stringify(input.geoCurrency.geographyLabel);

  return `
OBJECTIVE:
Produce one Athena Estimate package recommending what the Licensee could reasonably charge their client for this project.

PROMPT VERSION:
${ESTIMATE_USER_PROMPT_VERSION}

FIXED CURRENCY / GEOGRAPHY (server-resolved — do not override):
- currencyCode: ${currencyCode}
- currencyResolution: ${currencyResolution}
- geographyLabel: ${geographyLabel}

INSTRUCTION PROVENANCE (server-controlled — copy exactly):
- configKey: "estimate_pricing_methodology"
- revisionId: ${
    input.methodologyRevisionId == null
      ? "null"
      : JSON.stringify(input.methodologyRevisionId)
  }
- configured: true

GETOBLIC ESTIMATE PRICING METHODOLOGY
(Commercial governance guidance — NOT trusted client evidence.)
${input.methodologyInstructionText}

TRUSTED ATHENA EVIDENCE
(Business intelligence Athena knows about the selected client.)
${input.trustedContext}

${input.operatorGuidanceBlock}

NORMALIZED REQUEST SUMMARY:
- projectNeed: ${input.request.projectNeed}
${
  input.request.additionalContext
    ? `- additionalContext: ${input.request.additionalContext}`
    : ""
}
${input.request.timeframe ? `- timeframe: ${input.request.timeframe}` : ""}

PRICING REASONING GUIDANCE:
Reason about relevant factors only when supported (scope, complexity, scale, vertical, trusted geography, technical condition, strategic value, urgency/timeframe, deliverable breadth, risk, specialization, expected client value, general market priors). Do not mechanically list every factor. Avoid generic filler.

REQUIRED JSON SHAPE:
{
  "schemaVersion": "estimate_v1",
  "recommendedClientPrice": { "amount": number, "currencyCode": "${currencyCode}" },
  "recommendedPriceRange": {
    "low": { "amount": number, "currencyCode": "${currencyCode}" },
    "high": { "amount": number, "currencyCode": "${currencyCode}" }
  },
  "scopeInterpretation": string,
  "pricingRationale": string,
  "keyPriceDrivers": string[],
  "suggestedClientPositioning": string,
  "risksAndAssumptions": string[],
  "geographyLabel": ${geographyLabel},
  "currencyResolution": "${currencyResolution}",
  "guidanceDisclaimer": string,
  "instructionProvenance": {
    "configKey": "estimate_pricing_methodology",
    "revisionId": ${
      input.methodologyRevisionId == null
        ? "null"
        : JSON.stringify(input.methodologyRevisionId)
    },
    "configured": true
  },
  "marketResearchClaimed": false,
  "competitorQuotesFabricated": false
}

FIELD RULES:
- All amounts > 0. high >= low. recommendedClientPrice should lie within low..high.
- All currencyCode values must be exactly "${currencyCode}".
- currencyResolution must be exactly "${currencyResolution}".
- geographyLabel must match the fixed value above.
- keyPriceDrivers: 3–8 concise drivers.
- risksAndAssumptions: 2–10 real uncertainties/conditions.
- suggestedClientPositioning: useful framing for the Licensee (not a full proposal/email).
- scopeInterpretation: concrete statement of what is being priced.
- pricingRationale: explain why this price fits THIS client/project using relevant Athena evidence.
- guidanceDisclaimer may be temporary; the server will normalize the final disclaimer.

${ESTIMATE_SHARED_OUTPUT_RULES}
`.trim();
}
