/**
 * Pure invoice domain (CQ-INV-1B).
 *
 * An issued client_quote_issued_v1 snapshot converts into an editable
 * client_invoice_draft_v1. The quotation object is not modified.
 *
 * Quote validity is the life of the offer. It is not an invoice issue date
 * and it is not a payment due date. Quote payment terms stay payment terms.
 * Remittance directions are paymentInstructions.
 *
 * Totals are replaced by normalizeClientQuoteDraft, which calls
 * calculateClientQuote. Client-supplied totals are never read. Currency is
 * locked to the issued quotation, including historical ISO codes. Amounts
 * are not converted.
 */

import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
  ClientQuoteCalculationError,
  ClientQuoteValidationError,
  type ClientQuoteDraftV1,
  type ClientQuoteFrequencyTotals,
  type ClientQuoteIssuedBrandSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";
import {
  currencyMinorUnitScale,
  normalizeCurrencyCode,
} from "@/services/clientQuote/clientQuoteMoney";
import {
  assertQuoteNumber,
  assertUtcTimestamp,
  assertUuid,
  normalizeClientQuoteDraft,
  parseClientQuoteContentLanguage,
  parseClientQuoteIssuedBrand,
} from "@/services/clientQuote/clientQuoteValidation";
import { assertClientInvoiceNumber } from "@/services/clientInvoice/clientInvoiceNumber";
import {
  CLIENT_INVOICE_DRAFT_SCHEMA_VERSION,
  CLIENT_INVOICE_FIELD_LIMITS,
  CLIENT_INVOICE_ISSUED_SCHEMA_VERSION,
  CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION,
  ClientInvoiceLifecycleError,
  ClientInvoiceSourceOccupiedError,
  ClientInvoiceValidationError,
  IssuedClientInvoiceImmutableError,
  isClientInvoiceStatus,
  type ClientInvoice,
  type ClientInvoiceDraftV1,
  type ClientInvoiceIssuedSnapshotV1,
  type ClientInvoiceSourceOccupancy,
  type ClientInvoiceSourceQuoteV1,
} from "@/services/clientInvoice/clientInvoiceTypes";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fail(details: string[]): never {
  throw new ClientInvoiceValidationError(details);
}

function rethrowAsInvoiceError(error: unknown): never {
  if (error instanceof ClientInvoiceValidationError) throw error;
  if (error instanceof ClientQuoteValidationError) {
    throw new ClientInvoiceValidationError([...error.details]);
  }
  if (error instanceof ClientQuoteCalculationError) {
    throw new ClientInvoiceValidationError([error.message]);
  }
  throw error;
}

function capture<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    rethrowAsInvoiceError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function parsePaymentDueDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !isRealIsoDate(value)) {
    fail(["paymentDueDate must be a real YYYY-MM-DD date."]);
  }
  return value;
}

function parsePaymentInstructions(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    fail(["paymentInstructions must be a string."]);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\u0000")) {
    fail(["paymentInstructions contains an invalid character."]);
  }
  if (trimmed.length > CLIENT_INVOICE_FIELD_LIMITS.paymentInstructions) {
    fail([
      `paymentInstructions exceeds maximum length of ${CLIENT_INVOICE_FIELD_LIMITS.paymentInstructions} characters.`,
    ]);
  }
  return trimmed;
}

function assertIsoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !isRealIsoDate(value)) {
    fail([`${label} must be a real YYYY-MM-DD date.`]);
  }
  return value;
}

/**
 * Commercial body passed to the quotation normalizer.
 * Validity and appendix are intentionally blank: quote validity must not
 * become a due date, and the quotation appendix is not invoice content.
 * Totals and frequencyTotals are omitted so the calculator replaces them.
 */
function commercialPayload(
  input: {
    currencyScale?: unknown;
    issuer?: unknown;
    customer?: unknown;
    projectTitle?: unknown;
    scopeSummary?: unknown;
    lineItems?: unknown;
    paymentTerms?: unknown;
    discount?: unknown;
    tax?: unknown;
  },
  currencyScale: number,
): Record<string, unknown> {
  return {
    schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
    currencyScale: input.currencyScale ?? currencyScale,
    issuer: input.issuer,
    customer: input.customer,
    projectTitle: input.projectTitle,
    scopeSummary: input.scopeSummary,
    lineItems: input.lineItems,
    paymentTerms: input.paymentTerms,
    validity: { validForDays: null, validUntil: null, note: null },
    appendix: { enabled: false, sections: [] },
    discount: input.discount,
    tax: input.tax,
  };
}

