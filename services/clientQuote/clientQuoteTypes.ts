/**
 * Licensee client quotation contracts (EST-QUOTE-1C.1).
 * Pure domain types only — no persistence client, API, PDF, or worker.
 *
 * Monetary amounts are integer minor units. The rounding contract lives in
 * clientQuoteMoney.ts. Issued snapshots freeze commercial text and the
 * quote-owned brand metadata so a later PDF does not read the source
 * Estimate or the live organization identity.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

export const CLIENT_QUOTE_DRAFT_SCHEMA_VERSION = "client_quote_draft_v1" as const;

export const CLIENT_QUOTE_ISSUED_SCHEMA_VERSION =
  "client_quote_issued_v1" as const;

export const CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION =
  "client_quote_source_estimate_v1" as const;

export const CLIENT_QUOTE_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ClientQuoteLogoMimeType =
  (typeof CLIENT_QUOTE_LOGO_MIME_TYPES)[number];

/** SHA-256 hex digest of the quote-owned logo bytes. */
export const CLIENT_QUOTE_LOGO_CONTENT_HASH_LENGTH = 64 as const;

export const CLIENT_QUOTE_STATUSES = ["draft", "issued"] as const;

export type ClientQuoteStatus = (typeof CLIENT_QUOTE_STATUSES)[number];

/**
 * Canonical billing-frequency order. Grouped totals follow this sequence.
 * Amounts are never multiplied out to a year and never added across frequencies.
 */
export const CLIENT_QUOTE_BILLING_FREQUENCIES = [
  "one_time",
  "monthly",
  "quarterly",
  "annually",
] as const;

export type ClientQuoteBillingFrequency =
  (typeof CLIENT_QUOTE_BILLING_FREQUENCIES)[number];

/**
 * Parts-per-million of the whole amount.
 * 1_000_000 = 100%, 200_000 = 20%, 88_750 = 8.875%.
 */
export const CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR = 1_000_000 as const;

export const CLIENT_QUOTE_FIELD_LIMITS = {
  legalName: 200,
  tradingName: 200,
  contactName: 200,
  jobTitle: 200,
  addressLine: 200,
  city: 120,
  region: 120,
  postalCode: 32,
  country: 120,
  phone: 40,
  email: 320,
  website: 300,
  registrationNumber: 80,
  taxIdentifier: 80,
  taxIdentifierLabel: 40,
  additionalNote: 2_000,
  projectTitle: 200,
  scopeSummary: 4_000,
  scopeSummarySeed: 500,
  lineDescription: 500,
  paymentSummary: 2_000,
  paymentScheduleNote: 2_000,
  validityNote: 2_000,
  appendixHeading: 200,
  appendixBody: 24_000,
  quoteNumber: 40,
  logoStoragePath: 500,
  lineItems: 50,
  appendixSections: 8,
  quantityScale: 4,
  quantityCoefficient: 1_000_000_000_000,
  validForDays: 3_650,
  customerName: 200,
} as const;

export type ClientQuotePostalAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
};

/**
 * Commercial issuer text frozen onto a quotation.
 * Brand palette, font, and logo metadata live on the issued brand snapshot.
 */
export type ClientQuoteIssuerSnapshot = {
  legalName: string;
  tradingName: string | null;
  postalAddress: ClientQuotePostalAddress;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  taxIdentifier: string | null;
  taxIdentifierLabel: string | null;
  contactName: string | null;
  jobTitle: string | null;
  additionalNote: string | null;
};

export type ClientQuoteCustomerSnapshot = {
  name: string;
  contactName: string | null;
  jobTitle: string | null;
  postalAddress: ClientQuotePostalAddress;
  phone: string | null;
  email: string | null;
  taxIdentifier: string | null;
};

/**
 * Logo metadata owned by the issued quotation.
 * storagePath is the quote copy, not the live organization brand path.
 * This contract does not copy bytes or render a PDF.
 */
export type ClientQuoteIssuedLogoSnapshot = {
  storagePath: string;
  mimeType: ClientQuoteLogoMimeType;
  contentHash: string;
};

/** Palette and font frozen at issue, plus the quote-owned logo when present. */
export type ClientQuoteIssuedBrandSnapshot = {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  font: string | null;
  logo: ClientQuoteIssuedLogoSnapshot | null;
};

