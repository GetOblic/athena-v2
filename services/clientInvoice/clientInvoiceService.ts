/**
 * Licensee Master client invoice service (CQ-INV-1D).
 * licensee_account_id always comes from the authenticated Master.
 * Totals are recalculated by the invoice domain. Client totals are ignored.
 * Issued invoices are immutable. Invoice numbers are allocated only on issue.
 * Quote-owned branding is copied from the issued quotation snapshot at issue.
 * The originating quotation is read and never written.
 */

import {
  ClientQuoteCalculationError,
  type AthenaClientQuote,
  type ClientQuoteIssuedBrandSnapshot,
} from "@/services/clientQuote/clientQuoteTypes";
import { normalizeCurrencyCode } from "@/services/clientQuote/clientQuoteMoney";
import { parseClientQuoteIssuedBrand } from "@/services/clientQuote/clientQuoteValidation";
import type {
  ClientInvoiceDeps,
  ClientInvoiceMasterContext,
  StoredClientInvoice,
} from "@/services/clientInvoice/clientInvoiceDeps";
import {
  createClientInvoiceFromIssuedQuote,
  issueClientInvoice,
  updateClientInvoiceDraft,
} from "@/services/clientInvoice/clientInvoiceDomain";
import {
  clientInvoiceInvalid,
  clientInvoiceInvalidTransition,
  clientInvoiceIssuedImmutable,
  clientInvoiceNotFound,
  clientInvoiceNumberExhausted,
  clientInvoicePersistenceFailed,
  clientInvoiceSourceQuoteNotIssued,
  ClientInvoiceOperationError,
} from "@/services/clientInvoice/clientInvoiceErrors";
import {
  formatClientInvoiceNumber,
  invoiceNumberYear,
  nextClientInvoiceSequence,
} from "@/services/clientInvoice/clientInvoiceNumber";
import {
  ClientInvoiceLifecycleError,
  ClientInvoiceSourceOccupiedError,
  ClientInvoiceValidationError,
  IssuedClientInvoiceImmutableError,
  type ClientInvoice,
  type ClientInvoiceStatus,
} from "@/services/clientInvoice/clientInvoiceTypes";
import {
  OrganizationLanguageInvalidError,
  parseOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

export const CLIENT_INVOICE_NUMBER_ATTEMPTS = 8;
export const CLIENT_INVOICE_CREATE_ATTEMPTS = 3;

export type ClientInvoiceCreateResult = {
  invoice: StoredClientInvoice;
  created: boolean;
};

function asOperationError(error: unknown): never {
  if (error instanceof ClientInvoiceOperationError) throw error;
  if (error instanceof IssuedClientInvoiceImmutableError) {
    throw clientInvoiceIssuedImmutable();
  }
  if (error instanceof ClientInvoiceLifecycleError) {
    throw clientInvoiceInvalidTransition(error.message);
  }
  if (error instanceof ClientInvoiceValidationError) {
    throw clientInvoiceInvalid(error.details[0] ?? error.message);
  }
  if (error instanceof ClientQuoteCalculationError) {
    throw clientInvoiceInvalid(error.message);
  }
  throw error;
}

function activeOwnedInvoice(
  invoice: StoredClientInvoice | null,
  licenseeAccountId: string,
): StoredClientInvoice | null {
  if (
    !invoice ||
    invoice.licenseeAccountId !== licenseeAccountId ||
    invoice.deletedAt
  ) {
    return null;
  }
  return invoice;
}

function occupiesQuote(
  invoice: StoredClientInvoice,
  sourceQuoteId: string,
  licenseeAccountId: string,
): boolean {
  return (
    invoice.licenseeAccountId === licenseeAccountId &&
    !invoice.deletedAt &&
    invoice.draft.sourceQuote.quoteId === sourceQuoteId
  );
}

function issuedQuoteFingerprint(quote: AthenaClientQuote): string {
  return JSON.stringify({
    id: quote.id,
    licenseeAccountId: quote.licensee_account_id,
    organizationId: quote.organization_id,
    status: quote.status,
    quoteNumber: quote.quote_number,
    currencyCode: quote.currency_code,
    contentLanguage: quote.content_language,
    issuedAt: quote.issued_at,
    deletedAt: quote.deleted_at,
    issuedSnapshot: quote.issued_snapshot_json,
  });
}

function sameCurrency(left: unknown, right: unknown): boolean {
  try {
    return normalizeCurrencyCode(left) === normalizeCurrencyCode(right);
  } catch {
    return false;
  }
}

async function loadIssuedQuote(
  master: ClientInvoiceMasterContext,
  quoteId: string,
  deps: ClientInvoiceDeps,
): Promise<AthenaClientQuote> {
  const quote = await deps.getQuote(quoteId, master.licenseeAccountId);
  if (
    !quote ||
    quote.licensee_account_id !== master.licenseeAccountId ||
    quote.deleted_at
  ) {
    throw clientInvoiceNotFound("Quotation not found.");
  }
  if (
    quote.status !== "issued" ||
    !quote.issued_snapshot_json ||
    !quote.quote_number ||
    !quote.issued_at
  ) {
    throw clientInvoiceSourceQuoteNotIssued();
  }
  const snapshot = quote.issued_snapshot_json;
  if (
    snapshot.quoteId !== quote.id ||
    snapshot.licenseeAccountId !== quote.licensee_account_id ||
    snapshot.organizationId !== quote.organization_id ||
    snapshot.quoteNumber !== quote.quote_number ||
    snapshot.contentLanguage !== quote.content_language ||
    !sameCurrency(snapshot.currencyCode, quote.currency_code)
  ) {
    throw clientInvoicePersistenceFailed("The issued quotation could not be invoiced.");
  }
  return quote;
}

function assertBuiltInvoice(
  invoice: ClientInvoice,
  quote: AthenaClientQuote,
  licenseeAccountId: string,
): void {
  if (
    invoice.licenseeAccountId !== licenseeAccountId ||
    invoice.licenseeAccountId !== quote.licensee_account_id ||
    invoice.organizationId !== quote.organization_id ||
    invoice.draft.sourceQuote.quoteId !== quote.id ||
    invoice.draft.sourceQuote.quoteNumber !== quote.quote_number ||
    invoice.contentLanguage !== quote.content_language ||
    !sameCurrency(invoice.currencyCode, quote.currency_code) ||
    invoice.status !== "draft" ||
    invoice.invoiceNumber ||
    invoice.issuedSnapshot
  ) {
    throw clientInvoicePersistenceFailed("The issued quotation could not be invoiced.");
  }
}

function assertUnchangedAuthority(
  next: ClientInvoice,
  current: StoredClientInvoice,
): void {
  if (
    next.licenseeAccountId !== current.licenseeAccountId ||
    next.organizationId !== current.organizationId ||
    next.currencyCode !== current.currencyCode ||
    next.contentLanguage !== current.contentLanguage ||
    next.draft.sourceQuote.quoteId !== current.draft.sourceQuote.quoteId ||
    next.id !== current.id
  ) {
    throw clientInvoiceInvalid("Invoice authority fields cannot be changed.");
  }
}

function withStoredMeta(
  next: ClientInvoice,
  current: StoredClientInvoice,
): StoredClientInvoice {
  return {
    ...next,
    requestedBy: current.requestedBy,
    deletedAt: current.deletedAt,
  };
}

function assertCurrencyUnchanged(current: string, requested: unknown): void {
  if (requested == null) return;
  let next = "";
  try {
    next = normalizeCurrencyCode(requested);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      throw clientInvoiceInvalid("Currency is locked to the originating issued quote.");
    }
    throw error;
  }
  if (next !== current) {
    throw clientInvoiceInvalid("Currency is locked to the originating issued quote.");
  }
}