function normalizeCommercial(
  input: Record<string, unknown>,
  currencyCode: string,
): ClientQuoteDraftV1 {
  try {
    return normalizeClientQuoteDraft(input, currencyCode);
  } catch (error) {
    rethrowAsInvoiceError(error);
  }
}

function frequencyGroups(
  commercial: ClientQuoteDraftV1,
): ClientQuoteFrequencyTotals[] {
  if (!commercial.frequencyTotals || commercial.frequencyTotals.length === 0) {
    fail(["Calculated frequency totals are missing."]);
  }
  return commercial.frequencyTotals.map((group) => ({
    billingFrequency: group.billingFrequency,
    totals: { ...group.totals },
  }));
}

function assembleDraft(
  commercial: ClientQuoteDraftV1,
  sourceQuote: ClientInvoiceSourceQuoteV1,
  paymentDueDate: string | null,
  paymentInstructions: string | null,
): ClientInvoiceDraftV1 {
  return {
    schemaVersion: CLIENT_INVOICE_DRAFT_SCHEMA_VERSION,
    currencyScale: commercial.currencyScale,
    sourceQuote: clone(sourceQuote),
    issuer: commercial.issuer,
    customer: commercial.customer,
    projectTitle: commercial.projectTitle,
    scopeSummary: commercial.scopeSummary,
    lineItems: commercial.lineItems,
    paymentTerms: commercial.paymentTerms,
    discount: commercial.discount,
    tax: commercial.tax,
    totals: { ...commercial.totals },
    frequencyTotals: frequencyGroups(commercial),
    paymentDueDate,
    paymentInstructions,
  };
}

function parseSourceEstimateId(source: Record<string, unknown>): string | null {
  if (source.sourceEstimate == null) return null;
  if (!isRecord(source.sourceEstimate)) {
    fail(["source.sourceEstimate must be an object."]);
  }
  const estimate = source.sourceEstimate;
  return capture(() =>
    assertUuid(estimate.estimateId, "source.sourceEstimate.estimateId"),
  );
}

function parseIssuedQuote(value: unknown): {
  licenseeAccountId: string;
  organizationId: string;
  contentLanguage: ClientInvoice["contentLanguage"];
  currencyCode: string;
  sourceQuote: ClientInvoiceSourceQuoteV1;
  commercial: ClientQuoteDraftV1;
} {
  if (!isRecord(value)) {
    fail(["Issued quote snapshot must be an object."]);
  }
  if (value.schemaVersion !== CLIENT_QUOTE_ISSUED_SCHEMA_VERSION) {
    fail(["source schemaVersion must be client_quote_issued_v1."]);
  }

  const currency = capture(() => {
    const currencyCode = normalizeCurrencyCode(value.currencyCode);
    return {
      currencyCode,
      currencyScale: currencyMinorUnitScale(currencyCode),
    };
  });
  if (
    value.currencyScale != null &&
    value.currencyScale !== currency.currencyScale
  ) {
    fail(["source.currencyScale does not match the currency's minor-unit scale."]);
  }

  const sourceQuote: ClientInvoiceSourceQuoteV1 = {
    schemaVersion: CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION,
    quoteId: capture(() => assertUuid(value.quoteId, "source.quoteId")),
    quoteNumber: capture(() => assertQuoteNumber(value.quoteNumber)),
    quoteIssuedAt: capture(() =>
      assertUtcTimestamp(value.issuedAt, "source.issuedAt"),
    ),
    quoteSchemaVersion: CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
    sourceEstimateId: parseSourceEstimateId(value),
  };

  const commercial = normalizeCommercial(
    commercialPayload(value, currency.currencyScale),
    currency.currencyCode,
  );

  return {
    licenseeAccountId: capture(() =>
      assertUuid(value.licenseeAccountId, "source.licenseeAccountId"),
    ),
    organizationId: capture(() =>
      assertUuid(value.organizationId, "source.organizationId"),
    ),
    contentLanguage: capture(() => parseClientQuoteContentLanguage(value.contentLanguage)),
    currencyCode: currency.currencyCode,
    sourceQuote,
    commercial,
  };
}

function parseActiveInvoices(value: unknown): ClientInvoiceSourceOccupancy[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    fail(["activeInvoices must be an array."]);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      fail([`activeInvoices[${index}] must be an object.`]);
    }
    if (!isClientInvoiceStatus(entry.status)) {
      fail([`activeInvoices[${index}].status must be draft or issued.`]);
    }
    return {
      id: capture(() => assertUuid(entry.id, `activeInvoices[${index}].id`)),
      sourceQuoteId: capture(() =>
        assertUuid(entry.sourceQuoteId, `activeInvoices[${index}].sourceQuoteId`),
      ),
      status: entry.status,
    };
  });
}

