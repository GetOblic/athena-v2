/**
 * CQ-INV-1E — issued client invoice PDF.
 * In-memory fixtures only. No live Supabase, worker, or model calls.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { clientInvoiceFailure } from "../../services/clientInvoice/clientInvoiceHttp";
import {
  ClientInvoiceOperationError,
  clientInvoicePdfNotIssued,
} from "../../services/clientInvoice/clientInvoiceErrors";
import type { ClientInvoiceDeps, StoredClientInvoice } from "../../services/clientInvoice/clientInvoiceDeps";
import {
  createClientInvoiceFromIssuedQuote,
  issueClientInvoice,
  updateClientInvoiceDraft,
} from "../../services/clientInvoice/clientInvoiceDomain";
import type { ClientInvoiceIssuedSnapshotV1 } from "../../services/clientInvoice/clientInvoiceTypes";
import { loadIssuedClientInvoiceSnapshotForPdf } from "../../services/clientInvoice/pdf/clientInvoicePdfAccess";
import {
  buildClientInvoicePdfFilename,
  clientInvoicePdfDownloadHeaders,
  isSafeClientInvoicePdfFilename,
  parseClientInvoicePdfContentDisposition,
} from "../../services/clientInvoice/pdf/clientInvoicePdfFilename";
import {
  CLIENT_INVOICE_PDF_LABEL_KEYS,
  clientInvoicePdfLabels,
} from "../../services/clientInvoice/pdf/clientInvoicePdfLabels";
import { renderIssuedClientInvoicePdf } from "../../services/clientInvoice/pdf/renderClientInvoicePdf";
import {
  createDraftClientQuote,
  issueClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import {
  formatClientQuotePdfIssueDate,
  formatClientQuotePdfMoney,
  formatClientQuotePdfValidUntil,
} from "../../services/clientQuote/pdf/clientQuotePdfFormat";
import type {
  AthenaClientQuote,
  ClientQuoteIssuedBrandSnapshot,
  ClientQuoteIssuedSnapshotV1,
} from "../../services/clientQuote/clientQuoteTypes";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();
const LICENSEE_A = "22222222-2222-4222-8222-222222222222";
const LICENSEE_B = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "44444444-4444-4444-8444-444444444444";
const ESTIMATE_ID = "55555555-5555-4555-8555-555555555555";
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "66666666-6666-4666-8666-666666666666";
const USER_A = "77777777-7777-4777-8777-777777777777";
const QUOTE_ISSUED_AT = "2026-01-15T08:30:00.000Z";
const INVOICE_ISSUED_AT = "2026-10-10T23:30:00.000Z";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const WEBP = Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pdfColor(hex: string): string {
  const channel = (start: number) =>
    (parseInt(hex.slice(start, start + 2), 16) / 255).toString();
  return `${channel(1)} ${channel(3)} ${channel(5)}`;
}

const WIN_ANSI: Record<number, string> = {
  0x80: "€",
  0x91: "'",
  0x92: "'",
  0x93: '"',
  0x94: '"',
  0x96: "-",
  0x97: "-",
  0xa0: " ",
};

function decodeWinAnsi(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  let out = "";
  for (const byte of bytes) {
    if (WIN_ANSI[byte]) out += WIN_ANSI[byte];
    else if (byte >= 32 && byte <= 126) out += String.fromCharCode(byte);
    else if (byte >= 160) out += String.fromCharCode(byte);
  }
  return out;
}

function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const lines: string[] = [];
  for (const block of raw.matchAll(/BT([\s\S]*?)ET/g)) {
    let line = "";
    for (const hex of block[1].matchAll(/<([0-9A-Fa-f]*)>/g)) {
      if (hex[1].length % 2 === 0) line += decodeWinAnsi(hex[1]);
    }
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

function licenseeAccessError(message: string): Error {
  const error = new Error(message);
  error.name = "LicenseeAccessError";
  return error;
}

function quotationDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "client_quote_draft_v1",
    issuer: {
      legalName: "Alpha Studio Ltd",
      tradingName: "Alpha Studio",
      postalAddress: {
        line1: "12 Harbour Street",
        line2: null,
        city: "Valletta",
        region: null,
        postalCode: "VLT 1000",
        country: "Malta",
      },
      phone: null,
      email: "billing@alpha.example",
      website: null,
      registrationNumber: "C-100",
      taxIdentifier: "MT12345678",
      taxIdentifierLabel: "VAT",
      contactName: null,
      jobTitle: null,
      additionalNote: null,
    },
    customer: {
      name: "Northwind",
      contactName: "Casey Buyer",
      jobTitle: null,
      postalAddress: {
        line1: "4 Dock Lane",
        line2: null,
        city: "Oslo",
        region: null,
        postalCode: null,
        country: null,
      },
      phone: null,
      email: null,
      taxIdentifier: null,
    },
    projectTitle: "Northwind portal",
    scopeSummary: "Rebuild the client portal.",
    lineItems: [
      {
        id: "line-1",
        description: "Brand identity system",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: 10000,
        lineTotalMinor: 1,
        billingFrequency: "one_time",
      },
    ],
    paymentTerms: {
      summary: "Net 30 from the invoice issue date.",
      scheduleNote: null,
    },
    validity: {
      validForDays: 30,
      validUntil: "2026-12-31",
      note: "Offer expires with the quotation.",
    },
    appendix: {
      enabled: true,
      sections: [{ heading: "Method appendix", body: "Quotation-only method." }],
    },
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

function issueQuotation(options: {
  contentLanguage?: OrganizationLanguage;
  currencyCode?: string;
  draft?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  quoteNumber?: string;
} = {}): AthenaClientQuote {
  const quote = createDraftClientQuote({
    id: QUOTE_ID,
    licenseeAccountId: LICENSEE_A,
    organizationId: ORG_ID,
    requestedBy: USER_A,
    contentLanguage: options.contentLanguage ?? "en",
    currencyCode: options.currencyCode ?? "USD",
    draft: options.draft ?? quotationDraft(),
    sourceEstimateId: ESTIMATE_ID,
    sourceEstimateSnapshot: {
      schemaVersion: "client_quote_source_estimate_v1",
      estimateId: ESTIMATE_ID,
      organizationId: ORG_ID,
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
    issuedAt: QUOTE_ISSUED_AT,
    updatedAt: QUOTE_ISSUED_AT,
    brand: options.brand ?? {
      primaryColor: "#112233",
      accentColor: "#C2410C",
      font: "times_new_roman",
    },
  });
}

function requireQuoteSnapshot(quote: AthenaClientQuote): ClientQuoteIssuedSnapshotV1 {
  const snapshot = quote.issued_snapshot_json;
  if (!snapshot) throw new Error("expected an issued quotation snapshot");
  return snapshot;
}

function issueInvoice(options: {
  contentLanguage?: OrganizationLanguage;
  currencyCode?: string;
  draft?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  paymentDueDate?: string;
  paymentInstructions?: string | null;
  quote?: AthenaClientQuote;
} = {}) {
  const quote = options.quote ?? issueQuotation(options);
  const source = requireQuoteSnapshot(quote);
  const created = createClientInvoiceFromIssuedQuote(source, {
    id: INVOICE_ID,
    createdAt: "2026-10-10T09:00:00.000Z",
  });
  const ready = updateClientInvoiceDraft(
    created,
    {
      ...created.draft,
      paymentDueDate: options.paymentDueDate ?? "2026-10-31",
      paymentInstructions:
        options.paymentInstructions === undefined
          ? "Pay by the bank transfer named on this invoice."
          : options.paymentInstructions,
    },
    { updatedAt: "2026-10-10T10:00:00.000Z" },
  );
  return issueClientInvoice(ready, {
    invoiceNumber: "I-2026-0001",
    issuedAt: INVOICE_ISSUED_AT,
    updatedAt: INVOICE_ISSUED_AT,
    brand: options.brand ?? source.brand,
  });
}

function requireInvoiceSnapshot(
  invoice: ReturnType<typeof issueInvoice>,
): ClientInvoiceIssuedSnapshotV1 {
  const snapshot = invoice.issuedSnapshot;
  if (!snapshot) throw new Error("expected an issued invoice snapshot");
  return snapshot;
}

function stored(
  invoice: ReturnType<typeof issueInvoice>,
  extra: Partial<StoredClientInvoice> = {},
): StoredClientInvoice {
  return {
    ...invoice,
    requestedBy: USER_A,
    deletedAt: null,
    ...extra,
  };
}

function accessDeps(input: {
  licenseeAccountId: string;
  invoices: StoredClientInvoice[];
  requireMaster?: ClientInvoiceDeps["requireMaster"];
}): ClientInvoiceDeps {
  return {
    requireMaster:
      input.requireMaster ??
      (async () => ({
        licenseeAccountId: input.licenseeAccountId,
        masterUserId: USER_A,
      })),
    getInvoice: async (id, licenseeAccountId) => {
      const found = input.invoices.find((item) => item.id === id) ?? null;
      if (!found || found.licenseeAccountId !== licenseeAccountId) return null;
      return found;
    },
  } as ClientInvoiceDeps;
}

async function renderQuiet(snapshot: ClientInvoiceIssuedSnapshotV1) {
  return renderIssuedClientInvoicePdf(snapshot, {
    downloadLogo: async () => {
      throw new Error("live logo must not be read");
    },
  });
}

describe("client invoice PDF access", () => {
  it("requires an active master and returns only the issued snapshot", async () => {
    const invoice = stored(issueInvoice());
    const loaded = await loadIssuedClientInvoiceSnapshotForPdf({
      masterUserId: USER_A,
      invoiceId: INVOICE_ID,
      deps: accessDeps({ licenseeAccountId: LICENSEE_A, invoices: [invoice] }),
    });
    assert.equal(loaded.invoiceNumber, "I-2026-0001");
    assert.equal(loaded, invoice.issuedSnapshot);
    invoice.draft.projectTitle = "DRAFT_SHOULD_BE_ABSENT";
    const pdf = await renderQuiet(loaded);
    const text = extractPdfText(pdf);
    assert.equal(text.includes("DRAFT_SHOULD_BE_ABSENT"), false);
    assert.match(text, /Northwind portal/);
    await assert.rejects(
      () =>
        loadIssuedClientInvoiceSnapshotForPdf({
          masterUserId: USER_A,
          invoiceId: INVOICE_ID,
          deps: accessDeps({
            licenseeAccountId: LICENSEE_A,
            invoices: [invoice],
            requireMaster: async () => {
              throw licenseeAccessError("Master access is not active.");
            },
          }),
        }),
      (error: unknown) => error instanceof Error && error.name === "LicenseeAccessError",
    );
    const denied = clientInvoiceFailure(licenseeAccessError("Master access is not active."));
    assert.equal(denied.status, 403);
    assert.equal(denied.code, "LICENSEE_ACCESS_DENIED");
  });

  it("hides another licensee, a masked invoice, and a tampered snapshot", async () => {
    const owned = stored(issueInvoice());
    await assert.rejects(
      () =>
        loadIssuedClientInvoiceSnapshotForPdf({
          masterUserId: USER_A,
          invoiceId: INVOICE_ID,
          deps: accessDeps({
            licenseeAccountId: LICENSEE_A,
            invoices: [stored(issueInvoice(), { licenseeAccountId: LICENSEE_B })],
          }),
        }),
      (error: unknown) =>
        error instanceof ClientInvoiceOperationError && error.code === "NOT_FOUND",
    );
    await assert.rejects(
      () =>
        loadIssuedClientInvoiceSnapshotForPdf({
          masterUserId: USER_A,
          invoiceId: INVOICE_ID,
          deps: accessDeps({
            licenseeAccountId: LICENSEE_A,
            invoices: [stored(issueInvoice(), { deletedAt: "2026-10-10T12:00:00.000Z" })],
          }),
        }),
      (error: unknown) =>
        error instanceof ClientInvoiceOperationError && error.code === "NOT_FOUND",
    );
    const tampered = stored(issueInvoice());
    if (!tampered.issuedSnapshot) throw new Error("expected snapshot");
    tampered.issuedSnapshot = {
      ...tampered.issuedSnapshot,
      licenseeAccountId: LICENSEE_B,
    };
    await assert.rejects(
      () =>
        loadIssuedClientInvoiceSnapshotForPdf({
          masterUserId: USER_A,
          invoiceId: INVOICE_ID,
          deps: accessDeps({ licenseeAccountId: LICENSEE_A, invoices: [tampered] }),
        }),
      (error: unknown) =>
        error instanceof ClientInvoiceOperationError && error.code === "NOT_FOUND",
    );
    assert.equal(owned.issuedSnapshot?.licenseeAccountId, LICENSEE_A);
  });

  it("rejects a draft without rendering it", async () => {
    const quote = issueQuotation();
    const draft = createClientInvoiceFromIssuedQuote(requireQuoteSnapshot(quote), {
      id: INVOICE_ID,
      createdAt: "2026-10-10T09:00:00.000Z",
    });
    const failure = clientInvoiceFailure(clientInvoicePdfNotIssued());
    assert.equal(failure.status, 409);
    assert.equal(failure.code, "INVOICE_NOT_ISSUED");
    await assert.rejects(
      () =>
        loadIssuedClientInvoiceSnapshotForPdf({
          masterUserId: USER_A,
          invoiceId: INVOICE_ID,
          deps: accessDeps({
            licenseeAccountId: LICENSEE_A,
            invoices: [stored(draft as ReturnType<typeof issueInvoice>)],
          }),
        }),
      (error: unknown) =>
        error instanceof ClientInvoiceOperationError &&
        error.code === "INVOICE_NOT_ISSUED" &&
        error.httpStatus === 409,
    );
  });
});

describe("client invoice PDF document", () => {
  it("renders the frozen invoice and does not use quote validity as the due date", async () => {
    const invoice = issueInvoice();
    const snapshot = requireInvoiceSnapshot(invoice);
    const pdf = await renderQuiet(snapshot);
    const text = extractPdfText(pdf);
    const raw = pdf.toString("latin1");
    assert.match(pdf.subarray(0, 5).toString(), /^%PDF/);
    assert.match(text, /Invoice/);
    assert.match(text, /I-2026-0001/);
    assert.match(text, /Alpha Studio Ltd/);
    assert.match(text, /Alpha Studio/);
    assert.match(text, /12 Harbour Street/);
    assert.match(text, /billing@alpha\.example/);
    assert.match(text, /VAT MT12345678/);
    assert.match(text, /Northwind/);
    assert.match(text, /Casey Buyer/);
    assert.match(text, /4 Dock Lane/);
    assert.match(text, /Northwind portal/);
    assert.match(text, /Rebuild the client portal/);
    assert.match(text, /Brand identity system/);
    assert.match(text, /Billing: One-time/);
    assert.match(text, /Net 30 from the invoice issue date/);
    assert.match(text, /Pay by the bank transfer named on this invoice/);
    assert.match(text, /Source quotation/);
    assert.match(text, /Q-2026-0007/);
    const issueDate = formatClientQuotePdfValidUntil(snapshot.issueDate, "en");
    const dueDate = formatClientQuotePdfValidUntil(snapshot.paymentDueDate, "en");
    const quoteIssued = formatClientQuotePdfIssueDate(snapshot.sourceQuote.quoteIssuedAt, "en");
    const quoteValidity = formatClientQuotePdfValidUntil("2026-12-31", "en");
    assert.ok(text.includes(issueDate), issueDate);
    assert.ok(text.includes(dueDate), dueDate);
    assert.ok(text.includes(quoteIssued), quoteIssued);
    assert.notEqual(dueDate, quoteValidity);
    assert.equal(text.includes(quoteValidity), false);
    assert.equal(text.includes("Offer expires with the quotation."), false);
    assert.equal(text.includes("Method appendix"), false);
    assert.equal(text.includes("Quotation-only method."), false);
    assert.equal(text.includes("SECRET_ESTIMATE_CONTEXT"), false);
    assert.equal(raw.includes(ESTIMATE_ID), false);
    assert.equal(raw.includes(LICENSEE_A), false);
    assert.equal(raw.includes(ORG_ID), false);
    assert.equal(raw.includes("identity/logo"), false);
    assert.match(text, /Page 1 of 1/);
    assert.match(raw, /\/BaseFont \/Times-Bold/);
    assert.match(raw, new RegExp(pdfColor("#112233").replace(/\./g, "\\.")));
    assert.match(raw, new RegExp(pdfColor("#C2410C").replace(/\./g, "\\.")));
    assert.equal(raw.includes("validUntil"), false);
  });

  it("keeps authored text and localizes chrome in all six languages", async () => {
    const titles = new Set<string>();
    for (const language of ORGANIZATION_LANGUAGES) {
      const labels = clientInvoicePdfLabels(language);
      titles.add(labels.documentTitle);
      assert.equal(CLIENT_INVOICE_PDF_LABEL_KEYS.includes("paymentDueDate"), true);
      assert.equal(CLIENT_INVOICE_PDF_LABEL_KEYS.includes("validUntil" as "paymentDueDate"), false);
      const invoice = issueInvoice({
        contentLanguage: language,
        draft: quotationDraft({
          projectTitle: "Northwind portal stays in the author's words.",
          paymentTerms: { summary: "Author payment terms.", scheduleNote: null },
        }),
        paymentInstructions: "Author payment instructions.",
      });
      const text = extractPdfText(await renderQuiet(requireInvoiceSnapshot(invoice)));
      assert.match(text, new RegExp(labels.documentTitle));
      assert.match(text, new RegExp(labels.paymentDueDate));
      assert.match(text, new RegExp(labels.paymentInstructions));
      assert.match(text, new RegExp(labels.sourceQuote));
      assert.match(text, /Northwind portal stays in the author's words/);
      assert.match(text, /Author payment terms/);
      assert.match(text, /Author payment instructions/);
    }
    assert.equal(titles.size, ORGANIZATION_LANGUAGES.length);
  });

  it("presents tax and discount amounts from the frozen snapshot", async () => {
    const invoice = issueInvoice({
      draft: quotationDraft({
        discount: { kind: "percentage", ratePpm: 100_000 },
        tax: { kind: "percentage", ratePpm: 200_000, label: "VAT" },
      }),
    });
    const snapshot = requireInvoiceSnapshot(invoice);
    assert.equal(snapshot.totals.subtotalMinor, 10000);
    assert.equal(snapshot.totals.discountMinor, 1000);
    assert.equal(snapshot.totals.taxableMinor, 9000);
    assert.equal(snapshot.totals.taxMinor, 1800);
    assert.equal(snapshot.totals.totalMinor, 10800);
    const text = extractPdfText(await renderQuiet(snapshot));
    for (const amount of [10000, 1000, 9000, 1800, 10800]) {
      const formatted = formatClientQuotePdfMoney(amount, "USD", 2, "en");
      assert.ok(text.includes(formatted), formatted);
    }
    assert.match(text, /Discount/);
    assert.match(text, /Tax/);
    assert.match(text, /VAT/);
    assert.match(text, /Subtotal/);
    assert.match(text, /Taxable amount/);
  });

  it("prints separate totals for mixed billing frequencies", async () => {
    const invoice = issueInvoice({
      draft: quotationDraft({
        lineItems: [
          {
            id: "line-once",
            description: "Setup",
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 10000,
            lineTotalMinor: 1,
            billingFrequency: "one_time",
          },
          {
            id: "line-month",
            description: "Care plan",
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 25000,
            lineTotalMinor: 1,
            billingFrequency: "monthly",
          },
        ],
      }),
    });
    const snapshot = requireInvoiceSnapshot(invoice);
    const text = extractPdfText(await renderQuiet(snapshot));
    assert.match(text, /Billing: One-time/);
    assert.match(text, /Billing: Monthly/);
    assert.match(text, /Totals by billing frequency/);
    assert.match(text, /One-time total/);
    assert.match(text, /Monthly total/);
    assert.ok(text.includes(formatClientQuotePdfMoney(10000, "USD", 2, "en")));
    assert.ok(text.includes(formatClientQuotePdfMoney(25000, "USD", 2, "en")));
    assert.equal(text.includes(formatClientQuotePdfMoney(35000, "USD", 2, "en")), false);
    assert.equal(snapshot.totals.totalMinor, 10000);
  });

  it("renders a historical quotation as one-time and tolerates a pre-frequency snapshot", async () => {
    const historical = issueQuotation({
      currencyCode: "JPY",
      draft: quotationDraft({
        lineItems: [
          {
            id: "line-old",
            description: "Historical portal work",
            quantity: { coefficient: 1, scale: 0 },
            unitPriceMinor: 1500,
            lineTotalMinor: 9,
          },
        ],
      }),
    });
    const source = requireQuoteSnapshot(historical);
    delete source.frequencyTotals;
    for (const line of source.lineItems) delete line.billingFrequency;
    const invoice = issueInvoice({
      quote: historical,
      currencyCode: "JPY",
      paymentDueDate: "2026-10-31",
    });
    const snapshot = requireInvoiceSnapshot(invoice);
    assert.equal(snapshot.currencyCode, "JPY");
    assert.equal(snapshot.currencyScale, 0);
    assert.deepEqual(
      snapshot.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time"],
    );
    const text = extractPdfText(await renderQuiet(snapshot));
    assert.match(text, /Historical portal work/);
    assert.match(text, /Billing: One-time/);
    assert.equal(text.includes("Totals by billing frequency"), false);
    assert.ok(text.includes(formatClientQuotePdfMoney(1500, "JPY", 0, "en")));
    assert.equal(text.includes("Offer expires with the quotation."), false);
    assert.equal(text.includes(formatClientQuotePdfValidUntil("2026-12-31", "en")), false);

    const legacy = structuredClone(snapshot);
    delete (legacy as { frequencyTotals?: unknown }).frequencyTotals;
    for (const line of legacy.lineItems) delete line.billingFrequency;
    legacy.totals = {
      subtotalMinor: 4242,
      discountMinor: 0,
      taxableMinor: 4242,
      taxMinor: 0,
      totalMinor: 4242,
    };
    legacy.lineItems[0].unitPriceMinor = 4242;
    legacy.lineItems[0].lineTotalMinor = 4242;
    const legacyText = extractPdfText(await renderQuiet(legacy));
    assert.equal(legacyText.includes("Totals by billing frequency"), false);
    assert.equal(legacyText.includes("Billing:"), false);
    assert.ok(legacyText.includes(formatClientQuotePdfMoney(4242, "JPY", 0, "en")));
    assert.equal(legacyText.includes(formatClientQuotePdfMoney(1500, "JPY", 0, "en")), false);
  });

  it("embeds a hashed quote-owned logo and omits live or unusable art", async () => {
    const logoPath = `quotes/${QUOTE_ID}/logo/PRIVATE_LOGO_PATH.png`;
    const brand: ClientQuoteIssuedBrandSnapshot = {
      primaryColor: "#112233",
      secondaryColor: null,
      accentColor: "#C2410C",
      backgroundColor: null,
      font: "times_new_roman",
      logo: {
        storagePath: logoPath,
        mimeType: "image/png",
        contentHash: sha256(PNG),
      },
    };
    const calls: string[] = [];
    const pngPdf = await renderIssuedClientInvoicePdf(requireInvoiceSnapshot(issueInvoice({ brand })), {
      downloadLogo: async (storagePath) => {
        calls.push(storagePath);
        return { bytes: PNG, mimeType: "image/png" };
      },
    });
    assert.deepEqual(calls, [logoPath]);
    const pngRaw = pngPdf.toString("latin1");
    assert.match(pngRaw, /\/Subtype \/Image/);
    assert.equal(pngRaw.includes("PRIVATE_LOGO_PATH"), false);
    assert.equal(pngRaw.includes(LICENSEE_A), false);
    assert.match(extractPdfText(pngPdf), /Alpha Studio Ltd/);
    assert.match(pngRaw, new RegExp(pdfColor("#112233").replace(/\./g, "\\.")));

    const webp = await renderIssuedClientInvoicePdf(
      requireInvoiceSnapshot(
        issueInvoice({
          brand: {
            ...brand,
            logo: {
              storagePath: `quotes/${QUOTE_ID}/logo/mark.webp`,
              mimeType: "image/webp",
              contentHash: sha256(WEBP),
            },
          },
        }),
      ),
      {
        downloadLogo: async () => ({ bytes: WEBP, mimeType: "image/webp" }),
      },
    );
    assert.equal(webp.toString("latin1").includes("/Subtype /Image"), false);
    assert.match(extractPdfText(webp), /Alpha Studio Ltd/);

    let mismatchedCalls = 0;
    const mismatched = await renderIssuedClientInvoicePdf(
      requireInvoiceSnapshot(issueInvoice({ brand })),
      {
        downloadLogo: async () => {
          mismatchedCalls += 1;
          return { bytes: Buffer.from("not-the-hashed-png"), mimeType: "image/png" };
        },
      },
    );
    assert.equal(mismatchedCalls, 1);
    assert.equal(mismatched.toString("latin1").includes("/Subtype /Image"), false);

    const escaped = await renderIssuedClientInvoicePdf(
      requireInvoiceSnapshot(
        issueInvoice({
          brand: {
            ...brand,
            logo: {
              storagePath: "identity/logo/live.png",
              mimeType: "image/png",
              contentHash: sha256(PNG),
            },
          },
        }),
      ),
      {
        downloadLogo: async () => {
          throw new Error("live organization logo must not be downloaded");
        },
      },
    );
    assert.equal(escaped.toString("latin1").includes("/Subtype /Image"), false);
    assert.match(extractPdfText(escaped), /Invoice/);

    const bare = structuredClone(requireInvoiceSnapshot(issueInvoice()));
    delete (bare as { brand?: unknown }).brand;
    let bareCalls = 0;
    const barePdf = await renderIssuedClientInvoicePdf(bare, {
      downloadLogo: async () => {
        bareCalls += 1;
        throw new Error("missing brand must not download a logo");
      },
    });
    assert.equal(bareCalls, 0);
    assert.match(barePdf.toString("latin1"), /\/BaseFont \/Helvetica-Bold/);
    assert.match(
      barePdf.toString("latin1"),
      new RegExp(pdfColor("#E36A1E").replace(/\./g, "\\.")),
    );
  });
});

describe("client invoice PDF download contract", () => {
  it("builds a safe attachment filename and no-store headers", () => {
    const filename = buildClientInvoicePdfFilename({
      invoiceNumber: "I-2026-0007",
      issueDate: "2026-10-10",
    });
    assert.equal(filename, "invoice-i-2026-0007-2026-10-10.pdf");
    assert.equal(isSafeClientInvoicePdfFilename(filename), true);
    assert.equal(isSafeClientInvoicePdfFilename('invoice"\r\n.pdf'), false);
    assert.equal(
      buildClientInvoicePdfFilename({
        invoiceNumber: "../secret",
        issueDate: "2026-10-10",
      }),
      "invoice-secret-2026-10-10.pdf",
    );
    const headers = clientInvoicePdfDownloadHeaders(filename);
    assert.equal(headers["Content-Type"], "application/pdf");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(
      headers["Content-Disposition"],
      'attachment; filename="invoice-i-2026-0007-2026-10-10.pdf"',
    );
    assert.equal(
      parseClientInvoicePdfContentDisposition(headers["Content-Disposition"]),
      filename,
    );
    assert.equal(
      parseClientInvoicePdfContentDisposition('attachment; filename="../secret.pdf"'),
      null,
    );
  });

  it("keeps the route on the issued snapshot", () => {
    const route = read("app/api/licensee/invoices/[id]/pdf/route.ts");
    const renderer = read("services/clientInvoice/pdf/renderClientInvoicePdf.ts");
    const access = read("services/clientInvoice/pdf/clientInvoicePdfAccess.ts");
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /loadIssuedClientInvoiceSnapshotForPdf/);
    assert.match(route, /renderIssuedClientInvoicePdf/);
    assert.match(route, /clientInvoicePdfDownloadHeaders/);
    assert.match(route, /CLIENT_INVOICE_PDF_FAILED/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /Cache-Control": "no-store"/);
    assert.match(route, /createSupabaseServerClient/);
    assert.doesNotMatch(route, /toPublicClientInvoice|draft_json|getOrganization|brand_logo_storage_path/);
    assert.doesNotMatch(renderer, /getOrganization|brand_logo_storage_path|athena_estimates|calculateClientQuote/);
    assert.doesNotMatch(renderer, /organizations/);
    assert.match(renderer, /clientQuotePdfFrequencyGroups/);
    assert.match(renderer, /resolveClientQuotePdfLogo/);
    assert.match(renderer, /resolveClientQuotePdfTheme/);
    assert.match(access, /clientInvoicePdfNotIssued/);
    assert.match(access, /issuedSnapshot/);
    assert.doesNotMatch(access, /brand_primary_color|getOrganization/);
  });
});