function assertLanguageUnchanged(
  current: OrganizationLanguage,
  requested: unknown,
): void {
  if (requested == null || requested === "") return;
  try {
    const next = parseOrganizationLanguage(requested);
    if (next !== current) {
      throw clientInvoiceInvalid("contentLanguage is locked to the invoice.");
    }
  } catch (error) {
    if (error instanceof ClientInvoiceOperationError) throw error;
    if (error instanceof OrganizationLanguageInvalidError) {
      throw clientInvoiceInvalid(
        "contentLanguage must be one of en, fr, es, it, de, pt.",
      );
    }
    throw error;
  }
}

export async function listClientInvoicesForMaster(
  masterUserId: string,
  deps: ClientInvoiceDeps,
): Promise<StoredClientInvoice[]> {
  const master = await deps.requireMaster(masterUserId);
  const invoices = await deps.listInvoices(master.licenseeAccountId);
  return invoices
    .filter(
      (invoice) =>
        invoice.licenseeAccountId === master.licenseeAccountId && !invoice.deletedAt,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Active invoice occupying a quotation. Masked rows are not included. */
export type ActiveInvoiceQuoteLink = {
  sourceQuoteId: string;
  invoiceId: string;
  status: ClientInvoiceStatus;
};

/**
 * One Licensee-scoped read of active invoices, projected to the quotation
 * relationship the library needs. Does not load one invoice per card.
 */
export async function listActiveInvoiceQuoteLinksForMaster(
  masterUserId: string,
  deps: ClientInvoiceDeps,
): Promise<ActiveInvoiceQuoteLink[]> {
  const master = await deps.requireMaster(masterUserId);
  const invoices = await listClientInvoicesForMaster(masterUserId, deps);
  const links: ActiveInvoiceQuoteLink[] = [];
  for (const invoice of invoices) {
    if (invoice.licenseeAccountId !== master.licenseeAccountId || invoice.deletedAt) {
      continue;
    }
    if (invoice.status !== "draft" && invoice.status !== "issued") continue;
    const sourceQuoteId = invoice.draft.sourceQuote.quoteId;
    if (typeof sourceQuoteId !== "string" || sourceQuoteId.length === 0) continue;
    links.push({
      sourceQuoteId,
      invoiceId: invoice.id,
      status: invoice.status,
    });
  }
  return links;
}

export async function getClientInvoiceForMaster(input: {
  masterUserId: string;
  invoiceId: string;
  deps: ClientInvoiceDeps;
}): Promise<StoredClientInvoice> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const invoice = activeOwnedInvoice(
    await input.deps.getInvoice(input.invoiceId, master.licenseeAccountId),
    master.licenseeAccountId,
  );
  if (!invoice) throw clientInvoiceNotFound("Invoice not found.");
  return invoice;
}

export async function createClientInvoiceFromQuoteForMaster(input: {
  masterUserId: string;
  quoteId: string;
  deps: ClientInvoiceDeps;
}): Promise<ClientInvoiceCreateResult> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const quote = await loadIssuedQuote(master, input.quoteId, input.deps);
  for (let attempt = 0; attempt < CLIENT_INVOICE_CREATE_ATTEMPTS; attempt += 1) {
    const existing = await input.deps.findActiveInvoiceBySourceQuote(
      quote.id,
      master.licenseeAccountId,
    );
    if (existing) {
      if (!occupiesQuote(existing, quote.id, master.licenseeAccountId)) {
        throw clientInvoiceNotFound("Invoice not found.");
      }
      return { invoice: existing, created: false };
    }

    const again = await input.deps.getQuote(quote.id, master.licenseeAccountId);
    if (
      !again ||
      again.deleted_at ||
      again.licensee_account_id !== master.licenseeAccountId ||
      again.status !== "issued"
    ) {
      throw clientInvoiceNotFound("Quotation not found.");
    }
    if (
      issuedQuoteFingerprint(again) !== issuedQuoteFingerprint(quote) ||
      !again.issued_snapshot_json
    ) {
      throw clientInvoicePersistenceFailed(
        "The issued quotation changed during invoicing.",
      );
    }

    let built: ClientInvoice;
    try {
      built = createClientInvoiceFromIssuedQuote(
        structuredClone(again.issued_snapshot_json),
        {
          id: input.deps.newId(),
          createdAt: input.deps.now(),
          activeInvoices: [],
        },
      );
    } catch (error) {
      if (error instanceof ClientInvoiceSourceOccupiedError) {
        const winner = await input.deps.findActiveInvoiceBySourceQuote(
          quote.id,
          master.licenseeAccountId,
        );
        if (winner && occupiesQuote(winner, quote.id, master.licenseeAccountId)) {
          return { invoice: winner, created: false };
        }
        continue;
      }
      asOperationError(error);
    }
    assertBuiltInvoice(built, again, master.licenseeAccountId);

    let write;
    try {
      write = await input.deps.insertInvoice(built, master.masterUserId);
    } catch (error) {
      if (error instanceof ClientInvoiceOperationError) throw error;
      throw clientInvoicePersistenceFailed("Could not create the invoice.");
    }
    if (write.ok) {
      if (!occupiesQuote(write.invoice, quote.id, master.licenseeAccountId)) {
        throw clientInvoiceNotFound("Invoice not found.");
      }
      return { invoice: write.invoice, created: true };
    }

    const winner = await input.deps.findActiveInvoiceBySourceQuote(
      quote.id,
      master.licenseeAccountId,
    );
    if (winner && occupiesQuote(winner, quote.id, master.licenseeAccountId)) {
      return { invoice: winner, created: false };
    }
  }
  throw clientInvoicePersistenceFailed("Could not create the invoice.");
}