function assertCurrencyLocked(
  currencyCode: string,
  requested: unknown,
): void {
  if (requested == null) return;
  const next = capture(() => normalizeCurrencyCode(requested));
  if (next !== currencyCode) {
    fail(["Currency is locked to the originating issued quote."]);
  }
}

function assertSourceQuoteUnchanged(
  sourceQuote: ClientInvoiceSourceQuoteV1,
  requested: unknown,
): void {
  if (!isRecord(requested) || requested.quoteId == null) return;
  const quoteId = capture(() =>
    assertUuid(requested.quoteId, "sourceQuote.quoteId"),
  );
  if (quoteId !== sourceQuote.quoteId) {
    fail(["sourceQuote is fixed to the originating issued quote."]);
  }
}

/**
 * Draft and issued both occupy the source quotation.
 * A later gate can add a non-active status; this gate has none.
 * Database uniqueness is not enforced here.
 */
function occupancyQuoteId(sourceQuoteId: string): string {
  return sourceQuoteId.trim().toLowerCase();
}

export function findActiveInvoiceForSourceQuote(
  invoices: readonly ClientInvoiceSourceOccupancy[],
  sourceQuoteId: string,
): ClientInvoiceSourceOccupancy | null {
  const key = occupancyQuoteId(sourceQuoteId);
  return (
    invoices.find(
      (invoice) =>
        isClientInvoiceStatus(invoice.status) &&
        occupancyQuoteId(invoice.sourceQuoteId) === key,
    ) ?? null
  );
}

export function assertOneActiveInvoicePerSourceQuote(
  invoices: readonly ClientInvoiceSourceOccupancy[],
): void {
  const seen = new Map<string, string>();
  for (const invoice of invoices) {
    if (!isClientInvoiceStatus(invoice.status)) continue;
    const key = occupancyQuoteId(invoice.sourceQuoteId);
    const previousId = seen.get(key);
    if (previousId) {
      throw new ClientInvoiceSourceOccupiedError(key, previousId);
    }
    seen.set(key, invoice.id);
  }
}

/**
 * Convert an issued quotation snapshot into an editable invoice draft.
 * The snapshot is read only. Totals on it are discarded and recalculated.
 */
