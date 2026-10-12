/**
 * Licensee client invoice editor model.
 * Presentation and payload assembly only.
 * Totals, invoice numbers, and issued snapshots are never sent as authority.
 * The server recalculates totals and assigns the number and UTC issue date.
 */

import {
  clientQuoteFrequencyGroupsForDisplay,
  editorDraftFromQuote,
  editorDraftToUpdateBody,
  formatClientQuoteDate,
  formatClientQuoteMinorAmount,
  formatClientQuoteTimestamp,
  isClientQuoteRouteId,
  previewClientQuoteMoney,
  type ClientQuoteDraftBlocker,
  type ClientQuoteEditorDraft,
  type ClientQuoteLibraryStatusLabels,
} from "@/lib/licensee/clientQuoteEditorModel";
import {
  CLIENT_INVOICE_DRAFT_SCHEMA_VERSION,
  CLIENT_INVOICE_FIELD_LIMITS,
  type ClientInvoiceSourceQuoteV1,
} from "@/services/clientInvoice/clientInvoiceTypes";
import type { PublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";
import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  type ClientQuoteBillingFrequency,
} from "@/services/clientQuote/clientQuoteTypes";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ClientInvoiceEditorDraft = {
  commercial: ClientQuoteEditorDraft;
  paymentDueDate: string;
  paymentInstructions: string;
};

export type ClientInvoiceLibraryStatusFilter = "all" | "draft" | "issued";

export function isClientInvoiceLibraryStatusFilter(
  value: string,
): value is ClientInvoiceLibraryStatusFilter {
  return value === "all" || value === "draft" || value === "issued";
}

export type ClientInvoiceDraftBlocker =
  | Exclude<ClientQuoteDraftBlocker, "validity" | "appendix">
  | "projectTitle"
  | "scopeSummary"
  | "paymentDueDate"
  | "paymentDueDateBeforeIssue"
  | "paymentInstructions";

export const CLIENT_INVOICE_ISSUE_REQUIREMENTS = [
  "issuerLegalName",
  "customerName",
  "projectTitle",
  "scopeSummary",
  "lineItem",
  "paymentTerms",
  "paymentDueDate",
] as const;

export type ClientInvoiceIssueRequirement =
  (typeof CLIENT_INVOICE_ISSUE_REQUIREMENTS)[number];

export type ClientInvoiceUpdateBody = {
  draft: {
    schemaVersion: typeof CLIENT_INVOICE_DRAFT_SCHEMA_VERSION;
    currencyScale: number;
    sourceQuote: ClientInvoiceSourceQuoteV1;
    issuer: PublicClientInvoice["draft"]["issuer"];
    customer: PublicClientInvoice["draft"]["customer"];
    projectTitle: string;
    scopeSummary: string;
    lineItems: Array<{
      id: string;
      description: string;
      quantity: PublicClientInvoice["draft"]["lineItems"][number]["quantity"];
      unitPriceMinor: number;
      billingFrequency: ClientQuoteBillingFrequency;
    }>;
    paymentTerms: PublicClientInvoice["draft"]["paymentTerms"];
    discount: PublicClientInvoice["draft"]["discount"];
    tax: PublicClientInvoice["draft"]["tax"];
    paymentDueDate: string | null;
    paymentInstructions: string | null;
  };
};

export type ClientInvoiceLibraryFrequencyAmount = {
  billingFrequency: ClientQuoteBillingFrequency;
  totalLabel: string;
};

export type ClientInvoiceLibraryRow = {
  id: string;
  status: PublicClientInvoice["status"];
  invoiceNumber: string | null;
  customerName: string;
  projectTitle: string;
  scopeSummary: string;
  currencyCode: string;
  totalLabel: string | null;
  frequencyAmounts: ClientInvoiceLibraryFrequencyAmount[];
  dateIso: string;
  dateLabel: string;
  dateKind: "created" | "issued";
  sourceQuoteId: string;
  canDownloadPdf: boolean;
};

export function clientInvoiceDetailPath(invoiceId: string): string {
  return `/licensee/invoices/${invoiceId}`;
}

