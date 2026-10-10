/**
 * CQ-MAIL-1B — Gmail compose handoff from a frozen issued document.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  GMAIL_COMPOSE_MAX_SUBJECT_LENGTH,
  GMAIL_COMPOSE_MAX_URL_LENGTH,
  GMAIL_COMPOSE_URL_BASE,
  buildClientDocumentGmailHandoff,
  buildGmailComposeUrl,
  clientDocumentRecipientEmail,
  type ClientInvoiceGmailSnapshot,
  type ClientQuoteGmailSnapshot,
} from "../../lib/licensee/clientDocumentGmailHandoff";
import { buildClientInvoicePdfFilename } from "../../services/clientInvoice/pdf/clientInvoicePdfFilename";
import { buildClientQuotePdfFilename } from "../../services/clientQuote/pdf/clientQuotePdfFilename";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();

const SENTINELS = [
  "QUOTE-UUID-SENTINEL",
  "INVOICE-UUID-SENTINEL",
  "ORG-UUID-SENTINEL",
  "LICENSEE-SENTINEL",
  "ESTIMATE-ID-SENTINEL",
  "TAX-SENTINEL-99",
  "VAT-SENTINEL",
  "SCOPE-SENTINEL-SHOULD-NOT-LEAK",
  "PAY-SENTINEL",
  "IBAN-SENTINEL",
  "PRIVATE-NOTE-SENTINEL",
  "issuer-secret@hidden.example",
  "ZZZ Legal Name Sentinel",
  "42424242",
];

const LANGUAGE_MARKERS: Record<
  OrganizationLanguage,
  { quote: string; invoice: string; hello: string; regards: string }
> = {
  en: {
    quote: "Quotation",
    invoice: "Invoice",
    hello: "Hello Ada North,",
    regards: "Kind regards,",
  },
  fr: {
    quote: "Devis",
    invoice: "Facture",
    hello: "Bonjour Ada North,",
    regards: "Cordialement,",
  },
  es: {
    quote: "Presupuesto",
    invoice: "Factura",
    hello: "Hola Ada North,",
    regards: "Un saludo,",
  },
  it: {
    quote: "Preventivo",
    invoice: "Fattura",
    hello: "Buongiorno Ada North,",
    regards: "Cordiali saluti,",
  },
  de: {
    quote: "Angebot",
    invoice: "Rechnung",
    hello: "Guten Tag Ada North,",
    regards: "Mit freundlichen Grüßen",
  },
  pt: {
    quote: "Orçamento",
    invoice: "Fatura",
    hello: "Olá Ada North,",
    regards: "Com os melhores cumprimentos,",
  },
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value as object)) deepFreeze(child);
}

function quoteSnapshot(
  overrides: Partial<ClientQuoteGmailSnapshot> = {},
): ClientQuoteGmailSnapshot {
  return {
    contentLanguage: "en",
    quoteNumber: "Q-2026-0001",
    issuedAt: "2026-10-10T12:00:00.000Z",
    projectTitle: "Portal rebuild",
    customer: {
      name: "Northwind Customer Sentinel",
      contactName: "Ada North",
      email: "buyer@example.com",
    },
    issuer: {
      legalName: "ZZZ Legal Name Sentinel",
      tradingName: "Alpha Studio",
    },
    ...overrides,
  };
}

function invoiceSnapshot(
  overrides: Partial<ClientInvoiceGmailSnapshot> = {},
): ClientInvoiceGmailSnapshot {
  return {
    contentLanguage: "en",
    invoiceNumber: "I-2026-0001",
    issueDate: "2026-10-10",
    projectTitle: "Portal rebuild",
    customer: {
      name: "Northwind Customer Sentinel",
      contactName: "Ada North",
      email: "buyer@example.com",
    },
    issuer: {
      legalName: "ZZZ Legal Name Sentinel",
      tradingName: "Alpha Studio",
    },
    ...overrides,
  };
}

function withPoison<T extends object>(snapshot: T): T {
  return {
    ...snapshot,
    quoteId: "QUOTE-UUID-SENTINEL",
    invoiceId: "INVOICE-UUID-SENTINEL",
    organizationId: "ORG-UUID-SENTINEL",
    licenseeAccountId: "LICENSEE-SENTINEL",
    scopeSummary: "SCOPE-SENTINEL-SHOULD-NOT-LEAK",
    paymentTerms: { summary: "PAY-SENTINEL" },
    paymentInstructions: "IBAN-SENTINEL",
    totals: { totalMinor: 42424242 },
    sourceEstimate: { estimateId: "ESTIMATE-ID-SENTINEL" },
    sourceQuote: { quoteId: "QUOTE-UUID-SENTINEL", sourceEstimateId: "ESTIMATE-ID-SENTINEL" },
    customer: {
      ...("customer" in snapshot ? (snapshot.customer as object) : {}),
      taxIdentifier: "TAX-SENTINEL-99",
    },
    issuer: {
      ...("issuer" in snapshot ? (snapshot.issuer as object) : {}),
      email: "issuer-secret@hidden.example",
      taxIdentifier: "VAT-SENTINEL",
      additionalNote: "PRIVATE-NOTE-SENTINEL",
    },
  };
}

function assertSafeText(value: string): void {
  for (const sentinel of SENTINELS) {
    assert.equal(value.includes(sentinel), false, sentinel);
  }
  assert.doesNotMatch(value, /authuser|\/u\/\d/);
}

describe("Gmail compose URL", () => {
  it("uses the account-neutral compose base and URLSearchParams", () => {
    const result = buildGmailComposeUrl({
      to: "buyer@example.com",
      subject: "A & B café",
      body: "Line one\nLine two",
    });
    assert.equal(
      result.href.startsWith("https://mail.google.com/mail/?view=cm&fs=1&tf=1"),
      true,
    );
    const url = new URL(result.href);
    assert.equal(`${url.origin}${url.pathname}`, "https://mail.google.com/mail/");
    assert.equal(url.searchParams.get("view"), "cm");
    assert.equal(url.searchParams.get("fs"), "1");
    assert.equal(url.searchParams.get("tf"), "1");
    assert.equal(url.searchParams.get("to"), "buyer@example.com");
    assert.equal(url.searchParams.get("su"), "A & B café");
    assert.equal(url.searchParams.get("body"), "Line one\nLine two");
    assert.equal(url.searchParams.get("authuser"), null);
    assert.equal(result.href.includes("/u/"), false);
    assert.equal(result.recipientIncluded, true);
    const source = read("lib/licensee/clientDocumentGmailHandoff.ts");
    assert.match(source, /new URLSearchParams/);
    assert.doesNotMatch(source, /authuser|\/u\/0|\/u\/1/);
  });

  it("caps the subject at 120 characters and the URL at 2,000", () => {
    const longSubject = `Quotation Q-2026-0001 — ${"P".repeat(400)}`;
    const fitted = buildGmailComposeUrl({
      to: "buyer@example.com",
      subject: longSubject,
      body: "é".repeat(8_000),
    });
    assert.ok(fitted.subject.length <= GMAIL_COMPOSE_MAX_SUBJECT_LENGTH);
    assert.ok(fitted.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
    assert.equal(fitted.recipientIncluded, true);
    assert.match(fitted.href, /[?&]to=/);
    assert.match(fitted.body, /…$/);
    assert.ok(fitted.body.length < 8_000);
    assert.doesNotMatch(fitted.href, /authuser/);
    const url = new URL(fitted.href);
    assert.equal(url.searchParams.get("view"), "cm");
    assert.equal(url.searchParams.get("fs"), "1");
    assert.equal(url.searchParams.get("tf"), "1");
    assert.equal(url.searchParams.get("su"), fitted.subject);
  });

  it("drops an oversized recipient before it guesses an account", () => {
    const enormous = "é".repeat(20_000);
    const result = buildGmailComposeUrl({
      to: enormous,
      subject: enormous,
      body: enormous,
    });
    assert.ok(result.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
    assert.ok(Array.from(result.subject).length <= GMAIL_COMPOSE_MAX_SUBJECT_LENGTH);
    assert.equal(result.recipientIncluded, false);
    assert.equal(result.href.startsWith("https://mail.google.com/mail/?view=cm&fs=1&tf=1"), true);
    assert.doesNotMatch(result.href, /authuser|\/u\/\d/);
    assert.equal(GMAIL_COMPOSE_URL_BASE.length < GMAIL_COMPOSE_MAX_URL_LENGTH, true);
  });
});

describe("issued document email", () => {
  it("builds a quotation from the frozen recipient, contact, and trading name", () => {
    const snapshot = withPoison(quoteSnapshot());
    const before = JSON.stringify(snapshot);
    deepFreeze(snapshot);
    const handoff = buildClientDocumentGmailHandoff({ kind: "quote", snapshot });
    assert.equal(JSON.stringify(snapshot), before);
    const filename = buildClientQuotePdfFilename({
      quoteNumber: "Q-2026-0001",
      issuedAt: "2026-10-10T12:00:00.000Z",
    });
    assert.equal(handoff.pdfFilename, filename);
    assert.equal(handoff.subject, "Quotation Q-2026-0001 — Portal rebuild");
    assert.match(handoff.body, /Hello Ada North,/);
    assert.match(handoff.body, /quotation Q-2026-0001 for Portal rebuild/);
    assert.match(handoff.body, new RegExp(filename.replace(/\./g, "\\.")));
    assert.match(handoff.body, /Alpha Studio/);
    assert.equal(handoff.body.includes("Northwind Customer Sentinel"), false);
    assert.equal(handoff.recipientMissing, false);
    assert.equal(handoff.recipientIncluded, true);
    const url = new URL(handoff.href);
    assert.equal(url.searchParams.get("to"), "buyer@example.com");
    assert.equal(url.searchParams.get("su"), handoff.subject);
    assert.equal(url.searchParams.get("body"), handoff.body);
    assertSafeText(`${handoff.href}\n${handoff.subject}\n${handoff.body}`);
  });

  it("builds an invoice without payment instructions, amounts, or issuer email", () => {
    const snapshot = withPoison(
      invoiceSnapshot({
        customer: {
          name: "Northwind Customer Sentinel",
          contactName: null,
          email: "  buyer@example.com  ",
        },
        issuer: {
          legalName: "Alpha Legal",
          tradingName: "   ",
        },
      }),
    );
    const before = JSON.stringify(snapshot);
    deepFreeze(snapshot);
    const handoff = buildClientDocumentGmailHandoff({ kind: "invoice", snapshot });
    assert.equal(JSON.stringify(snapshot), before);
    const filename = buildClientInvoicePdfFilename({
      invoiceNumber: "I-2026-0001",
      issueDate: "2026-10-10",
    });
    assert.equal(handoff.subject, "Invoice I-2026-0001 — Portal rebuild");
    assert.match(handoff.body, /Hello Northwind Customer Sentinel,/);
    assert.match(handoff.body, /invoice I-2026-0001 for Portal rebuild/);
    assert.match(handoff.body, /Alpha Legal/);
    assert.match(handoff.body, new RegExp(filename.replace(/\./g, "\\.")));
    assert.equal(new URL(handoff.href).searchParams.get("to"), "buyer@example.com");
    assertSafeText(`${handoff.href}\n${handoff.subject}\n${handoff.body}`);
    assert.equal(handoff.body.includes("issuer-secret@hidden.example"), false);
  });

  it("omits an invalid recipient and keeps the compose link", () => {
    for (const email of [
      null,
      "",
      "   ",
      "not-an-email",
      "buyer@example",
      "buyer@example.com,other@example.com",
      "Ada <buyer@example.com>",
    ]) {
      const handoff = buildClientDocumentGmailHandoff({
        kind: "quote",
        snapshot: quoteSnapshot({
          customer: {
            name: "Northwind",
            contactName: "Ada North",
            email,
          },
        }),
      });
      assert.equal(handoff.recipientMissing, true, String(email));
      assert.equal(handoff.recipientIncluded, false, String(email));
      assert.equal(new URL(handoff.href).searchParams.has("to"), false);
      assert.match(handoff.subject, /^Quotation Q-2026-0001/);
    }
    assert.equal(clientDocumentRecipientEmail(" buyer@example.com "), "buyer@example.com");
    assert.equal(clientDocumentRecipientEmail("buyer@example.com"), "buyer@example.com");
  });

  it("uses the document language for all six templates and caps a long subject", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const marker = LANGUAGE_MARKERS[language];
      const quote = buildClientDocumentGmailHandoff({
        kind: "quote",
        snapshot: quoteSnapshot({ contentLanguage: language }),
      });
      const invoice = buildClientDocumentGmailHandoff({
        kind: "invoice",
        snapshot: invoiceSnapshot({ contentLanguage: language }),
      });
      assert.equal(quote.subject.startsWith(marker.quote), true, language);
      assert.equal(invoice.subject.startsWith(marker.invoice), true, language);
      assert.match(quote.body, new RegExp(marker.hello.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(quote.body, new RegExp(marker.regards.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(invoice.body, /PDF|Fichier PDF|Archivo PDF|File PDF|PDF-Datei|Ficheiro PDF/);
      if (language !== "en") {
        assert.equal(quote.body.includes("Hello Ada North,"), false, language);
        assert.equal(quote.subject.startsWith("Quotation"), false, language);
      }
      assertSafeText(`${quote.href}\n${invoice.href}`);
    }

    const long = buildClientDocumentGmailHandoff({
      kind: "quote",
      snapshot: quoteSnapshot({ projectTitle: "P".repeat(200) }),
    });
    assert.ok(Array.from(long.subject).length <= GMAIL_COMPOSE_MAX_SUBJECT_LENGTH);
    assert.match(long.subject, /^Quotation Q-2026-0001 — P+…$/);
    assert.ok(long.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
  });
});