/**
 * Positive decimal quantity.
 * value = coefficient / 10^scale, with scale in 0..4.
 */
export type ClientQuoteQuantity = {
  coefficient: number;
  scale: number;
};

export type ClientQuoteLineItem = {
  id: string;
  description: string;
  quantity: ClientQuoteQuantity;
  /** Nonnegative integer minor units of the quotation currency. */
  unitPriceMinor: number;
  /** Domain-calculated. Client-supplied values are discarded. */
  lineTotalMinor: number;
  /**
   * Billing cadence of this line.
   * Missing values normalize to one_time, and new drafts stamp one_time.
   * Quotations issued before recurring pricing omit the field and stay unchanged.
   */
  billingFrequency?: ClientQuoteBillingFrequency;
};

export type ClientQuoteDiscount =
  | { kind: "none" }
  | { kind: "fixed"; amountMinor: number }
  | { kind: "percentage"; ratePpm: number };

export type ClientQuoteTax =
  | { kind: "none" }
  | { kind: "percentage"; ratePpm: number; label: string | null };

export type ClientQuotePaymentTerms = {
  summary: string;
  scheduleNote: string | null;
};

export type ClientQuoteValidity = {
  validForDays: number | null;
  validUntil: string | null;
  note: string | null;
};

export type ClientQuoteAppendixSection = {
  heading: string;
  body: string;
};

export type ClientQuoteAppendix = {
  enabled: boolean;
  sections: ClientQuoteAppendixSection[];
};

/**
 * Calculated commercial totals for a single billing frequency.
 * There is no independently editable final total.
 * totalMinor = taxableMinor + taxMinor, and taxableMinor = subtotalMinor - discountMinor.
 */
export type ClientQuoteTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/** Authoritative totals for one billing frequency. Groups are not annualized. */
export type ClientQuoteFrequencyTotals = {
  billingFrequency: ClientQuoteBillingFrequency;
  totals: ClientQuoteTotals;
};

export type ClientQuoteDraftV1 = {
  schemaVersion: typeof CLIENT_QUOTE_DRAFT_SCHEMA_VERSION;
  /** Minor-unit exponent of currency_code, stamped by validation. */
  currencyScale: number;
  issuer: ClientQuoteIssuerSnapshot;
  customer: ClientQuoteCustomerSnapshot;
  projectTitle: string;
  scopeSummary: string;
  lineItems: ClientQuoteLineItem[];
  paymentTerms: ClientQuotePaymentTerms;
  validity: ClientQuoteValidity;
  appendix: ClientQuoteAppendix;
  discount: ClientQuoteDiscount;
  tax: ClientQuoteTax;
  /**
   * Compatibility total. It is not a combined contract value.
   * One frequency: equal to that frequency's totals.
   * Mixed, with a one_time group: the one_time group only.
   * Mixed, with no one_time group: a zero-valued compatibility object.
   * Unlike billing periods are never summed, and recurring charges are not annualized.
   * frequencyTotals is authoritative for mixed quotations.
   */
  totals: ClientQuoteTotals;
  /**
   * Per-frequency totals in canonical order: one_time, monthly, quarterly, annually.
   * Only frequencies that have lines are included.
   * Client-supplied values are discarded. Documents issued before recurring
   * pricing omit this field and are not rewritten.
   */
  frequencyTotals?: ClientQuoteFrequencyTotals[];
};

/**
 * Copied Estimate provenance.
 * estimateId remains after source_estimate_id is cleared.
 * This object must not carry prospect generation context.
 */
export type ClientQuoteSourceEstimateSnapshot = {
  schemaVersion: typeof CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION;
  estimateId: string;
  organizationId: string;
  organizationNameSnapshot: string | null;
  estimateSchemaVersion: "estimate_v1";
  currencyCode: string;
  recommendedClientPriceMinor: number;
};

/**
 * Frozen commercial document. A later PDF can render this without reading
 * athena_estimates or the live organization identity.
 */