export async function updateClientInvoiceDraftForMaster(input: {
  masterUserId: string;
  invoiceId: string;
  draft: unknown;
  contentLanguage?: unknown;
  currencyCode?: unknown;
  deps: ClientInvoiceDeps;
}): Promise<StoredClientInvoice> {
  const current = await getClientInvoiceForMaster({
    masterUserId: input.masterUserId,
    invoiceId: input.invoiceId,
    deps: input.deps,
  });
  if (current.status === "issued") throw clientInvoiceIssuedImmutable();
  assertCurrencyUnchanged(current.currencyCode, input.currencyCode);
  assertLanguageUnchanged(current.contentLanguage, input.contentLanguage);
  let next: ClientInvoice;
  try {
    next = updateClientInvoiceDraft(current, input.draft, {
      updatedAt: input.deps.now(),
    });
  } catch (error) {
    asOperationError(error);
  }
  assertUnchangedAuthority(next, current);
  const saved = await input.deps.updateDraftInvoice(withStoredMeta(next, current));
  if (saved) {
    assertUnchangedAuthority(saved, current);
    return saved;
  }
  const again = await input.deps.getInvoice(
    current.id,
    current.licenseeAccountId,
  );
  if (
    !again ||
    again.deletedAt ||
    again.licenseeAccountId !== current.licenseeAccountId
  ) {
    throw clientInvoiceNotFound("Invoice not found.");
  }
  if (again.status === "draft") {
    throw clientInvoicePersistenceFailed("Could not save the invoice.");
  }
  throw clientInvoiceIssuedImmutable();
}

