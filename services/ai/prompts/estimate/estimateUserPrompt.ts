import { ESTIMATE_SHARED_OUTPUT_RULES } from "@/services/ai/prompts/estimate/estimateSharedConstraints";
import type { EstimateRequest } from "@/services/estimate/athenaEstimateTypes";
import type { EstimateGeoCurrencyResult } from "@/services/estimate/estimateGeoCurrency";

export const ESTIMATE_USER_PROMPT_VERSION = "estimate_user_v2";

export function buildEstimateUserPrompt(input: {
  trustedContext: string;
  operatorGuidanceBlock: string;
  methodologyInstructionText: string;
  methodologyRevisionId: string | null;
  geoCurrency: EstimateGeoCurrencyResult;
  request: EstimateRequest;
  /**
   * Exact Prospect commercial-target block when Estimate is Prospect-targeted.
   * Omit / null / empty for org-only — do not emit an empty Prospect heading.
   */
  prospectCommercialTargetIntelligence?: string | null;
  /**
   * Already-resolved Master output-language instruction.
   * Prompt builders must not import catalogs or resolve language themselves.
   */
  outputLanguageInstruction?: string | null;
  /**
   * Server-resolved Master language code for deliveryEmail.language.
   * Defaults to English when the pipeline has no Master language.
   */
  outputLanguageCode?: string | null;
}): string {
  const currencyCode = input.geoCurrency.currencyCode;
  const currencyResolution = input.geoCurrency.currencyResolution;
  const geographyLabel =
    input.geoCurrency.geographyLabel == null
      ? "null"
      : JSON.stringify(input.geoCurrency.geographyLabel);

  const prospectBlock =
    typeof input.prospectCommercialTargetIntelligence === "string" &&
    input.prospectCommercialTargetIntelligence.trim()
      ? `\n${input.prospectCommercialTargetIntelligence.trim()}\n`
      : "";
  const languageCode =
    typeof input.outputLanguageCode === "string" &&
    /^[a-z]{2}$/.test(input.outputLanguageCode)
      ? input.outputLanguageCode
      : "en";

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
(Business intelligence Athena knows about the selected client / Licensee sub-account.)
${input.trustedContext}
${prospectBlock}
${input.operatorGuidanceBlock}
${
  input.outputLanguageInstruction?.trim()
    ? `\n${input.outputLanguageInstruction.trim()}\n`
    : ""
}
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
  "competitorQuotesFabricated": false,
  "deliveryEmail": {
    "schemaVersion": "estimate_delivery_email_v1",
    "language": "${languageCode}",
    "subject": string,
    "body": string
  }
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

DELIVERY EMAIL (same JSON object — not a second model response):
Write deliveryEmail for the Licensee to send with this Estimate or the resulting proposal PDF.
Use only the business context already in this prompt. Do not invent facts.

- schemaVersion must be exactly "estimate_delivery_email_v1".
- language must be exactly "${languageCode}".
- Write the subject and body only in that language.
- subject: one single line, maximum 120 characters, specific to this business and project.
- Do not start the subject with Re: or Fwd:.
- Do not mention Athena, GetOblic, OpenRouter, or any model in the subject or body.
- No generic spam, urgency bait, or exaggerated claims.
- body: plain text, no HTML or markdown, maximum 2000 characters.
- Target about 90–160 words, normally three short paragraphs.
- Address the decision maker only when decision_maker is present in PROSPECT COMMERCIAL TARGET INTELLIGENCE.
- Otherwise address the business. If there is no Prospect block, address the organization identity in TRUSTED ATHENA EVIDENCE.
- If industry or other context is absent from the authorized context, omit it.
- Do not imply a prior call, meeting, email, promise, or agreement.
- Summarize the proposed scope accurately.
- Explain the commercial relevance for this business.
- State the recommended investment as the recommendedClientPrice amount together with the currency code ${currencyCode}. The amount and currency must match this package.
- End with one clear next step.
- Do not invent meetings, discounts, start dates, or guarantees.
- Do not expose pricing methodology, internal reasoning, or Licensee margins.
- Do not invent a recipient email, phone number, or sender legal/tax identity.
- Do not invent a personal sender name, title, or signature. No Own Company identity is provided.
- Do not paste guidanceDisclaimer, or any part of it, into the email.

${ESTIMATE_SHARED_OUTPUT_RULES}
`.trim();
}
