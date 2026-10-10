/**
 * Pure mapping between athena_client_invoices rows and ClientInvoice.
 * No Supabase client. The civil issue date stays inside issued_snapshot_json.
 */

import { CLIENT_QUOTE_ISSUED_SCHEMA_VERSION } from "@/services/clientQuote/clientQuoteTypes";
import { clientInvoicePersistenceFailed } from "@/services/clientInvoice/clientInvoiceErrors";
import {
  CLIENT_INVOICE_DRAFT_SCHEMA_VERSION,
  CLIENT_INVOICE_ISSUED_SCHEMA_VERSION,
  CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION,
  type ClientInvoice,
  type ClientInvoiceDraftV1,
  type ClientInvoiceIssuedSnapshotV1,
  type ClientInvoiceSourceQuoteV1,
  type ClientInvoiceStatus,
} from "@/services/clientInvoice/clientInvoiceTypes";
import type { StoredClientInvoice } from "@/services/clientInvoice/clientInvoiceDeps";
import { parseOrganizationLanguage } from "@/services/organizationLanguage";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fail(): never {
  throw clientInvoicePersistenceFailed();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) fail();
  return value.trim().toLowerCase();
}

function asOptionalUuid(value: unknown): string | null {
  if (value == null) return null;
  return asUuid(value);
}

function asTimestamp(value: unknown): string {
  if (typeof value !== "string" && !(value instanceof Date)) fail();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail();
  return date.toISOString();
}

function asOptionalTimestamp(value: unknown): string | null {
  if (value == null) return null;
  return asTimestamp(value);
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      return null;
    }
    return null;
  }
  if (isRecord(value)) return value;
  return null;
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

function readSourceQuote(value: unknown): ClientInvoiceSourceQuoteV1 {
  const source = asJsonObject(value);
  if (!source || source.schemaVersion !== CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION) {
    fail();
  }
  if (source.quoteSchemaVersion !== CLIENT_QUOTE_ISSUED_SCHEMA_VERSION) fail();
  if (typeof source.quoteNumber !== "string" || !source.quoteNumber.trim()) fail();
  return {
    schemaVersion: CLIENT_INVOICE_SOURCE_QUOTE_SCHEMA_VERSION,
    quoteId: asUuid(source.quoteId),
    quoteNumber: source.quoteNumber.trim(),
    quoteIssuedAt: asTimestamp(source.quoteIssuedAt),
    quoteSchemaVersion: CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
    sourceEstimateId: asOptionalUuid(source.sourceEstimateId),
  };
}

function sameSource(
  left: ClientInvoiceSourceQuoteV1,
  right: ClientInvoiceSourceQuoteV1,
): boolean {
  return (
    left.quoteId === right.quoteId &&
    left.quoteNumber === right.quoteNumber &&
    left.quoteIssuedAt === right.quoteIssuedAt &&
    left.quoteSchemaVersion === right.quoteSchemaVersion &&
    left.sourceEstimateId === right.sourceEstimateId
  );
}

function readContentLanguage(value: unknown) {
  try {
    return parseOrganizationLanguage(value);
  } catch {
    fail();
  }
}

function readCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) fail();
  return value;
}

/**
 * Hide a stored invoice from the active library.
 * The row, number, and source quotation stay. A masked invoice is unchanged.
 */
export function maskStoredClientInvoice(
  invoice: StoredClientInvoice,
  deletedAt: string,
): { invoice: StoredClientInvoice; alreadyMasked: boolean } {
  if (invoice.deletedAt) {
    return { invoice: structuredClone(invoice), alreadyMasked: true };
  }
  const stamp = asTimestamp(deletedAt);
  return {
    alreadyMasked: false,
    invoice: structuredClone({
      ...invoice,
      deletedAt: stamp,
      updatedAt: stamp,
    }),
  };
}

export function toClientInvoiceInsertRow(
  invoice: ClientInvoice,
  requestedBy: string,
): Record<string, unknown> {
  if (
    invoice.status !== "draft" ||
    invoice.issuedSnapshot ||
    invoice.invoiceNumber ||
    invoice.issuedAt ||
    invoice.issueDate
  ) {
    fail();
  }
  if (invoice.draft.schemaVersion !== CLIENT_INVOICE_DRAFT_SCHEMA_VERSION) fail();
  return {
    id: asUuid(invoice.id),
    licensee_account_id: asUuid(invoice.licenseeAccountId),
    organization_id: asUuid(invoice.organizationId),
    requested_by: asUuid(requestedBy),
    source_quote_id: asUuid(invoice.draft.sourceQuote.quoteId),
    source_quote_snapshot: structuredClone(invoice.draft.sourceQuote),
    status: "draft" satisfies ClientInvoiceStatus,
    content_language: invoice.contentLanguage,
    currency_code: invoice.currencyCode,
    draft_json: structuredClone(invoice.draft),
    issued_snapshot_json: null,
    invoice_number: null,
    issued_at: null,
    created_at: asTimestamp(invoice.createdAt),
    updated_at: asTimestamp(invoice.updatedAt),
  };
}

