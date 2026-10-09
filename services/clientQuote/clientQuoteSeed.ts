/**
 * Pure seed from a Ready estimate_v1 package.
 * Copies commercial text and the recommended client price.
 * Does not mutate the Estimate, enqueue generation, or call a model.
 * prospect generation context is not read.
 */

import { ATHENA_ESTIMATE_SCHEMA_VERSION } from "@/services/estimate/athenaEstimateTypes";
import {
  majorAmountToMinorUnits,
  normalizeCurrencyCode,
} from "@/services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_FIELD_LIMITS,
  CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
  ClientQuoteCalculationError,
  ClientQuoteValidationError,
  type ClientQuoteAppendixSection,
  type ClientQuoteDraftV1,
  type ClientQuoteSourceEstimateSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";
import {
  assertUuid,
  normalizeClientQuoteDraft,
} from "@/services/clientQuote/clientQuoteValidation";

const ORGANIZATION_NAME_MAX = 500;

export const CLIENT_QUOTE_APPENDIX_HEADINGS = {
  scope: "Scope interpretation",
  pricingRationale: "Pricing rationale",
  positioning: "Suggested positioning",
  drivers: "Key price drivers",
  risks: "Risks and assumptions",
  guidance: "Guidance",
} as const;

export type ReadyEstimateQuoteSeedPackage = {
  schemaVersion?: unknown;
  recommendedClientPrice?: unknown;
  scopeInterpretation?: unknown;
  pricingRationale?: unknown;
  keyPriceDrivers?: unknown;
  suggestedClientPositioning?: unknown;
  risksAndAssumptions?: unknown;
  guidanceDisclaimer?: unknown;
  geographyLabel?: unknown;
};

export type ClientQuoteSeedResult = {
  currencyCode: string;
  draft: ClientQuoteDraftV1;
  sourceEstimateSnapshot: ClientQuoteSourceEstimateSnapshot;
};

function fail(message: string): never {
  throw new ClientQuoteValidationError([message]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function collapseClientQuoteWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Shorten a scope summary on a word or sentence boundary.
 * The kept text is a prefix of the whitespace-normalized source.
 * No words are rewritten.
 */
export function shortenClientQuoteScopeSummary(value: string): string {
  const normalized = collapseClientQuoteWhitespace(value);
  const limit = CLIENT_QUOTE_FIELD_LIMITS.scopeSummarySeed;
  if (normalized.length <= limit) return normalized;
  const window = normalized.slice(0, limit - 1);
  const minKeep = Math.floor(window.length * 0.6);
  const sentence = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  let stem: string;
  if (sentence >= minKeep) {
    stem = window.slice(0, sentence + 1).trimEnd();
  } else {
    const space = window.lastIndexOf(" ");
    stem = (space >= minKeep ? window.slice(0, space) : window).trimEnd();
  }
  if (!stem) stem = window.trimEnd();
  return `${stem}…`;
}

function optionalNarrative(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    fail(`${label} must be a string.`);
  }
  const collapsed = collapseClientQuoteWhitespace(value);
  return collapsed || null;
}

function optionalList(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    fail(`${label} must be an array of strings.`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      fail(`${label} must contain only strings.`);
    }
    const collapsed = collapseClientQuoteWhitespace(item);
    if (collapsed) items.push(collapsed);
  }
  if (items.length === 0) return null;
  return items.join("\n");
}

function deriveProjectTitle(summary: string): string {
  const match = /[.!?](?:\s|$)/.exec(summary);
  const sentence = match ? summary.slice(0, match.index + 1).trim() : summary;
  if (sentence.length <= 120) return sentence;
  const window = sentence.slice(0, 120);
  const space = window.lastIndexOf(" ");
  return (space >= 60 ? window.slice(0, space) : window).trimEnd();
}

function resolveProjectTitle(value: unknown, summary: string): string {
  if (value == null || value === "") return deriveProjectTitle(summary);
  if (typeof value !== "string") {
    fail("projectTitle must be a string.");
  }
  const title = value.trim();
  if (!title) return deriveProjectTitle(summary);
  if (title.length > CLIENT_QUOTE_FIELD_LIMITS.projectTitle) {
    fail(
      `projectTitle exceeds maximum length of ${CLIENT_QUOTE_FIELD_LIMITS.projectTitle} characters.`,
    );
  }
  return title;
}

function pushSection(
  sections: ClientQuoteAppendixSection[],
  heading: string,
  body: string | null,
) {
  if (!body) return;
  if (body.length > CLIENT_QUOTE_FIELD_LIMITS.appendixBody) {
    fail(`${heading} exceeds the appendix length limit.`);
  }
  sections.push({ heading, body });
}

/**
 * Build the initial draft and the durable source-estimate snapshot.
 * The Estimate object passed in is only read.
 */