export function canDownloadClientInvoicePdf(
  status: PublicClientInvoice["status"],
): boolean {
  return status === "issued";
}

export function shouldShowCreateInvoiceAction(
  status: PublicClientQuote["status"],
): boolean {
  return status === "issued";
}

/** UTC civil date. This is the issue date the server assigns. */
export function clientInvoiceUtcIssueDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
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

function commercialDocument(invoice: PublicClientInvoice) {
  if (invoice.status === "issued" && invoice.issuedSnapshot) {
    return invoice.issuedSnapshot;
  }
  return invoice.draft;
}

export function editorDraftFromInvoice(
  invoice: PublicClientInvoice,
): ClientInvoiceEditorDraft {
  const commercial = commercialDocument(invoice);
  const synthetic: PublicClientQuote = {
    id: invoice.id,
    organizationId: invoice.organizationId,
    status: "draft",
    contentLanguage: invoice.contentLanguage,
    currencyCode: invoice.currencyCode,
    quoteNumber: null,
    issuedAt: null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    sourceEstimateId: commercial.sourceQuote.sourceEstimateId,
    sourceEstimate: null,
    revisedFromQuoteId: null,
    issuedSnapshot: null,
    draft: {
      schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
      currencyScale: commercial.currencyScale,
      issuer: commercial.issuer,
      customer: commercial.customer,
      projectTitle: commercial.projectTitle,
      scopeSummary: commercial.scopeSummary,
      lineItems: commercial.lineItems,
      paymentTerms: commercial.paymentTerms,
      validity: { validForDays: 30, validUntil: null, note: null },
      appendix: { enabled: false, sections: [] },
      discount: commercial.discount,
      tax: commercial.tax,
      totals: commercial.totals,
      frequencyTotals: commercial.frequencyTotals,
    },
  };
  return {
    commercial: editorDraftFromQuote(synthetic),
    paymentDueDate: commercial.paymentDueDate ?? "",
    paymentInstructions: commercial.paymentInstructions ?? "",
  };
}

function paymentDueDateValue(
  value: string,
): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isRealIsoDate(trimmed) ? trimmed : "invalid";
}

function withoutQuoteOnlyBlockers(
  blockers: readonly ClientQuoteDraftBlocker[],
): ClientInvoiceDraftBlocker[] {
  const kept: ClientInvoiceDraftBlocker[] = [];
  for (const blocker of blockers) {
    if (blocker === "validity" || blocker === "appendix") continue;
    kept.push(blocker);
  }
  return kept;
}

function quoteBlockersForInvoice(
  commercial: ClientQuoteEditorDraft,
  currencyCode: string,
): ClientInvoiceDraftBlocker[] {
  const built = editorDraftToUpdateBody(commercial, currencyCode);
  if (built.ok) return [];
  return withoutQuoteOnlyBlockers(built.blockers);
}

export function clientInvoiceSaveBlockers(
  editor: ClientInvoiceEditorDraft,
  currencyCode: string,
): ClientInvoiceDraftBlocker[] {
  const blockers = quoteBlockersForInvoice(editor.commercial, currencyCode);
  if (!editor.commercial.projectTitle.trim()) blockers.push("projectTitle");
  if (!editor.commercial.scopeSummary.trim()) blockers.push("scopeSummary");
  if (editor.commercial.lines.length < 1) blockers.push("lineItem");
  const due = paymentDueDateValue(editor.paymentDueDate);
  if (due === "invalid") blockers.push("paymentDueDate");
  const instructions = editor.paymentInstructions;
  if (
    instructions.includes("\u0000") ||
    instructions.trim().length > CLIENT_INVOICE_FIELD_LIMITS.paymentInstructions
  ) {
    blockers.push("paymentInstructions");
  }
  return blockers;
}

export function clientInvoiceIssueBlockers(
  editor: ClientInvoiceEditorDraft,
  currencyCode: string,
  utcIssueDate: string,
): ClientInvoiceDraftBlocker[] {
  const blockers = clientInvoiceSaveBlockers(editor, currencyCode);
  const due = paymentDueDateValue(editor.paymentDueDate);
  if (due == null) blockers.push("paymentDueDate");
  if (typeof due === "string" && due < utcIssueDate) {
    blockers.push("paymentDueDateBeforeIssue");
  }
  return blockers;
}