export type ClientQuoteIssuedSnapshotV1 = {
  schemaVersion: typeof CLIENT_QUOTE_ISSUED_SCHEMA_VERSION;
  quoteId: string;
  licenseeAccountId: string;
  organizationId: string;
  quoteNumber: string;
  issuedAt: string;
  contentLanguage: OrganizationLanguage;
  currencyCode: string;
  currencyScale: number;
  sourceEstimate: ClientQuoteSourceEstimateSnapshot | null;
  revisedFromQuoteId: string | null;
  issuer: ClientQuoteIssuerSnapshot;
  customer: ClientQuoteCustomerSnapshot;
  brand: ClientQuoteIssuedBrandSnapshot;
  projectTitle: string;
  scopeSummary: string;
  lineItems: ClientQuoteLineItem[];
  paymentTerms: ClientQuotePaymentTerms;
  validity: ClientQuoteValidity;
  appendix: ClientQuoteAppendix;
  discount: ClientQuoteDiscount;
  tax: ClientQuoteTax;
  /**
   * Frozen compatibility total. Same rules as the draft.
   * A snapshot issued before recurring pricing has no frequencyTotals
   * and must not be rewritten to invent one.
   */
  totals: ClientQuoteTotals;
  /** Frozen per-frequency totals. Absent on snapshots issued before recurring pricing. */
  frequencyTotals?: ClientQuoteFrequencyTotals[];
};

/** Row shape for athena_client_quotes. */
export type AthenaClientQuote = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
  requested_by: string | null;
  source_estimate_id: string | null;
  source_estimate_snapshot: ClientQuoteSourceEstimateSnapshot | null;
  revised_from_quote_id: string | null;
  status: ClientQuoteStatus;
  content_language: OrganizationLanguage;
  currency_code: string;
  draft_json: ClientQuoteDraftV1;
  issued_snapshot_json: ClientQuoteIssuedSnapshotV1 | null;
  quote_number: string | null;
  issued_at: string | null;
  /** Null while the quotation is in the active library. */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export class ClientQuoteCalculationError extends Error {
  readonly code = "INVALID_CLIENT_QUOTE_CALCULATION" as const;

  constructor(message: string) {
    super(message);
    this.name = "ClientQuoteCalculationError";
  }
}

export class ClientQuoteValidationError extends Error {
  readonly code = "INVALID_CLIENT_QUOTE" as const;
  readonly details: readonly string[];

  constructor(details: string[]) {
    super(details[0] ?? "Client quote validation failed.");
    this.name = "ClientQuoteValidationError";
    this.details = details;
  }
}

export class IssuedClientQuoteImmutableError extends Error {
  readonly code = "ISSUED_IMMUTABLE" as const;

  constructor(
    message = "Issued client quotes cannot be changed. Revise them as a new draft.",
  ) {
    super(message);
    this.name = "IssuedClientQuoteImmutableError";
  }
}

export class ClientQuoteLifecycleError extends Error {
  readonly code = "INVALID_CLIENT_QUOTE_TRANSITION" as const;

  constructor(message: string) {
    super(message);
    this.name = "ClientQuoteLifecycleError";
  }
}

export function emptyClientQuotePostalAddress(): ClientQuotePostalAddress {
  return {
    line1: null,
    line2: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
  };
}

export function emptyClientQuoteIssuedBrand(): ClientQuoteIssuedBrandSnapshot {
  return {
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    backgroundColor: null,
    font: null,
    logo: null,
  };
}

export function isClientQuoteStatus(value: unknown): value is ClientQuoteStatus {
  return (
    typeof value === "string" &&
    (CLIENT_QUOTE_STATUSES as readonly string[]).includes(value)
  );
}

export function isClientQuoteBillingFrequency(
  value: unknown,
): value is ClientQuoteBillingFrequency {
  return (
    typeof value === "string" &&
    (CLIENT_QUOTE_BILLING_FREQUENCIES as readonly string[]).includes(value)
  );
}

/**
 * Original Estimate id for display and audit.
 * Prefers the copied snapshot so a cleared FK does not drop the reference.
 */
export function preservedSourceEstimateId(
  quote: Pick<
    AthenaClientQuote,
    "source_estimate_id" | "source_estimate_snapshot"
  >,
): string | null {
  return quote.source_estimate_snapshot?.estimateId ?? quote.source_estimate_id;
}