export function createClientInvoiceFromIssuedQuote(
  source: unknown,
  input: {
    id: unknown;
    createdAt: unknown;
    activeInvoices?: unknown;
  },
): ClientInvoice {
  if (!isRecord(source)) {
    fail(["Issued quote snapshot must be an object."]);
  }
  const snapshot = clone(source);
  const parsed = parseIssuedQuote(snapshot);
  const id = capture(() => assertUuid(input.id, "id"));
  const createdAt = capture(() => assertUtcTimestamp(input.createdAt, "createdAt"));
  const activeInvoices = parseActiveInvoices(input.activeInvoices);
  const existing = findActiveInvoiceForSourceQuote(
    activeInvoices,
    parsed.sourceQuote.quoteId,
  );
  if (existing) {
    throw new ClientInvoiceSourceOccupiedError(
      parsed.sourceQuote.quoteId,
      existing.id,
    );
  }

  const draft = assembleDraft(
    parsed.commercial,
    parsed.sourceQuote,
    null,
    null,
  );
  return clone({
    id,
    licenseeAccountId: parsed.licenseeAccountId,
    organizationId: parsed.organizationId,
    status: "draft",
    contentLanguage: parsed.contentLanguage,
    currencyCode: parsed.currencyCode,
    draft,
    issuedSnapshot: null,
    invoiceNumber: null,
    issueDate: null,
    issuedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

/**
 * Replace the editable commercial draft and recalculate totals.
 * Currency and the source quotation cannot change. An issued invoice cannot
 * be edited. Quote validity on the payload is ignored.
 */
export function updateClientInvoiceDraft(
  invoice: ClientInvoice,
  draft: unknown,
  meta: { updatedAt: unknown },
): ClientInvoice {
  if (invoice.status === "issued") {
    throw new IssuedClientInvoiceImmutableError();
  }
  if (invoice.status !== "draft") {
    throw new ClientInvoiceLifecycleError("Only a draft invoice can be edited.");
  }
  if (!isRecord(draft)) {
    fail(["draft must be an object."]);
  }
  if (draft.schemaVersion !== CLIENT_INVOICE_DRAFT_SCHEMA_VERSION) {
    fail(["draft.schemaVersion must be client_invoice_draft_v1."]);
  }

  const current = clone(invoice);
  assertCurrencyLocked(current.currencyCode, draft.currencyCode);
  assertSourceQuoteUnchanged(current.draft.sourceQuote, draft.sourceQuote);
  const commercial = normalizeCommercial(
    commercialPayload(draft, current.draft.currencyScale),
    current.currencyCode,
  );
  const nextDraft = assembleDraft(
    commercial,
    current.draft.sourceQuote,
    parsePaymentDueDate(draft.paymentDueDate),
    parsePaymentInstructions(draft.paymentInstructions),
  );
  return clone({
    ...current,
    draft: nextDraft,
    issuedSnapshot: null,
    invoiceNumber: null,
    issueDate: null,
    issuedAt: null,
    updatedAt: capture(() => assertUtcTimestamp(meta.updatedAt, "updatedAt")),
  });
}

function freezeIssuedBrand(value: unknown): ClientQuoteIssuedBrandSnapshot {
  return capture(() => parseClientQuoteIssuedBrand(value));
}

/**
 * Freeze the draft. The invoice number, issue date, issued snapshot,
 * and quote-owned brand are assigned here and only here.
 * Omitted brand becomes an empty palette. It is not read from the
 * live organization.
 */
export function issueClientInvoice(
  invoice: ClientInvoice,
  input: {
    invoiceNumber: unknown;
    issuedAt: unknown;
    updatedAt: unknown;
    /** Civil issue date. Defaults to the UTC date of issuedAt. */
    issueDate?: unknown;
    /**
     * Quote-owned palette and logo metadata. The service passes the
     * issued quotation brand. Omitted brand freezes an empty palette.
     */
    brand?: unknown;
  },
): ClientInvoice {
  if (invoice.status === "issued") {
    throw new IssuedClientInvoiceImmutableError();
  }
  if (invoice.status !== "draft") {
    throw new ClientInvoiceLifecycleError("Only a draft invoice can be issued.");
  }

  const current = clone(invoice);
  const invoiceNumber = assertClientInvoiceNumber(input.invoiceNumber);
  const issuedAt = capture(() => assertUtcTimestamp(input.issuedAt, "issuedAt"));
  const updatedAt = capture(() => assertUtcTimestamp(input.updatedAt, "updatedAt"));
  const issueDate =
    input.issueDate == null
      ? issuedAt.slice(0, 10)
      : assertIsoDate(input.issueDate, "issueDate");
  const commercial = normalizeCommercial(
    commercialPayload(current.draft, current.draft.currencyScale),
    current.currencyCode,
  );
  const paymentDueDate = parsePaymentDueDate(current.draft.paymentDueDate);
  const paymentInstructions = parsePaymentInstructions(
    current.draft.paymentInstructions,
  );
  if (!paymentDueDate) {
    fail(["paymentDueDate is required to issue an invoice."]);
  }
  if (paymentDueDate < issueDate) {
    fail(["paymentDueDate must be on or after the invoice issue date."]);
  }

  const draft = assembleDraft(
    commercial,
    current.draft.sourceQuote,
    paymentDueDate,
    paymentInstructions,
  );
  const snapshot: ClientInvoiceIssuedSnapshotV1 = {
    schemaVersion: CLIENT_INVOICE_ISSUED_SCHEMA_VERSION,
    invoiceId: current.id,
    licenseeAccountId: current.licenseeAccountId,
    organizationId: current.organizationId,
    invoiceNumber,
    issuedAt,
    issueDate,
    contentLanguage: current.contentLanguage,
    currencyCode: current.currencyCode,
    currencyScale: draft.currencyScale,
    sourceQuote: clone(draft.sourceQuote),
    brand: freezeIssuedBrand(input.brand),
    issuer: clone(draft.issuer),
    customer: clone(draft.customer),
    projectTitle: draft.projectTitle,
    scopeSummary: draft.scopeSummary,
    lineItems: clone(draft.lineItems),
    paymentTerms: clone(draft.paymentTerms),
    discount: clone(draft.discount),
    tax: clone(draft.tax),
    totals: { ...draft.totals },
    frequencyTotals: clone(draft.frequencyTotals),
    paymentDueDate,
    paymentInstructions,
  };
  return clone({
    ...current,
    status: "issued",
    draft: clone(draft),
    issuedSnapshot: snapshot,
    invoiceNumber,
    issueDate,
    issuedAt,
    updatedAt,
  });
}
