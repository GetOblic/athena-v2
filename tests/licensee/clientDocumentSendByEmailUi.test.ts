/**
 * CQ-MAIL-1B — Send by Email on issued quotation and invoice surfaces.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientInvoiceEditorView } from "../../components/licensee/clientInvoices/ClientInvoiceEditorView";
import { ClientInvoiceLibraryView } from "../../components/licensee/clientInvoices/ClientInvoiceLibraryView";
import {
  CLIENT_DOCUMENT_SEND_EMAIL_CARD_CLASS,
  CLIENT_DOCUMENT_SEND_EMAIL_DETAIL_CLASS,
} from "../../components/licensee/clientDocuments/ClientDocumentSendByEmailLink";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { ClientQuoteLibraryView } from "../../components/licensee/clientQuotes/ClientQuoteLibraryView";
import { editorDraftFromInvoice } from "../../lib/licensee/clientInvoiceEditorModel";
import { editorDraftFromQuote } from "../../lib/licensee/clientQuoteEditorModel";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
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
const DRAFT_QUOTE = "22222222-2222-4222-8222-222222222222";
const ISSUED_QUOTE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const INVOICED_QUOTE = "55555555-5555-4555-8555-555555555555";
const INVOICE = "11111111-1111-4111-8111-111111111111";
const DRAFT_INVOICE = "44444444-4444-4444-8444-444444444444";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function gmailHrefs(html: string): string[] {
  return Array.from(
    html.matchAll(/href="(https:\/\/mail\.google\.com\/mail\/\?[^"]+)"/g),
    (match) => match[1].replace(/&amp;/g, "&"),
  );
}

function quotationDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "client_quote_draft_v1",
    issuer: {
      legalName: "ZZZ Legal Name Sentinel",
      tradingName: "Alpha Studio",
      postalAddress: {
        line1: "1 Harbour Road",
        line2: null,
        city: "Valletta",
        region: null,
        postalCode: "VLT 1000",
        country: "Malta",
      },
      phone: "+35620000000",
      email: "issuer-secret@hidden.example",
      website: "https://alpha.example",
      registrationNumber: "C-100",
      taxIdentifier: "VAT-SENTINEL",
      taxIdentifierLabel: "VAT",
      contactName: "Alex Issuer",
      jobTitle: "Director",
      additionalNote: "PRIVATE-NOTE-SENTINEL",
    },
    customer: {
      name: "Northwind Customer Sentinel",
      contactName: "Ada North",
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
      email: "buyer@example.com",
      taxIdentifier: "TAX-SENTINEL-99",
    },
    projectTitle: "Portal rebuild",
    scopeSummary: "SCOPE-SENTINEL-SHOULD-NOT-LEAK",
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
    paymentTerms: { summary: "PAY-SENTINEL", scheduleNote: null },
    validity: { validForDays: 30, validUntil: "2026-12-31", note: null },
    appendix: { enabled: false, sections: [] },
    discount: { kind: "none" },
    tax: { kind: "none" },
    totals: {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 42424242,
    },
    ...overrides,
  };
}

function issueQuote(options: {
  id?: string;
  contentLanguage?: OrganizationLanguage;
  email?: string | null;
  customerName?: string;
  projectTitle?: string;
}): AthenaClientQuote {
  const base = quotationDraft();
  const quote = createDraftClientQuote({
    id: options.id ?? ISSUED_QUOTE,
    licenseeAccountId: LICENSEE,
    organizationId: ORG,
    requestedBy: USER,
    contentLanguage: options.contentLanguage ?? "en",
    currencyCode: "EUR",
    draft: quotationDraft({
      customer: {
        ...(base.customer as object),
        name: options.customerName ?? "Northwind Customer Sentinel",
        email: options.email === undefined ? "buyer@example.com" : options.email,
      },
      projectTitle: options.projectTitle ?? "Portal rebuild",
    }),
    sourceEstimateId: ESTIMATE,
    sourceEstimateSnapshot: {
      schemaVersion: "client_quote_source_estimate_v1",
      estimateId: ESTIMATE,
      organizationId: ORG,
      organizationNameSnapshot: "Northwind",
      estimateSchemaVersion: "estimate_v1",
      currencyCode: "EUR",
      recommendedClientPriceMinor: 5000,
    },
    revisedFromQuoteId: null,
    createdAt: "2026-10-10T08:00:00.000Z",
  });
  return issueClientQuote(quote, {
    quoteNumber: "Q-2026-0001",
    issuedAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
    brand: { primaryColor: "#A1B2C3" },
  });
}

function draftQuote() {
  return toPublicClientQuote(
    createDraftClientQuote({
      id: DRAFT_QUOTE,
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: USER,
      contentLanguage: "en",
      currencyCode: "EUR",
      draft: quotationDraft({
        customer: {
          ...(quotationDraft().customer as object),
          name: "Harbor Studio",
        },
        projectTitle: "Harbor site",
      }),
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: "2026-10-09T08:00:00.000Z",
    }),
  );
}

function issuedInvoice(quote: AthenaClientQuote, invoiceId = INVOICE) {
  const created = createClientInvoiceFromIssuedQuote(quote.issued_snapshot_json, {
    id: invoiceId,
    createdAt: "2026-10-10T13:00:00.000Z",
  });
  const ready = updateClientInvoiceDraft(
    created,
    {
      ...created.draft,
      paymentDueDate: "2026-10-20",
      paymentInstructions: "IBAN-SENTINEL",
    },
    { updatedAt: "2026-10-10T13:30:00.000Z" },
  );
  return toPublicClientInvoice(
    issueClientInvoice(ready, {
      invoiceNumber: "I-2026-0001",
      issuedAt: "2026-10-10T14:00:00.000Z",
      updatedAt: "2026-10-10T14:00:00.000Z",
      issueDate: "2026-10-10",
      brand: { primaryColor: "#A1B2C3" },
    }),
  );
}

function quoteEditorProps(
  quote: ReturnType<typeof toPublicClientQuote>,
  overrides: Record<string, unknown> = {},
) {
  const editor = editorDraftFromQuote(quote);
  return {
    mode: quote.status,
    quoteNumber: quote.quoteNumber,
    issuedAtLabel: "Oct 10, 2026",
    currencyCode: quote.currencyCode,
    editor,
    lineTotalsMinor: null,
    totals: quote.issuedSnapshot?.totals ?? quote.draft.totals,
    locale: "en-US",
    messages,
    pending: null,
    notice: null,
    error: null,
    missingRequirements: [],
    revisedFromQuoteId: null,
    downloadQuoteId: quote.status === "issued" ? quote.id : null,
    issuedSnapshot: quote.status === "issued" ? quote.issuedSnapshot : null,
    onChange: () => undefined,
    onSave: () => undefined,
    onIssue: () => undefined,
    onRevise: () => undefined,
    ...overrides,
  };
}

describe("Send by Email placement", () => {
  it("shows the action on issued and invoiced quote cards, not drafts", () => {
    const draft = draftQuote();
    const issued = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE }));
    const invoiced = toPublicClientQuote(
      issueQuote({
        id: INVOICED_QUOTE,
        customerName: "Fabrikam Atelier",
        projectTitle: "Catalog migration",
      }),
    );
    const html = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [draft, issued, invoiced],
        error: null,
        locale: "en-US",
        messages,
        invoiceLinks: [
          {
            sourceQuoteId: INVOICED_QUOTE,
            invoiceId: INVOICE,
            status: "issued",
          },
        ],
        onRetry: () => undefined,
      }),
    );
    assert.equal(html.match(/data-client-document-send-email="quote"/g)?.length, 2);
    assert.equal(html.match(/data-client-document-send-layout="card"/g)?.length, 2);
    assert.match(html, new RegExp(`data-create-client-invoice="${ISSUED_QUOTE}"`));
    assert.match(html, new RegExp(`data-view-client-invoice="${INVOICED_QUOTE}"`));
    assert.match(html, new RegExp(`data-client-quote-open="${DRAFT_QUOTE}"`));
    assert.match(html, new RegExp(`data-client-quote-open="${ISSUED_QUOTE}"`));
    assert.match(html, new RegExp(`data-client-quote-delete="${DRAFT_QUOTE}"`));
    assert.match(html, /Send by Email/);
    assert.match(html, /Attach the PDF manually/);
    assert.match(html, /verify the Gmail From account before sending/);
    assert.doesNotMatch(html, /email was sent|message was sent/i);
    const hrefs = gmailHrefs(html);
    assert.equal(hrefs.length, 2);
    for (const href of hrefs) {
      const url = new URL(href);
      assert.equal(url.searchParams.get("view"), "cm");
      assert.equal(url.searchParams.has("authuser"), false);
      assert.equal(href.includes("/u/"), false);
      assert.equal(url.searchParams.get("body")?.includes("SCOPE-SENTINEL"), false);
      assert.equal(url.searchParams.get("body")?.includes("issuer-secret@hidden.example"), false);
      assert.equal(url.searchParams.get("body")?.includes("42424242"), false);
    }
    assert.match(html, new RegExp(CLIENT_DOCUMENT_SEND_EMAIL_CARD_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const draftsOnly = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [draft],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.doesNotMatch(draftsOnly, /data-client-document-send-email|mail\.google\.com/);
    assert.match(draftsOnly, /data-client-quote-open=/);
  });

  it("shows the action on issued quote detail and keeps the existing actions", () => {
    const quote = toPublicClientQuote(issueQuote({}));
    const before = JSON.stringify(quote.issuedSnapshot);
    const editor = editorDraftFromQuote(quote);
    editor.customer.email = "mutated-editor@example.com";
    const html = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        ...quoteEditorProps(quote),
        editor,
        messages,
      }),
    );
    assert.equal(JSON.stringify(quote.issuedSnapshot), before);
    assert.match(html, /data-client-document-send-email="quote"/);
    assert.match(html, /data-client-document-send-layout="detail"/);
    assert.match(html, /data-create-client-invoice="detail"/);
    assert.match(html, /data-client-quote-download-pdf="true"/);
    assert.match(html, /data-client-quote-revise="true"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /<svg/);
    const href = gmailHrefs(html)[0];
    const url = new URL(href);
    assert.equal(url.searchParams.get("to"), "buyer@example.com");
    assert.equal(url.searchParams.get("body")?.includes("mutated-editor@example.com"), false);
    assert.match(url.searchParams.get("su") ?? "", /^Quotation Q-2026-0001/);
    assert.match(html, new RegExp(CLIENT_DOCUMENT_SEND_EMAIL_DETAIL_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const draftHtml = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        ...quoteEditorProps(draftQuote(), {
          mode: "draft",
          issuedSnapshot: quote.issuedSnapshot,
          downloadQuoteId: quote.id,
        }),
      }),
    );
    assert.doesNotMatch(draftHtml, /data-client-document-send-email|mail\.google\.com/);
    assert.match(draftHtml, /data-client-quote-save="true"/);
  });

  it("shows the action on issued invoice cards and detail only", () => {
    const quote = issueQuote({});
    const issued = issuedInvoice(quote);
    const draft = toPublicClientInvoice(
      createClientInvoiceFromIssuedQuote(quote.issued_snapshot_json, {
        id: DRAFT_INVOICE,
        createdAt: "2026-10-10T13:00:00.000Z",
      }),
    );
    const library = renderToStaticMarkup(
      createElement(ClientInvoiceLibraryView, {
        phase: "ready",
        invoices: [draft, issued],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.equal(library.match(/data-client-document-send-email="invoice"/g)?.length, 1);
    assert.match(library, /data-client-invoice-download-pdf="true"/);
    assert.match(library, new RegExp(`data-client-invoice-open="${INVOICE}"`));
    assert.match(library, new RegExp(`data-client-invoice-open="${DRAFT_INVOICE}"`));
    assert.match(library, /data-client-invoice-status="draft"/);
    const invoiceHref = new URL(gmailHrefs(library)[0]);
    assert.match(invoiceHref.searchParams.get("su") ?? "", /^Invoice I-2026-0001/);
    assert.equal(invoiceHref.searchParams.get("body")?.includes("IBAN-SENTINEL"), false);
    assert.equal(invoiceHref.searchParams.get("body")?.includes(ESTIMATE), false);

    const detail = renderToStaticMarkup(
      createElement(ClientInvoiceEditorView, {
        mode: "issued",
        invoiceId: issued.id,
        invoiceNumber: issued.invoiceNumber,
        issueDateLabel: "Oct 10, 2026",
        currencyCode: issued.currencyCode,
        contentLanguageLabel: "English",
        sourceQuoteId: issued.sourceQuoteId,
        sourceQuoteNumber: issued.draft.sourceQuote.quoteNumber,
        editor: editorDraftFromInvoice(issued),
        lineTotalsMinor: null,
        totals: issued.issuedSnapshot?.totals ?? null,
        locale: "en-US",
        messages,
        pending: null,
        notice: null,
        error: null,
        missingRequirements: [],
        issuedSnapshot: issued.issuedSnapshot,
        confirmIssueOpen: false,
        onChange: () => undefined,
        onSave: () => undefined,
        onRequestIssue: () => undefined,
        onCancelIssue: () => undefined,
        onConfirmIssue: () => undefined,
      }),
    );
    assert.match(detail, /data-client-document-send-email="invoice"/);
    assert.match(detail, /data-client-invoice-download-pdf="true"/);
    assert.doesNotMatch(detail, /data-client-invoice-save="true"|data-client-invoice-issue="true"/);
    assert.match(detail, /target="_blank"/);
    assert.match(detail, /rel="noopener noreferrer"/);
    const detailUrl = new URL(gmailHrefs(detail)[0]);
    assert.equal(detailUrl.searchParams.get("body")?.includes("IBAN-SENTINEL"), false);
    assert.match(detailUrl.searchParams.get("body") ?? "", /invoice-i-2026-0001-2026-10-10\.pdf/);

    const draftDetail = renderToStaticMarkup(
      createElement(ClientInvoiceEditorView, {
        mode: "draft",
        invoiceId: draft.id,
        invoiceNumber: null,
        issueDateLabel: null,
        currencyCode: draft.currencyCode,
        contentLanguageLabel: "English",
        sourceQuoteId: draft.sourceQuoteId,
        sourceQuoteNumber: draft.draft.sourceQuote.quoteNumber,
        editor: editorDraftFromInvoice(draft),
        lineTotalsMinor: null,
        totals: draft.draft.totals,
        locale: "en-US",
        messages,
        pending: null,
        notice: null,
        error: null,
        missingRequirements: [],
        issuedSnapshot: issued.issuedSnapshot,
        confirmIssueOpen: false,
        onChange: () => undefined,
        onSave: () => undefined,
        onRequestIssue: () => undefined,
        onCancelIssue: () => undefined,
        onConfirmIssue: () => undefined,
      }),
    );
    assert.doesNotMatch(draftDetail, /data-client-document-send-email|mail\.google\.com/);
    assert.match(draftDetail, /data-client-invoice-save="true"/);
  });

  it("warns when the frozen recipient is missing and keeps UI language separate", () => {
    const quote = toPublicClientQuote(
      issueQuote({ email: null, contentLanguage: "en" }),
    );
    const french = getLicenseeLocalization("fr").messages;
    const html = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [quote],
        error: null,
        locale: "fr-FR",
        messages: french,
        onRetry: () => undefined,
      }),
    );
    assert.match(html, /Envoyer par e-mail/);
    assert.match(html, /Joignez le PDF manuellement/);
    assert.match(html, /compte expéditeur Gmail/);
    assert.match(html, /data-client-document-send-recipient="omitted"/);
    assert.match(html, /data-client-document-send-recipient-warning="true"/);
    assert.match(html, /data-client-document-send-reminder="true"/);
    const url = new URL(gmailHrefs(html)[0]);
    assert.equal(url.searchParams.has("to"), false);
    assert.match(url.searchParams.get("body") ?? "", /Hello Ada North,/);
    assert.match(url.searchParams.get("su") ?? "", /^Quotation /);
    assert.equal((url.searchParams.get("body") ?? "").includes("Bonjour"), false);
    assert.doesNotMatch(html, /e-mail a été envoyé|email was sent/i);

    for (const language of ORGANIZATION_LANGUAGES) {
      const catalog = { en, fr, es, it: itMessages, de, pt }[language].licensee.clientDocuments;
      assert.ok(catalog.sendByEmail.trim().length > 0);
      assert.match(catalog.sendReminder, /PDF|Gmail/);
      assert.match(catalog.missingRecipient, /Gmail/);
      if (language !== "en") {
        assert.notEqual(catalog.sendByEmail, en.licensee.clientDocuments.sendByEmail);
        assert.notEqual(catalog.sendReminder, en.licensee.clientDocuments.sendReminder);
        assert.notEqual(catalog.missingRecipient, en.licensee.clientDocuments.missingRecipient);
      }
    }
  });

  it("wires detail pages to the frozen snapshot and does not fetch a message", () => {
    const quoteEditor = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    );
    const invoiceEditor = read(
      "components/licensee/clientInvoices/LicenseeClientInvoiceEditor.tsx",
    );
    assert.match(quoteEditor, /issuedSnapshot=\{frozen\}/);
    assert.match(invoiceEditor, /issuedSnapshot=\{frozen\}/);
    const sources = [
      "lib/licensee/clientDocumentGmailHandoff.ts",
      "lib/licensee/clientDocumentEmailCopy.ts",
      "components/licensee/clientDocuments/ClientDocumentSendByEmailLink.tsx",
      "components/licensee/clientQuotes/ClientQuoteEditorView.tsx",
      "components/licensee/clientQuotes/ClientQuoteLibraryView.tsx",
      "components/licensee/clientInvoices/ClientInvoiceEditorView.tsx",
      "components/licensee/clientInvoices/ClientInvoiceLibraryView.tsx",
    ].map(read);
    const joined = sources.join("\n");
    assert.match(joined, /from "lucide-react"/);
    assert.doesNotMatch(joined, /\bfetch\s*\(/);
    assert.doesNotMatch(joined, /authuser|\/u\/0/);
  });
});