/** Draft commercial update. Authority columns stay on the stored row. */
export function toClientInvoiceDraftUpdate(
  invoice: ClientInvoice,
): Record<string, unknown> {
  if (
    invoice.status !== "draft" ||
    invoice.issuedSnapshot ||
    invoice.invoiceNumber ||
    invoice.issuedAt ||
    invoice.issueDate
  ) {
    fail();
  }
  return {
    draft_json: structuredClone(invoice.draft),
    issued_snapshot_json: null,
    invoice_number: null,
    issued_at: null,
    updated_at: asTimestamp(invoice.updatedAt),
  };
}

/** Issue update. The civil issue date is inside the snapshot, not a column. */
export function toClientInvoiceIssueUpdate(
  invoice: ClientInvoice,
): Record<string, unknown> {
  if (
    invoice.status !== "issued" ||
    !invoice.issuedSnapshot ||
    !invoice.invoiceNumber ||
    !invoice.issuedAt ||
    !invoice.issueDate
  ) {
    throw clientInvoicePersistenceFailed("Could not issue the invoice.");
  }
  return {
    status: "issued" satisfies ClientInvoiceStatus,
    draft_json: structuredClone(invoice.draft),
    issued_snapshot_json: structuredClone(invoice.issuedSnapshot),
    invoice_number: invoice.invoiceNumber,
    issued_at: asTimestamp(invoice.issuedAt),
    updated_at: asTimestamp(invoice.updatedAt),
  };
}

export function mapClientInvoiceRow(row: Record<string, unknown>): StoredClientInvoice {
  const status = row.status;
  if (status !== "draft" && status !== "issued") fail();
  const draftRecord = asJsonObject(row.draft_json);
  if (!draftRecord || draftRecord.schemaVersion !== CLIENT_INVOICE_DRAFT_SCHEMA_VERSION) {
    fail();
  }
  const columnSource = readSourceQuote(row.source_quote_snapshot);
  const draftSource = readSourceQuote(draftRecord.sourceQuote);
  const sourceQuoteId = asUuid(row.source_quote_id);
  if (
    columnSource.quoteId !== sourceQuoteId ||
    draftSource.quoteId !== sourceQuoteId ||
    !sameSource(columnSource, draftSource)
  ) {
    fail();
  }

  const issuedRecord = asJsonObject(row.issued_snapshot_json);
  if (issuedRecord && issuedRecord.schemaVersion !== CLIENT_INVOICE_ISSUED_SCHEMA_VERSION) {
    fail();
  }
  const currencyCode = readCurrency(row.currency_code);
  const contentLanguage = readContentLanguage(row.content_language);
  const invoiceNumber =
    typeof row.invoice_number === "string" ? row.invoice_number : null;
  const issuedAt = asOptionalTimestamp(row.issued_at);
  let issueDate: string | null = null;
  let issuedSnapshot: ClientInvoiceIssuedSnapshotV1 | null = null;

  if (status === "draft") {
    if (issuedRecord || invoiceNumber || issuedAt) fail();
  } else {
    if (!issuedRecord || !invoiceNumber || !issuedAt) fail();
    if (typeof issuedRecord.issueDate !== "string" || !isRealIsoDate(issuedRecord.issueDate)) {
      fail();
    }
    if (issuedRecord.invoiceNumber !== invoiceNumber) fail();
    if (asUuid(issuedRecord.invoiceId) !== asUuid(row.id)) fail();
    if (asUuid(issuedRecord.licenseeAccountId) !== asUuid(row.licensee_account_id)) fail();
    if (asUuid(issuedRecord.organizationId) !== asUuid(row.organization_id)) fail();
    if (issuedRecord.currencyCode !== currencyCode) fail();
    if (issuedRecord.contentLanguage !== contentLanguage) fail();
    const issuedSource = readSourceQuote(issuedRecord.sourceQuote);
    if (!sameSource(issuedSource, columnSource)) fail();
    const snapshotIssuedAt = asTimestamp(issuedRecord.issuedAt);
    if (snapshotIssuedAt !== issuedAt) fail();
    issueDate = issuedRecord.issueDate;
    issuedSnapshot = issuedRecord as unknown as ClientInvoiceIssuedSnapshotV1;
  }

  const draft = draftRecord as unknown as ClientInvoiceDraftV1;
  return structuredClone({
    id: asUuid(row.id),
    licenseeAccountId: asUuid(row.licensee_account_id),
    organizationId: asUuid(row.organization_id),
    status,
    contentLanguage,
    currencyCode,
    draft,
    issuedSnapshot,
    invoiceNumber,
    issueDate,
    issuedAt,
    createdAt: asTimestamp(row.created_at),
    updatedAt: asTimestamp(row.updated_at),
    requestedBy: asOptionalUuid(row.requested_by),
    deletedAt: asOptionalTimestamp(row.deleted_at),
  });
}