/**
 * Copy palette and logo metadata from the immutable quotation snapshot.
 * A masked quotation can still supply that snapshot. Live organization
 * branding is not read.
 */
function brandFrozenFromQuote(
  quote: AthenaClientQuote | null,
  invoice: StoredClientInvoice,
): ClientQuoteIssuedBrandSnapshot {
  const snapshot = quote?.issued_snapshot_json ?? null;
  if (
    !quote ||
    quote.licensee_account_id !== invoice.licenseeAccountId ||
    !snapshot ||
    snapshot.quoteId !== invoice.draft.sourceQuote.quoteId ||
    snapshot.licenseeAccountId !== invoice.licenseeAccountId ||
    snapshot.quoteNumber !== invoice.draft.sourceQuote.quoteNumber
  ) {
    throw clientInvoicePersistenceFailed(
      "The issued quotation could not be invoiced.",
    );
  }
  try {
    return parseClientQuoteIssuedBrand(snapshot.brand);
  } catch {
    throw clientInvoicePersistenceFailed(
      "The issued quotation could not be invoiced.",
    );
  }
}

async function assignIssuedInvoice(
  invoice: StoredClientInvoice,
  deps: ClientInvoiceDeps,
): Promise<StoredClientInvoice> {
  const quote = await deps.getQuote(
    invoice.draft.sourceQuote.quoteId,
    invoice.licenseeAccountId,
  );
  const brand = brandFrozenFromQuote(quote, invoice);
  const issuedAt = deps.now();
  const year = invoiceNumberYear(issuedAt);
  let sequence = nextClientInvoiceSequence(
    await deps.listInvoiceNumbers(invoice.licenseeAccountId),
    year,
  );
  for (let attempt = 0; attempt < CLIENT_INVOICE_NUMBER_ATTEMPTS; attempt += 1) {
    const invoiceNumber = formatClientInvoiceNumber(year, sequence);
    let issued: ClientInvoice;
    try {
      issued = issueClientInvoice(invoice, {
        invoiceNumber,
        issuedAt,
        updatedAt: issuedAt,
        brand,
      });
    } catch (error) {
      asOperationError(error);
    }
    assertUnchangedAuthority(issued, invoice);
    let write;
    try {
      write = await deps.issueInvoice(withStoredMeta(issued, invoice));
    } catch (error) {
      if (error instanceof ClientInvoiceOperationError) throw error;
      throw clientInvoicePersistenceFailed("Could not issue the invoice.");
    }
    if (write.ok) {
      assertUnchangedAuthority(write.invoice, invoice);
      return write.invoice;
    }
    if (write.reason === "not_draft") {
      const current = await deps.getInvoice(invoice.id, invoice.licenseeAccountId);
      if (
        !current ||
        current.deletedAt ||
        current.licenseeAccountId !== invoice.licenseeAccountId
      ) {
        throw clientInvoiceNotFound("Invoice not found.");
      }
      if (current.status === "issued") return current;
      throw clientInvoiceIssuedImmutable();
    }
    const latest = nextClientInvoiceSequence(
      await deps.listInvoiceNumbers(invoice.licenseeAccountId),
      year,
    );
    sequence = Math.max(sequence + 1, latest);
  }
  throw clientInvoiceNumberExhausted();
}

