/**
 * CQ-MAIL-1B — Send by Email on issued quotation and invoice surfaces.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ClientInvoiceEditorView } from "../../components/licensee/clientInvoices/ClientInvoiceEditorView";
import { ClientInvoiceLibraryView } from "../../components/licensee/clientInvoices/ClientInvoiceLibraryView";
import {
  CLIENT_DOCUMENT_SEND_EMAIL_CARD_CLASS,
  CLIENT_DOCUMENT_SEND_EMAIL_DETAIL_CLASS,
} from "../../components/licensee/clientDocuments/ClientDocumentSendByEmailLink";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { ClientQuoteLibraryView } from "../../components/licensee/clientQuotes/ClientQuoteLibraryView";
import { editorDraftFromInvoice } from "../../lib/licensee/clientInvoiceEditorModel";
import {
  GMAIL_COMPOSE_MAX_URL_LENGTH,
  buildClientDocumentGmailHandoff,
} from "../../lib/licensee/clientDocumentGmailHandoff";
import { editorDraftFromQuote } from "../../lib/licensee/clientQuoteEditorModel";
import { parseClientQuotePaymentLinkPayload } from "../../lib/licensee/clientQuotePaymentLinksModel";
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
    assert.equal(html.match(/data-client-document-send-email-button="true"/g)?.length, 2);
    assert.equal(gmailHrefs(html).length, 0);
    assert.doesNotMatch(html, /mail\.google\.com/);
    assert.doesNotMatch(html, /SCOPE-SENTINEL-SHOULD-NOT-LEAK|issuer-secret@hidden\.example/);
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
    assert.match(html, /data-client-document-send-email-pending="true"/);
    assert.doesNotMatch(html, /data-client-document-send-email-button/);
    assert.equal(gmailHrefs(html).length, 0);
    assert.match(html, /data-create-client-invoice="detail"/);
    assert.match(html, /data-client-quote-download-pdf="true"/);
    assert.match(html, /data-client-quote-revise="true"/);
    assert.match(html, /<svg/);
    assert.equal(JSON.stringify(quote.issuedSnapshot).includes("mutated-editor@example.com"), false);
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
    assert.match(library, /data-client-document-send-email-link="true"/);
    assert.doesNotMatch(library, /data-client-document-send-email-button/);
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
    assert.equal(gmailHrefs(html).length, 0);
    assert.doesNotMatch(html, /mail\.google\.com/);
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
    const quiet = [
      "lib/licensee/clientDocumentGmailHandoff.ts",
      "lib/licensee/clientDocumentEmailCopy.ts",
      "components/licensee/clientQuotes/ClientQuoteEditorView.tsx",
      "components/licensee/clientInvoices/ClientInvoiceEditorView.tsx",
      "components/licensee/clientInvoices/ClientInvoiceLibraryView.tsx",
    ].map(read);
    const emailControl = read(
      "components/licensee/clientDocuments/ClientDocumentSendByEmailLink.tsx",
    );
    const quoteLibrary = read("components/licensee/clientQuotes/ClientQuoteLibraryView.tsx");
    const joined = [...quiet, emailControl, quoteLibrary].join("\n");
    assert.match(joined, /from "lucide-react"/);
    assert.doesNotMatch(quiet.join("\n"), /\bfetch\s*\(/);
    assert.doesNotMatch(quoteLibrary, /\bfetch\s*\(|method:\s*"POST"|\/payment-links/);
    assert.match(emailControl, /method:\s*"GET"/);
    assert.match(emailControl, /\/payment-links/);
    assert.doesNotMatch(emailControl, /method:\s*"POST"|api\.stripe\.com/);
    assert.doesNotMatch(joined, /authuser|\/u\/0/);
  });
});

const FULL_URL = "https://buy.stripe.com/abcdefghij";
const DEPOSIT_URL = "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08";
const BALANCE_URL = "https://buy.stripe.com/test_abcdefghij";
const MONTHLY_URL = "https://pay.getoblic.com/b/test_14AdRb6Mt0NF4Fv1hmdIA08";
const QUARTERLY_URL = "https://buy.stripe.com/quarterly1";
const ANNUAL_URL = "https://pay.getoblic.com/b/annually01";

type EmailLink = { purpose: string; url: string | null };
type PublicQuote = ReturnType<typeof toPublicClientQuote>;

function paymentApiBody(links: EmailLink[]) {
  return {
    ok: true,
    paymentRequests: links.map((link) => {
      const recurring =
        link.purpose === "monthly" ||
        link.purpose === "quarterly" ||
        link.purpose === "annually";
      return {
        id: `req-${link.purpose}`,
        purpose: link.purpose,
        billingFrequency: recurring ? link.purpose : "one_time",
        currencyCode: "EUR",
        currencyScale: 2,
        amountMinor: 1000,
        oneTimeCollectionMode:
          link.purpose === "one_time_full"
            ? "full"
            : link.purpose.startsWith("one_time")
              ? "split"
              : null,
        depositMinor: null,
        balanceMinor: null,
        paymentLinkUrl: link.url,
      };
    }),
    eligibility: {
      expired: false,
      canCreatePaymentRequest: false,
      canInitiateStripe: false,
      blockedReason: null,
      oneTime: null,
      recurring: [],
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function detailHandoff(quote: PublicQuote, links: EmailLink[] | null) {
  const snapshot = quote.issuedSnapshot;
  assert.ok(snapshot);
  if (!links) return buildClientDocumentGmailHandoff({ kind: "quote", snapshot });
  const payload = parseClientQuotePaymentLinkPayload(paymentApiBody(links));
  assert.ok(payload, "payment-link fixture should parse");
  return buildClientDocumentGmailHandoff({
    kind: "quote",
    snapshot,
    paymentLinks: payload.paymentRequests.map((row) => ({
      purpose: row.purpose,
      url: row.paymentLinkUrl,
    })),
  });
}

function assertCompletePaymentUrls(body: string, urls: readonly string[]) {
  assert.ok(body.includes(".pdf") === false);
  for (const url of urls) {
    const token = url.slice(url.lastIndexOf("/") + 1);
    if (body.includes(token)) assert.equal(body.includes(url), true, url);
    else assert.equal(body.includes(url), false, url);
  }
}

describe("quote library click-time Gmail handoff", () => {
  let container: HTMLElement;
  let root: Root | null = null;
  let restoreFetch: (() => void) | null = null;
  let openCalls: { url: string; target: string }[] = [];
  let fetchCalls: { url: string; method: string; cache: string | undefined; accept: string | null }[] =
    [];
  let fetchImpl: (url: string) => Promise<Response> = async () => {
    throw new Error("unexpected fetch");
  };
  let popupMode: "popup" | "blocked" = "popup";
  let activePopup: {
    closed: boolean;
    opener: unknown;
    replacements: string[];
    location: { href: string; replace: (next: string) => void };
    document: Document;
  } | null = null;
  const originalFetch = globalThis.fetch;
  const leaked: string[] = [];
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  function watchConsole(...args: unknown[]) {
    const text = args.map((arg) => String(arg)).join(" ");
    if (/buy\.stripe\.com|pay\.getoblic\.com|mail\.google\.com/.test(text)) leaked.push(text);
  }

  before(() => {
    const dom = new JSDOM(
      "<!doctype html><html><body><div id='quote-library-email-root'></div></body></html>",
      { url: "http://localhost/", pretendToBeVisual: true },
    );
    const { window: domWindow } = dom;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: domWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: domWindow.document,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: domWindow.navigator,
    });
    globalThis.HTMLElement = domWindow.HTMLElement;
    globalThis.HTMLButtonElement = domWindow.HTMLButtonElement;
    globalThis.HTMLAnchorElement = domWindow.HTMLAnchorElement;
    globalThis.Node = domWindow.Node;
    globalThis.MutationObserver = domWindow.MutationObserver;
    globalThis.getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis, "self", {
      configurable: true,
      writable: true,
      value: domWindow,
    });
    container = domWindow.document.getElementById("quote-library-email-root")!;
    console.log = watchConsole;
    console.info = watchConsole;
    console.debug = watchConsole;
  });

  after(() => {
    console.log = originalLog;
    console.info = originalInfo;
    console.debug = originalDebug;
    globalThis.fetch = originalFetch;
  });

  function installBrowser() {
    openCalls = [];
    fetchCalls = [];
    activePopup = null;
    popupMode = "popup";
    window.open = ((url?: string | URL, target?: string) => {
      openCalls.push({ url: String(url), target: String(target) });
      if (popupMode === "blocked") return null;
      const popupDom = new JSDOM(
        "<!doctype html><html><head><title></title></head><body></body></html>",
        { url: "about:blank" },
      );
      const popup = {
        closed: false,
        opener: window,
        replacements: [] as string[],
        location: {
          href: "about:blank",
          replace(next: string) {
            popup.replacements.push(next);
            popup.location.href = next;
          },
        },
        document: popupDom.window.document,
      };
      activePopup = popup;
      return popup as unknown as Window;
    }) as typeof window.open;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers = new Headers(init?.headers);
      fetchCalls.push({
        url,
        method: init?.method ?? "GET",
        cache: init?.cache,
        accept: headers.get("Accept"),
      });
      return fetchImpl(url);
    }) as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };
  }

  async function renderQuotes(
    quotes: PublicQuote[],
    libraryMessages: typeof messages = messages,
  ) {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container.replaceChildren();
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(ClientQuoteLibraryView, {
          phase: "ready",
          quotes,
          error: null,
          locale: "en-US",
          messages: libraryMessages,
          onRetry: () => undefined,
        }),
      );
    });
  }

  function sendButton(quoteId: string): HTMLButtonElement {
    const button = container.querySelector(
      `[data-client-quote-send-email="${quoteId}"] [data-client-document-send-email-button]`,
    );
    assert.ok(button instanceof HTMLButtonElement);
    return button;
  }

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function assertPaymentGet(quoteId: string, index = 0) {
    const call = fetchCalls[index];
    assert.ok(call);
    assert.equal(call.url, `/api/licensee/client-quotes/${quoteId}/payment-links`);
    assert.equal(call.method, "GET");
    assert.equal(call.cache, "no-store");
    assert.equal(call.accept, "application/json");
    assert.equal(call.url.includes("api.stripe.com"), false);
  }

  it("does not fetch payment links until the issued card is clicked", async () => {
    installBrowser();
    fetchImpl = async () => jsonResponse(paymentApiBody([]));
    const draft = draftQuote();
    const issued = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE }));
    await renderQuotes([draft]);
    assert.equal(fetchCalls.length, 0);
    assert.equal(openCalls.length, 0);
    assert.equal(container.querySelector("[data-client-document-send-email]"), null);

    await renderQuotes([draft, issued]);
    assert.equal(fetchCalls.length, 0);
    assert.equal(container.querySelectorAll("[data-client-document-send-email-button]").length, 1);
    assert.equal(gmailHrefs(container.innerHTML).length, 0);
    assert.match(container.innerHTML, /Attach the PDF manually/);
    assert.match(container.innerHTML, new RegExp(`data-client-quote-open="${ISSUED_QUOTE}"`));
    assert.match(container.innerHTML, new RegExp(`data-client-quote-delete="${DRAFT_QUOTE}"`));
    assert.match(container.innerHTML, new RegExp(`data-create-client-invoice="${ISSUED_QUOTE}"`));
    restoreFetch?.();
  });

  it("opens one blank tab before the payment-link GET and matches the detail handoff", async () => {
    installBrowser();
    const quote = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE }));
    const links = [{ purpose: "one_time_full", url: FULL_URL }];
    let release: (response: Response) => void = () => undefined;
    const order: string[] = [];
    fetchImpl = (url) => {
      order.push(url.includes("/payment-links") ? "fetch" : "other");
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    const previousOpen = window.open;
    window.open = ((url?: string | URL, target?: string) => {
      order.push("open");
      return previousOpen.call(window, url, target);
    }) as typeof window.open;
    await renderQuotes([quote]);
    assert.equal(fetchCalls.length, 0);
    const button = sendButton(ISSUED_QUOTE);
    await act(async () => {
      button.click();
      button.click();
    });
    assert.deepEqual(order, ["open", "fetch"]);
    assert.equal(openCalls.length, 1);
    assert.deepEqual(openCalls[0], { url: "about:blank", target: "_blank" });
    assert.equal(fetchCalls.length, 1);
    assertPaymentGet(ISSUED_QUOTE);
    assert.ok(activePopup);
    assert.equal(activePopup.opener, null);
    assert.equal(activePopup.location.href, "about:blank");
    assert.equal(activePopup.replacements.length, 0);
    assert.equal(activePopup.document.title, "Preparing email");
    assert.equal(activePopup.document.body.textContent, "Preparing email…");
    assert.doesNotMatch(activePopup.document.body.innerHTML, /stripe|mail\.google|buyer@|Q-2026/);

    await flush();
    assert.equal(sendButton(ISSUED_QUOTE).disabled, true);
    assert.equal(
      container
        .querySelector("[data-client-quote-send-email]")
        ?.getAttribute("data-client-document-send-email-pending"),
      "true",
    );
    sendButton(ISSUED_QUOTE).click();
    assert.equal(openCalls.length, 1);
    assert.equal(fetchCalls.length, 1);

    const expected = detailHandoff(quote, links);
    await act(async () => {
      release(jsonResponse(paymentApiBody(links)));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(activePopup.replacements.length, 1);
    assert.equal(activePopup.replacements[0], expected.href);
    assert.equal(activePopup.location.href, expected.href);
    const body = new URL(expected.href).searchParams.get("body") ?? "";
    assert.match(body, /Payment link: https:\/\/buy\.stripe\.com\/abcdefghij/);
    assert.equal(body.includes(".pdf"), false);
    assert.equal(body.includes("SCOPE-SENTINEL"), false);
    assert.equal(body.includes("issuer-secret@hidden.example"), false);
    assert.equal(body.includes("42424242"), false);
    assert.ok(expected.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
    assert.equal(new URL(expected.href).searchParams.get("to"), "buyer@example.com");
    assert.equal(container.querySelector("a[data-client-document-send-email-link]"), null);
    assert.equal(leaked.length, 0);

    const opensBefore = openCalls.length;
    await act(async () => {
      sendButton(ISSUED_QUOTE).click();
    });
    assert.equal(openCalls.length, opensBefore + 1);
    assert.equal(fetchCalls.length, 2);
    assertPaymentGet(ISSUED_QUOTE, 1);
    assert.equal(fetchCalls.every((call) => call.method === "GET"), true);
    restoreFetch?.();
  });

  it("fetches only the clicked quote and keeps the other card idle", async () => {
    installBrowser();
    fetchImpl = async () => jsonResponse(paymentApiBody([]));
    const first = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE }));
    const second = toPublicClientQuote(
      issueQuote({
        id: INVOICED_QUOTE,
        customerName: "Fabrikam Atelier",
        projectTitle: "Catalog migration",
      }),
    );
    await renderQuotes([first, second]);
    assert.equal(fetchCalls.length, 0);
    await act(async () => {
      sendButton(ISSUED_QUOTE).click();
    });
    await flush();
    assert.equal(fetchCalls.length, 1);
    assertPaymentGet(ISSUED_QUOTE);
    assert.equal(fetchCalls.some((call) => call.url.includes(INVOICED_QUOTE)), false);
    assert.equal(openCalls.length, 1);
    await act(async () => {
      sendButton(INVOICED_QUOTE).click();
    });
    await flush();
    assert.equal(fetchCalls.length, 2);
    assertPaymentGet(INVOICED_QUOTE, 1);
    assert.equal(fetchCalls.some((call) => call.method !== "GET"), false);
    restoreFetch?.();
  });

  it("matches detail for full, split, partial, recurring, and mixed links in every document language", async () => {
    const shapes: Record<string, EmailLink[]> = {
      full: [{ purpose: "one_time_full", url: FULL_URL }],
      split: [
        { purpose: "one_time_balance", url: BALANCE_URL },
        { purpose: "one_time_deposit", url: DEPOSIT_URL },
      ],
      partial: [
        { purpose: "one_time_deposit", url: DEPOSIT_URL },
        { purpose: "one_time_balance", url: null },
      ],
      recurring: [
        { purpose: "annually", url: ANNUAL_URL },
        { purpose: "quarterly", url: QUARTERLY_URL },
        { purpose: "monthly", url: MONTHLY_URL },
      ],
      mixed: [
        { purpose: "annually", url: ANNUAL_URL },
        { purpose: "one_time_full", url: FULL_URL },
        { purpose: "monthly", url: MONTHLY_URL },
      ],
    };
    for (const [name, links] of Object.entries(shapes)) {
      installBrowser();
      const quote = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE, contentLanguage: "en" }));
      fetchImpl = async () => jsonResponse(paymentApiBody(links));
      await renderQuotes([quote]);
      await act(async () => {
        sendButton(ISSUED_QUOTE).click();
      });
      await flush();
      const expected = detailHandoff(quote, links);
      assert.equal(activePopup?.replacements[0], expected.href, name);
      const body = new URL(expected.href).searchParams.get("body") ?? "";
      assertCompletePaymentUrls(body, links.flatMap((link) => (link.url ? [link.url] : [])));
      assert.ok(expected.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH, name);
    }

    const allLinks = [
      { purpose: "one_time_full", url: FULL_URL },
      { purpose: "one_time_deposit", url: DEPOSIT_URL },
      { purpose: "one_time_balance", url: BALANCE_URL },
      { purpose: "monthly", url: MONTHLY_URL },
      { purpose: "quarterly", url: QUARTERLY_URL },
      { purpose: "annually", url: ANNUAL_URL },
    ];
    for (const language of ORGANIZATION_LANGUAGES) {
      installBrowser();
      const quote = toPublicClientQuote(
        issueQuote({ id: ISSUED_QUOTE, contentLanguage: language }),
      );
      fetchImpl = async () => jsonResponse(paymentApiBody(allLinks));
      await renderQuotes([quote]);
      await act(async () => {
        sendButton(ISSUED_QUOTE).click();
      });
      await flush();
      const expected = detailHandoff(quote, allLinks);
      assert.equal(activePopup?.replacements[0], expected.href, language);
      const body = new URL(expected.href).searchParams.get("body") ?? "";
      assert.equal(body.includes(".pdf"), false, language);
      assert.equal(body.includes(FULL_URL), true, language);
      assert.ok(expected.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH, language);
    }
    restoreFetch?.();
  });

  it("omits null and non-official links and falls back when the GET cannot be used", async () => {
    installBrowser();
    const quote = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE }));
    const links = [
      { purpose: "one_time_full", url: "https://evil.example/abcdefghij" },
      { purpose: "one_time_deposit", url: null },
      { purpose: "one_time_balance", url: BALANCE_URL },
    ];
    fetchImpl = async () => jsonResponse(paymentApiBody(links));
    await renderQuotes([quote]);
    await act(async () => {
      sendButton(ISSUED_QUOTE).click();
    });
    await flush();
    const expected = detailHandoff(quote, links);
    assert.equal(activePopup?.replacements[0], expected.href);
    const body = new URL(expected.href).searchParams.get("body") ?? "";
    assert.equal(body.includes(BALANCE_URL), true);
    assert.equal(body.includes("evil.example"), false);
    assert.doesNotMatch(body, /Deposit:/);
    assert.equal(body.includes(".pdf"), false);

    const failures: Array<() => Promise<Response>> = [
      async () => {
        throw new Error("offline");
      },
      async () => new Response("<html>no</html>", { status: 500, headers: { "content-type": "text/html" } }),
      async () => jsonResponse({ ok: false, error: { code: "PAYMENT_LINK_FAILED" } }, 400),
      async () => jsonResponse({ ok: true }),
      async () => jsonResponse({ ok: true, paymentRequests: [{ purpose: "not_a_purpose" }] }),
    ];
    const snapshotOnly = detailHandoff(quote, null).href;
    for (const [index, fail] of failures.entries()) {
      installBrowser();
      fetchImpl = fail;
      await renderQuotes([quote]);
      await act(async () => {
        sendButton(ISSUED_QUOTE).click();
      });
      await flush();
      assert.equal(activePopup?.replacements[0], snapshotOnly, `failure ${index}`);
      assert.equal(fetchCalls.length, 1, `failure ${index}`);
      assert.equal(fetchCalls[0]?.method, "GET");
      const failedBody = new URL(snapshotOnly).searchParams.get("body") ?? "";
      assert.doesNotMatch(failedBody, /buy\.stripe\.com|pay\.getoblic\.com|\.pdf/);
    }
    restoreFetch?.();
  });

  it("keeps the Gmail URL within the cap without a partial payment URL", async () => {
    installBrowser();
    const links = [
      { purpose: "one_time_full", url: FULL_URL },
      { purpose: "one_time_deposit", url: DEPOSIT_URL },
      { purpose: "one_time_balance", url: BALANCE_URL },
      { purpose: "monthly", url: MONTHLY_URL },
      { purpose: "quarterly", url: QUARTERLY_URL },
      { purpose: "annually", url: ANNUAL_URL },
    ];
    const issued = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE }));
    assert.ok(issued.issuedSnapshot);
    const quote = {
      ...issued,
      issuedSnapshot: {
        ...issued.issuedSnapshot,
        projectTitle: "P".repeat(5000),
      },
    };
    fetchImpl = async () => jsonResponse(paymentApiBody(links));
    await renderQuotes([quote]);
    await act(async () => {
      sendButton(ISSUED_QUOTE).click();
    });
    await flush();
    const expected = detailHandoff(quote, links);
    const href = activePopup?.replacements[0] ?? "";
    assert.equal(href, expected.href);
    assert.ok(href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
    const body = new URL(href).searchParams.get("body") ?? "";
    assert.equal(body.includes(ANNUAL_URL), false);
    assertCompletePaymentUrls(
      body,
      links.map((link) => link.url).filter((url): url is string => Boolean(url)),
    );
    restoreFetch?.();
  });

  it("uses a clickable Gmail anchor when the popup is blocked", async () => {
    installBrowser();
    popupMode = "blocked";
    const quote = toPublicClientQuote(issueQuote({ id: ISSUED_QUOTE, email: null }));
    const links = [{ purpose: "one_time_full", url: FULL_URL }];
    fetchImpl = async () => jsonResponse(paymentApiBody(links));
    const french = getLicenseeLocalization("fr").messages;
    await renderQuotes([quote], french);
    assert.match(container.innerHTML, /Envoyer par e-mail/);
    assert.match(container.innerHTML, /Joignez le PDF manuellement/);
    assert.equal(fetchCalls.length, 0);
    await act(async () => {
      sendButton(ISSUED_QUOTE).click();
    });
    await flush();
    assert.equal(openCalls.length, 1);
    assert.deepEqual(openCalls[0], { url: "about:blank", target: "_blank" });
    assert.equal(activePopup, null);
    assert.equal(fetchCalls.length, 1);
    assertPaymentGet(ISSUED_QUOTE);
    const anchor = container.querySelector("a[data-client-document-send-email-link]");
    assert.ok(anchor instanceof HTMLAnchorElement);
    const expected = detailHandoff(quote, links);
    assert.equal(anchor.getAttribute("href"), expected.href);
    assert.equal(anchor.getAttribute("target"), "_blank");
    assert.equal(anchor.getAttribute("rel"), "noopener noreferrer");
    assert.match(anchor.textContent ?? "", /Envoyer par e-mail/);
    assert.match(anchor.className, /rounded-full/);
    assert.equal(container.querySelector("[data-client-document-send-email-button]"), null);
    assert.match(container.innerHTML, /data-client-document-send-recipient-warning="true"/);
    assert.match(container.innerHTML, /data-client-document-send-reminder="true"/);
    const url = new URL(anchor.getAttribute("href") ?? "");
    assert.equal(url.searchParams.has("to"), false);
    assert.match(url.searchParams.get("body") ?? "", /Hello Ada North,/);
    assert.equal((url.searchParams.get("body") ?? "").includes("Bonjour"), false);
    assert.match(url.searchParams.get("su") ?? "", /^Quotation /);
    anchor.click();
    await flush();
    assert.equal(openCalls.filter((call) => call.url === "about:blank").length, 1);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls.some((call) => call.method === "POST"), false);
    restoreFetch?.();
  });

  it("leaves invoice library cards on the existing anchor", async () => {
    installBrowser();
    const quote = issueQuote({});
    const issued = issuedInvoice(quote);
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container.replaceChildren();
    const invoiceRoot = createRoot(container);
    await act(async () => {
      invoiceRoot.render(
        createElement(ClientInvoiceLibraryView, {
          phase: "ready",
          invoices: [issued],
          error: null,
          locale: "en-US",
          messages,
          onRetry: () => undefined,
        }),
      );
    });
    assert.equal(fetchCalls.length, 0);
    assert.equal(openCalls.length, 0);
    assert.equal(container.querySelector("[data-client-document-send-email-button]"), null);
    const href = gmailHrefs(container.innerHTML)[0];
    assert.match(new URL(href).searchParams.get("body") ?? "", /invoice-i-2026-0001-2026-10-10\.pdf/);
    assert.equal(new URL(href).searchParams.get("body")?.includes("IBAN-SENTINEL"), false);
    await act(async () => {
      invoiceRoot.unmount();
    });
    restoreFetch?.();
  });
});
