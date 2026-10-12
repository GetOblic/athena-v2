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
  selectClientQuoteEmailPaymentLinks,
  type ClientInvoiceGmailSnapshot,
  type ClientQuoteGmailSnapshot,
} from "../../lib/licensee/clientDocumentGmailHandoff";
import { isOfficialStripePaymentLinkUrl } from "../../services/clientQuotePayment/clientQuotePaymentStripeContract";
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
    assert.equal(
      handoff.body,
      [
        "Hello Ada North,",
        "",
        "Please find our quotation Q-2026-0001 for Portal rebuild.",
        "",
        "Kind regards,",
        "Alpha Studio",
      ].join("\n"),
    );
    assert.equal(handoff.body.includes(filename), false);
    assert.doesNotMatch(handoff.body, /PDF file:/);
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
      assert.equal(quote.body.includes(quote.pdfFilename), false, language);
      assert.doesNotMatch(
        quote.body,
        /PDF file:|Fichier PDF|Archivo PDF|File PDF|PDF-Datei|Ficheiro PDF/,
      );
      assert.match(invoice.body, /PDF file:|Fichier PDF|Archivo PDF|File PDF|PDF-Datei|Ficheiro PDF/);
      assert.match(invoice.body, new RegExp(invoice.pdfFilename.replace(/\./g, "\\.")));
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

const FULL_URL = "https://buy.stripe.com/abcdefghij";
const DEPOSIT_URL = "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08";
const BALANCE_URL = "https://buy.stripe.com/test_abcdefghij";
const MONTHLY_URL = "https://pay.getoblic.com/b/test_14AdRb6Mt0NF4Fv1hmdIA08";
const QUARTERLY_URL = "https://buy.stripe.com/quarterly1";
const ANNUAL_URL = "https://pay.getoblic.com/b/annually01";

const PAYMENT_LABELS: Record<
  OrganizationLanguage,
  {
    full: string;
    deposit: string;
    balance: string;
    monthly: string;
    quarterly: string;
    annual: string;
  }
> = {
  en: {
    full: "Payment link",
    deposit: "Deposit",
    balance: "Remaining balance",
    monthly: "Monthly payment link",
    quarterly: "Quarterly payment link",
    annual: "Annual payment link",
  },
  fr: {
    full: "Lien de paiement",
    deposit: "Acompte",
    balance: "Solde restant",
    monthly: "Lien de paiement mensuel",
    quarterly: "Lien de paiement trimestriel",
    annual: "Lien de paiement annuel",
  },
  es: {
    full: "Enlace de pago",
    deposit: "Anticipo",
    balance: "Saldo restante",
    monthly: "Enlace de pago mensual",
    quarterly: "Enlace de pago trimestral",
    annual: "Enlace de pago anual",
  },
  it: {
    full: "Link di pagamento",
    deposit: "Acconto",
    balance: "Saldo restante",
    monthly: "Link di pagamento mensile",
    quarterly: "Link di pagamento trimestrale",
    annual: "Link di pagamento annuale",
  },
  de: {
    full: "Zahlungslink",
    deposit: "Anzahlung",
    balance: "Restbetrag",
    monthly: "Monatlicher Zahlungslink",
    quarterly: "Vierteljährlicher Zahlungslink",
    annual: "Jährlicher Zahlungslink",
  },
  pt: {
    full: "Ligação de pagamento",
    deposit: "Sinal",
    balance: "Saldo restante",
    monthly: "Ligação de pagamento mensal",
    quarterly: "Ligação de pagamento trimestral",
    annual: "Ligação de pagamento anual",
  },
};

function paymentLine(language: OrganizationLanguage, label: string, url: string): string {
  return `${label}${language === "fr" ? " : " : ": "}${url}`;
}

function quoteWithLinks(
  paymentLinks: { purpose: string; url: string | null }[],
  snapshot: ClientQuoteGmailSnapshot = quoteSnapshot(),
) {
  return buildClientDocumentGmailHandoff({
    kind: "quote",
    snapshot,
    paymentLinks,
  });
}

function httpsUrls(body: string): string[] {
  return body.match(/https:\/\/\S+/g) ?? [];
}

