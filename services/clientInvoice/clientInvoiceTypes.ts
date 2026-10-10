/**
 * Licensee client invoice contracts (CQ-INV-1B).
 * Pure domain types only — no persistence, API, PDF, or payment collection.
 *
 * Monetary amounts stay integer minor units. Totals are produced by the
 * quotation calculator. An issued invoice snapshot freezes the commercial
 * document; the originating quotation is not rewritten.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { CLIENT_QUOTE_ISSUED_SCHEMA_VERSION } from "@/services/clientQuote/clientQuoteTypes";
import type {
  ClientQuoteCustomerSnapshot,
  ClientQuoteDiscount,
  ClientQuoteFrequencyTotals,
  ClientQuoteIssuedBrandSnapshot,
  ClientQuoteIssuerSnapshot,
  ClientQuoteLineItem,
  ClientQuotePaymentTerms,
  ClientQuoteTax,
  ClientQuoteTotals,
} from "@/services/clientQuote/clientQuoteTypes";

export const CLIENT_INVOICE_DRAFT_SCHEMA_VERSION = "client_invoice_draft_v1" as const;

export const CLIENT_INVOICE_ISSUED_SCHEMA_VERSION =
  "client_invoice_issued_v1" as const;

export const CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION =
  "client_invoice_source_quote_v1" as const;

export const CLIENT_INVOICE_STATUSES = ["draft", "issued"] as const;

export type ClientInvoiceStatus = (typeof CLIENT_INVOICE_STATUSES)[number];

export const CLIENT_INVOICE_FIELD_LIMITS = {
  paymentInstructions: 2_000,
  invoiceNumber: 40,
} as const;

/**
 * Provenance of the issued quotation this invoice was created from.
 * Quote validity, brand, and appendix are not part of this reference.
 */
export type ClientInvoiceSourceQuoteV1 = {
  schemaVersion: typeof CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION;
  quoteId: string;
  quoteNumber: string;
  quoteIssuedAt: string;
  quoteSchemaVersion: typeof CLIENT_QUOTE_ISSUED_SCHEMA_VERSION;
  /** Copied estimate id when the quotation preserved one. Not a live FK. */
  sourceEstimateId: string | null;
};

/**
 * Editable invoice. Totals and line totals are domain-calculated.
 * paymentDueDate is an invoice date. It is never copied from quote validity.
 * paymentInstructions are remittance directions, not quote payment terms.
 */
export type ClientInvoiceDraftV1 = {
  schemaVersion: typeof CLIENT_INVOICE_DRAFT_SCHEMA_VERSION;
  /** Minor-unit exponent of the locked currency. */
  currencyScale: number;
  sourceQuote: ClientInvoiceSourceQuoteV1;
  issuer: ClientQuoteIssuerSnapshot;
  customer: ClientQuoteCustomerSnapshot;
  projectTitle: string;
  scopeSummary: string;
  lineItems: ClientQuoteLineItem[];
  paymentTerms: ClientQuotePaymentTerms;
  discount: ClientQuoteDiscount;
  tax: ClientQuoteTax;
  /**
   * Compatibility total from the quotation calculator.
   * Mixed billing periods are not summed. frequencyTotals is authoritative.
   */
  totals: ClientQuoteTotals;
  /** Per-frequency totals in canonical order. Always calculated for a new invoice. */
  frequencyTotals: ClientQuoteFrequencyTotals[];
  /** Civil date the customer is expected to pay. Null until the draft sets one. */
  paymentDueDate: string | null;
  /** Where and how to pay. Null until the draft sets directions. */
  paymentInstructions: string | null;
};

/**
 * Frozen invoice. A later renderer can use this without reading the
 * quotation row, the Estimate, or the live organization identity.
 * brand is copied from the issued quotation at invoice issue.
 */
export type ClientInvoiceIssuedSnapshotV1 = {
  schemaVersion: typeof CLIENT_INVOICE_ISSUED_SCHEMA_VERSION;
  invoiceId: string;
  licenseeAccountId: string;
  organizationId: string;
  invoiceNumber: string;
  issuedAt: string;
  /** Civil issue date. Assigned at issue. Not the quotation's issuedAt. */
  issueDate: string;
  contentLanguage: OrganizationLanguage;
  currencyCode: string;
  currencyScale: number;
  sourceQuote: ClientInvoiceSourceQuoteV1;
  /**
   * Palette, font, and quote-owned logo metadata frozen at invoice issue.
   * The logo path is the quotation copy. It is not a live organization logo.
   */
  brand: ClientQuoteIssuedBrandSnapshot;
  issuer: ClientQuoteIssuerSnapshot;
  customer: ClientQuoteCustomerSnapshot;
  projectTitle: string;
  scopeSummary: string;
  lineItems: ClientQuoteLineItem[];
  paymentTerms: ClientQuotePaymentTerms;
  discount: ClientQuoteDiscount;
  tax: ClientQuoteTax;
  totals: ClientQuoteTotals;
  frequencyTotals: ClientQuoteFrequencyTotals[];
  paymentDueDate: string;
  paymentInstructions: string | null;
};

/** In-memory invoice. This is not a database row. */
export type ClientInvoice = {
  id: string;
  licenseeAccountId: string;
  organizationId: string;
  status: ClientInvoiceStatus;
  contentLanguage: OrganizationLanguage;
  /** Locked to the originating issued quotation. */
  currencyCode: string;
  draft: ClientInvoiceDraftV1;
  issuedSnapshot: ClientInvoiceIssuedSnapshotV1 | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** An invoice that occupies a source quotation. Both statuses are active. */
export type ClientInvoiceSourceOccupancy = {
  id: string;
  sourceQuoteId: string;
  status: ClientInvoiceStatus;
};

export class ClientInvoiceValidationError extends Error {
  readonly code = "INVALID_CLIENT_INVOICE" as const;
  readonly details: readonly string[];

  constructor(details: string[]) {
    super(details[0] ?? "Client invoice validation failed.");
    this.name = "ClientInvoiceValidationError";
    this.details = details;
  }
}

export class IssuedClientInvoiceImmutableError extends Error {
  readonly code = "ISSUED_INVOICE_IMMUTABLE" as const;

  constructor(message = "Issued client invoices cannot be changed.") {
    super(message);
    this.name = "IssuedClientInvoiceImmutableError";
  }
}

export class ClientInvoiceLifecycleError extends Error {
  readonly code = "INVALID_CLIENT_INVOICE_TRANSITION" as const;

  constructor(message: string) {
    super(message);
    this.name = "ClientInvoiceLifecycleError";
  }
}

export class ClientInvoiceSourceOccupiedError extends Error {
  readonly code = "SOURCE_QUOTE_HAS_ACTIVE_INVOICE" as const;
  readonly sourceQuoteId: string;
  readonly existingInvoiceId: string;

  constructor(sourceQuoteId: string, existingInvoiceId: string) {
    super("An active invoice already exists for this quotation.");
    this.name = "ClientInvoiceSourceOccupiedError";
    this.sourceQuoteId = sourceQuoteId;
    this.existingInvoiceId = existingInvoiceId;
  }
}

export function isClientInvoiceStatus(
  value: unknown,
): value is ClientInvoiceStatus {
  return (
    typeof value === "string" &&
    (CLIENT_INVOICE_STATUSES as readonly string[]).includes(value)
  );
}

export function clientInvoiceSourceQuoteId(
  invoice: Pick<ClientInvoice, "draft">,
): string {
  return invoice.draft.sourceQuote.quoteId;
}