export function missingClientInvoiceIssueRequirements(
  editor: ClientInvoiceEditorDraft,
  currencyCode: string,
  utcIssueDate: string,
): ClientInvoiceIssueRequirement[] {
  const preview = previewClientQuoteMoney(editor.commercial, currencyCode);
  const due = paymentDueDateValue(editor.paymentDueDate);
  const missing: ClientInvoiceIssueRequirement[] = [];
  if (!editor.commercial.issuer.legalName.trim()) missing.push("issuerLegalName");
  if (!editor.commercial.customer.name.trim()) missing.push("customerName");
  if (!editor.commercial.projectTitle.trim()) missing.push("projectTitle");
  if (!editor.commercial.scopeSummary.trim()) missing.push("scopeSummary");
  if (!preview.ok || editor.commercial.lines.length < 1) missing.push("lineItem");
  if (!editor.commercial.paymentSummary.trim()) missing.push("paymentTerms");
  if (due == null || due === "invalid" || due < utcIssueDate) {
    missing.push("paymentDueDate");
  }
  return missing;
}

/**
 * PATCH body for a draft. Omits totals, line totals, invoice numbers,
 * issue dates, and issued snapshots. Currency and content language stay off
 * the body so the server keeps them locked.
 */
export function editorDraftToInvoiceUpdateBody(
  editor: ClientInvoiceEditorDraft,
  currencyCode: string,
  sourceQuote: ClientInvoiceSourceQuoteV1,
):
  | { ok: true; body: ClientInvoiceUpdateBody }
  | { ok: false; blockers: ClientInvoiceDraftBlocker[] } {
  const blockers = clientInvoiceSaveBlockers(editor, currencyCode);
  if (blockers.length > 0) return { ok: false, blockers };
  const built = editorDraftToUpdateBody(editor.commercial, currencyCode);
  if (!built.ok) {
    const next = withoutQuoteOnlyBlockers(built.blockers);
    return { ok: false, blockers: next.length > 0 ? next : ["lineItem"] };
  }
  const quoteDraft = built.body.draft;
  const due = paymentDueDateValue(editor.paymentDueDate);
  const paymentDueDate = due === "invalid" ? null : due;
  const instructions = editor.paymentInstructions.trim();
  return {
    ok: true,
    body: {
      draft: {
        schemaVersion: CLIENT_INVOICE_DRAFT_SCHEMA_VERSION,
        currencyScale: quoteDraft.currencyScale,
        sourceQuote,
        issuer: quoteDraft.issuer,
        customer: quoteDraft.customer,
        projectTitle: quoteDraft.projectTitle,
        scopeSummary: quoteDraft.scopeSummary,
        lineItems: quoteDraft.lineItems.map((line) => ({
          id: line.id,
          description: line.description,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          billingFrequency: line.billingFrequency ?? "one_time",
        })),
        paymentTerms: quoteDraft.paymentTerms,
        discount: quoteDraft.discount,
        tax: quoteDraft.tax,
        paymentDueDate,
        paymentInstructions: instructions ? instructions : null,
      },
    },
  };
}

export function previewClientInvoiceMoney(
  editor: ClientInvoiceEditorDraft,
  currencyCode: string,
) {
  return previewClientQuoteMoney(editor.commercial, currencyCode);
}

function invoiceMoney(invoice: PublicClientInvoice) {
  const issued =
    invoice.status === "issued" && invoice.issuedSnapshot
      ? invoice.issuedSnapshot
      : null;
  if (issued) {
    return {
      currencyCode: issued.currencyCode,
      totals: issued.totals,
      frequencyTotals: issued.frequencyTotals,
      customerName: issued.customer.name,
      projectTitle: issued.projectTitle,
      scopeSummary: issued.scopeSummary,
    };
  }
  return {
    currencyCode: invoice.currencyCode,
    totals: invoice.draft.totals,
    frequencyTotals: invoice.draft.frequencyTotals,
    customerName: invoice.draft.customer.name,
    projectTitle: invoice.draft.projectTitle,
    scopeSummary: invoice.draft.scopeSummary,
  };
}

