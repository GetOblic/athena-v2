/**
 * EST-QUOTE-1C.5 — issued client quotation PDF.
 * In-memory fixtures only. No live Supabase, worker, or model calls.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import { clientQuoteFailure } from "../../services/clientQuote/clientQuoteHttp";
import { ClientQuoteOperationError } from "../../services/clientQuote/clientQuoteErrors";
import type { ClientQuoteDeps } from "../../services/clientQuote/clientQuoteDeps";
import { loadIssuedClientQuoteSnapshotForPdf } from "../../services/clientQuote/pdf/clientQuotePdfAccess";
import { localizeClientQuoteSystemAppendixHeading } from "../../services/clientQuote/pdf/clientQuotePdfAppendixHeadings";
import {
  formatClientQuotePdfIssueDate,
  formatClientQuotePdfMoney,
  formatClientQuotePdfValidUntil,
} from "../../services/clientQuote/pdf/clientQuotePdfFormat";
import {
  buildClientQuotePdfFilename,
  clientQuotePdfDownloadHeaders,
  isSafeClientQuotePdfFilename,
  parseClientQuotePdfContentDisposition,
} from "../../services/clientQuote/pdf/clientQuotePdfFilename";
import {
  CLIENT_QUOTE_PDF_LABEL_KEYS,
  clientQuotePdfLabels,
} from "../../services/clientQuote/pdf/clientQuotePdfLabels";
import {
  clientQuotePdfLogoHashMatches,
  resolveClientQuotePdfLogo,
} from "../../services/clientQuote/pdf/clientQuotePdfLogo";
import { resolveClientQuotePdfTheme } from "../../services/clientQuote/pdf/clientQuotePdfTheme";
import {
  clientQuotePdfShouldAdvance,
  renderIssuedClientQuotePdf,
} from "../../services/clientQuote/pdf/renderClientQuotePdf";
import { CLIENT_QUOTE_APPENDIX_HEADINGS } from "../../services/clientQuote/clientQuoteSeed";
import {
  ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
  ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK,
} from "../../services/estimate/estimatePackageNormalization";
import {
  CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
  CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
  emptyClientQuotePostalAddress,
  type AthenaClientQuote,
  type ClientQuoteIssuedSnapshotV1,
  type ClientQuoteLineItem,
} from "../../services/clientQuote/clientQuoteTypes";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

function licenseeAccessError(message: string): Error {
  const error = new Error(message);
  error.name = "LicenseeAccessError";
  return error;
}

const ROOT = process.cwd();
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LICENSEE_A = "22222222-2222-4222-8222-222222222222";
const LICENSEE_B = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "44444444-4444-4444-8444-444444444444";
const ESTIMATE_ID = "55555555-5555-4555-8555-555555555555";
const USER_A = "66666666-6666-4666-8666-666666666666";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
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

function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

type Span = { page: number; y: number; text: string };

function extractPdfSpans(pdf: Buffer): Span[] {
  const raw = pdf.toString("latin1");
  const spans: Span[] = [];
  let page = 0;
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    if (!stream[1].includes("BT")) continue;
    page += 1;
    for (const block of stream[1].matchAll(/BT([\s\S]*?)ET/g)) {
      const tm = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/.exec(block[1]);
      let text = "";
      for (const hex of block[1].matchAll(/<([0-9A-Fa-f]*)>/g)) {
        if (hex[1].length % 2 === 0) text += decodeWinAnsi(hex[1]);
      }
      if (text) {
        spans.push({ page, y: tm ? Number(tm[2]) : 0, text });
      }
    }
  }
  return spans;
}

function line(description: string, unit = 10000, quantity = 1): ClientQuoteLineItem {
  return {
    id: `line-${description.slice(0, 12)}`,
    description,
    quantity: { coefficient: quantity, scale: 0 },
    unitPriceMinor: unit,
    lineTotalMinor: unit * quantity,
  };
}

function snapshot(
  overrides: Partial<ClientQuoteIssuedSnapshotV1> = {},
): ClientQuoteIssuedSnapshotV1 {
  const base: ClientQuoteIssuedSnapshotV1 = {
    schemaVersion: CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
    quoteId: QUOTE_ID,
    licenseeAccountId: LICENSEE_A,
    organizationId: ORG_ID,
    quoteNumber: "Q-2026-0007",
    issuedAt: "2026-10-09T15:04:05.000Z",
    contentLanguage: "en",
    currencyCode: "USD",
    currencyScale: 2,
    sourceEstimate: {
      schemaVersion: CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
      estimateId: ESTIMATE_ID,
      organizationId: ORG_ID,
      organizationNameSnapshot: "SECRET_ESTIMATE_CONTEXT",
      estimateSchemaVersion: "estimate_v1",
      currencyCode: "USD",
      recommendedClientPriceMinor: 1,
    },
    revisedFromQuoteId: null,
    issuer: {
      legalName: "Alpha Studio Ltd",
      tradingName: "Alpha Studio",
      postalAddress: {
        ...emptyClientQuotePostalAddress(),
        line1: "12 Harbour Street",
        city: "Valletta",
        postalCode: "VLT 1117",
        country: "Malta",
      },
      phone: "+356 2100 0000",
      email: "billing@alpha.example",
      website: "https://alpha.example",
      registrationNumber: "C-100",
      taxIdentifier: "MT12345678",
      taxIdentifierLabel: "VAT",
      contactName: "Alex Issuer",
      jobTitle: "Director",
      additionalNote: null,
    },
    customer: {
      name: "Northwind",
      contactName: "Casey Buyer",
      jobTitle: "Operations",
      postalAddress: {
        ...emptyClientQuotePostalAddress(),
        line1: "4 Dock Lane",
        city: "Lisbon",
        country: "Portugal",
      },
      phone: "+351 210 000 000",
      email: "ap@northwind.example",
      taxIdentifier: "PT500000000",
    },
    brand: {
      primaryColor: "#112233",
      secondaryColor: "#445566",
      accentColor: "#C2410C",
      backgroundColor: null,
      font: "georgia",
      logo: null,
    },
    projectTitle: "Northwind portal",
    scopeSummary: "A concise client scope for the portal engagement.",
    lineItems: [line("Brand identity system", 150000, 2)],
    paymentTerms: {
      summary: "50% to begin and 50% on delivery.",
      scheduleNote: "Invoices follow each milestone.",
    },
    validity: {
      validForDays: 30,
      validUntil: "2026-11-08",
      note: "Prices stay fixed through the validity date.",
    },
    appendix: { enabled: false, sections: [] },
    discount: { kind: "fixed", amountMinor: 10000 },
    tax: { kind: "percentage", ratePpm: 100000, label: "VAT" },
    totals: {
      subtotalMinor: 300000,
      discountMinor: 10000,
      taxableMinor: 290000,
      taxMinor: 29000,
      totalMinor: 319000,
    },
  };
  return {
    ...base,
    ...overrides,
    issuer: { ...base.issuer, ...overrides.issuer },
    customer: { ...base.customer, ...overrides.customer },
    brand: { ...base.brand, ...overrides.brand },
    paymentTerms: { ...base.paymentTerms, ...overrides.paymentTerms },
    validity: { ...base.validity, ...overrides.validity },
    appendix: overrides.appendix ?? base.appendix,
    totals: overrides.totals ?? base.totals,
    lineItems: overrides.lineItems ?? base.lineItems,
  };
}

function quoteRow(
  issued: ClientQuoteIssuedSnapshotV1 | null,
  overrides: Partial<AthenaClientQuote> = {},
): AthenaClientQuote {
  return {
    id: issued?.quoteId ?? QUOTE_ID,
    licensee_account_id: issued?.licenseeAccountId ?? LICENSEE_A,
    organization_id: ORG_ID,
    requested_by: USER_A,
    source_estimate_id: ESTIMATE_ID,
    source_estimate_snapshot: issued?.sourceEstimate ?? null,
    revised_from_quote_id: null,
    status: issued ? "issued" : "draft",
    content_language: issued?.contentLanguage ?? "en",
    currency_code: issued?.currencyCode ?? "USD",
    draft_json: {} as AthenaClientQuote["draft_json"],
    issued_snapshot_json: issued,
    quote_number: issued?.quoteNumber ?? null,
    issued_at: issued?.issuedAt ?? null,
    deleted_at: null,
    created_at: "2026-10-09T15:04:05.000Z",
    updated_at: "2026-10-09T15:04:05.000Z",
    ...overrides,
  };
}

function deps(input: {
  licenseeAccountId: string;
  quotes: AthenaClientQuote[];
  requireMaster?: ClientQuoteDeps["requireMaster"];
}): ClientQuoteDeps {
  return {
    requireMaster:
      input.requireMaster ??
      (async () => ({
        licenseeAccountId: input.licenseeAccountId,
        masterUserId: USER_A,
        defaultLanguage: "en",
        ownCompanyOrganizationId: null,
      })),
    getQuote: async (id, licenseeAccountId) => {
      const found = input.quotes.find((item) => item.id === id) ?? null;
      if (!found || found.licensee_account_id !== licenseeAccountId) return null;
      return found;
    },
  } as ClientQuoteDeps;
}

function blankAddress() {
  return {
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  };
}

describe("client quotation PDF access", () => {
  it("requires an active master and returns only the issued snapshot", async () => {
    const issued = snapshot();
    const loaded = await loadIssuedClientQuoteSnapshotForPdf({
      masterUserId: USER_A,
      quoteId: QUOTE_ID,
      deps: deps({ licenseeAccountId: LICENSEE_A, quotes: [quoteRow(issued)] }),
    });
    assert.equal(loaded.quoteNumber, "Q-2026-0007");
    assert.equal(loaded.issuer.legalName, "Alpha Studio Ltd");
    await assert.rejects(
      () =>
        loadIssuedClientQuoteSnapshotForPdf({
          masterUserId: USER_A,
          quoteId: QUOTE_ID,
          deps: deps({
            licenseeAccountId: LICENSEE_A,
            quotes: [],
            requireMaster: async () => {
              throw licenseeAccessError("Master access is not active.");
            },
          }),
        }),
      (error: unknown) => error instanceof Error && error.name === "LicenseeAccessError",
    );
    const denied = clientQuoteFailure(licenseeAccessError("Master access is not active."));
    assert.equal(denied.status, 403);
    assert.equal(denied.code, "LICENSEE_ACCESS_DENIED");
  });

  it("denies another licensee without disclosing the quotation", async () => {
    const issued = snapshot();
    await assert.rejects(
      () =>
        loadIssuedClientQuoteSnapshotForPdf({
          masterUserId: USER_A,
          quoteId: QUOTE_ID,
          deps: deps({
            licenseeAccountId: LICENSEE_A,
            quotes: [quoteRow(issued, { licensee_account_id: LICENSEE_B })],
          }),
        }),
      (error: unknown) =>
        error instanceof ClientQuoteOperationError && error.code === "NOT_FOUND",
    );
    const mismatched = snapshot({ licenseeAccountId: LICENSEE_B });
    await assert.rejects(
      () =>
        loadIssuedClientQuoteSnapshotForPdf({
          masterUserId: USER_A,
          quoteId: QUOTE_ID,
          deps: deps({
            licenseeAccountId: LICENSEE_A,
            quotes: [
              quoteRow(mismatched, {
                licensee_account_id: LICENSEE_A,
                id: QUOTE_ID,
              }),
            ],
          }),
        }),
      (error: unknown) =>
        error instanceof ClientQuoteOperationError && error.code === "NOT_FOUND",
    );
  });

  it("hides a masked quotation from PDF download", async () => {
    const issued = snapshot();
    await assert.rejects(
      () =>
        loadIssuedClientQuoteSnapshotForPdf({
          masterUserId: USER_A,
          quoteId: QUOTE_ID,
          deps: deps({
            licenseeAccountId: LICENSEE_A,
            quotes: [
              quoteRow(issued, { deleted_at: "2026-10-09T16:00:00.000Z" }),
            ],
          }),
        }),
      (error: unknown) =>
        error instanceof ClientQuoteOperationError && error.code === "NOT_FOUND",
    );
  });

  it("rejects a draft and a missing snapshot", async () => {
    await assert.rejects(
      () =>
        loadIssuedClientQuoteSnapshotForPdf({
          masterUserId: USER_A,
          quoteId: QUOTE_ID,
          deps: deps({ licenseeAccountId: LICENSEE_A, quotes: [quoteRow(null)] }),
        }),
      (error: unknown) =>
        error instanceof ClientQuoteOperationError && error.code === "QUOTE_NOT_ISSUED",
    );
  });
});

describe("client quotation PDF document", () => {
  it("renders frozen identity, pricing, dates, and hides estimate context", async () => {
    const issued = snapshot();
    const pdf = await renderIssuedClientQuotePdf(issued, {
      downloadLogo: async () => {
        throw new Error("live logo must not be read");
      },
    });
    const text = extractPdfText(pdf);
    assert.match(pdf.subarray(0, 5).toString(), /^%PDF/);
    assert.match(text, /Quotation/);
    assert.match(text, /Q-2026-0007/);
    assert.match(text, /Alpha Studio Ltd/);
    assert.match(text, /Alpha Studio/);
    assert.match(text, /12 Harbour Street/);
    assert.match(text, /billing@alpha\.example/);
    assert.match(text, /VAT MT12345678/);
    assert.match(text, /Northwind/);
    assert.match(text, /Casey Buyer/);
    assert.match(text, /4 Dock Lane/);
    assert.match(text, /Northwind portal/);
    assert.match(text, /concise client scope/);
    assert.match(text, /Brand identity system/);
    assert.match(text, /50% to begin/);
    assert.match(text, /Invoices follow each milestone/);
    assert.match(text, /Prices stay fixed/);
    assert.match(text, /Prepared by/);
    assert.match(text, /Prepared for/);
    const issueDate = formatClientQuotePdfIssueDate(issued.issuedAt, "en");
    const validUntil = formatClientQuotePdfValidUntil("2026-11-08", "en");
    assert.ok(text.includes(issueDate), issueDate);
    assert.ok(text.includes(validUntil), validUntil);
    for (const amount of [300000, 10000, 290000, 29000, 319000, 150000]) {
      const formatted = formatClientQuotePdfMoney(amount, "USD", 2, "en");
      assert.ok(text.includes(formatted), formatted);
    }
    assert.equal(text.includes("SECRET_ESTIMATE_CONTEXT"), false);
    assert.equal(pdf.toString("latin1").includes(ESTIMATE_ID), false);
    assert.equal(pdf.toString("latin1").includes(LICENSEE_A), false);
    assert.equal(pdf.toString("latin1").includes(ORG_ID), false);
    assert.equal(pdf.toString("latin1").includes("identity/logo"), false);
    assert.match(text, /Page 1 of 1/);
    assert.match(pdf.toString("latin1"), /\/BaseFont \/Times-Bold/);
    assert.match(pdf.toString("latin1"), new RegExp(pdfColor("#112233").replace(/\./g, "\\.")));
    assert.match(pdf.toString("latin1"), new RegExp(pdfColor("#C2410C").replace(/\./g, "\\.")));
  });

  it("localizes chrome in all six languages and keeps authored text", async () => {
    const narrative = "Northwind portal stays in the author's words.";
    for (const language of ORGANIZATION_LANGUAGES) {
      const labels = clientQuotePdfLabels(language);
      assert.deepEqual(Object.keys(labels).sort(), [...CLIENT_QUOTE_PDF_LABEL_KEYS].sort());
      const pdf = await renderIssuedClientQuotePdf(
        snapshot({
          contentLanguage: language,
          projectTitle: narrative,
          scopeSummary: narrative,
        }),
        { downloadLogo: async () => null },
      );
      const text = extractPdfText(pdf);
      assert.ok(text.includes(labels.documentTitle), language);
      assert.ok(text.includes(labels.preparedFor), language);
      assert.ok(text.includes(labels.total), language);
      assert.ok(text.includes(labels.paymentTerms), language);
      assert.ok(text.includes(narrative), language);
      if (language !== "en") {
        assert.equal(text.includes("Prepared for"), false, language);
        assert.equal(text.includes("Quotation"), false, language);
      }
    }
  });

  it("formats currency scales 0, 2, and 3 from the snapshot", () => {
    assert.match(formatClientQuotePdfMoney(123456, "USD", 2, "en"), /1,234\.56/);
    assert.match(formatClientQuotePdfMoney(1500, "JPY", 0, "en"), /1,500/);
    assert.doesNotMatch(formatClientQuotePdfMoney(1500, "JPY", 0, "en"), /\.\d/);
    assert.match(formatClientQuotePdfMoney(1234567, "KWD", 3, "en"), /1,234\.567/);
    const french = formatClientQuotePdfMoney(123456, "EUR", 2, "fr");
    assert.match(french, /1 234,56/);
  });

  it("embeds scaled totals for yen and dinar snapshots", async () => {
    const yen = await renderIssuedClientQuotePdf(
      snapshot({
        currencyCode: "JPY",
        currencyScale: 0,
        lineItems: [line("Yen retainer", 1500, 1)],
        discount: { kind: "none" },
        tax: { kind: "none" },
        totals: {
          subtotalMinor: 1500,
          discountMinor: 0,
          taxableMinor: 1500,
          taxMinor: 0,
          totalMinor: 1500,
        },
      }),
      { downloadLogo: async () => null },
    );
    const yenText = extractPdfText(yen);
    assert.ok(yenText.includes(formatClientQuotePdfMoney(1500, "JPY", 0, "en")));
    assert.equal(yenText.includes("15.00"), false);

    const dinar = await renderIssuedClientQuotePdf(
      snapshot({
        currencyCode: "KWD",
        currencyScale: 3,
        lineItems: [line("Dinar retainer", 1234567, 1)],
        discount: { kind: "none" },
        tax: { kind: "none" },
        totals: {
          subtotalMinor: 1234567,
          discountMinor: 0,
          taxableMinor: 1234567,
          taxMinor: 0,
          totalMinor: 1234567,
        },
      }),
      { downloadLogo: async () => null },
    );
    assert.ok(
      extractPdfText(dinar).includes(formatClientQuotePdfMoney(1234567, "KWD", 3, "en")),
    );
  });

  it("paginates long descriptions and keeps an appendix heading with its text", async () => {
    const description = `LONG_START ${"detailed delivery language ".repeat(18)} LONG_END`;
    const lines = Array.from({ length: 18 }, (_, index) =>
      line(index === 0 ? description : `Service line ${index + 1}`, 5000, 1),
    );
    const subtotal = lines.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const pdf = await renderIssuedClientQuotePdf(
      snapshot({
        lineItems: lines,
        discount: { kind: "none" },
        tax: { kind: "none" },
        totals: {
          subtotalMinor: subtotal,
          discountMinor: 0,
          taxableMinor: subtotal,
          taxMinor: 0,
          totalMinor: subtotal,
        },
        appendix: {
          enabled: true,
          sections: [
            {
              heading: "APPENDIX_HEADING_KEEP",
              body: "APPENDIX_BODY_KEEP explains the saved section without new promises.",
            },
          ],
        },
      }),
      { downloadLogo: async () => null },
    );
    const text = extractPdfText(pdf);
    assert.ok(pdfPageCount(pdf) >= 2);
    assert.match(text, /LONG_START/);
    assert.match(text, /LONG_END/);
    assert.match(text, /APPENDIX_HEADING_KEEP/);
    assert.match(text, /APPENDIX_BODY_KEEP/);
    assert.match(text, /Page 2 of /);
    const spans = extractPdfSpans(pdf);
    const heading = spans.find((span) => span.text.includes("APPENDIX_HEADING_KEEP"));
    const body = spans.find((span) => span.text.includes("APPENDIX_BODY_KEEP"));
    assert.ok(heading);
    assert.ok(body);
    assert.equal(heading?.page, body?.page);
    assert.ok((body?.y ?? 0) < (heading?.y ?? 0));
  });

  it("omits a disabled appendix and renders an enabled one", async () => {
    const hidden = await renderIssuedClientQuotePdf(
      snapshot({
        appendix: {
          enabled: false,
          sections: [{ heading: "APPENDIX_SHOULD_BE_ABSENT", body: "Hidden body" }],
        },
      }),
      { downloadLogo: async () => null },
    );
    assert.equal(extractPdfText(hidden).includes("APPENDIX_SHOULD_BE_ABSENT"), false);
    assert.equal(extractPdfText(hidden).includes("Hidden body"), false);

    const shown = await renderIssuedClientQuotePdf(
      snapshot({
        appendix: {
          enabled: true,
          sections: [
            { heading: "Delivery notes", body: "Saved appendix paragraph one." },
            {
              heading: "Assumptions",
              body: `APPENDIX_LONG ${"assumption text ".repeat(80)}`,
            },
          ],
        },
      }),
      { downloadLogo: async () => null },
    );
    const shownText = extractPdfText(shown);
    assert.match(shownText, /Appendix/);
    assert.match(shownText, /Delivery notes/);
    assert.match(shownText, /Saved appendix paragraph one/);
    assert.match(shownText, /APPENDIX_LONG/);
    assert.ok(pdfPageCount(shown) >= 2);
  });

  it("localizes seeded appendix headings in six languages and keeps custom headings", async () => {
    const expected: Record<
      OrganizationLanguage,
      Record<keyof typeof CLIENT_QUOTE_APPENDIX_HEADINGS, string>
    > = {
      en: { ...CLIENT_QUOTE_APPENDIX_HEADINGS },
      fr: {
        scope: "Interprétation du périmètre",
        pricingRationale: "Justification tarifaire",
        positioning: "Positionnement suggéré",
        drivers: "Principaux leviers de prix",
        risks: "Risques et hypothèses",
        guidance: "Orientation",
      },
      es: {
        scope: "Interpretación del alcance",
        pricingRationale: "Justificación del precio",
        positioning: "Posicionamiento sugerido",
        drivers: "Principales factores de precio",
        risks: "Riesgos e hipótesis",
        guidance: "Orientación",
      },
      it: {
        scope: "Interpretazione del perimetro",
        pricingRationale: "Motivazione del prezzo",
        positioning: "Posizionamento suggerito",
        drivers: "Principali leve di prezzo",
        risks: "Rischi e ipotesi",
        guidance: "Orientamento",
      },
      de: {
        scope: "Interpretation des Umfangs",
        pricingRationale: "Preisbegründung",
        positioning: "Vorgeschlagene Positionierung",
        drivers: "Wesentliche Preistreiber",
        risks: "Risiken und Annahmen",
        guidance: "Hinweise",
      },
      pt: {
        scope: "Interpretação do âmbito",
        pricingRationale: "Justificação do preço",
        positioning: "Posicionamento sugerido",
        drivers: "Principais fatores de preço",
        risks: "Riscos e hipóteses",
        guidance: "Orientação",
      },
    };
    const keys = Object.keys(CLIENT_QUOTE_APPENDIX_HEADINGS) as Array<
      keyof typeof CLIENT_QUOTE_APPENDIX_HEADINGS
    >;
    const customHeading = "Client authored delivery notes";
    const customBody = "CUSTOM_APPENDIX_BODY stays in the author's words.";

    for (const language of ORGANIZATION_LANGUAGES) {
      for (const key of keys) {
        assert.equal(
          localizeClientQuoteSystemAppendixHeading(
            CLIENT_QUOTE_APPENDIX_HEADINGS[key],
            language,
          ),
          expected[language][key],
          `${language} ${key}`,
        );
      }
      assert.equal(
        localizeClientQuoteSystemAppendixHeading(customHeading, language),
        customHeading,
      );
      assert.equal(
        localizeClientQuoteSystemAppendixHeading("Scope interpretation notes", language),
        "Scope interpretation notes",
      );
      assert.equal(
        localizeClientQuoteSystemAppendixHeading("scope interpretation", language),
        "scope interpretation",
      );
      assert.equal(
        localizeClientQuoteSystemAppendixHeading(customBody, language),
        customBody,
      );

      const issued = snapshot({
        contentLanguage: language,
        appendix: {
          enabled: true,
          sections: [
            ...keys.map((key) => ({
              heading: CLIENT_QUOTE_APPENDIX_HEADINGS[key],
              body: `NARRATIVE_${key}_UNCHANGED`,
            })),
            { heading: customHeading, body: customBody },
          ],
        },
      });
      const storedAppendix = structuredClone(issued.appendix);
      const pdf = await renderIssuedClientQuotePdf(issued, {
        downloadLogo: async () => null,
      });
      assert.deepEqual(issued.appendix, storedAppendix);
      const text = extractPdfText(pdf);
      for (const key of keys) {
        assert.ok(text.includes(expected[language][key]), `${language} ${key}`);
        assert.ok(text.includes(`NARRATIVE_${key}_UNCHANGED`), `${language} ${key}`);
        if (language !== "en") {
          assert.equal(
            text.includes(CLIENT_QUOTE_APPENDIX_HEADINGS[key]),
            false,
            `${language} ${key}`,
          );
        }
      }
      assert.ok(text.includes(customHeading), language);
      assert.ok(text.includes(customBody), language);
    }

    assert.equal(
      localizeClientQuoteSystemAppendixHeading(
        CLIENT_QUOTE_APPENDIX_HEADINGS.scope,
        "zz",
      ),
      CLIENT_QUOTE_APPENDIX_HEADINGS.scope,
    );
  });

  it("omits the known Estimate guidance disclaimer and keeps other appendix text", async () => {
    const customHeading = "Client authored delivery notes";
    const customBody =
      "CUSTOM_NOTE mentions AI-assisted estimate guidance and a disclaimer, but it is commercial.";
    const authoredGuidance = "Client-authored orientation for the engagement.";
    const issued = snapshot({
      contentLanguage: "fr",
      appendix: {
        enabled: true,
        sections: [
          {
            heading: CLIENT_QUOTE_APPENDIX_HEADINGS.pricingRationale,
            body: "PRICING_STAYS",
          },
          {
            heading: CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
            body: `  ${ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED}  `,
          },
          {
            heading: CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
            body: ESTIMATE_GUIDANCE_DISCLAIMER_FALLBACK,
          },
          {
            heading: CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
            body: authoredGuidance,
          },
          { heading: customHeading, body: customBody },
        ],
      },
    });
    const stored = structuredClone(issued);
    const pdf = await renderIssuedClientQuotePdf(issued, {
      downloadLogo: async () => null,
    });
    assert.deepEqual(issued, stored);
    const text = extractPdfText(pdf);
    assert.match(text, /Annexe/);
    assert.match(text, /Justification tarifaire/);
    assert.match(text, /PRICING_STAYS/);
    assert.match(text, /Orientation/);
    assert.match(text, new RegExp(authoredGuidance));
    assert.match(text, new RegExp(customHeading));
    assert.match(text, /CUSTOM_NOTE/);
    assert.equal(text.includes(ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED), false);
    assert.equal(text.includes("not a binding quote or invoice"), false);
    assert.equal(text.includes("fallback guidance"), false);
    assert.equal(text.includes("AI-assisted commercial guidance"), false);

    const onlyDisclaimer = snapshot({
      appendix: {
        enabled: true,
        sections: [
          {
            heading: CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
            body: ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
          },
        ],
      },
    });
    const hidden = await renderIssuedClientQuotePdf(onlyDisclaimer, {
      downloadLogo: async () => null,
    });
    const hiddenText = extractPdfText(hidden);
    assert.equal(hiddenText.includes("Appendix"), false);
    assert.equal(hiddenText.includes(ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED), false);
    assert.deepEqual(onlyDisclaimer.appendix.sections, [
      {
        heading: CLIENT_QUOTE_APPENDIX_HEADINGS.guidance,
        body: ESTIMATE_GUIDANCE_DISCLAIMER_DERIVED,
      },
    ]);
  });

  it("falls back when brand color or font is missing", () => {
    const fallback = resolveClientQuotePdfTheme({
      primaryColor: null,
      secondaryColor: null,
      accentColor: "not-a-color",
      backgroundColor: "#FFFFFF",
      font: null,
      logo: null,
    });
    assert.equal(fallback.primary, "#1C1917");
    assert.equal(fallback.accent, "#E36A1E");
    assert.equal(fallback.fonts.regular, "Helvetica");
    assert.equal(fallback.fonts.bold, "Helvetica-Bold");
    const mono = resolveClientQuotePdfTheme({
      primaryColor: "#112233",
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      font: "geist_mono",
      logo: null,
    });
    assert.equal(mono.fonts.regular, "Courier");
    assert.equal(mono.accent, "#E36A1E");
    assert.equal(
      clientQuotePdfShouldAdvance({
        cursor: 700,
        bottom: 780,
        pageStart: 58,
        blockHeight: 90,
      }),
      true,
    );
    assert.equal(
      clientQuotePdfShouldAdvance({
        cursor: 58,
        bottom: 780,
        pageStart: 58,
        blockHeight: 90,
      }),
      false,
    );
  });
});

describe("client quotation PDF logo", () => {
  const logoPath = `quotes/${QUOTE_ID}/logo/PRIVATE_LOGO_PATH.png`;

  it("embeds a hashed PNG or JPEG and omits WebP, mismatches, and missing art", async () => {
    const calls: string[] = [];
    const pngPdf = await renderIssuedClientQuotePdf(
      snapshot({
        brand: {
          primaryColor: "#112233",
          secondaryColor: null,
          accentColor: null,
          backgroundColor: null,
          font: null,
          logo: {
            storagePath: logoPath,
            mimeType: "image/png",
            contentHash: sha256(PNG),
          },
        },
      }),
      {
        downloadLogo: async (storagePath) => {
          calls.push(storagePath);
          return { bytes: PNG, mimeType: "image/png" };
        },
      },
    );
    assert.deepEqual(calls, [logoPath]);
    assert.match(pngPdf.toString("latin1"), /\/Subtype \/Image/);
    assert.equal(pngPdf.toString("latin1").includes("PRIVATE_LOGO_PATH"), false);
    assert.match(extractPdfText(pngPdf), /Alpha Studio Ltd/);
    assert.match(pngPdf.toString("latin1"), /\/BaseFont \/Helvetica-Bold/);

    const jpegPdf = await renderIssuedClientQuotePdf(
      snapshot({
        brand: {
          primaryColor: null,
          secondaryColor: null,
          accentColor: null,
          backgroundColor: null,
          font: "times_new_roman",
          logo: {
            storagePath: `quotes/${QUOTE_ID}/logo/mark.jpg`,
            mimeType: "image/jpeg",
            contentHash: sha256(JPEG),
          },
        },
      }),
      {
        downloadLogo: async () => ({ bytes: JPEG, mimeType: "image/jpeg" }),
      },
    );
    assert.match(jpegPdf.toString("latin1"), /\/Subtype \/Image/);

    const webpCalls: string[] = [];
    const webpPdf = await renderIssuedClientQuotePdf(
      snapshot({
        brand: {
          primaryColor: null,
          secondaryColor: null,
          accentColor: null,
          backgroundColor: null,
          font: null,
          logo: {
            storagePath: `quotes/${QUOTE_ID}/logo/mark.webp`,
            mimeType: "image/webp",
            contentHash: sha256(WEBP),
          },
        },
      }),
      {
        downloadLogo: async (storagePath) => {
          webpCalls.push(storagePath);
          return { bytes: WEBP, mimeType: "image/webp" };
        },
      },
    );
    assert.equal(webpCalls.length, 1);
    assert.doesNotMatch(webpPdf.toString("latin1"), /\/Subtype \/Image/);
    assert.match(extractPdfText(webpPdf), /Northwind portal/);

    const mismatch = await resolveClientQuotePdfLogo({
      quoteId: QUOTE_ID,
      logo: {
        storagePath: logoPath,
        mimeType: "image/png",
        contentHash: "ab".repeat(32),
      },
      download: async () => ({ bytes: PNG, mimeType: "image/png" }),
    });
    assert.equal(mismatch.image, null);
    assert.equal(mismatch.reason, "hash_mismatch");
    assert.equal(clientQuotePdfLogoHashMatches(PNG, sha256(PNG)), true);

    const missingCalls: string[] = [];
    const missing = await renderIssuedClientQuotePdf(snapshot(), {
      downloadLogo: async (storagePath) => {
        missingCalls.push(storagePath);
        return { bytes: PNG, mimeType: "image/png" };
      },
    });
    assert.deepEqual(missingCalls, []);
    assert.doesNotMatch(missing.toString("latin1"), /\/Subtype \/Image/);

    const escaped = await resolveClientQuotePdfLogo({
      quoteId: QUOTE_ID,
      logo: {
        storagePath: `${ORG_ID}/identity/logo/live.png`,
        mimeType: "image/png",
        contentHash: sha256(PNG),
      },
      download: async () => {
        throw new Error("live organization logo must not be downloaded");
      },
    });
    assert.equal(escaped.reason, "invalid_path");
    assert.equal(escaped.image, null);
  });
});

describe("client quotation PDF download contract", () => {
  it("builds a safe attachment filename and no-store headers", () => {
    const filename = buildClientQuotePdfFilename({
      quoteNumber: "Q-2026-0007",
      issuedAt: "2026-10-09T15:04:05.000Z",
    });
    assert.equal(filename, "quotation-q-2026-0007-2026-10-09.pdf");
    assert.equal(isSafeClientQuotePdfFilename(filename), true);
    assert.equal(isSafeClientQuotePdfFilename('quote"\r\n.pdf'), false);
    const headers = clientQuotePdfDownloadHeaders(filename);
    assert.equal(headers["Content-Type"], "application/pdf");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.equal(
      headers["Content-Disposition"],
      'attachment; filename="quotation-q-2026-0007-2026-10-09.pdf"',
    );
    assert.equal(
      parseClientQuotePdfContentDisposition(headers["Content-Disposition"]),
      filename,
    );
    assert.equal(parseClientQuotePdfContentDisposition('attachment; filename="../secret.pdf"'), null);
  });

  it("keeps the route on the issued snapshot and leaves the GHL quote alone", () => {
    const route = read("app/api/licensee/client-quotes/[id]/pdf/route.ts");
    const renderer = read("services/clientQuote/pdf/renderClientQuotePdf.ts");
    const logo = read("services/clientQuote/pdf/clientQuotePdfLogo.ts");
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /loadIssuedClientQuoteSnapshotForPdf/);
    assert.match(route, /renderIssuedClientQuotePdf/);
    assert.match(route, /clientQuotePdfDownloadHeaders/);
    assert.match(route, /CLIENT_QUOTE_PDF_FAILED/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /createSupabaseServerClient/);
    assert.doesNotMatch(route, /draft_json|getEstimate|getOrganization|brand_logo_storage_path/);
    assert.doesNotMatch(route, /openrouter|athenaWorker|workers\//i);
    assert.doesNotMatch(renderer, /openrouter|athenaWorker|getOrganization|athena_estimates|generateReview/i);
    assert.doesNotMatch(logo, /sharp|identity\/logo/);
    assert.match(logo, /BRAND_LOGO_BUCKET/);
    assert.match(logo, /clientQuotePdfLogoHashMatches/);

    const ghl = read("app/licensee/quote/page.tsx");
    const embed = read("components/quote/AthenaQuoteFormEmbed.tsx");
    assert.match(ghl, /AthenaQuoteFormEmbed/);
    assert.doesNotMatch(ghl, /client-quotes|clientQuote|renderIssuedClientQuotePdf/);
    assert.match(embed, /ghl-athena-quote-form-embed/);
    assert.match(embed, /NQfn7tnDbGyyq9JVei6Q/);
    assert.doesNotMatch(embed, /client-quotes|clientQuotePdf/);

    const button = read("components/licensee/clientQuotes/ClientQuotePdfDownloadButton.tsx");
    const view = read("components/licensee/clientQuotes/ClientQuoteEditorView.tsx");
    const editor = read("components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx");
    assert.match(button, /createObjectURL/);
    assert.match(button, /revokeObjectURL/);
    assert.match(button, /pendingRef/);
    assert.match(button, /data-client-quote-download-pdf/);
    assert.doesNotMatch(button, /window\.open|window\.print/);
    assert.match(editor, /downloadQuoteId=\{issued \? quote\.id : null\}/);
    assert.match(view, /readOnly \? \([\s\S]*ClientQuotePdfDownloadButton/);
    assert.doesNotMatch(
      view.slice(view.indexOf("data-client-quote-save")),
      /ClientQuotePdfDownloadButton/,
    );
  });

  it("shows Download PDF on an issued quotation and not on a draft", () => {
    const messages = getLicenseeLocalization("en").messages;
    const editor = {
      issuer: {
        legalName: "Alpha Studio Ltd",
        tradingName: "",
        postalAddress: blankAddress(),
        phone: "",
        email: "",
        website: "",
        registrationNumber: "",
        taxIdentifier: "",
        taxIdentifierLabel: "",
        contactName: "",
        jobTitle: "",
        additionalNote: "",
      },
      customer: {
        name: "Northwind",
        contactName: "",
        jobTitle: "",
        postalAddress: blankAddress(),
        phone: "",
        email: "",
        taxIdentifier: "",
      },
      projectTitle: "Northwind portal",
      scopeSummary: "Scope",
      lines: [{ id: "1", description: "Work", quantityText: "1", unitPriceText: "10.00" }],
      discountKind: "none" as const,
      discountAmountText: "",
      discountPercentText: "",
      taxKind: "none" as const,
      taxPercentText: "",
      taxLabel: "",
      paymentSummary: "Due on receipt",
      paymentScheduleNote: "",
      validForDaysText: "30",
      validUntil: "",
      validityNote: "",
      appendixEnabled: false,
      appendixSections: [],
      contentLanguage: "en" as OrganizationLanguage,
    };
    const shared = {
      quoteNumber: "Q-2026-0007",
      issuedAtLabel: "Oct 9, 2026",
      currencyCode: "USD",
      editor,
      lineTotalsMinor: [1000],
      totals: {
        subtotalMinor: 1000,
        discountMinor: 0,
        taxableMinor: 1000,
        taxMinor: 0,
        totalMinor: 1000,
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
    };
    const issuedHtml = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        ...shared,
        mode: "issued",
        downloadQuoteId: QUOTE_ID,
      }),
    );
    assert.match(issuedHtml, /data-client-quote-download-pdf="true"/);
    assert.match(issuedHtml, /Download PDF/);
    assert.match(issuedHtml, /data-client-quote-pdf-pending="false"/);
    assert.doesNotMatch(issuedHtml, /data-client-quote-save="true"/);

    const draftHtml = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        ...shared,
        mode: "draft",
        downloadQuoteId: QUOTE_ID,
      }),
    );
    assert.doesNotMatch(draftHtml, /data-client-quote-download-pdf/);
    assert.match(draftHtml, /data-client-quote-save="true"/);
  });
});
