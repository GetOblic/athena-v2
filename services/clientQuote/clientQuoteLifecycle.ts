/**
 * Pure draft / issued quotation lifecycle.
 * Drafts are editable. Issued quotations are immutable.
 * A revision is a new draft; the issued quotation is not changed.
 * No invoice, payment collection, or email sending.
 */

import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
  CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
  ClientQuoteCalculationError,
  ClientQuoteLifecycleError,
  ClientQuoteValidationError,
  IssuedClientQuoteImmutableError,
  type AthenaClientQuote,
  type ClientQuoteIssuedSnapshotV1,
  type ClientQuoteSourceEstimateSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";
import {
  currencyMinorUnitScale,
  isClientQuoteSelectableCurrency,
  normalizeCurrencyCode,
} from "@/services/clientQuote/clientQuoteMoney";
import {
  assertClientQuoteIssuable,
  assertQuoteNumber,
  assertUtcTimestamp,
  assertUuid,
  normalizeClientQuoteDraft,
  parseClientQuoteContentLanguage,
  parseClientQuoteIssuedBrand,
} from "@/services/clientQuote/clientQuoteValidation";
import { ATHENA_ESTIMATE_SCHEMA_VERSION } from "@/services/estimate/athenaEstimateTypes";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fail(message: string): never {
  throw new ClientQuoteValidationError([message]);
}

function assertSourceEstimateSnapshot(
  value: ClientQuoteSourceEstimateSnapshot | null,
): ClientQuoteSourceEstimateSnapshot | null {
  if (value == null) return null;
  if (value.schemaVersion !== CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION) {
    fail("sourceEstimateSnapshot.schemaVersion is not supported.");
  }
  if (value.estimateSchemaVersion !== ATHENA_ESTIMATE_SCHEMA_VERSION) {
    fail("sourceEstimateSnapshot.estimateSchemaVersion must be estimate_v1.");
  }
  const estimateId = assertUuid(value.estimateId, "sourceEstimateSnapshot.estimateId");
  const organizationId = assertUuid(
    value.organizationId,
    "sourceEstimateSnapshot.organizationId",
  );
  let currencyCode: string;
  try {
    currencyCode = normalizeCurrencyCode(value.currencyCode);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      fail(error.message);
    }
    throw error;
  }
  if (
    typeof value.recommendedClientPriceMinor !== "number" ||
    !Number.isSafeInteger(value.recommendedClientPriceMinor) ||
    value.recommendedClientPriceMinor <= 0
  ) {
    fail(
      "sourceEstimateSnapshot.recommendedClientPriceMinor must be a positive integer.",
    );
  }
  if (
    value.organizationNameSnapshot != null &&
    typeof value.organizationNameSnapshot !== "string"
  ) {
    fail("sourceEstimateSnapshot.organizationNameSnapshot must be a string.");
  }
  return {
    schemaVersion: CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
    estimateId,
    organizationId,
    organizationNameSnapshot: value.organizationNameSnapshot?.trim() || null,
    estimateSchemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
    currencyCode,
    recommendedClientPriceMinor: value.recommendedClientPriceMinor,
  };
}

function assertSourceLink(
  sourceEstimateId: string | null,
  snapshot: ClientQuoteSourceEstimateSnapshot | null,
) {
  if (!snapshot && sourceEstimateId) {
    fail("sourceEstimateSnapshot is required when sourceEstimateId is set.");
  }
  if (snapshot && sourceEstimateId && snapshot.estimateId !== sourceEstimateId) {
    fail("sourceEstimateId must match sourceEstimateSnapshot.estimateId.");
  }
}