export async function issueClientInvoiceForMaster(input: {
  masterUserId: string;
  invoiceId: string;
  deps: ClientInvoiceDeps;
}): Promise<StoredClientInvoice> {
  const invoice = await getClientInvoiceForMaster({
    masterUserId: input.masterUserId,
    invoiceId: input.invoiceId,
    deps: input.deps,
  });
  if (invoice.status === "issued") return invoice;
  const latest = await input.deps.getInvoice(invoice.id, invoice.licenseeAccountId);
  if (
    !latest ||
    latest.deletedAt ||
    latest.licenseeAccountId !== invoice.licenseeAccountId
  ) {
    throw clientInvoiceNotFound("Invoice not found.");
  }
  if (latest.status === "issued") return latest;
  return assignIssuedInvoice(latest, input.deps);
}

export async function maskClientInvoiceForMaster(input: {
  masterUserId: string;
  invoiceId: string;
  deps: ClientInvoiceDeps;
}): Promise<{ alreadyMasked: boolean }> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const masked = await input.deps.maskInvoice(
    input.invoiceId,
    master.licenseeAccountId,
    input.deps.now(),
  );
  if (!masked || masked.invoice.licenseeAccountId !== master.licenseeAccountId) {
    throw clientInvoiceNotFound("Invoice not found.");
  }
  return { alreadyMasked: masked.alreadyMasked };
}
