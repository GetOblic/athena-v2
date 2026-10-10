/**
 * Server-side client invoice dependencies.
 * The service never constructs a Supabase client. Routes supply the
 * default adapter. Tests supply an in-memory adapter.
 */

import type { AthenaClientQuote } from "@/services/clientQuote/clientQuoteTypes";
import type { ClientInvoice } from "@/services/clientInvoice/clientInvoiceTypes";

export type ClientInvoiceMasterContext = {
  licenseeAccountId: string;
  masterUserId: string;
};

/** Domain invoice plus row fields that are not part of the commercial document. */
export type StoredClientInvoice = ClientInvoice & {
  requestedBy: string | null;
  deletedAt: string | null;
};

export type ClientInvoiceInsertResult =
  | { ok: true; invoice: StoredClientInvoice }
  | { ok: false; reason: "source_occupied" };

export type ClientInvoiceIssueWriteResult =
  | { ok: true; invoice: StoredClientInvoice }
  | { ok: false; reason: "conflict" | "not_draft" };

export type ClientInvoiceMaskResult = {
  invoice: StoredClientInvoice;
  alreadyMasked: boolean;
};

export type ClientInvoiceDeps = {
  requireMaster(masterUserId: string): Promise<ClientInvoiceMasterContext>;
  /**
   * Read one quotation owned by this Licensee, including a masked row.
   * Must not insert, update, or delete the quotation.
   */
  getQuote(
    id: string,
    licenseeAccountId: string,
  ): Promise<AthenaClientQuote | null>;
  insertInvoice(
    invoice: ClientInvoice,
    requestedBy: string,
  ): Promise<ClientInvoiceInsertResult>;
  updateDraftInvoice(
    invoice: StoredClientInvoice,
  ): Promise<StoredClientInvoice | null>;
  issueInvoice(
    invoice: StoredClientInvoice,
  ): Promise<ClientInvoiceIssueWriteResult>;
  /** Includes a masked row so a repeated mask can be idempotent. */
  getInvoice(
    id: string,
    licenseeAccountId: string,
  ): Promise<StoredClientInvoice | null>;
  /** Active library only. Masked rows stay stored and out of this list. */
  listInvoices(licenseeAccountId: string): Promise<StoredClientInvoice[]>;
  /**
   * The non-deleted invoice occupying a quotation, if one exists.
   * Scoped to the authenticated Licensee.
   */
  findActiveInvoiceBySourceQuote(
    sourceQuoteId: string,
    licenseeAccountId: string,
  ): Promise<StoredClientInvoice | null>;
  /**
   * Soft-mask one owned invoice. A second call must not write again.
   * Does not delete the row, snapshot, number, or source quotation.
   */
  maskInvoice(
    id: string,
    licenseeAccountId: string,
    deletedAt: string,
  ): Promise<ClientInvoiceMaskResult | null>;
  /**
   * Every invoice number for the Licensee, including masked rows.
   * Quotation numbers are not included.
   */
  listInvoiceNumbers(licenseeAccountId: string): Promise<string[]>;
  now(): string;
  newId(): string;
};