export function createDraftClientQuote(input: {
  id: unknown;
  licenseeAccountId: unknown;
  organizationId: unknown;
  requestedBy: unknown;
  contentLanguage: unknown;
  currencyCode: unknown;
  draft: unknown;
  sourceEstimateId: unknown;
  sourceEstimateSnapshot: ClientQuoteSourceEstimateSnapshot | null;
  revisedFromQuoteId: unknown;
  createdAt: unknown;
}): AthenaClientQuote {
  const id = assertUuid(input.id, "id");
  const licenseeAccountId = assertUuid(
    input.licenseeAccountId,
    "licenseeAccountId",
  );
  const organizationId = assertUuid(input.organizationId, "organizationId");
  const requestedBy =
    input.requestedBy == null
      ? null
      : assertUuid(input.requestedBy, "requestedBy");
  const revisedFromQuoteId =
    input.revisedFromQuoteId == null
      ? null
      : assertUuid(input.revisedFromQuoteId, "revisedFromQuoteId");
  if (revisedFromQuoteId === id) {
    fail("A quotation cannot revise itself.");
  }
  let currencyCode: string;
  try {
    currencyCode = normalizeCurrencyCode(input.currencyCode);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      fail(error.message);
    }
    throw error;
  }
  const sourceEstimateId =
    input.sourceEstimateId == null
      ? null
      : assertUuid(input.sourceEstimateId, "sourceEstimateId");
  const sourceEstimateSnapshot = assertSourceEstimateSnapshot(
    input.sourceEstimateSnapshot,
  );
  assertSourceLink(sourceEstimateId, sourceEstimateSnapshot);
  const createdAt = assertUtcTimestamp(input.createdAt, "createdAt");
  const draft = normalizeClientQuoteDraft(input.draft, currencyCode, {
    allowIncomplete: true,
  });
  return clone({
    id,
    licensee_account_id: licenseeAccountId,
    organization_id: organizationId,
    requested_by: requestedBy,
    source_estimate_id: sourceEstimateId,
    source_estimate_snapshot: sourceEstimateSnapshot,
    revised_from_quote_id: revisedFromQuoteId,
    status: "draft",
    content_language: parseClientQuoteContentLanguage(input.contentLanguage),
    currency_code: currencyCode,
    draft_json: draft,
    issued_snapshot_json: null,
    quote_number: null,
    issued_at: null,
    deleted_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  });
}

/**
 * Currency for a draft save.
 * Omitted requests keep the stored currency, including historical ISO codes.
 * An explicit value may only be USD or EUR, and only when the minor-unit
 * scale matches. Line prices are not converted and are not rewritten here.
 */
export function resolveApprovedClientQuoteCurrency(
  currentCurrency: string,
  requestedCurrency: unknown,
): string {
  if (requestedCurrency == null) return currentCurrency;
  let next: string;
  try {
    next = normalizeCurrencyCode(requestedCurrency);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      fail(error.message);
    }
    throw error;
  }
  if (!isClientQuoteSelectableCurrency(next)) {
    fail("Currency can only be changed to USD or EUR.");
  }
  if (next === currentCurrency) return currentCurrency;
  if (currencyMinorUnitScale(currentCurrency) !== currencyMinorUnitScale(next)) {
    fail(
      "Currency change must keep the same minor-unit scale. Prices are not converted.",
    );
  }
  return next;
}

export function updateDraftClientQuote(
  quote: AthenaClientQuote,
  draft: unknown,
  meta: { updatedAt: unknown; contentLanguage?: unknown; currencyCode?: unknown },
): AthenaClientQuote {
  if (quote.status === "issued") {
    throw new IssuedClientQuoteImmutableError();
  }
  if (quote.status !== "draft") {
    throw new ClientQuoteLifecycleError("Only a draft quotation can be edited.");
  }
  const currencyCode = resolveApprovedClientQuoteCurrency(
    quote.currency_code,
    meta.currencyCode,
  );
  const nextDraft = normalizeClientQuoteDraft(draft, currencyCode, {
    allowIncomplete: true,
  });
  const contentLanguage =
    meta.contentLanguage == null
      ? quote.content_language
      : parseClientQuoteContentLanguage(meta.contentLanguage);
  return clone({
    ...quote,
    content_language: contentLanguage,
    currency_code: currencyCode,
    draft_json: nextDraft,
    issued_snapshot_json: null,
    quote_number: null,
    issued_at: null,
    updated_at: assertUtcTimestamp(meta.updatedAt, "updatedAt"),
  });
}