describe("persisted quotation payment links", () => {
  it("keeps the invoice PDF line unchanged", () => {
    const handoff = buildClientDocumentGmailHandoff({
      kind: "invoice",
      snapshot: invoiceSnapshot(),
    });
    const filename = buildClientInvoicePdfFilename({
      invoiceNumber: "I-2026-0001",
      issueDate: "2026-10-10",
    });
    assert.equal(
      handoff.body,
      [
        "Hello Ada North,",
        "",
        "Please find our invoice I-2026-0001 for Portal rebuild.",
        "",
        `PDF file: ${filename}`,
        "",
        "Kind regards,",
        "Alpha Studio",
      ].join("\n"),
    );
    assert.equal(handoff.subject, "Invoice I-2026-0001 — Portal rebuild");
    assert.doesNotMatch(handoff.body, /buy\.stripe\.com|pay\.getoblic\.com|Payment link:/);
  });

  it("lists a full payment link and preserves the quotation message", () => {
    const bare = quoteWithLinks([]);
    const handoff = quoteWithLinks([{ purpose: "one_time_full", url: FULL_URL }]);
    assert.equal(handoff.subject, bare.subject);
    assert.equal(handoff.subject, "Quotation Q-2026-0001 — Portal rebuild");
    assert.equal(handoff.recipientIncluded, true);
    assert.equal(new URL(handoff.href).searchParams.get("to"), "buyer@example.com");
    assert.equal(
      handoff.body,
      [
        "Hello Ada North,",
        "",
        "Please find our quotation Q-2026-0001 for Portal rebuild.",
        "",
        paymentLine("en", "Payment link", FULL_URL),
        "",
        "Kind regards,",
        "Alpha Studio",
      ].join("\n"),
    );
    assert.equal(bare.body.includes(FULL_URL), false);
    assert.doesNotMatch(bare.body, /Payment link:|Deposit:/);
    assertSafeText(handoff.body);
  });

  it("lists split, partial split, recurring, and mixed links in purpose order", () => {
    const split = quoteWithLinks([
      { purpose: "one_time_balance", url: BALANCE_URL },
      { purpose: "one_time_deposit", url: DEPOSIT_URL },
    ]);
    assert.equal(
      split.body.includes(paymentLine("en", "Deposit", DEPOSIT_URL)),
      true,
    );
    assert.equal(
      split.body.includes(paymentLine("en", "Remaining balance", BALANCE_URL)),
      true,
    );
    assert.ok(split.body.indexOf(DEPOSIT_URL) < split.body.indexOf(BALANCE_URL));

    const depositOnly = quoteWithLinks([{ purpose: "one_time_deposit", url: DEPOSIT_URL }]);
    assert.match(depositOnly.body, /Deposit:/);
    assert.doesNotMatch(depositOnly.body, /Remaining balance:/);
    assert.equal(depositOnly.body.includes(BALANCE_URL), false);

    const balanceOnly = quoteWithLinks([
      { purpose: "one_time_balance", url: null },
      { purpose: "one_time_balance", url: BALANCE_URL },
    ]);
    assert.match(balanceOnly.body, /Remaining balance:/);
    assert.doesNotMatch(balanceOnly.body, /Deposit:/);
    assert.equal(balanceOnly.body.includes(BALANCE_URL), true);

    const recurring = quoteWithLinks([
      { purpose: "annually", url: ANNUAL_URL },
      { purpose: "quarterly", url: QUARTERLY_URL },
      { purpose: "monthly", url: MONTHLY_URL },
    ]);
    assert.ok(recurring.body.indexOf(MONTHLY_URL) < recurring.body.indexOf(QUARTERLY_URL));
    assert.ok(recurring.body.indexOf(QUARTERLY_URL) < recurring.body.indexOf(ANNUAL_URL));
    assert.match(recurring.body, /Monthly payment link:/);
    assert.match(recurring.body, /Quarterly payment link:/);
    assert.match(recurring.body, /Annual payment link:/);

    const mixed = quoteWithLinks([
      { purpose: "annually", url: ANNUAL_URL },
      { purpose: "one_time_full", url: FULL_URL },
      { purpose: "monthly", url: MONTHLY_URL },
    ]);
    assert.ok(mixed.body.indexOf(FULL_URL) < mixed.body.indexOf(MONTHLY_URL));
    assert.ok(mixed.body.indexOf(MONTHLY_URL) < mixed.body.indexOf(ANNUAL_URL));
    assert.match(mixed.body, /Kind regards,\nAlpha Studio$/);
    assert.match(mixed.body, /^Hello Ada North,/);
  });

  it("omits missing and non-official URLs without inventing a replacement", () => {
    const rejected = [
      "http://buy.stripe.com/abcdefghij",
      "https://donate.stripe.com/abcdefghij",
      "https://buy.stripe.com/short",
      "https://user:secret@pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com:443/b/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/14AdRb6Mt0NF4Fv1hmdIA08",
      "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08/extra",
      "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08/",
      "https://pay.getoblic.com/b/14AdRb6Mt0NF4Fv1hmdIA08?x=1",
      "https://evil.example/abcdefghij",
      "",
    ];
    for (const url of [FULL_URL, DEPOSIT_URL, BALANCE_URL, MONTHLY_URL, QUARTERLY_URL, ANNUAL_URL]) {
      assert.equal(isOfficialStripePaymentLinkUrl(url), true, url);
    }
    for (const url of rejected) {
      assert.equal(isOfficialStripePaymentLinkUrl(url), false, url);
    }

    const bare = quoteWithLinks([]);
    const handoff = quoteWithLinks([
      { purpose: "one_time_full", url: rejected[1] },
      { purpose: "one_time_deposit", url: null },
      { purpose: "one_time_balance", url: rejected[0] },
      { purpose: "monthly", url: "" },
      { purpose: "not_a_purpose", url: FULL_URL },
      { purpose: "quarterly", url: QUARTERLY_URL },
    ]);
    assert.equal(handoff.body.includes(QUARTERLY_URL), true);
    assert.match(handoff.body, /Quarterly payment link:/);
    assert.doesNotMatch(handoff.body, /Payment link:|Deposit:|Remaining balance:|Monthly payment link:/);
    for (const url of rejected) {
      if (url) assert.equal(handoff.body.includes(url), false, url);
    }
    assert.equal(handoff.body.includes(FULL_URL), false);
    assert.equal(
      quoteWithLinks(rejected.map((url) => ({ purpose: "one_time_full", url }))).body,
      bare.body,
    );

    assert.deepEqual(
      selectClientQuoteEmailPaymentLinks([
        { purpose: "one_time_full", url: "https://not-stripe.example/abcdefghij" },
        { purpose: "one_time_full", url: FULL_URL },
        { purpose: "one_time_full", url: DEPOSIT_URL },
        { purpose: "monthly", url: null },
      ]),
      [{ purpose: "one_time_full", url: FULL_URL }],
    );
  });

  it("uses the quotation language for every payment label", () => {
    const links = [
      { purpose: "one_time_full", url: FULL_URL },
      { purpose: "one_time_deposit", url: DEPOSIT_URL },
      { purpose: "one_time_balance", url: BALANCE_URL },
      { purpose: "monthly", url: MONTHLY_URL },
      { purpose: "quarterly", url: QUARTERLY_URL },
      { purpose: "annually", url: ANNUAL_URL },
    ];
    for (const language of ORGANIZATION_LANGUAGES) {
      const labels = PAYMENT_LABELS[language];
      const handoff = quoteWithLinks(links, quoteSnapshot({ contentLanguage: language }));
      for (const [label, url] of [
        [labels.full, FULL_URL],
        [labels.deposit, DEPOSIT_URL],
        [labels.balance, BALANCE_URL],
        [labels.monthly, MONTHLY_URL],
        [labels.quarterly, QUARTERLY_URL],
        [labels.annual, ANNUAL_URL],
      ] as const) {
        assert.equal(handoff.body.includes(paymentLine(language, label, url)), true, language);
      }
      assert.equal(handoff.body.includes(handoff.pdfFilename), false, language);
      if (language !== "en") {
        assert.equal(handoff.body.includes("Payment link:"), false, language);
        assert.equal(handoff.body.includes("Remaining balance:"), false, language);
      }
    }
  });

  it("drops whole payment lines from the end instead of cutting a URL", () => {
    const urls = [FULL_URL, DEPOSIT_URL, BALANCE_URL, MONTHLY_URL, QUARTERLY_URL, ANNUAL_URL];
    const links = [
      { purpose: "one_time_full", url: FULL_URL },
      { purpose: "one_time_deposit", url: DEPOSIT_URL },
      { purpose: "one_time_balance", url: BALANCE_URL },
      { purpose: "monthly", url: MONTHLY_URL },
      { purpose: "quarterly", url: QUARTERLY_URL },
      { purpose: "annually", url: ANNUAL_URL },
    ];
    const short = quoteWithLinks(links);
    assert.ok(short.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
    assert.deepEqual(httpsUrls(short.body), urls);
    for (const found of httpsUrls(short.body)) {
      assert.equal(isOfficialStripePaymentLinkUrl(found), true);
    }

    let partial: ReturnType<typeof quoteWithLinks> | null = null;
    let previousCount = urls.length;
    for (let size = 0; size <= 4000; size += 1) {
      const handoff = quoteWithLinks(links, quoteSnapshot({ projectTitle: "P".repeat(size) }));
      const found = httpsUrls(handoff.body);
      assert.ok(handoff.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH, String(size));
      assert.deepEqual(found, urls.filter((url) => handoff.body.includes(url)));
      for (const url of urls) {
        const token = url.slice(url.lastIndexOf("/") + 1);
        if (handoff.body.includes(token)) assert.equal(handoff.body.includes(url), true, url);
      }
      if (found.length < previousCount) {
        assert.deepEqual(found, urls.slice(0, found.length), `size ${size}`);
        if (found.length > 0) partial = handoff;
        previousCount = found.length;
      }
      if (found.length === 0) break;
    }
    assert.ok(partial, "expected at least one complete payment link to remain");
    assert.ok(httpsUrls(partial.body).length < urls.length);
    assert.equal(partial.body.includes(ANNUAL_URL), false);

    const overflow = quoteWithLinks(links, quoteSnapshot({ projectTitle: "é".repeat(8000) }));
    assert.ok(overflow.href.length <= GMAIL_COMPOSE_MAX_URL_LENGTH);
    assert.equal(overflow.recipientIncluded, true);
    assert.match(overflow.body, /…$/);
    assert.deepEqual(httpsUrls(overflow.body), []);
    assert.doesNotMatch(overflow.body, /buy\.stripe\.com|pay\.getoblic\.com/);
    assert.match(new URL(overflow.href).searchParams.get("su") ?? "", /^Quotation /);
  });

  it("prepares a library email from the same handoff and the existing payment-link GET", () => {
    const library = read("components/licensee/clientQuotes/ClientQuoteLibraryView.tsx");
    const email = read("components/licensee/clientDocuments/ClientDocumentSendByEmailLink.tsx");
    const editor = read("components/licensee/clientQuotes/ClientQuoteEditorView.tsx");
    const payments = read("components/licensee/clientQuotes/ClientQuotePaymentLinks.tsx");
    const handoffSource = read("lib/licensee/clientDocumentGmailHandoff.ts");
    const mapped =
      /paymentRequests\.map\(\(row\) => \(\{[\s\S]*purpose: row\.purpose[\s\S]*url: row\.paymentLinkUrl/;
    assert.match(library, /QuoteLibraryCardEmail/);
    assert.match(library, /snapshot=\{issuedSnapshotById\.get\(row\.id\)/);
    assert.doesNotMatch(library, /buildClientDocumentGmailHandoff|\/payment-links|ClientQuotePaymentLinks/);
    assert.doesNotMatch(library, /\bfetch\s*\(|method:\s*"POST"|api\.stripe\.com|useEffect\(/);
    assert.match(email, /window\.open\(\s*"about:blank",\s*"_blank"\s*\)/);
    assert.match(email, /location\.replace\(handoff\.href\)/);
    assert.match(email, /Preparing email…/);
    assert.match(email, /cache:\s*"no-store"/);
    assert.match(email, /Accept:\s*"application\/json"/);
    assert.match(email, /parseClientQuotePaymentLinkPayload/);
    assert.match(email, mapped);
    assert.match(editor, mapped);
    assert.doesNotMatch(email, /useEffect\(|method:\s*"POST"|api\.stripe\.com/);
    assert.doesNotMatch(email, /console\.(log|info|debug|warn|error)\s*\(/);
    const card = quoteWithLinks([]);
    assert.doesNotMatch(card.body, /Payment link:|Deposit:|buy\.stripe\.com|\.pdf/);

    assert.match(editor, /onPaymentLinksSettled=\{onPaymentLinksSettled\}/);
    assert.match(editor, /data-client-document-send-email-pending="true"/);
    assert.match(editor, /paymentSettlement\.status === "loading"/);
    assert.match(editor, /snapshot:\s*issuedSnapshot/);
    assert.match(
      editor,
      /paymentSettlement\.status === "ready"[\s\S]*row\.paymentLinkUrl[\s\S]*: undefined/,
    );
    assert.match(editor, /ClientDocumentSendByEmailLink/);
    assert.doesNotMatch(editor, /\bfetch\s*\(/);
    assert.doesNotMatch(editor, /\/payment-links/);
    assert.doesNotMatch(editor, /method:\s*"POST"/);
    assert.equal((payments.match(/\/payment-links/g) ?? []).length, 2);
    assert.match(payments, /method:\s*"GET"/);
    assert.match(payments, /method:\s*"POST"/);
    assert.match(payments, /\[applyPayload, quoteId\]/);
    assert.match(payments, /settledRef\.current = onPaymentLinksSettled/);
    assert.match(payments, /status: "failed"/);
    assert.doesNotMatch(payments, /setTimeout\(|setInterval\(|api\.stripe\.com/);
    assert.match(handoffSource, /isOfficialStripePaymentLinkUrl/);
    assert.doesNotMatch(handoffSource, /\bfetch\s*\(|method:\s*"POST"|api\.stripe\.com/);
  });
});
