/**
 * EST-QUOTE-1C.4 — Licensee client quotation editor and navigation.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import {
  ClientQuoteLibraryView,
  ClientQuoteMaskDialog,
} from "../../components/licensee/clientQuotes/ClientQuoteLibraryView";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import {
  addClientQuoteLine,
  buildCreateClientQuoteRequest,
  clientQuoteDraftBlockers,
  clientQuoteLibraryRow,
  editorDraftFromQuote,
  filterClientQuotesForLibrary,
  editorDraftToUpdateBody,
  formatClientQuoteMinorAmount,
  missingClientQuoteIssueRequirements,
  moveClientQuoteLineAt,
  parseClientQuoteQuantityText,
  percentTextToRatePpm,
  previewClientQuoteMoney,
  ratePpmToPercentText,
  removeClientQuoteLineAt,
  setClientQuoteAppendixEnabled,
  withClientQuoteDocumentLanguage,
  type ClientQuoteEditorDraft,
} from "../../lib/licensee/clientQuoteEditorModel";
import {
  CLIENT_QUOTE_STABLE_ERROR_CODES,
  clientQuoteErrorMessage,
} from "../../lib/licensee/clientQuoteEditorMessages";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { calculateClientQuote } from "../../services/clientQuote/clientQuoteMoney";
import type { PublicClientQuote } from "../../services/clientQuote/clientQuotePublic";
import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
  type ClientQuoteDraftV1,
  type ClientQuoteIssuedSnapshotV1,
} from "../../services/clientQuote/clientQuoteTypes";
import { assertClientQuoteIssuable, normalizeClientQuoteDraft } from "../../services/clientQuote/clientQuoteValidation";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();
const messages = getLicenseeLocalization("en").messages;

const UI_FILES = [
  "app/licensee/client-quotes/page.tsx",
  "app/licensee/client-quotes/[id]/page.tsx",
  "components/licensee/clientQuotes/ClientQuoteLibraryView.tsx",
  "components/licensee/clientQuotes/LicenseeClientQuoteLibrary.tsx",
  "components/licensee/clientQuotes/ClientQuoteEditorView.tsx",
  "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
  "components/licensee/clientQuotes/CreateClientQuoteFromEstimate.tsx",
  "lib/licensee/clientQuoteEditorModel.ts",
  "lib/licensee/clientQuoteEditorMessages.ts",
];

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
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

function address() {
  return {
    line1: "1 Market Street",
    line2: null,
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "United States",
  };
}

function draftFixture(currencyCode = "USD"): ClientQuoteDraftV1 {
  const calculated = calculateClientQuote({
    currencyCode,
    lineItems: [
      {
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: currencyCode === "JPY" ? 1500 : 10000,
      },
    ],
    discount: { kind: "none" },
    tax: { kind: "none" },
  });
  return {
    schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
    currencyScale: calculated.currencyScale,
    issuer: {
      legalName: "Acme Legal",
      tradingName: "Acme",
      postalAddress: address(),
      phone: "+1 512 555 0100",
      email: "billing@acme.test",
      website: "https://acme.test",
      registrationNumber: "REG-1",
      taxIdentifier: "TAX-1",
      taxIdentifierLabel: "EIN",
      contactName: "Ada Issuer",
      jobTitle: "Principal",
      additionalNote: "Issued by the studio.",
    },
    customer: {
      name: "Northwind Studio",
      contactName: "Bea Buyer",
      jobTitle: "Owner",
      postalAddress: address(),
      phone: "+1 512 555 0199",
      email: "bea@northwind.test",
      taxIdentifier: "CUST-9",
    },
    projectTitle: "Website rebuild",
    scopeSummary: "Rebuild the marketing site and booking flow.",
    lineItems: [
      {
        id: "line-1",
        description: "Website rebuild",
        quantity: { coefficient: 1, scale: 0 },
        unitPriceMinor: currencyCode === "JPY" ? 1500 : 10000,
        lineTotalMinor: calculated.lineTotalsMinor[0],
      },
    ],
    paymentTerms: { summary: "50% to start, 50% on delivery.", scheduleNote: null },
    validity: { validForDays: 30, validUntil: null, note: "Prices exclude travel." },
    appendix: {
      enabled: false,
      sections: [
        { heading: "Pricing rationale", body: "Detailed rationale from the Estimate." },
      ],
    },
    discount: { kind: "none" },
    tax: { kind: "none" },
    totals: calculated.totals,
  };
}

function quoteFixture(
  overrides: Partial<PublicClientQuote> = {},
  currencyCode = "USD",
): PublicClientQuote {
  const draft = draftFixture(currencyCode);
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    status: "draft",
    contentLanguage: "fr",
    currencyCode,
    quoteNumber: null,
    issuedAt: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    sourceEstimateId: "33333333-3333-4333-8333-333333333333",
    sourceEstimate: null,
    revisedFromQuoteId: null,
    draft,
    issuedSnapshot: null,
    ...overrides,
  };
}

function issuedSnapshot(
  quote: PublicClientQuote,
): NonNullable<PublicClientQuote["issuedSnapshot"]> {
  const snapshot: Omit<ClientQuoteIssuedSnapshotV1, "licenseeAccountId"> = {
    schemaVersion: CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
    quoteId: quote.id,
    organizationId: quote.organizationId,
    quoteNumber: "Q-2026-0007",
    issuedAt: "2026-10-02T15:04:05.000Z",
    contentLanguage: "de",
    currencyCode: quote.currencyCode,
    currencyScale: quote.draft.currencyScale,
    sourceEstimate: null,
    revisedFromQuoteId: null,
    issuer: quote.draft.issuer,
    customer: quote.draft.customer,
    brand: {
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      font: null,
      logo: null,
    },
    projectTitle: quote.draft.projectTitle,
    scopeSummary: quote.draft.scopeSummary,
    lineItems: quote.draft.lineItems,
    paymentTerms: quote.draft.paymentTerms,
    validity: quote.draft.validity,
    appendix: quote.draft.appendix,
    discount: quote.draft.discount,
    tax: quote.draft.tax,
    totals: quote.draft.totals,
  };
  return snapshot;
}

function renderEditor(
  editor: ClientQuoteEditorDraft,
  options: {
    mode?: "draft" | "issued";
    currencyCode?: string;
    quoteNumber?: string | null;
    totals?: PublicClientQuote["draft"]["totals"] | null;
    lineTotalsMinor?: number[] | null;
  } = {},
) {
  const currencyCode = options.currencyCode ?? "USD";
  const preview = previewClientQuoteMoney(editor, currencyCode);
  return renderToStaticMarkup(
    createElement(ClientQuoteEditorView, {
      mode: options.mode ?? "draft",
      quoteNumber: options.quoteNumber ?? null,
      issuedAtLabel: options.mode === "issued" ? "Oct 2, 2026, 3:04 PM" : null,
      currencyCode,
      editor,
      lineTotalsMinor:
        options.lineTotalsMinor ??
        (preview.ok ? preview.preview.lineTotalsMinor : null),
      totals: options.totals === undefined
        ? preview.ok
          ? preview.preview.totals
          : null
        : options.totals,
      locale: "en-US",
      messages,
      pending: null,
      notice: null,
      error: null,
      missingRequirements: missingClientQuoteIssueRequirements(editor, currencyCode),
      revisedFromQuoteId: null,
      onChange: () => undefined,
      onSave: () => undefined,
      onIssue: () => undefined,
      onRevise: () => undefined,
    }),
  );
}

describe("client quotation money display", () => {
  it("keeps currency minor-unit scales, including cents and fils", () => {
    assert.equal(formatClientQuoteMinorAmount(1, "USD"), "0.01 USD");
    assert.equal(formatClientQuoteMinorAmount(10, "USD"), "0.10 USD");
    assert.equal(formatClientQuoteMinorAmount(1999, "USD"), "19.99 USD");
    assert.equal(formatClientQuoteMinorAmount(1500, "JPY"), "1500 JPY");
    assert.equal(formatClientQuoteMinorAmount(1050, "BHD"), "1.050 BHD");
    assert.equal(formatClientQuoteMinorAmount(1, "KWD"), "0.001 KWD");
    assert.equal(formatClientQuoteMinorAmount(1, "CLF"), "0.0001 CLF");
    assert.equal(formatClientQuoteMinorAmount(12345, "CLF"), "1.2345 CLF");
  });

  it("previews discount and tax through calculateClientQuote", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    editor.lines = [
      {
        id: "line-1",
        description: "Design",
        quantityText: "1",
        unitPriceText: "100.00",
      },
      {
        id: "line-2",
        description: "Build",
        quantityText: "2",
        unitPriceText: "25.00",
      },
    ];
    editor.discountKind = "percentage";
    editor.discountPercentText = "10";
    editor.taxKind = "percentage";
    editor.taxPercentText = "8.875";
    editor.taxLabel = "VAT";
    const preview = previewClientQuoteMoney(editor, "USD");
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const expected = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [
        { quantity: { coefficient: 1, scale: 0 }, unitPriceMinor: 10000 },
        { quantity: { coefficient: 2, scale: 0 }, unitPriceMinor: 2500 },
      ],
      discount: { kind: "percentage", ratePpm: 100_000 },
      tax: { kind: "percentage", ratePpm: 88_750, label: "VAT" },
    });
    assert.deepEqual(preview.preview.totals, expected.totals);
    assert.deepEqual(preview.preview.lineTotalsMinor, expected.lineTotalsMinor);
    assert.equal(
      formatClientQuoteMinorAmount(preview.preview.totals.subtotalMinor, "USD"),
      "150.00 USD",
    );
    assert.equal(
      formatClientQuoteMinorAmount(preview.preview.totals.discountMinor, "USD"),
      "15.00 USD",
    );
    assert.equal(
      formatClientQuoteMinorAmount(preview.preview.totals.taxMinor, "USD"),
      formatClientQuoteMinorAmount(expected.totals.taxMinor, "USD"),
    );
    assert.match(
      formatClientQuoteMinorAmount(preview.preview.totals.totalMinor, "USD"),
      /^\d+\.\d{2} USD$/,
    );
    const html = renderEditor(editor);
    assert.match(html, /150\.00 USD/);
    assert.match(html, /15\.00 USD/);
    assert.match(html, /data-field="totals.total"/);
    assert.doesNotMatch(html, /data-field="totals.total"[^>]*<input/);
    assert.equal(percentTextToRatePpm("8.875"), 88_750);
    assert.equal(ratePpmToPercentText(88_750), "8.875");
  });
});

describe("client quotation editor behavior", () => {
  it("prefills issuer and customer from the saved draft and keeps document language", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    assert.equal(editor.issuer.legalName, "Acme Legal");
    assert.equal(editor.customer.name, "Northwind Studio");
    assert.equal(editor.contentLanguage, "fr");
    assert.equal(editor.appendixEnabled, false);
    assert.equal(editor.lines[0]?.unitPriceText, "100.00");
    const html = renderEditor(editor);
    assert.match(html, /data-field="issuer.legalName"/);
    assert.match(html, /value="Acme Legal"/);
    assert.match(html, /data-field="customer.name"/);
    assert.match(html, /value="Northwind Studio"/);
    assert.match(html, /data-field="contentLanguage"/);
    assert.match(html, /value="fr"/);
    assert.doesNotMatch(html, /navigator\.language/);
    const changed = withClientQuoteDocumentLanguage(editor, "pt");
    assert.equal(changed.contentLanguage, "pt");
    assert.equal(changed.projectTitle, editor.projectTitle);
    assert.equal(changed.scopeSummary, editor.scopeSummary);
    assert.equal(changed.issuer.legalName, editor.issuer.legalName);
  });

  it("adds, removes, and reorders lines without an independent total", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    const added = addClientQuoteLine(editor, "USD");
    assert.equal(added.lines.length, 2);
    assert.equal(added.lines[1]?.id, "line-2");
    assert.equal(added.lines[1]?.quantityText, "1");
    const renamed = {
      ...added,
      lines: added.lines.map((line, index) =>
        index === 1 ? { ...line, description: "Support" } : line,
      ),
    };
    const moved = moveClientQuoteLineAt(renamed, 1, -1);
    assert.deepEqual(
      moved.lines.map((line) => line.description),
      ["Support", "Website rebuild"],
    );
    const removed = removeClientQuoteLineAt(moved, 0);
    assert.equal(removed.lines.length, 1);
    assert.equal(removeClientQuoteLineAt(removed, 0), removed);
    assert.equal(parseClientQuoteQuantityText("1.25")?.coefficient, 125);
    assert.equal(parseClientQuoteQuantityText("1.25")?.scale, 2);
    assert.equal(parseClientQuoteQuantityText("0"), null);
    const body = editorDraftToUpdateBody(editor, "USD");
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(
      body.body.draft.totals.totalMinor,
      calculateClientQuote({
        currencyCode: "USD",
        lineItems: body.body.draft.lineItems,
        discount: body.body.draft.discount,
        tax: body.body.draft.tax,
      }).totals.totalMinor,
    );
    const normalized = normalizeClientQuoteDraft(body.body.draft, "USD");
    assert.deepEqual(normalized.totals, body.body.draft.totals);
    assert.equal(body.body.contentLanguage, "fr");
  });

  it("blocks issue until commercial requirements are present, then saves a server-ready draft", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    editor.issuer.legalName = "";
    editor.paymentSummary = "";
    editor.validForDaysText = "";
    const missing = missingClientQuoteIssueRequirements(editor, "USD");
    assert.deepEqual(missing, ["issuerLegalName", "paymentTerms", "validity"]);
    const html = renderEditor(editor);
    assert.match(html, /data-requirement="issuerLegalName"/);
    assert.match(html, /data-met="false"/);
    assert.match(html, /data-client-quote-save="true"/);
    assert.match(html, /data-client-quote-issue="true"/);
    editor.issuer.legalName = "Acme Legal";
    editor.paymentSummary = "Due on receipt.";
    editor.validUntil = "2026-12-31";
    assert.deepEqual(missingClientQuoteIssueRequirements(editor, "USD"), []);
    const built = editorDraftToUpdateBody(editor, "USD");
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assertClientQuoteIssuable(built.body.draft);
  });

  it("keeps the appendix off without deleting seeded sections", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    assert.equal(editor.appendixEnabled, false);
    const enabled = setClientQuoteAppendixEnabled(editor, true);
    assert.equal(enabled.appendixSections.length, 1);
    const disabled = setClientQuoteAppendixEnabled(enabled, false);
    assert.equal(disabled.appendixEnabled, false);
    assert.equal(disabled.appendixSections[0]?.heading, "Pricing rationale");
    const html = renderEditor(editor);
    assert.match(html, /data-field="appendix.enabled"/);
    assert.match(html, /Appendix is off by default|appendix is off by default/i);
  });

  it("renders an issued quotation as read-only and offers revision only", () => {
    const draftQuote = quoteFixture();
    const quote = quoteFixture({
      status: "issued",
      quoteNumber: "Q-2026-0007",
      issuedAt: "2026-10-02T15:04:05.000Z",
      contentLanguage: "de",
      issuedSnapshot: issuedSnapshot(draftQuote),
    });
    const editor = editorDraftFromQuote(quote);
    assert.equal(editor.contentLanguage, "de");
    assert.equal(editor.issuer.legalName, "Acme Legal");
    const html = renderEditor(editor, {
      mode: "issued",
      quoteNumber: "Q-2026-0007",
      totals: quote.issuedSnapshot?.totals ?? null,
      lineTotalsMinor: quote.issuedSnapshot?.lineItems.map((line) => line.lineTotalMinor) ?? null,
    });
    assert.match(html, /data-client-quote-mode="issued"/);
    assert.match(html, /Q-2026-0007/);
    assert.match(html, /Deutsch/);
    assert.match(html, /data-client-quote-revise="true"/);
    assert.doesNotMatch(html, /<input|<textarea|<select/);
    assert.doesNotMatch(html, /data-client-quote-save="true"/);
    assert.doesNotMatch(html, /data-client-quote-issue="true"/);
    assert.match(html, /100\.00 USD/);
  });
});

describe("client quotation library", () => {
  it("shows loading, empty, error, and issued or draft rows", () => {
    const loading = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "loading",
        quotes: [],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(loading, /data-client-quote-loading="true"/);

    const empty = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(empty, /data-client-quote-empty="true"/);
    assert.match(empty, /href="\/licensee\/estimate"/);

    const failed = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "error",
        quotes: [],
        error: messages.clientQuotes.errors.generic,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(failed, /role="alert"/);

    const jpy = quoteFixture({}, "JPY");
    const usd = quoteFixture({
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: "2026-10-03T12:00:00.000Z",
      status: "issued",
      quoteNumber: "Q-2026-0007",
      issuedAt: "2026-10-04T09:00:00.000Z",
      issuedSnapshot: issuedSnapshot(
        quoteFixture({
          id: "44444444-4444-4444-8444-444444444444",
          currencyCode: "USD",
        }),
      ),
    });
    const html = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [jpy, usd],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(html, /Northwind Studio/);
    assert.match(html, /Website rebuild/);
    assert.match(html, /1500 JPY/);
    assert.match(html, /100\.00 USD/);
    assert.match(html, /Q-2026-0007/);
    assert.match(html, /href="\/licensee\/client-quotes\/44444444-4444-4444-8444-444444444444"/);
    assert.match(html, /data-client-quote-status="issued"/);
    assert.match(html, /data-client-quote-status="draft"/);
  });
});

describe("client quotation routes and estimate entry", () => {
  it("protects both pages as Licensee Master only", () => {
    for (const path of [
      "app/licensee/client-quotes/page.tsx",
      "app/licensee/client-quotes/[id]/page.tsx",
    ]) {
      const page = read(path);
      assert.match(page, /redirect\("\/licensee\/login"\)/);
      assert.match(page, /getLicenseeAccountByUserId/);
      assert.match(page, /\/api\/licensee\/master-marker\?action=clear/);
      assert.match(page, /This Master account has been deactivated/);
      assert.match(page, /\/api\/licensee\/master-marker\?action=refresh/);
      assert.match(page, /getLicenseeLocalization/);
      assert.match(page, /messages\.common\.backToMasterDashboard/);
      assert.doesNotMatch(page, /getTenantLocalization|requireCurrentOrganizationContext/);
      assert.doesNotMatch(page, /DashboardSidebar/);
    }
  });

  it("creates one draft from the selected Ready Estimate and does not regenerate", () => {
    const estimate = read("components/licensee/estimate/LicenseeEstimateClient.tsx");
    const entry = read(
      "components/licensee/clientQuotes/CreateClientQuoteFromEstimate.tsx",
    );
    assert.match(estimate, /CreateClientQuoteFromEstimate/);
    assert.match(estimate, /estimateId=\{activeEstimate\.id\}/);
    assert.match(estimate, /prospectId=\{activeEstimate\.prospectId\}/);
    assert.match(estimate, /prospectRemoved=\{activeEstimate\.prospectRemoved\}/);
    assert.match(estimate, /status === "Ready"/);
    assert.match(entry, /data-create-client-quote="true"/);
    assert.match(entry, /lockRef\.current/);
    assert.match(entry, /\/api\/licensee\/client-quotes"/);
    assert.match(entry, /method: "POST"/);
    assert.match(entry, /buildCreateClientQuoteRequest/);
    assert.match(entry, /router\.push\(`\/licensee\/client-quotes\/\$\{payload\.quote\.id\}`\)/);
    assert.doesNotMatch(
      entry,
      /\/api\/licensee\/estimate\/|\/regenerate|openrouter|openai|workers\/|navigator\.language/i,
    );
    assert.deepEqual(
      buildCreateClientQuoteRequest({
        estimateId: "33333333-3333-4333-8333-333333333333",
        prospectId: "55555555-5555-4555-8555-555555555555",
      }),
      {
        estimateId: "33333333-3333-4333-8333-333333333333",
        recipient: {
          kind: "prospect",
          prospectId: "55555555-5555-4555-8555-555555555555",
        },
      },
    );
    assert.deepEqual(
      buildCreateClientQuoteRequest({
        estimateId: "33333333-3333-4333-8333-333333333333",
        prospectId: null,
      }),
      {
        estimateId: "33333333-3333-4333-8333-333333333333",
        recipient: { kind: "client" },
      },
    );
    assert.deepEqual(
      buildCreateClientQuoteRequest({
        estimateId: "33333333-3333-4333-8333-333333333333",
        prospectId: null,
        prospectRemoved: true,
      }),
      {
        estimateId: "33333333-3333-4333-8333-333333333333",
        recipient: { kind: "removedProspect" },
      },
    );
    assert.equal(
      JSON.stringify(
        buildCreateClientQuoteRequest({
          estimateId: "33333333-3333-4333-8333-333333333333",
          prospectId: null,
          prospectRemoved: true,
        }),
      ).includes("prospectBusinessNameSnapshot"),
      false,
    );
    assert.doesNotMatch(entry, /prospectBusinessNameSnapshot/);
    assert.equal(
      "contentLanguage" in
        buildCreateClientQuoteRequest({
          estimateId: "33333333-3333-4333-8333-333333333333",
          prospectId: null,
        }),
      false,
    );
  });

  it("saves, issues, and revises through the existing quotation APIs", () => {
    const editor = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    );
    assert.match(editor, /editorDraftToUpdateBody/);
    assert.match(editor, /missingClientQuoteIssueRequirements/);
    assert.match(editor, /pendingRef\.current/);
    assert.match(editor, /method: "PATCH"/);
    assert.match(editor, /\/api\/licensee\/client-quotes\/\$\{quoteId\}`/);
    assert.match(
      editor,
      /\/api\/licensee\/client-quotes\/\$\{quoteId\}\/issue/,
    );
    assert.match(
      editor,
      /\/api\/licensee\/client-quotes\/\$\{quoteId\}\/revise/,
    );
    assert.match(editor, /quoteRef\.current\?\.status !== "draft"/);
    assert.match(editor, /quoteRef\.current\?\.status !== "issued"/);
    assert.doesNotMatch(editor, /totalsMinor\s*:|manualTotal|overrideTotal/);
  });

  it("keeps the GetOblic fulfillment quote and does not call a model or worker", () => {
    const quotePage = read("app/licensee/quote/page.tsx");
    const estimate = read("components/licensee/estimate/LicenseeEstimateClient.tsx");
    const dashboard = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(quotePage, /AthenaQuoteFormEmbed/);
    assert.match(quotePage, /href="\/licensee"/);
    assert.doesNotMatch(quotePage, /client-quotes/);
    assert.match(estimate, /href="\/licensee\/quote"/);
    assert.match(estimate, /estimate\.quoteCta|messages\.estimate\.quoteCta/);
    assert.match(dashboard, /href="\/licensee\/quote"/);
    assert.match(dashboard, /href="\/licensee\/estimate"/);
    assert.match(dashboard, /href="\/licensee\/client-quotes"/);
    assert.doesNotMatch(estimate, /go\.getoblic\.com|NQfn7tnDbGyyq9JVei6Q/);
    for (const path of UI_FILES) {
      const source = read(path);
      assert.doesNotMatch(source, /openrouter|openai|anthropic|workers\//i);
      assert.doesNotMatch(source, /\/api\/licensee\/estimate\/.+\/regenerate/);
    }
    const names = execFileSync("git", ["diff", "--name-only"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(
      names
        .split("\n")
        .some((line) => line.startsWith("workers/")),
      false,
    );
  });
});

describe("client quotation catalogs", () => {
  it("matches client quote keys in all six locales and maps stable API codes", () => {
    const dictionaries: Record<OrganizationLanguage, typeof en> = {
      en,
      fr,
      es,
      it: itMessages,
      de,
      pt,
    };
    const canonical = collectKeyPaths(en.licensee.clientQuotes);
    assert.ok(canonical.includes("errors.issuedImmutable"));
    assert.ok(canonical.includes("createFromEstimate"));
    assert.ok(canonical.includes("languageNoTranslate"));
    assert.ok(canonical.includes("searchPlaceholder"));
    assert.ok(canonical.includes("searchEmptyTitle"));
    assert.ok(canonical.includes("clearSearch"));
    assert.ok(canonical.includes("deleteDialogBody"));
    assert.ok(canonical.includes("deleteSuccess"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const licensee = dictionaries[language].licensee;
      const paths = collectKeyPaths(licensee.clientQuotes);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing client quote keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra client quote keys`,
      );
      assert.equal(typeof licensee.dashboard.clientQuotesTitle, "string");
      assert.ok(licensee.dashboard.clientQuotesTitle.trim().length > 0);
      assert.ok(licensee.dashboard.clientQuotesDescription.trim().length > 0);
      if (language !== "en") {
        assert.notEqual(
          licensee.clientQuotes.libraryTitle,
          en.licensee.clientQuotes.libraryTitle,
        );
        assert.notEqual(
          licensee.clientQuotes.createFromEstimate,
          en.licensee.clientQuotes.createFromEstimate,
        );
        assert.notEqual(
          licensee.clientQuotes.searchEmptyTitle,
          en.licensee.clientQuotes.searchEmptyTitle,
        );
        assert.notEqual(
          licensee.clientQuotes.deleteDialogBody,
          en.licensee.clientQuotes.deleteDialogBody,
        );
        assert.notEqual(
          licensee.clientQuotes.searchPlaceholder,
          en.licensee.clientQuotes.searchPlaceholder,
        );
      }
      const localized = getLicenseeLocalization(language).messages;
      for (const code of CLIENT_QUOTE_STABLE_ERROR_CODES) {
        const text = clientQuoteErrorMessage(localized, code);
        assert.ok(text.trim().length > 0, `${language} ${code}`);
        if (code !== "CLIENT_QUOTE_FAILED") {
          assert.notEqual(text, localized.clientQuotes.errors.generic, `${language} ${code}`);
        }
      }
      assert.equal(
        clientQuoteErrorMessage(localized, "NOT_A_REAL_CODE"),
        localized.clientQuotes.errors.generic,
      );
    }
    assert.deepEqual(clientQuoteDraftBlockers(editorDraftFromQuote(quoteFixture()), "USD"), []);
  });
});

describe("EST-QUOTE-1D.5A presentation", () => {
  it("keeps Ready Estimate actions at a natural size", () => {
    const estimate = read("components/licensee/estimate/LicenseeEstimateClient.tsx");
    const entry = read(
      "components/licensee/clientQuotes/CreateClientQuoteFromEstimate.tsx",
    );
    const start = estimate.indexOf('data-estimate-ready-actions="true"');
    assert.ok(start > 0);
    const block = estimate.slice(start - 180, start + 1600);
    assert.match(block, /flex flex-wrap items-start gap-3/);
    assert.match(block, /shrink-0/);
    assert.match(block, /handleRegenerate\(\)/);
    assert.match(block, /handleCreateAnother/);
    assert.match(block, /CreateClientQuoteFromEstimate/);
    assert.match(block, /data-estimate-regenerate-action="true"/);
    assert.doesNotMatch(block, /flex-1|w-full|items-stretch|sticky|fixed/);
    assert.match(entry, /data-create-client-quote="true"/);
    assert.match(entry, /shrink-0/);
    assert.match(entry, /createFromEstimateHint/);
    assert.doesNotMatch(entry, /(?:\s|")w-full(?:\s|")|flex-1/);
    assert.match(entry, /method: "POST"/);
    assert.match(entry, /\/api\/licensee\/client-quotes"/);
  });

  it("keeps issue requirements inline and leaves save available", () => {
    const view = read("components/licensee/clientQuotes/ClientQuoteEditorView.tsx");
    const editor = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    );
    assert.match(view, /data-client-quote-issue-panel="inline"/);
    assert.doesNotMatch(view, /sticky|fixed bottom|z-10|z-50/);
    assert.match(view, /data-client-quote-save="true"/);
    assert.match(view, /data-client-quote-issue="true"/);
    assert.match(editor, /missingClientQuoteIssueRequirements/);
    assert.match(editor, /copy\.issueBlocked/);
    const incomplete = editorDraftFromQuote(quoteFixture());
    incomplete.issuer.legalName = "";
    incomplete.paymentSummary = "";
    const html = renderEditor(incomplete);
    assert.match(html, /data-client-quote-issue-panel="inline"/);
    assert.match(html, /data-requirement="issuerLegalName"/);
    assert.match(html, /data-met="false"/);
    assert.match(html, /data-requirement="customerName"/);
    assert.match(html, /data-met="true"/);
    assert.match(html, /data-client-quote-save="true"/);
    const saveButton = html.slice(
      html.indexOf('data-client-quote-save="true"'),
      html.indexOf('data-client-quote-issue="true"'),
    );
    assert.doesNotMatch(saveButton, /disabled=""/);
    assert.match(html, /data-client-quote-issue="true"/);
    const blocked = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        mode: "draft",
        quoteNumber: null,
        issuedAtLabel: null,
        currencyCode: "USD",
        editor: incomplete,
        lineTotalsMinor: null,
        totals: null,
        locale: "en-US",
        messages,
        pending: null,
        notice: null,
        error: messages.clientQuotes.issueBlocked,
        missingRequirements: missingClientQuoteIssueRequirements(incomplete, "USD"),
        revisedFromQuoteId: null,
        onChange: () => undefined,
        onSave: () => undefined,
        onIssue: () => undefined,
        onRevise: () => undefined,
      }),
    );
    assert.match(blocked, /Complete every requirement below before issuing/);
    assert.match(blocked, /Issuer legal name/);
    assert.doesNotMatch(blocked, /sticky|position:\s*fixed|fixed bottom/);
  });

  it("filters the loaded library by customer, project, number, and status", () => {
    const labels = {
      draft: messages.clientQuotes.statusDraft,
      issued: messages.clientQuotes.statusIssued,
    };
    const older = quoteFixture({
      id: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-10-01T12:00:00.000Z",
    });
    const newer = quoteFixture({
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: "2026-10-03T12:00:00.000Z",
      status: "issued",
      quoteNumber: "Q-2026-0007",
      issuedSnapshot: issuedSnapshot(
        quoteFixture({
          id: "44444444-4444-4444-8444-444444444444",
          draft: {
            ...draftFixture(),
            customer: { ...draftFixture().customer, name: "Fabrikam Atelier" },
            projectTitle: "Catalog migration",
          },
        }),
      ),
    });
    const ordered = filterClientQuotesForLibrary([older, newer], "   ", labels);
    assert.deepEqual(
      ordered.map((quote) => quote.id),
      [newer.id, older.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([older, newer], "  north  ", labels).map(
        (quote) => quote.id,
      ),
      [older.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([older, newer], "CATALOG", labels).map(
        (quote) => quote.id,
      ),
      [newer.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([older, newer], "q-2026-000", labels).map(
        (quote) => quote.id,
      ),
      [newer.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([older, newer], "draft", labels).map(
        (quote) => quote.id,
      ),
      [older.id],
    );
    assert.deepEqual(
      filterClientQuotesForLibrary([older, newer], "ISSUED", labels).map(
        (quote) => quote.id,
      ),
      [newer.id],
    );
    const french = getLicenseeLocalization("fr").messages;
    assert.deepEqual(
      filterClientQuotesForLibrary([older, newer], "brouillon", {
        draft: french.clientQuotes.statusDraft,
        issued: french.clientQuotes.statusIssued,
      }).map((quote) => quote.id),
      [older.id],
    );

    const emptyLibrary = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(emptyLibrary, /data-client-quote-empty="true"/);
    assert.doesNotMatch(emptyLibrary, /data-client-quote-search/);

    const noMatch = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [older, newer],
        error: null,
        locale: "en-US",
        messages,
        searchQuery: "zzzz-no-match",
        onRetry: () => undefined,
      }),
    );
    assert.match(noMatch, /data-client-quote-search="true"/);
    assert.match(noMatch, /data-client-quote-search-clear="true"/);
    assert.match(noMatch, /data-client-quote-search-empty="true"/);
    assert.doesNotMatch(noMatch, /data-client-quote-empty="true"/);
    assert.doesNotMatch(noMatch, /data-client-quote-row=/);

    const matched = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [older, newer],
        error: null,
        locale: "en-US",
        messages,
        searchQuery: "fabrikam",
        onRetry: () => undefined,
      }),
    );
    assert.match(matched, /Fabrikam Atelier/);
    assert.match(matched, /Catalog migration/);
    assert.doesNotMatch(matched, /Northwind Studio/);
    assert.match(matched, /data-client-quote-delete="44444444-4444-4444-8444-444444444444"/);
    assert.doesNotMatch(matched, /data-client-quote-delete="11111111-1111-4111-8111-111111111111"/);

    const both = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [older, newer],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(both, /data-client-quote-delete="11111111-1111-4111-8111-111111111111"/);
    assert.match(both, /data-client-quote-delete="44444444-4444-4444-8444-444444444444"/);
    assert.match(both, /data-client-quote-open=/);

    const issuedRow = clientQuoteLibraryRow(newer, "en-US");
    const dialog = renderToStaticMarkup(
      createElement(ClientQuoteMaskDialog, {
        row: issuedRow,
        messages,
        pending: true,
        error: null,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );
    assert.match(dialog, /data-client-quote-mask-dialog="true"/);
    assert.match(dialog, /Fabrikam Atelier/);
    assert.match(dialog, /Q-2026-0007/);
    assert.match(dialog, /data-client-quote-mask-status="issued"/);
    assert.match(dialog, /This quotation will disappear from the active library/);
    assert.match(dialog, /data-client-quote-mask-cancel="true"/);
    assert.match(dialog, /disabled=""/);
    assert.match(dialog, /data-client-quote-mask-confirm="true"/);
    const draftDialog = renderToStaticMarkup(
      createElement(ClientQuoteMaskDialog, {
        row: clientQuoteLibraryRow(older, "en-US"),
        messages,
        pending: false,
        error: messages.clientQuotes.errors.generic,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );
    assert.match(draftDialog, /Northwind Studio/);
    assert.match(draftDialog, /data-client-quote-mask-status="draft"/);
    assert.doesNotMatch(draftDialog, /Q-2026-0007/);
    assert.match(draftDialog, /role="alert"/);
    const library = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteLibrary.tsx",
    );
    assert.match(library, /method: "DELETE"/);
    assert.match(library, /maskLock\.current/);
    assert.match(library, /deleteSuccess/);
    assert.doesNotMatch(library, /licenseeAccountId|organization_id|openrouter|workers\//i);
  });
});