export function issueClientQuote(
  quote: AthenaClientQuote,
  input: {
    quoteNumber: unknown;
    issuedAt: unknown;
    updatedAt: unknown;
    brand?: unknown;
  },
): AthenaClientQuote {
  if (quote.status === "issued") {
    throw new IssuedClientQuoteImmutableError();
  }
  if (quote.status !== "draft") {
    throw new ClientQuoteLifecycleError("Only a draft quotation can be issued.");
  }
  const draft = normalizeClientQuoteDraft(quote.draft_json, quote.currency_code, {
    allowIncomplete: true,
  });
  assertClientQuoteIssuable(draft);
  const quoteNumber = assertQuoteNumber(input.quoteNumber);
  const issuedAt = assertUtcTimestamp(input.issuedAt, "issuedAt");
  const updatedAt = assertUtcTimestamp(input.updatedAt, "updatedAt");
  const brand = parseClientQuoteIssuedBrand(input.brand);
  const snapshot: ClientQuoteIssuedSnapshotV1 = {
    schemaVersion: CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
    quoteId: quote.id,
    licenseeAccountId: quote.licensee_account_id,
    organizationId: quote.organization_id,
    quoteNumber,
    issuedAt,
    contentLanguage: quote.content_language,
    currencyCode: quote.currency_code,
    currencyScale: draft.currencyScale,
    sourceEstimate: quote.source_estimate_snapshot
      ? clone(quote.source_estimate_snapshot)
      : null,
    revisedFromQuoteId: quote.revised_from_quote_id,
    issuer: clone(draft.issuer),
    customer: clone(draft.customer),
    brand: clone(brand),
    projectTitle: draft.projectTitle,
    scopeSummary: draft.scopeSummary,
    lineItems: clone(draft.lineItems),
    paymentTerms: clone(draft.paymentTerms),
    validity: clone(draft.validity),
    appendix: clone(draft.appendix),
    discount: clone(draft.discount),
    tax: clone(draft.tax),
    totals: { ...draft.totals },
    frequencyTotals: clone(draft.frequencyTotals ?? []),
  };
  return clone({
    ...quote,
    status: "issued",
    draft_json: clone(draft),
    issued_snapshot_json: snapshot,
    quote_number: quoteNumber,
    issued_at: issuedAt,
    updated_at: updatedAt,
  });
}

/**
 * Create a new draft from an issued quotation.
 * The issued quotation object is not modified.
 */
export function reviseIssuedClientQuote(
  quote: AthenaClientQuote,
  input: { id: unknown; createdAt: unknown },
): AthenaClientQuote {
  if (quote.status !== "issued" || !quote.issued_snapshot_json) {
    throw new ClientQuoteLifecycleError(
      "Only an issued quotation can be revised.",
    );
  }
  const issued = quote.issued_snapshot_json;
  const draft = normalizeClientQuoteDraft(
    {
      schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
      currencyScale: issued.currencyScale,
      issuer: issued.issuer,
      customer: issued.customer,
      projectTitle: issued.projectTitle,
      scopeSummary: issued.scopeSummary,
      lineItems: issued.lineItems,
      paymentTerms: issued.paymentTerms,
      validity: issued.validity,
      appendix: issued.appendix,
      discount: issued.discount,
      tax: issued.tax,
    },
    quote.currency_code,
  );
  return createDraftClientQuote({
    id: input.id,
    licenseeAccountId: quote.licensee_account_id,
    organizationId: quote.organization_id,
    requestedBy: quote.requested_by,
    contentLanguage: quote.content_language,
    currencyCode: quote.currency_code,
    draft,
    sourceEstimateId: quote.source_estimate_id,
    sourceEstimateSnapshot: quote.source_estimate_snapshot
      ? clone(quote.source_estimate_snapshot)
      : null,
    revisedFromQuoteId: quote.id,
    createdAt: input.createdAt,
  });
}

/**
 * Hide a quotation from the active library.
 * The row, issued snapshot, quote number, source estimate, and logo stay.
 * A quotation that is already masked is returned unchanged.
 */
export function maskAthenaClientQuote(
  quote: AthenaClientQuote,
  deletedAt: unknown,
): { quote: AthenaClientQuote; alreadyMasked: boolean } {
  if (quote.deleted_at) {
    return { quote: clone(quote), alreadyMasked: true };
  }
  const stamp = assertUtcTimestamp(deletedAt, "deletedAt");
  return {
    alreadyMasked: false,
    quote: clone({
      ...quote,
      deleted_at: stamp,
      updated_at: stamp,
    }),
  };
}

/**
 * Model ON DELETE SET NULL for source_estimate_id.
 * The copied source snapshot, including estimateId, stays in place.
 * Issued commercial JSON is not rewritten.
 */
export function applySourceEstimateForeignKeyClear(
  quote: AthenaClientQuote,
): AthenaClientQuote {
  const next = clone(quote);
  next.source_estimate_id = null;
  return next;
}