export function clientInvoiceLibraryRow(
  invoice: PublicClientInvoice,
  locale: string,
): ClientInvoiceLibraryRow {
  const money = invoiceMoney(invoice);
  const groups = clientQuoteFrequencyGroupsForDisplay(money.frequencyTotals);
  const mixed = groups.length > 1;
  const issued = invoice.status === "issued";
  return {
    id: invoice.id,
    status: invoice.status,
    invoiceNumber: invoice.invoiceNumber,
    customerName: money.customerName,
    projectTitle: money.projectTitle,
    scopeSummary: money.scopeSummary,
    currencyCode: money.currencyCode,
    totalLabel: mixed
      ? null
      : formatClientQuoteMinorAmount(money.totals.totalMinor, money.currencyCode),
    frequencyAmounts: mixed
      ? groups.map((group) => ({
          billingFrequency: group.billingFrequency,
          totalLabel: formatClientQuoteMinorAmount(
            group.totals.totalMinor,
            money.currencyCode,
          ),
        }))
      : [],
    dateIso: issued && invoice.issueDate ? invoice.issueDate : invoice.createdAt,
    dateLabel:
      issued && invoice.issueDate
        ? formatClientQuoteDate(invoice.issueDate, locale)
        : formatClientQuoteTimestamp(invoice.createdAt, locale),
    dateKind: issued ? "issued" : "created",
    sourceQuoteId: invoice.sourceQuoteId,
    canDownloadPdf: canDownloadClientInvoicePdf(invoice.status),
  };
}

export function sortClientInvoicesForLibrary(
  invoices: readonly PublicClientInvoice[],
): PublicClientInvoice[] {
  return [...invoices].sort((left, right) => {
    const byCreated = right.createdAt.localeCompare(left.createdAt);
    if (byCreated !== 0) return byCreated;
    return right.id.localeCompare(left.id);
  });
}

export function clientInvoiceMatchesLibraryQuery(
  invoice: PublicClientInvoice,
  query: string,
  statusLabels: ClientQuoteLibraryStatusLabels,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const row = clientInvoiceLibraryRow(invoice, "en-US");
  const statusLabel =
    invoice.status === "issued" ? statusLabels.issued : statusLabels.draft;
  const haystack = [
    row.customerName,
    row.projectTitle,
    row.scopeSummary,
    row.invoiceNumber ?? "",
    row.currencyCode,
    invoice.status,
    statusLabel,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterClientInvoicesForLibrary(
  invoices: readonly PublicClientInvoice[],
  query: string,
  statusLabels: ClientQuoteLibraryStatusLabels,
  statusFilter: ClientInvoiceLibraryStatusFilter = "all",
): PublicClientInvoice[] {
  return sortClientInvoicesForLibrary(invoices).filter((invoice) => {
    if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
    return clientInvoiceMatchesLibraryQuery(invoice, query, statusLabels);
  });
}

export type CreatedClientInvoicePayload = {
  ok?: boolean;
  invoice?: { id?: string };
  error?: { code?: string; message?: string };
};

export function clientInvoiceIdFromPayload(
  payload: CreatedClientInvoicePayload,
): string | null {
  const id = payload.invoice?.id?.trim() ?? "";
  return isClientQuoteRouteId(id) ? id : null;
}

export async function submitCreateClientInvoice(input: {
  quoteId: string;
  fetcher?: typeof fetch;
}): Promise<
  | { ok: true; invoiceId: string }
  | { ok: false; code?: string; network?: boolean }
> {
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(
      `/api/licensee/client-quotes/${input.quoteId}/invoices`,
      { method: "POST", cache: "no-store" },
    );
    const payload = (await response.json()) as CreatedClientInvoicePayload;
    const invoiceId = clientInvoiceIdFromPayload(payload);
    if (!response.ok || !payload.ok || !invoiceId) {
      return { ok: false, code: payload.error?.code };
    }
    return { ok: true, invoiceId };
  } catch {
    return { ok: false, network: true };
  }
}