export function seedClientQuoteFromReadyEstimate(input: {
  estimateId: unknown;
  organizationId: unknown;
  organizationNameSnapshot?: unknown;
  estimatePackage: ReadyEstimateQuoteSeedPackage;
  projectTitle?: unknown;
  issuer: unknown;
  customer: unknown;
}): ClientQuoteSeedResult {
  const estimatePackage = input.estimatePackage;
  if (!isRecord(estimatePackage)) {
    fail("estimatePackage must be an object.");
  }
  if (estimatePackage.schemaVersion !== ATHENA_ESTIMATE_SCHEMA_VERSION) {
    fail("estimatePackage.schemaVersion must be estimate_v1.");
  }
  const rawPrice = estimatePackage.recommendedClientPrice;
  if (!isRecord(rawPrice)) {
    fail("recommendedClientPrice must be an object.");
  }
  const recommendedAmount = rawPrice.amount;
  if (typeof recommendedAmount !== "number") {
    fail("recommendedClientPrice.amount must be a finite number.");
  }
  if (typeof estimatePackage.scopeInterpretation !== "string") {
    fail("scopeInterpretation must be a string.");
  }

  const fullScope = collapseClientQuoteWhitespace(
    estimatePackage.scopeInterpretation,
  );
  if (!fullScope) {
    fail("scopeInterpretation must be a non-empty string.");
  }
  const scopeSummary = shortenClientQuoteScopeSummary(fullScope);
  const projectTitle = resolveProjectTitle(input.projectTitle, scopeSummary);

  let currencyCode: string;
  let recommendedClientPriceMinor: number;
  try {
    currencyCode = normalizeCurrencyCode(rawPrice.currencyCode);
    recommendedClientPriceMinor = majorAmountToMinorUnits(
      recommendedAmount,
      currencyCode,
    );
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      fail(error.message);
    }
    throw error;
  }
  if (recommendedClientPriceMinor <= 0) {
    fail(
      "recommendedClientPrice.amount must convert to a positive minor-unit integer.",
    );
  }

  const sections: ClientQuoteAppendixSection[] = [];
  if (scopeSummary !== fullScope) {
    pushSection(sections, CLIENT_QUOTE_APPENDIX_HEADINGS.scope, fullScope);
  }
  pushSection(
    sections,
    CLIENT_QUOTE_APPENDIX_HEADINGS.pricingRationale,
    optionalNarrative(estimatePackage.pricingRationale, "pricingRationale"),
  );
  pushSection(
    sections,
    CLIENT_QUOTE_APPENDIX_HEADINGS.positioning,
    optionalNarrative(
      estimatePackage.suggestedClientPositioning,
      "suggestedClientPositioning",
    ),
  );
  pushSection(
    sections,
    CLIENT_QUOTE_APPENDIX_HEADINGS.drivers,
    optionalList(estimatePackage.keyPriceDrivers, "keyPriceDrivers"),
  );
  pushSection(
    sections,
    CLIENT_QUOTE_APPENDIX_HEADINGS.risks,
    optionalList(estimatePackage.risksAndAssumptions, "risksAndAssumptions"),
  );
  pushSection(
    sections,
    CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
    optionalNarrative(estimatePackage.guidanceDisclaimer, "guidanceDisclaimer"),
  );

  const draft = normalizeClientQuoteDraft(
    {
      schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
      issuer: input.issuer,
      customer: input.customer,
      projectTitle,
      scopeSummary,
      lineItems: [
        {
          id: "line-1",
          description: projectTitle,
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: recommendedClientPriceMinor,
        },
      ],
      paymentTerms: { summary: "", scheduleNote: null },
      validity: { validForDays: null, validUntil: null, note: null },
      appendix: { enabled: false, sections },
      discount: { kind: "none" },
      tax: { kind: "none" },
    },
    currencyCode,
  );

  let organizationNameSnapshot: string | null = null;
  if (input.organizationNameSnapshot != null) {
    if (typeof input.organizationNameSnapshot !== "string") {
      fail("organizationNameSnapshot must be a string.");
    }
    const trimmed = input.organizationNameSnapshot.trim();
    if (trimmed.length > ORGANIZATION_NAME_MAX) {
      fail("organizationNameSnapshot exceeds maximum length of 500 characters.");
    }
    organizationNameSnapshot = trimmed || null;
  }

  return {
    currencyCode,
    draft,
    sourceEstimateSnapshot: {
      schemaVersion: CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
      estimateId: assertUuid(input.estimateId, "estimateId"),
      organizationId: assertUuid(input.organizationId, "organizationId"),
      organizationNameSnapshot,
      estimateSchemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
      currencyCode,
      recommendedClientPriceMinor,
    },
  };
}
