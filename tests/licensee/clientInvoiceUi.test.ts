/**
 * CQ-INV-1F — Licensee invoice library, editor, and quotation entry points.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { ClientQuoteLibraryView } from "../../components/licensee/clientQuotes/ClientQuoteLibraryView";
import { ClientInvoiceEditorView } from "../../components/licensee/clientInvoices/ClientInvoiceEditorView";
import { ClientInvoiceLibraryView } from "../../components/licensee/clientInvoices/ClientInvoiceLibraryView";
import {
  clientInvoiceDetailPath,
  clientInvoiceIssueBlockers,
  clientInvoiceLibraryRow,
  editorDraftFromInvoice,
  editorDraftToInvoiceUpdateBody,
  filterClientInvoicesForLibrary,
  previewClientInvoiceMoney,
  shouldShowCreateInvoiceAction,
  submitCreateClientInvoice,
  canDownloadClientInvoicePdf,
} from "../../lib/licensee/clientInvoiceEditorModel";
import {
  CLIENT_INVOICE_STABLE_ERROR_CODES,
  clientInvoiceErrorMessage,
} from "../../lib/licensee/clientInvoiceEditorMessages";
import {
  clientQuoteInvoiceRelationshipForQuote,
  clientQuoteLibraryPresentationStatus,
  clientQuoteLibraryRow,
  filterClientQuotesForLibrary,
  parseClientQuoteInvoiceLinks,
} from "../../lib/licensee/clientQuoteEditorModel";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import { LICENSEE_SUCCESS_CTA_CLASS } from "../../lib/licensee/licenseeDashboardPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  createClientInvoiceFromIssuedQuote,
  issueClientInvoice,
  updateClientInvoiceDraft,
} from "../../services/clientInvoice/clientInvoiceDomain";
import { toPublicClientInvoice } from "../../services/clientInvoice/clientInvoicePublic";
import {
  createDraftClientQuote,
  issueClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import { calculateClientQuote } from "../../services/clientQuote/clientQuoteMoney";
import type { AthenaClientQuote } from "../../services/clientQuote/clientQuoteTypes";
import { toPublicClientQuote } from "../../services/clientQuote/clientQuotePublic";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();
const messages = getLicenseeLocalization("en").messages;
const LICENSEE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ESTIMATE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const INVOICE = "11111111-1111-4111-8111-111111111111";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(...collectKeyPaths((value as Record<string, unknown>)[key], next));
  }
  return paths;
}

function quotationDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "client_quote_draft_v1",
    issuer: {
      legalName: "Alpha Studio Ltd",
      tradingName: "Alpha",
      postalAddress: {
        line1: "1 Harbour Road",
        line2: null,
        city: "Valletta",
        region: null,
        postalCode: "VLT 1000",
        country: "Malta",
      },
      phone: "+35620000000",
      email: "billing@alpha.example",
      website: "https://alpha.example",
      registrationNumber: "C-100",
      taxIdentifier: "MT123",
      taxIdentifierLabel: "VAT",
      contactName: "Alex Issuer",
      jobTitle: "Director",
      additionalNote: null,
    },
    customer: {
      name: "Northwind",
      contactName: null,
      jobTitle: null,
      postalAddress: {
        line1: "9 Dock Street",
        line2: null,
        city: "Oslo",
        region: null,
        postalCode: "0150",
        country: "Norway",
      },
      phone: null,
      email: "ap@northwind.example",
      taxIdentifier: null,
    },
    projectTitle: "Portal rebuild",
    scopeSummary: "Rebuild the client portal.",
    lineItems: [
      {
        id: "line-1",
        description: "Portal rebuild",
        quantity: { coefficient: 2, scale: 0 },
        unitPriceMinor: 1500,
        lineTotalMinor: 1,
        billingFrequency: "one_time",
      },
    ],
    paymentTerms: { summary: "Net 30 from invoice issue.", scheduleNote: null },
    validity: { validForDays: 30, validUntil: "2026-12-31", note: "Offer expires." },
    appendix: { enabled: false, sections: [] },
    discount: { kind: "none" },
    tax: { kind: "none" },
    totals: {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    },
    ...overrides,
  };
}

function issueQuotation(
  options: {
    quoteId?: string;
    customerName?: string;
    projectTitle?: string;
    quoteNumber?: string;
    lineItems?: unknown[];
  } = {},
): AthenaClientQuote {
  const draft = quotationDraft({
    customer: {
      ...quotationDraft().customer,
      name: options.customerName ?? "Northwind",
    },
    projectTitle: options.projectTitle ?? "Portal rebuild",
    ...(options.lineItems ? { lineItems: options.lineItems } : {}),
  });
  const quote = createDraftClientQuote({
    id: options.quoteId ?? QUOTE,
    licenseeAccountId: LICENSEE,
    organizationId: ORG,
    requestedBy: USER,
    contentLanguage: "en",
    currencyCode: "EUR",
    draft,
    sourceEstimateId: ESTIMATE,
    sourceEstimateSnapshot: {
      schemaVersion: "client_quote_source_estimate_v1",
      estimateId: ESTIMATE,
      organizationId: ORG,
      organizationNameSnapshot: "Northwind",
      estimateSchemaVersion: "estimate_v1",
      currencyCode: "USD",
      recommendedClientPriceMinor: 5000,
    },
    revisedFromQuoteId: null,
    createdAt: "2026-01-15T08:00:00.000Z",
  });
  return issueClientQuote(quote, {
    quoteNumber: options.quoteNumber ?? "Q-2026-0007",
    issuedAt: "2026-01-15T08:30:00.000Z",
    updatedAt: "2026-01-15T08:30:00.000Z",
    brand: { primaryColor: "#A1B2C3" },
  });
}

function publicInvoiceFromQuote(quote: AthenaClientQuote, invoiceId = INVOICE) {
  const snapshot = quote.issued_snapshot_json;
  if (!snapshot) throw new Error("expected issued quotation");
  return toPublicClientInvoice(
    createClientInvoiceFromIssuedQuote(snapshot, {
      id: invoiceId,
      createdAt: "2026-10-10T09:00:00.000Z",
    }),
  );
}

function editorProps(
  invoice: ReturnType<typeof publicInvoiceFromQuote>,
  editor: ReturnType<typeof editorDraftFromInvoice>,
  overrides: Record<string, unknown> = {},
) {
  const preview = previewClientInvoiceMoney(editor, invoice.currencyCode);
  return {
    mode: invoice.status,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issueDateLabel: invoice.issueDate,
    currencyCode: invoice.currencyCode,
    contentLanguageLabel: "English",
    sourceQuoteId: invoice.sourceQuoteId,
    sourceQuoteNumber: invoice.draft.sourceQuote.quoteNumber,
    editor,
    lineTotalsMinor: preview.ok ? preview.preview.lineTotalsMinor : null,
    totals: preview.ok ? preview.preview.totals : null,
    frequencyTotals: preview.ok ? preview.preview.frequencyTotals : null,
    locale: "en-US",
    messages,
    pending: null,
    notice: null,
    error: null,
    missingRequirements: [],
    confirmIssueOpen: false,
    onChange: () => undefined,
    onSave: () => undefined,
    onRequestIssue: () => undefined,
    onCancelIssue: () => undefined,
    onConfirmIssue: () => undefined,
    ...overrides,
  };
}

describe("quote library status filter and create invoice", () => {
  const labels = {
    draft: messages.clientQuotes.statusDraft,
    issued: messages.clientQuotes.statusIssued,
  };

  function quotes() {
    const draft = createDraftClientQuote({
      id: "22222222-2222-4222-8222-222222222222",
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: USER,
      contentLanguage: "en",
      currencyCode: "EUR",
      draft: quotationDraft({
        customer: { ...quotationDraft().customer, name: "Harbor Studio" },
        projectTitle: "Harbor site",
      }),
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: "2026-01-01T12:00:00.000Z",
    });
    const issued = issueQuotation({
      customerName: "Fabrikam Atelier",
      projectTitle: "Catalog migration",
      quoteNumber: "Q-2026-0007",
    });
    return {
      draft: toPublicClientQuote(draft),
      issued: toPublicClientQuote(issued),
    };
  }

  it("defaults to all and composes status with search without changing sort", () => {
    const { draft, issued } = quotes();
    const ordered = filterClientQuotesForLibrary([draft, issued], "   ", labels);
    assert.deepEqual(
      ordered.map((quote) => quote.id),
      [issued.id, draft.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([draft, issued], "harbor", labels, "issued").map(
        (quote) => quote.id,
      ),
      [],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([draft, issued], "fabrikam", labels, "issued").map(
        (quote) => quote.id,
      ),
      [issued.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([draft, issued], "", labels, "draft").map(
        (quote) => quote.id,
      ),
      [draft.id],
    );

    const html = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [draft, issued],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(html, /data-client-quote-status-filter="all"/);
    assert.match(html, /data-create-client-invoice="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"/);
    assert.doesNotMatch(
      html,
      /data-create-client-invoice="22222222-2222-4222-8222-222222222222"/,
    );
    assert.match(html, /data-client-quote-open=/);
    assert.match(html, /bg-\[var\(--athena-success\)\]/);
    assert.match(html, /shadow-\[0_10px_24px_rgba\(0,208,132,0\.20\)\]/);
    assert.equal(shouldShowCreateInvoiceAction("issued"), true);
    assert.equal(shouldShowCreateInvoiceAction("draft"), false);

    const filtered = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [draft, issued],
        error: null,
        locale: "en-US",
        messages,
        searchQuery: "fabrikam",
        statusFilter: "issued",
        onRetry: () => undefined,
      }),
    );
    assert.match(filtered, /Fabrikam Atelier/);
    assert.doesNotMatch(filtered, /Harbor Studio/);
    assert.match(filtered, /data-client-quote-status-filter="issued"/);

    const statusEmpty = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [draft, issued],
        error: null,
        locale: "en-US",
        messages,
        statusFilter: "draft",
        searchQuery: "fabrikam",
        onRetry: () => undefined,
      }),
    );
    assert.match(statusEmpty, /data-client-quote-search-empty="true"/);
    assert.doesNotMatch(statusEmpty, /data-create-client-invoice=/);
  });

  it("places the green create-invoice action on issued quotation detail only", () => {
    const issuedHtml = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        mode: "issued",
        quoteNumber: "Q-2026-0007",
        issuedAtLabel: "Jan 15, 2026",
        currencyCode: "EUR",
        editor: editorDraftFromInvoice(publicInvoiceFromQuote(issueQuotation())).commercial,
        lineTotalsMinor: null,
        totals: null,
        locale: "en-US",
        messages,
        pending: null,
        notice: null,
        error: null,
        missingRequirements: [],
        revisedFromQuoteId: null,
        downloadQuoteId: QUOTE,
        createInvoicePending: true,
        onChange: () => undefined,
        onSave: () => undefined,
        onIssue: () => undefined,
        onRevise: () => undefined,
      }),
    );
    assert.match(issuedHtml, /data-create-client-invoice="detail"/);
    assert.match(issuedHtml, /data-create-client-invoice-pending="true"/);
    assert.match(issuedHtml, /Creating invoice/);
    assert.match(issuedHtml, /data-client-quote-download-pdf="true"/);
    assert.match(issuedHtml, /data-client-quote-revise="true"/);
    assert.match(issuedHtml, /bg-\[var\(--athena-success\)\]/);

    const draftQuote = createDraftClientQuote({
      id: QUOTE,
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: USER,
      contentLanguage: "en",
      currencyCode: "EUR",
      draft: quotationDraft(),
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: "2026-10-01T12:00:00.000Z",
    });
    const draftEditor = editorDraftFromInvoice(
      publicInvoiceFromQuote(issueQuotation()),
    ).commercial;
    const draftHtml = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        mode: "draft",
        quoteNumber: null,
        issuedAtLabel: null,
        currencyCode: "EUR",
        editor: draftEditor,
        lineTotalsMinor: [3000],
        totals: {
          subtotalMinor: 3000,
          discountMinor: 0,
          taxableMinor: 3000,
          taxMinor: 0,
          totalMinor: 3000,
        },
        locale: "en-US",
        messages,
        pending: null,
        notice: null,
        error: null,
        missingRequirements: [],
        revisedFromQuoteId: null,
        onChange: () => undefined,
        onSave: () => undefined,
        onIssue: () => undefined,
        onRevise: () => undefined,
      }),
    );
    assert.doesNotMatch(draftHtml, /data-create-client-invoice=/);
    assert.equal(draftQuote.status, "draft");
    const quoteUi = [
      "components/licensee/clientQuotes/ClientQuoteLibraryView.tsx",
      "components/licensee/clientQuotes/ClientQuoteEditorView.tsx",
      "components/licensee/clientQuotes/LicenseeClientQuoteLibrary.tsx",
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    ]
      .map(read)
      .join("\n");
    assert.doesNotMatch(quoteUi, /components\/prospects/);
    assert.match(quoteUi, /submitCreateClientInvoice/);
    assert.match(quoteUi, /clientInvoiceDetailPath/);
    assert.match(
      read("lib/licensee/clientInvoiceEditorModel.ts"),
      /\/api\/licensee\/client-quotes\/\$\{input\.quoteId\}\/invoices/,
    );
    assert.match(LICENSEE_SUCCESS_CTA_CLASS, /bg-\[var\(--athena-success\)\]/);
    assert.match(LICENSEE_SUCCESS_CTA_CLASS, /text-white/);
  });

  it("reopens the existing invoice id returned by create", async () => {
    const invoiceId = INVOICE;
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return {
        ok: true,
        status: calls === 1 ? 201 : 200,
        json: async () => ({ ok: true, invoice: { id: invoiceId } }),
      };
    };
    const created = await submitCreateClientInvoice({
      quoteId: QUOTE,
      fetcher: fetcher as unknown as typeof fetch,
    });
    const replayed = await submitCreateClientInvoice({
      quoteId: QUOTE,
      fetcher: fetcher as unknown as typeof fetch,
    });
    assert.equal(created.ok && created.invoiceId, invoiceId);
    assert.equal(replayed.ok && replayed.invoiceId, invoiceId);
    assert.equal(clientInvoiceDetailPath(invoiceId), `/licensee/invoices/${invoiceId}`);

    const denied = await submitCreateClientInvoice({
      quoteId: QUOTE,
      fetcher: (async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          error: {
            code: "SOURCE_QUOTE_NOT_ISSUED",
            message: "Only an issued quotation can be invoiced.",
          },
        }),
      })) as unknown as typeof fetch,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(
        clientInvoiceErrorMessage(messages, denied.code),
        messages.clientInvoices.errors.sourceQuoteNotIssued,
      );
      assert.notEqual(
        clientInvoiceErrorMessage(messages, denied.code),
        "Only an issued quotation can be invoiced.",
      );
    }
    const offline = await submitCreateClientInvoice({
      quoteId: QUOTE,
      fetcher: (async () => {
        throw new Error("network");
      }) as unknown as typeof fetch,
    });
    assert.deepEqual(offline, { ok: false, network: true });
  });
});

describe("invoice editor and library", () => {
  it("edits a draft, shows server-calculated totals, and omits authority fields", () => {
    const quote = issueQuotation();
    const invoice = publicInvoiceFromQuote(quote);
    const editor = editorDraftFromInvoice(invoice);
    assert.equal(editor.paymentDueDate, "");
    assert.notEqual(editor.paymentDueDate, "2026-12-31");
    editor.paymentDueDate = "2026-11-15";
    editor.paymentInstructions = "Wire to IBAN MT00";
    editor.commercial.lines[0].unitPriceText = "40.00";

    const preview = previewClientInvoiceMoney(editor, invoice.currencyCode);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const calculated = calculateClientQuote({
      currencyCode: "EUR",
      lineItems: [
        {
          id: "line-1",
          description: "Portal rebuild",
          quantity: { coefficient: 2, scale: 0 },
          unitPriceMinor: 4000,
          billingFrequency: "one_time",
        },
      ],
      discount: { kind: "none" },
      tax: { kind: "none" },
    });
    assert.equal(preview.preview.totals.totalMinor, calculated.totals.totalMinor);
    assert.equal(preview.preview.totals.totalMinor, 8000);

    const built = editorDraftToInvoiceUpdateBody(
      editor,
      invoice.currencyCode,
      invoice.draft.sourceQuote,
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const serialized = JSON.stringify(built.body);
    assert.doesNotMatch(serialized, /"totals"/);
    assert.doesNotMatch(serialized, /"frequencyTotals"/);
    assert.doesNotMatch(serialized, /"lineTotalMinor"/);
    assert.doesNotMatch(serialized, /"invoiceNumber"/);
    assert.doesNotMatch(serialized, /"issuedSnapshot"/);
    assert.doesNotMatch(serialized, /"validity"/);
    assert.doesNotMatch(serialized, /"contentLanguage"/);
    assert.doesNotMatch(serialized, /"currencyCode"/);
    assert.equal(built.body.draft.paymentDueDate, "2026-11-15");
    assert.equal(built.body.draft.sourceQuote.quoteId, QUOTE);

    const stored = createClientInvoiceFromIssuedQuote(quote.issued_snapshot_json, {
      id: INVOICE,
      createdAt: "2026-10-10T09:00:00.000Z",
    });
    const saved = updateClientInvoiceDraft(stored, built.body.draft, {
      updatedAt: "2026-10-10T10:00:00.000Z",
    });
    assert.equal(saved.draft.totals.totalMinor, 8000);
    assert.equal(saved.invoiceNumber, null);
    assert.equal(saved.draft.paymentDueDate, "2026-11-15");
    assert.equal(
      clientInvoiceIssueBlockers(editor, "EUR", "2026-10-10").includes(
        "paymentDueDateBeforeIssue",
      ),
      false,
    );
    editor.paymentDueDate = "2026-10-01";
    assert.equal(
      clientInvoiceIssueBlockers(editor, "EUR", "2026-10-10").includes(
        "paymentDueDateBeforeIssue",
      ),
      true,
    );

    const html = renderToStaticMarkup(
      createElement(
        ClientInvoiceEditorView,
        editorProps(invoice, editorDraftFromInvoice(invoice), {
          editor,
          totals: preview.preview.totals,
          lineTotalsMinor: preview.preview.lineTotalsMinor,
        }),
      ),
    );
    assert.match(html, /data-client-invoice-mode="draft"/);
    assert.match(html, /data-client-invoice-source-quote=/);
    assert.match(html, /data-field="issuer.legalName"/);
    assert.match(html, /data-field="customer.name"/);
    assert.match(html, /data-field="projectTitle"/);
    assert.match(html, /data-field="scopeSummary"/);
    assert.match(html, /data-field="line.line-1.quantity"/);
    assert.match(html, /data-field="line.line-1.unitPrice"/);
    assert.match(html, /data-field="line.line-1.billingFrequency"/);
    assert.match(html, /data-field="discount.kind"/);
    assert.match(html, /data-field="tax.kind"/);
    assert.match(html, /data-field="payment.summary"/);
    assert.match(html, /data-field="paymentDueDate"/);
    assert.match(html, /data-field="paymentInstructions"/);
    assert.match(html, /data-client-invoice-totals="true"/);
    assert.match(html, /80\.00 EUR/);
    assert.doesNotMatch(html, /<input[^>]*data-field="totals/);
    assert.doesNotMatch(html, /data-field="validForDays"|data-field="validUntil"/);
    assert.match(html, /data-client-invoice-currency-locked="EUR"/);
    assert.match(html, /data-client-invoice-language-locked="true"/);
    assert.match(html, /data-client-invoice-issue-date-hint="true"/);
    assert.match(html, /data-client-invoice-save="true"/);
    assert.match(html, /data-client-invoice-issue="true"/);
    assert.doesNotMatch(html, /data-client-invoice-download-pdf/);
    assert.match(html, /not the quotation validity date/);
    assert.doesNotMatch(html, /2026-12-31/);
  });

  it("confirms issue and then renders the invoice read-only", () => {
    const quote = issueQuotation();
    const stored = createClientInvoiceFromIssuedQuote(quote.issued_snapshot_json, {
      id: INVOICE,
      createdAt: "2026-10-10T09:00:00.000Z",
    });
    const ready = updateClientInvoiceDraft(
      stored,
      {
        ...stored.draft,
        paymentDueDate: "2026-10-20",
        paymentInstructions: "Wire to IBAN MT00",
      },
      { updatedAt: "2026-10-10T10:00:00.000Z" },
    );
    const issued = issueClientInvoice(ready, {
      invoiceNumber: "I-2026-0004",
      issuedAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
      brand: { primaryColor: "#A1B2C3" },
    });
    const publicIssued = toPublicClientInvoice(issued);
    assert.equal(publicIssued.status, "issued");
    assert.equal(canDownloadClientInvoicePdf("draft"), false);
    assert.equal(canDownloadClientInvoicePdf("issued"), true);

    const dialog = renderToStaticMarkup(
      createElement(
        ClientInvoiceEditorView,
        editorProps(publicInvoiceFromQuote(quote), editorDraftFromInvoice(publicInvoiceFromQuote(quote)), {
          confirmIssueOpen: true,
          pending: "issue",
        }),
      ),
    );
    assert.match(dialog, /data-client-invoice-issue-dialog="true"/);
    assert.match(dialog, /data-client-invoice-issue-confirm="true"/);
    assert.match(dialog, /Issuing…/);

    const html = renderToStaticMarkup(
      createElement(
        ClientInvoiceEditorView,
        editorProps(publicIssued, editorDraftFromInvoice(publicIssued), {
          totals: publicIssued.issuedSnapshot?.totals ?? null,
          frequencyTotals: publicIssued.issuedSnapshot?.frequencyTotals ?? null,
          lineTotalsMinor:
            publicIssued.issuedSnapshot?.lineItems.map((line) => line.lineTotalMinor) ?? null,
        }),
      ),
    );
    assert.match(html, /data-client-invoice-mode="issued"/);
    assert.match(html, /data-client-invoice-number="true"/);
    assert.match(html, /I-2026-0004/);
    assert.match(html, /data-client-invoice-issue-date="true"/);
    assert.match(html, /data-client-invoice-download-pdf="true"/);
    assert.match(html, /data-client-invoice-open-source=/);
    assert.doesNotMatch(html, /data-client-invoice-save="true"/);
    assert.doesNotMatch(html, /data-client-invoice-issue="true"/);
    assert.match(html, /Frozen totals|frozen/i);
    const button = read(
      "components/licensee/clientInvoices/ClientInvoicePdfDownloadButton.tsx",
    );
    assert.match(button, /\/api\/licensee\/invoices\/\$\{invoiceId\}\/pdf/);
    const editorSource = read(
      "components/licensee/clientInvoices/LicenseeClientInvoiceEditor.tsx",
    );
    assert.match(editorSource, /method: "PATCH"/);
    assert.match(editorSource, /\/issue/);
    assert.doesNotMatch(editorSource, /invoiceNumber:/);
  });

  it("filters the invoice library and downloads PDFs only for issued invoices", () => {
    const olderQuote = issueQuotation({
      quoteId: "33333333-3333-4333-8333-333333333333",
      customerName: "Harbor Studio",
      projectTitle: "Harbor site",
      quoteNumber: "Q-2026-0001",
    });
    const newerQuote = issueQuotation({
      customerName: "Fabrikam Atelier",
      projectTitle: "Catalog migration",
      quoteNumber: "Q-2026-0008",
      lineItems: [
        {
          id: "once",
          description: "Setup",
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 1000,
          lineTotalMinor: 1,
          billingFrequency: "one_time",
        },
        {
          id: "month",
          description: "Care",
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 2500,
          lineTotalMinor: 1,
          billingFrequency: "monthly",
        },
      ],
    });
    const draft = publicInvoiceFromQuote(
      olderQuote,
      "44444444-4444-4444-8444-444444444444",
    );
    const issuedStored = issueClientInvoice(
      updateClientInvoiceDraft(
        createClientInvoiceFromIssuedQuote(newerQuote.issued_snapshot_json, {
          id: INVOICE,
          createdAt: "2026-10-11T09:00:00.000Z",
        }),
        {
          ...createClientInvoiceFromIssuedQuote(newerQuote.issued_snapshot_json, {
            id: INVOICE,
            createdAt: "2026-10-11T09:00:00.000Z",
          }).draft,
          paymentDueDate: "2026-10-20",
        },
        { updatedAt: "2026-10-11T10:00:00.000Z" },
      ),
      {
        invoiceNumber: "I-2026-0008",
        issuedAt: "2026-10-11T12:00:00.000Z",
        updatedAt: "2026-10-11T12:00:00.000Z",
        brand: { primaryColor: "#A1B2C3" },
      },
    );
    const issued = toPublicClientInvoice(issuedStored);
    const labels = {
      draft: messages.clientInvoices.statusDraft,
      issued: messages.clientInvoices.statusIssued,
    };
    assert.deepEqual(
      filterClientInvoicesForLibrary([draft, issued], "fabrikam", labels, "draft").map(
        (item) => item.id,
      ),
      [],
    );
    assert.deepEqual(
      filterClientInvoicesForLibrary([draft, issued], "catalog", labels, "issued").map(
        (item) => item.id,
      ),
      [issued.id],
    );
    const mixed = clientInvoiceLibraryRow(issued, "en-US");
    assert.equal(mixed.totalLabel, null);
    assert.equal(mixed.frequencyAmounts.length, 2);
    assert.equal(mixed.canDownloadPdf, true);
    assert.equal(clientInvoiceLibraryRow(draft, "en-US").canDownloadPdf, false);

    const html = renderToStaticMarkup(
      createElement(ClientInvoiceLibraryView, {
        phase: "ready",
        invoices: [draft, issued],
        error: null,
        locale: "en-US",
        messages,
        searchQuery: "fabrikam",
        statusFilter: "issued",
        onRetry: () => undefined,
      }),
    );
    assert.match(html, /data-client-invoice-status-filter="issued"/);
    assert.match(html, /I-2026-0008/);
    assert.match(html, /Fabrikam Atelier/);
    assert.match(html, /data-client-invoice-frequency-totals=/);
    assert.match(html, /data-client-invoice-download-pdf="true"/);
    assert.match(html, /data-client-invoice-open=/);
    assert.doesNotMatch(html, /Harbor Studio/);

    const draftOnly = renderToStaticMarkup(
      createElement(ClientInvoiceLibraryView, {
        phase: "ready",
        invoices: [draft],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(draftOnly, /data-client-invoice-status="draft"/);
    assert.doesNotMatch(draftOnly, /data-client-invoice-download-pdf/);

    const empty = renderToStaticMarkup(
      createElement(ClientInvoiceLibraryView, {
        phase: "ready",
        invoices: [],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(empty, /data-client-invoice-empty="true"/);
    assert.doesNotMatch(empty, /data-client-invoice-search=/);
  });
});

describe("derived invoiced quotation status", () => {
  const labels = {
    draft: messages.clientQuotes.statusDraft,
    issued: messages.clientQuotes.statusIssued,
    invoiced: messages.clientQuotes.statusInvoiced,
  };
  const draftId = "22222222-2222-4222-8222-222222222222";
  const issuedId = QUOTE;
  const draftInvoiceQuoteId = "abababab-abab-4aba-8aba-abababababab";
  const invoicedId = "44444444-4444-4444-8444-444444444444";
  const draftInvoiceId = "33333333-3333-4333-8333-333333333333";
  const finalizedInvoiceId = INVOICE;

  function libraryQuotes() {
    const draft = toPublicClientQuote(
      createDraftClientQuote({
        id: draftId,
        licenseeAccountId: LICENSEE,
        organizationId: ORG,
        requestedBy: USER,
        contentLanguage: "en",
        currencyCode: "EUR",
        draft: quotationDraft({
          customer: { ...quotationDraft().customer, name: "Harbor Studio" },
          projectTitle: "Harbor site",
        }),
        sourceEstimateId: null,
        sourceEstimateSnapshot: null,
        revisedFromQuoteId: null,
        createdAt: "2026-01-01T12:00:00.000Z",
      }),
    );
    const issued = {
      ...toPublicClientQuote(
        issueQuotation({
          quoteId: issuedId,
          customerName: "Fabrikam Atelier",
          projectTitle: "Catalog migration",
          quoteNumber: "Q-2026-0007",
        }),
      ),
      createdAt: "2026-03-01T12:00:00.000Z",
    };
    const draftInvoiceQuote = {
      ...toPublicClientQuote(
        issueQuotation({
          quoteId: draftInvoiceQuoteId,
          customerName: "Contoso Works",
          projectTitle: "Workshop fit-out",
          quoteNumber: "Q-2026-0008",
        }),
      ),
      createdAt: "2026-02-01T12:00:00.000Z",
    };
    const invoiced = {
      ...toPublicClientQuote(
        issueQuotation({
          quoteId: invoicedId,
          customerName: "Initech Goods",
          projectTitle: "Ledger import",
          quoteNumber: "Q-2026-0009",
        }),
      ),
      createdAt: "2026-04-01T12:00:00.000Z",
    };
    return { draft, issued, draftInvoiceQuote, invoiced };
  }

  function links() {
    return [
      {
        sourceQuoteId: draftInvoiceQuoteId,
        invoiceId: draftInvoiceId,
        status: "draft" as const,
      },
      {
        sourceQuoteId: invoicedId,
        invoiceId: finalizedInvoiceId,
        status: "issued" as const,
      },
    ];
  }

  it("derives Draft, Issued, and Invoiced without changing the stored status", () => {
    const { draft, issued, draftInvoiceQuote, invoiced } = libraryQuotes();
    const relationships = links();
    assert.equal(draft.status, "draft");
    assert.equal(issued.status, "issued");
    assert.equal(draftInvoiceQuote.status, "issued");
    assert.equal(invoiced.status, "issued");
    assert.equal(clientQuoteLibraryPresentationStatus(draft, relationships[1]), "draft");
    assert.equal(
      clientQuoteLibraryPresentationStatus(issued, null),
      "issued",
    );
    assert.equal(
      clientQuoteLibraryPresentationStatus(
        draftInvoiceQuote,
        clientQuoteInvoiceRelationshipForQuote(draftInvoiceQuote.id, relationships),
      ),
      "issued",
    );
    assert.equal(
      clientQuoteLibraryPresentationStatus(
        invoiced,
        clientQuoteInvoiceRelationshipForQuote(invoiced.id, relationships),
      ),
      "invoiced",
    );
    assert.equal(
      clientQuoteLibraryPresentationStatus(issued, null),
      "issued",
    );
    const row = clientQuoteLibraryRow(invoiced, "en-US", relationships);
    assert.equal(row.status, "issued");
    assert.equal(row.presentationStatus, "invoiced");
    assert.equal(row.finalizedInvoiceId, finalizedInvoiceId);
    assert.equal(
      clientQuoteLibraryRow(draftInvoiceQuote, "en-US", relationships).finalizedInvoiceId,
      null,
    );
    assert.equal(
      clientQuoteLibraryRow(issued, "en-US", relationships).presentationStatus,
      "issued",
    );

    const foundation = read(
      "supabase/migrations/20261009000001_create_athena_client_quote_foundation.sql",
    );
    assert.match(foundation, /check \(status in \('draft', 'issued'\)\)/);
    assert.doesNotMatch(foundation, /invoiced/);
    const quoteRoute = read("app/api/licensee/client-quotes/route.ts");
    assert.match(quoteRoute, /listActiveInvoiceQuoteLinksForMaster/);
    assert.match(quoteRoute, /quoteIds\.has\(link\.sourceQuoteId\)/);
    assert.doesNotMatch(quoteRoute, /findActiveInvoiceBySourceQuote/);
    assert.doesNotMatch(quoteRoute, /status:\s*"invoiced"/);
  });

  it("filters All, Draft, Issued, and Invoiced together with search", () => {
    const { draft, issued, draftInvoiceQuote, invoiced } = libraryQuotes();
    const quotes = [draft, issued, draftInvoiceQuote, invoiced];
    const relationships = links();
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "   ", labels, "all", relationships).map(
        (quote) => quote.id,
      ),
      [invoicedId, issuedId, draftInvoiceQuoteId, draftId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "", labels, "draft", relationships).map(
        (quote) => quote.id,
      ),
      [draftId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "", labels, "issued", relationships).map(
        (quote) => quote.id,
      ),
      [issuedId, draftInvoiceQuoteId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "", labels, "invoiced", relationships).map(
        (quote) => quote.id,
      ),
      [invoicedId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "contoso", labels, "issued", relationships).map(
        (quote) => quote.id,
      ),
      [draftInvoiceQuoteId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "contoso", labels, "invoiced", relationships).map(
        (quote) => quote.id,
      ),
      [],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "initech", labels, "invoiced", relationships).map(
        (quote) => quote.id,
      ),
      [invoicedId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "INVOICED", labels, "all", relationships).map(
        (quote) => quote.id,
      ),
      [invoicedId],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary(quotes, "issued", labels, "all", relationships).map(
        (quote) => quote.id,
      ),
      [issuedId, draftInvoiceQuoteId],
    );

    const html = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes,
        invoiceLinks: relationships,
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(html, /data-client-quote-status-filter="all"/);
    assert.match(html, /value="invoiced"/);
    assert.match(html, /data-client-quote-status="draft"/);
    assert.match(html, /data-client-quote-status="issued"/);
    assert.match(html, /data-client-quote-status="invoiced"/);
    assert.match(
      html,
      /data-client-quote-status="invoiced"[^>]*border-emerald-400\/30 bg-emerald-500\/10 text-emerald-100/,
    );
    assert.match(html, />Invoiced</);
    assert.match(html, new RegExp(`data-view-client-invoice="${invoicedId}"`));
    assert.match(html, new RegExp(`href="/licensee/invoices/${finalizedInvoiceId}"`));
    assert.match(html, /View Invoice/);
    assert.doesNotMatch(html, new RegExp(`data-create-client-invoice="${invoicedId}"`));
    assert.match(html, new RegExp(`data-create-client-invoice="${issuedId}"`));
    assert.match(html, new RegExp(`data-create-client-invoice="${draftInvoiceQuoteId}"`));
    assert.doesNotMatch(html, new RegExp(`data-create-client-invoice="${draftId}"`));
    assert.match(html, new RegExp(`data-client-quote-open="${invoicedId}"`));
    assert.match(html, new RegExp(`data-client-quote-delete="${invoicedId}"`));
    assert.equal(clientInvoiceDetailPath(finalizedInvoiceId), `/licensee/invoices/${finalizedInvoiceId}`);

    const issuedOnly = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes,
        invoiceLinks: relationships,
        error: null,
        locale: "en-US",
        messages,
        statusFilter: "issued",
        searchQuery: "fabrikam",
        onRetry: () => undefined,
      }),
    );
    assert.match(issuedOnly, /Fabrikam Atelier/);
    assert.doesNotMatch(issuedOnly, /Initech Goods/);
    assert.doesNotMatch(issuedOnly, /data-view-client-invoice=/);
    assert.match(issuedOnly, /data-client-quote-status-filter="issued"/);

    const invoicedOnly = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes,
        invoiceLinks: relationships,
        error: null,
        locale: "en-US",
        messages,
        statusFilter: "invoiced",
        searchQuery: "ledger",
        onRetry: () => undefined,
      }),
    );
    assert.match(invoicedOnly, /Initech Goods/);
    assert.match(invoicedOnly, /data-view-client-invoice=/);
    assert.doesNotMatch(invoicedOnly, /Fabrikam Atelier/);
    assert.doesNotMatch(invoicedOnly, /Harbor Studio/);
    assert.doesNotMatch(invoicedOnly, /data-create-client-invoice=/);

    const dropped = parseClientQuoteInvoiceLinks([
      {
        sourceQuoteId: invoicedId,
        invoiceId: "not-an-invoice",
        status: "issued",
        licenseeAccountId: "foreign",
      },
      {
        sourceQuoteId: "also-bad",
        invoiceId: finalizedInvoiceId,
        status: "issued",
      },
      relationships[1],
    ]);
    assert.deepEqual(dropped, [relationships[1]]);
  });
});

describe("invoice navigation and six-locale catalogs", () => {
  it("adds an invoices card without removing the existing dashboard entries", () => {
    const dashboard = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(dashboard, /href="\/licensee\/invoices"/);
    assert.match(dashboard, /data-licensee-nav="invoices"/);
    assert.match(dashboard, /LICENSEE_INVOICES_CARD_CLASS/);
    assert.match(dashboard, /messages\.dashboard\.invoicesTitle/);
    assert.match(dashboard, /href="\/licensee\/client-quotes"/);
    assert.match(dashboard, /href="\/licensee\/estimate"/);
    assert.match(dashboard, /href="\/licensee\/quote"/);
    assert.match(dashboard, /messages\.dashboard\.myCompany/);
    const page = read("app/licensee/invoices/page.tsx");
    const detail = read("app/licensee/invoices/[id]/page.tsx");
    assert.match(page, /redirect\("\/licensee\/login"\)/);
    assert.match(detail, /redirect\("\/licensee\/login"\)/);
    assert.match(page, /getLicenseeLocalization/);
    assert.match(detail, /getLicenseeLocalization/);
    assert.doesNotMatch(`${page}\n${detail}`, /navigator\.language|Accept-Language/);
  });

  it("keeps invoice and quotation catalogs aligned in six languages", () => {
    const dictionaries: Record<OrganizationLanguage, typeof en> = {
      en,
      fr,
      es,
      it: itMessages,
      de,
      pt,
    };
    const canonical = collectKeyPaths(en.licensee.clientInvoices);
    assert.ok(canonical.includes("errors.sourceQuoteNotIssued"));
    assert.ok(canonical.includes("paymentDueDateHint"));
    assert.ok(canonical.includes("issueDateHint"));
    assert.ok(canonical.includes("draftPdfUnavailable"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const licensee = dictionaries[language].licensee;
      const paths = collectKeyPaths(licensee.clientInvoices);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing invoice keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra invoice keys`,
      );
      assert.equal(typeof licensee.dashboard.invoicesTitle, "string");
      assert.ok(licensee.dashboard.invoicesDescription.trim().length > 0);
      assert.ok(licensee.clientQuotes.createInvoice.trim().length > 0);
      assert.ok(licensee.clientQuotes.statusInvoiced.trim().length > 0);
      assert.ok(licensee.clientQuotes.viewInvoice.trim().length > 0);
      assert.ok(licensee.clientQuotes.statusAll.trim().length > 0);
      assert.ok(licensee.clientQuotes.filterEmptyTitle.trim().length > 0);
      const localized = getLicenseeLocalization(language).messages;
      for (const code of CLIENT_INVOICE_STABLE_ERROR_CODES) {
        const text = clientInvoiceErrorMessage(localized, code);
        assert.ok(text.trim().length > 0, `${language} ${code}`);
        if (code !== "CLIENT_INVOICE_FAILED") {
          assert.notEqual(text, localized.clientInvoices.errors.generic);
        }
      }
      if (language !== "en") {
        assert.notEqual(
          licensee.clientInvoices.libraryTitle,
          en.licensee.clientInvoices.libraryTitle,
        );
        assert.notEqual(
          licensee.clientInvoices.issueDateHint,
          en.licensee.clientInvoices.issueDateHint,
        );
        assert.notEqual(
          licensee.clientQuotes.createInvoice,
          en.licensee.clientQuotes.createInvoice,
        );
        assert.notEqual(
          licensee.clientQuotes.statusInvoiced,
          en.licensee.clientQuotes.statusInvoiced,
        );
        assert.notEqual(
          licensee.clientQuotes.viewInvoice,
          en.licensee.clientQuotes.viewInvoice,
        );
        assert.notEqual(
          licensee.dashboard.invoicesTitle,
          en.licensee.dashboard.invoicesTitle,
        );
      }
    }
  });
});
