/**
 * EST-QUOTE-1C.4 — Licensee client quotation editor and navigation.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  clientQuoteMatchesLibraryQuery,
  compatibleClientQuoteTemplates,
  editorDraftFromQuote,
  filterClientQuotesForLibrary,
  editorDraftToUpdateBody,
  formatClientQuoteMinorAmount,
  insertClientQuoteTemplateLine,
  missingClientQuoteIssueRequirements,
  moveClientQuoteLineAt,
  parseClientQuoteQuantityText,
  percentTextToRatePpm,
  previewClientQuoteMoney,
  ratePpmToPercentText,
  removeClientQuoteLineAt,
  setClientQuoteAppendixEnabled,
  setClientQuoteDiscountKind,
  setClientQuoteLineBillingFrequency,
  withClientQuoteDocumentLanguage,
  type ClientQuoteEditorDraft,
  type ClientQuoteTemplateInsertSource,
} from "../../lib/licensee/clientQuoteEditorModel";
import {
  CLIENT_QUOTE_STABLE_ERROR_CODES,
  clientQuoteBlockerMessage,
  clientQuoteErrorMessage,
} from "../../lib/licensee/clientQuoteEditorMessages";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { calculateClientQuote } from "../../services/clientQuote/clientQuoteMoney";
import { copyClientQuoteTemplateToLine } from "../../services/clientQuote/clientQuoteTemplateCopy";
import {
  createDraftClientQuote,
  issueClientQuote,
  reviseIssuedClientQuote,
  updateDraftClientQuote,
} from "../../services/clientQuote/clientQuoteLifecycle";
import type { PublicClientQuote } from "../../services/clientQuote/clientQuotePublic";
import {
  CLIENT_QUOTE_BILLING_FREQUENCIES,
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_FIELD_LIMITS,
  CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
  type ClientQuoteBillingFrequency,
  type ClientQuoteDraftV1,
  type ClientQuoteFrequencyTotals,
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
    frequencyTotals?: readonly ClientQuoteFrequencyTotals[] | null;
    lineTotalsMinor?: number[] | null;
    messages?: typeof messages;
    templatesOpen?: boolean;
    templatesPhase?: "loading" | "error" | "ready";
    templateChoices?: Array<{
      id: string;
      name: string;
      description: string;
      unitPriceMinor: number;
      currencyCode: string;
      billingFrequency: ClientQuoteBillingFrequency;
    }>;
  } = {},
) {
  const currencyCode = options.currencyCode ?? "USD";
  const preview = previewClientQuoteMoney(editor, currencyCode);
  const frequencyTotals =
    options.frequencyTotals === undefined
      ? preview.ok
        ? preview.preview.frequencyTotals
        : null
      : options.frequencyTotals;
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
      frequencyTotals,
      templatesOpen: options.templatesOpen ?? false,
      templatesPhase: options.templatesPhase ?? "loading",
      templateChoices: options.templateChoices ?? [],
      locale: "en-US",
      messages: options.messages ?? messages,
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
        billingFrequency: "one_time",
      },
      {
        id: "line-2",
        description: "Build",
        quantityText: "2",
        unitPriceText: "25.00",
        billingFrequency: "one_time",
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
    assert.doesNotMatch(quotePage, /billingFrequency|frequencyTotals|client-quote-templates/);
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
    assert.ok(canonical.includes("billingFrequency"));
    assert.ok(canonical.includes("frequencyOneTime"));
    assert.ok(canonical.includes("frequencyMonthly"));
    assert.ok(canonical.includes("frequencyQuarterly"));
    assert.ok(canonical.includes("frequencyAnnually"));
    assert.ok(canonical.includes("addFromTemplates"));
    assert.ok(canonical.includes("templatesEmpty"));
    assert.ok(canonical.includes("templatesLoading"));
    assert.ok(canonical.includes("templatesLoadError"));
    assert.ok(canonical.includes("frequencySummaryTitle"));
    assert.ok(canonical.includes("frequencySummarySeparate"));
    assert.ok(canonical.includes("fixedDiscountMixed"));
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
        assert.notEqual(
          licensee.clientQuotes.billingFrequency,
          en.licensee.clientQuotes.billingFrequency,
        );
        assert.notEqual(
          licensee.clientQuotes.frequencyOneTime,
          en.licensee.clientQuotes.frequencyOneTime,
        );
        assert.notEqual(
          licensee.clientQuotes.addFromTemplates,
          en.licensee.clientQuotes.addFromTemplates,
        );
        assert.notEqual(
          licensee.clientQuotes.templatesEmpty,
          en.licensee.clientQuotes.templatesEmpty,
        );
        assert.notEqual(
          licensee.clientQuotes.templatesLoadError,
          en.licensee.clientQuotes.templatesLoadError,
        );
        assert.notEqual(
          licensee.clientQuotes.frequencySummaryTitle,
          en.licensee.clientQuotes.frequencySummaryTitle,
        );
        assert.notEqual(
          licensee.clientQuotes.fixedDiscountMixed,
          en.licensee.clientQuotes.fixedDiscountMixed,
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

describe("client quotation library frequency totals", () => {
  const catalogs = {
    en,
    fr,
    es,
    it: itMessages,
    de,
    pt,
  } as const;

  function amount(totalMinor: number) {
    return {
      subtotalMinor: totalMinor,
      discountMinor: 0,
      taxableMinor: totalMinor,
      taxMinor: 0,
      totalMinor,
    };
  }

  function group(
    billingFrequency: ClientQuoteBillingFrequency,
    totalMinor: number,
  ): ClientQuoteFrequencyTotals {
    return { billingFrequency, totals: amount(totalMinor) };
  }

  function withDraftFrequencies(
    quote: PublicClientQuote,
    groups: readonly ClientQuoteFrequencyTotals[] | undefined,
    compatibilityTotalMinor: number,
  ): PublicClientQuote {
    const draft = {
      ...quote.draft,
      totals: amount(compatibilityTotalMinor),
    };
    if (groups === undefined) {
      delete draft.frequencyTotals;
    } else {
      draft.frequencyTotals = [...groups];
    }
    return { ...quote, draft };
  }

  function renderLibrary(
    quotes: readonly PublicClientQuote[],
    options: {
      language?: OrganizationLanguage;
      searchQuery?: string;
    } = {},
  ) {
    const language = options.language ?? "en";
    return renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes,
        error: null,
        locale: "en-US",
        messages: getLicenseeLocalization(language).messages,
        searchQuery: options.searchQuery,
        onRetry: () => undefined,
      }),
    );
  }

  it("keeps one total for a legacy quotation and a monthly-only quotation", () => {
    const legacy = withDraftFrequencies(
      quoteFixture({ id: "11111111-1111-4111-8111-111111111111" }),
      undefined,
      3431,
    );
    const emptyGroups = withDraftFrequencies(
      quoteFixture({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      [],
      3431,
    );
    const monthly = withDraftFrequencies(
      quoteFixture({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        draft: {
          ...quoteFixture().draft,
          customer: { ...quoteFixture().draft.customer, name: "Harbor Studio" },
        },
      }),
      [group("monthly", 2500)],
      1,
    );
    const legacyRow = clientQuoteLibraryRow(legacy, "en-US");
    assert.equal(legacyRow.totalLabel, "34.31 USD");
    assert.equal(legacyRow.totalMinor, 3431);
    assert.deepEqual(legacyRow.frequencyAmounts, []);
    assert.deepEqual(clientQuoteLibraryRow(emptyGroups, "en-US").frequencyAmounts, []);
    assert.equal(clientQuoteLibraryRow(emptyGroups, "en-US").totalLabel, "34.31 USD");

    const monthlyRow = clientQuoteLibraryRow(monthly, "en-US");
    assert.equal(monthlyRow.totalLabel, "25.00 USD");
    assert.equal(monthlyRow.totalMinor, 2500);
    assert.deepEqual(monthlyRow.frequencyAmounts, []);
    assert.notEqual(monthlyRow.totalMinor, 1);
    assert.notEqual(monthlyRow.totalMinor, 2500 * 12);

    const html = renderLibrary([legacy, monthly]);
    assert.match(html, /data-client-quote-total="11111111-1111-4111-8111-111111111111"/);
    assert.match(html, /data-client-quote-total="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"/);
    assert.match(html, /34\.31 USD/);
    assert.match(html, /25\.00 USD/);
    assert.equal(html.includes("300.00 USD"), false);
    assert.equal(html.includes("0.01 USD"), false);
    assert.doesNotMatch(html, /data-client-quote-frequency-totals=/);
    assert.doesNotMatch(html, /Monthly|One-time|Quarterly|Annually/);
  });

  it("lists mixed frequencies in canonical order and omits a zero compatibility total", () => {
    const mixed = withDraftFrequencies(
      quoteFixture({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
      [group("monthly", 5000), group("one_time", 10000)],
      10000,
    );
    const noOneTime = withDraftFrequencies(
      quoteFixture({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        currencyCode: "EUR",
        draft: {
          ...quoteFixture({}, "EUR").draft,
          customer: { ...quoteFixture().draft.customer, name: "Recurring Only" },
        },
      }),
      [group("quarterly", 9000), group("monthly", 3000)],
      0,
    );
    const mixedRow = clientQuoteLibraryRow(mixed, "en-US");
    assert.equal(mixedRow.totalLabel, null);
    assert.equal(mixedRow.totalMinor, null);
    assert.deepEqual(
      mixedRow.frequencyAmounts.map((entry) => entry.billingFrequency),
      ["one_time", "monthly"],
    );
    assert.deepEqual(
      mixedRow.frequencyAmounts.map((entry) => entry.totalLabel),
      ["100.00 USD", "50.00 USD"],
    );
    const recurringRow = clientQuoteLibraryRow(noOneTime, "en-US");
    assert.deepEqual(
      recurringRow.frequencyAmounts.map((entry) => entry.billingFrequency),
      ["monthly", "quarterly"],
    );
    assert.deepEqual(
      recurringRow.frequencyAmounts.map((entry) => entry.totalMinor),
      [3000, 9000],
    );
    assert.equal(recurringRow.frequencyAmounts.some((entry) => entry.totalMinor === 0), false);

    const mixedHtml = renderLibrary([mixed]);
    assert.match(
      mixedHtml,
      /data-client-quote-frequency-amount="cccccccc-cccc-4ccc-8ccc-cccccccccccc:one_time"/,
    );
    assert.match(
      mixedHtml,
      /data-client-quote-frequency-amount="cccccccc-cccc-4ccc-8ccc-cccccccccccc:monthly"/,
    );
    const oneTimeAt = mixedHtml.indexOf("One-time");
    const monthlyAt = mixedHtml.indexOf("Monthly");
    assert.ok(oneTimeAt >= 0 && monthlyAt > oneTimeAt);
    assert.equal(mixedHtml.split("100.00 USD").length - 1, 1);
    assert.equal(mixedHtml.split("50.00 USD").length - 1, 1);
    assert.equal(mixedHtml.includes("150.00 USD"), false);
    assert.equal(mixedHtml.includes("600.00 USD"), false);
    assert.doesNotMatch(mixedHtml, /data-client-quote-total=/);

    const recurringHtml = renderLibrary([noOneTime]);
    assert.match(
      recurringHtml,
      /data-client-quote-frequency-amount="dddddddd-dddd-4ddd-8ddd-dddddddddddd:monthly"/,
    );
    assert.match(
      recurringHtml,
      /data-client-quote-frequency-amount="dddddddd-dddd-4ddd-8ddd-dddddddddddd:quarterly"/,
    );
    assert.doesNotMatch(
      recurringHtml,
      /data-client-quote-frequency-amount="dddddddd-dddd-4ddd-8ddd-dddddddddddd:one_time"/,
    );
    assert.doesNotMatch(recurringHtml, /(?<!\d)0\.00 EUR/);
    assert.doesNotMatch(recurringHtml, /120\.00 EUR/);
    assert.doesNotMatch(recurringHtml, /360\.00 EUR/);
    const monthlyEur = recurringHtml.indexOf("30.00 EUR");
    const quarterlyEur = recurringHtml.indexOf("90.00 EUR");
    assert.ok(monthlyEur >= 0 && quarterlyEur > monthlyEur);
    assert.doesNotMatch(recurringHtml, /One-time|data-client-quote-total=/);
  });

  it("formats mixed currency minor units and uses the frozen issued snapshot", () => {
    const yen = withDraftFrequencies(
      quoteFixture(
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          currencyCode: "JPY",
        },
        "JPY",
      ),
      [group("annually", 400), group("monthly", 1500)],
      0,
    );
    const fils = withDraftFrequencies(
      quoteFixture({
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        currencyCode: "BHD",
        draft: {
          ...quoteFixture({}, "BHD").draft,
          currencyScale: 3,
        },
      }),
      [group("one_time", 1050)],
      1050,
    );
    assert.deepEqual(
      clientQuoteLibraryRow(yen, "en-US").frequencyAmounts.map((entry) => entry.totalLabel),
      ["1500 JPY", "400 JPY"],
    );
    assert.equal(clientQuoteLibraryRow(fils, "en-US").totalLabel, "1.050 BHD");
    assert.deepEqual(clientQuoteLibraryRow(fils, "en-US").frequencyAmounts, []);

    const base = quoteFixture({
      id: "12121212-1212-4121-8121-121212121212",
      status: "issued",
      quoteNumber: "Q-2026-0042",
      issuedAt: "2026-10-04T09:00:00.000Z",
    });
    const driftedDraft = withDraftFrequencies(
      base,
      [group("one_time", 1), group("monthly", 999)],
      1,
    );
    const issued = {
      ...driftedDraft,
      issuedSnapshot: {
        ...issuedSnapshot(base),
        currencyCode: "USD",
        totals: amount(0),
        frequencyTotals: [group("quarterly", 7500), group("monthly", 2500)],
      },
    };
    const issuedRow = clientQuoteLibraryRow(issued, "en-US");
    assert.deepEqual(
      issuedRow.frequencyAmounts.map((entry) => [entry.billingFrequency, entry.totalLabel]),
      [
        ["monthly", "25.00 USD"],
        ["quarterly", "75.00 USD"],
      ],
    );
    assert.equal(JSON.stringify(issuedRow).includes("0.01 USD"), false);
    assert.equal(JSON.stringify(issuedRow).includes("9.99 USD"), false);

    const historical = {
      ...withDraftFrequencies(base, [group("monthly", 5000), group("quarterly", 9000)], 0),
      issuedSnapshot: issuedSnapshot(base),
    };
    historical.issuedSnapshot = {
      ...historical.issuedSnapshot,
      totals: amount(3431),
    };
    delete historical.issuedSnapshot.frequencyTotals;
    const historicalRow = clientQuoteLibraryRow(historical, "en-US");
    assert.equal(historicalRow.totalLabel, "34.31 USD");
    assert.deepEqual(historicalRow.frequencyAmounts, []);

    const html = renderLibrary([yen, fils, issued]);
    assert.match(html, /1500 JPY/);
    assert.match(html, /400 JPY/);
    assert.match(html, /1\.050 BHD/);
    assert.match(html, /data-client-quote-total="ffffffff-ffff-4fff-8fff-ffffffffffff"/);
    assert.doesNotMatch(html, /18000 JPY/);
    assert.doesNotMatch(html, /(?<!\d)0 JPY/);
    assert.doesNotMatch(html, /(?<!\d)0\.00 USD/);
  });

  it("localizes frequency labels in the six Master languages", () => {
    const quote = withDraftFrequencies(
      quoteFixture({ id: "34343434-3434-4343-8343-343434343434" }),
      [
        group("annually", 400),
        group("quarterly", 300),
        group("monthly", 200),
        group("one_time", 100),
      ],
      100,
    );
    const expected = {
      en: ["One-time", "Monthly", "Quarterly", "Annually"],
      fr: ["Ponctuel", "Mensuel", "Trimestriel", "Annuel"],
      es: ["Pago único", "Mensual", "Trimestral", "Anual"],
      it: ["Una tantum", "Mensile", "Trimestrale", "Annuale"],
      de: ["Einmalig", "Monatlich", "Vierteljährlich", "Jährlich"],
      pt: ["Pontual", "Mensal", "Trimestral", "Anual"],
    } as const;
    assert.deepEqual(ORGANIZATION_LANGUAGES, ["en", "fr", "es", "it", "de", "pt"]);
    for (const language of ORGANIZATION_LANGUAGES) {
      const html = renderLibrary([quote], { language });
      let cursor = -1;
      for (const label of expected[language]) {
        const at = html.indexOf(label);
        assert.ok(at > cursor, `${language} ${label}`);
        cursor = at;
      }
      assert.match(html, /1\.00 USD/);
      assert.match(html, /2\.00 USD/);
      assert.match(html, /3\.00 USD/);
      assert.match(html, /4\.00 USD/);
      assert.equal(html.includes("10.00 USD"), false);
      assert.equal(html.includes("24.00 USD"), false);
      assert.equal(catalogs[language].licensee.clientQuotes.frequencyMonthly.length > 0, true);
    }
  });

  it("keeps search, numbering, status, open, and delete, and still excludes masked quotations", () => {
    const older = quoteFixture();
    const mixed = withDraftFrequencies(
      quoteFixture({
        id: "44444444-4444-4444-8444-444444444444",
        createdAt: "2026-10-03T12:00:00.000Z",
        status: "issued",
        quoteNumber: "Q-2026-0007",
        issuedAt: "2026-10-04T09:00:00.000Z",
        draft: {
          ...quoteFixture().draft,
          customer: { ...quoteFixture().draft.customer, name: "Fabrikam Atelier" },
          projectTitle: "Catalog migration",
        },
      }),
      [group("monthly", 3000), group("quarterly", 9000)],
      0,
    );
    mixed.issuedSnapshot = {
      ...issuedSnapshot(mixed),
      totals: amount(0),
      frequencyTotals: [group("quarterly", 9000), group("monthly", 3000)],
    };
    const statusLabels = {
      draft: messages.clientQuotes.statusDraft,
      issued: messages.clientQuotes.statusIssued,
    };
    assert.equal(clientQuoteMatchesLibraryQuery(mixed, "fabrikam", statusLabels), true);
    assert.equal(clientQuoteMatchesLibraryQuery(mixed, "q-2026-0007", statusLabels), true);
    assert.equal(clientQuoteMatchesLibraryQuery(mixed, "issued", statusLabels), true);
    assert.equal(clientQuoteMatchesLibraryQuery(mixed, "30.00", statusLabels), false);
    assert.equal(clientQuoteMatchesLibraryQuery(mixed, "monthly", statusLabels), false);
    assert.deepEqual(
      filterClientQuotesForLibrary([older, mixed], "fabrikam", statusLabels).map(
        (quote) => quote.id,
      ),
      [mixed.id],
    );

    const html = renderLibrary([older, mixed], { searchQuery: "fabrikam" });
    assert.match(html, /Fabrikam Atelier/);
    assert.match(html, /Q-2026-0007/);
    assert.match(html, /data-client-quote-status="issued"/);
    assert.match(html, /30\.00 USD/);
    assert.match(html, /90\.00 USD/);
    assert.doesNotMatch(html, /(?<!\d)0\.00 USD/);
    assert.match(html, /data-client-quote-open="44444444-4444-4444-8444-444444444444"/);
    assert.match(html, /data-client-quote-delete="44444444-4444-4444-8444-444444444444"/);
    assert.doesNotMatch(html, /Northwind Studio/);
    assert.doesNotMatch(html, /data-client-quote-total=/);

    const service = read("services/clientQuote/clientQuoteService.ts");
    const library = read("components/licensee/clientQuotes/LicenseeClientQuoteLibrary.tsx");
    const view = read("components/licensee/clientQuotes/ClientQuoteLibraryView.tsx");
    const projection = read("services/clientQuote/clientQuotePublic.ts");
    assert.match(service, /!quote\.deleted_at/);
    assert.match(library, /method: "DELETE"/);
    assert.match(projection, /draft: quote\.draft_json/);
    assert.match(projection, /issuedSnapshot: publicIssuedSnapshot/);
    assert.doesNotMatch(view, /calculateClientQuote|openrouter|workers\/|gohighlevel/i);
    assert.doesNotMatch(library, /calculateClientQuote|openrouter|workers\/|gohighlevel/i);
    assert.doesNotMatch(projection, /calculateClientQuote|clientQuoteTemplate|athena_estimates/);
    assert.doesNotMatch(
      read("lib/licensee/clientQuoteEditorModel.ts").slice(
        read("lib/licensee/clientQuoteEditorModel.ts").indexOf("function clientQuoteLibraryMoney"),
      ),
      /calculateClientQuote|athena_estimates|clientQuoteTemplate/,
    );
  });
});

function lineEdit(
  id: string,
  description: string,
  unitPriceText: string,
  billingFrequency: ClientQuoteBillingFrequency,
  quantityText = "1",
) {
  return { id, description, quantityText, unitPriceText, billingFrequency };
}

function hostingTemplate(
  overrides: Partial<ClientQuoteTemplateInsertSource> = {},
): ClientQuoteTemplateInsertSource {
  return {
    name: "Managed hosting",
    description: "Monthly hosting and backups",
    quantity: { coefficient: 25, scale: 1 },
    unitPriceMinor: 4000,
    currencyCode: "USD",
    billingFrequency: "quarterly",
    ...overrides,
  };
}

describe("EST-QUOTE-2B.3 recurring editor and template insertion", () => {
  it("defaults missing frequency to one-time and preserves it across edits", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    assert.equal(editor.lines[0]?.billingFrequency, "one_time");
    const monthly = setClientQuoteLineBillingFrequency(editor, 0, "monthly");
    assert.equal(monthly.lines[0]?.billingFrequency, "monthly");
    assert.equal(monthly.lines[0]?.description, "Website rebuild");
    const edited = {
      ...monthly,
      lines: monthly.lines.map((line) => ({
        ...line,
        description: "Care plan",
        quantityText: "2",
        unitPriceText: "12.50",
      })),
    };
    assert.equal(edited.lines[0]?.billingFrequency, "monthly");
    const added = addClientQuoteLine(edited, "USD");
    assert.equal(added.lines[1]?.billingFrequency, "one_time");
    assert.equal(added.lines[1]?.id, "line-2");
    const moved = moveClientQuoteLineAt(
      {
        ...added,
        lines: added.lines.map((line, index) =>
          index === 1 ? { ...line, description: "Setup" } : line,
        ),
      },
      1,
      -1,
    );
    assert.deepEqual(
      moved.lines.map((line) => line.billingFrequency),
      ["one_time", "monthly"],
    );
    const html = renderEditor(monthly);
    assert.match(html, /data-field="line.line-1.billingFrequency"/);
    assert.match(html, /value="monthly"/);
    assert.match(html, /One-time/);
    assert.match(html, /Monthly/);
    assert.match(html, /Quarterly/);
    assert.match(html, /Annually/);
    const languageOnly = withClientQuoteDocumentLanguage(monthly, "pt");
    assert.equal(languageOnly.lines[0]?.billingFrequency, "monthly");
    assert.equal(languageOnly.lines[0]?.description, "Website rebuild");
    assert.equal(languageOnly.contentLanguage, "pt");
  });

  it("keeps a single frequency on the simple total and groups mixed frequencies without combining them", () => {
    const monthlyOnly = editorDraftFromQuote(quoteFixture());
    monthlyOnly.lines = [
      lineEdit("line-1", "Care", "80.00", "monthly"),
    ];
    const single = previewClientQuoteMoney(monthlyOnly, "USD");
    assert.equal(single.ok, true);
    if (!single.ok) return;
    assert.equal(single.preview.frequencyTotals.length, 1);
    assert.equal(single.preview.frequencyTotals[0]?.billingFrequency, "monthly");
    assert.deepEqual(single.preview.totals, single.preview.frequencyTotals[0]?.totals);
    const singleHtml = renderEditor(monthlyOnly);
    assert.match(singleHtml, /data-client-quote-totals="true"/);
    assert.match(singleHtml, /data-field="totals.total"/);
    assert.match(singleHtml, /80\.00 USD/);
    assert.doesNotMatch(singleHtml, /data-client-quote-frequency-summary/);
    assert.doesNotMatch(singleHtml, /960\.00 USD/);

    const mixed = editorDraftFromQuote(quoteFixture());
    mixed.lines = [
      lineEdit("line-annually", "Annual retainer", "40.00", "annually"),
      lineEdit("line-once", "Setup", "10.00", "one_time"),
      lineEdit("line-quarter", "Quarterly review", "30.00", "quarterly"),
      lineEdit("line-month", "Care", "20.00", "monthly"),
    ];
    mixed.discountKind = "percentage";
    mixed.discountPercentText = "10";
    mixed.taxKind = "percentage";
    mixed.taxPercentText = "10";
    const preview = previewClientQuoteMoney(mixed, "USD");
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const expected = calculateClientQuote({
      currencyCode: "USD",
      lineItems: [
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 4000,
          billingFrequency: "annually",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 1000,
          billingFrequency: "one_time",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 3000,
          billingFrequency: "quarterly",
        },
        {
          quantity: { coefficient: 1, scale: 0 },
          unitPriceMinor: 2000,
          billingFrequency: "monthly",
        },
      ],
      discount: { kind: "percentage", ratePpm: 100_000 },
      tax: { kind: "percentage", ratePpm: 100_000, label: null },
    });
    assert.deepEqual(preview.preview.frequencyTotals, expected.frequencyTotals);
    assert.deepEqual(
      preview.preview.frequencyTotals.map((group) => group.billingFrequency),
      ["one_time", "monthly", "quarterly", "annually"],
    );
    assert.equal(preview.preview.frequencyTotals[0]?.totals.subtotalMinor, 1000);
    assert.equal(preview.preview.frequencyTotals[0]?.totals.discountMinor, 100);
    assert.equal(preview.preview.frequencyTotals[0]?.totals.taxMinor, 90);
    assert.equal(preview.preview.frequencyTotals[0]?.totals.totalMinor, 990);
    assert.equal(preview.preview.frequencyTotals[1]?.totals.totalMinor, 1980);
    assert.notEqual(
      preview.preview.totals.totalMinor,
      preview.preview.frequencyTotals.reduce(
        (sum, group) => sum + group.totals.totalMinor,
        0,
      ),
    );
    const html = renderEditor(mixed);
    const oneTimeAt = html.indexOf('data-client-quote-frequency-group="one_time"');
    const monthlyAt = html.indexOf('data-client-quote-frequency-group="monthly"');
    const quarterlyAt = html.indexOf('data-client-quote-frequency-group="quarterly"');
    const annuallyAt = html.indexOf('data-client-quote-frequency-group="annually"');
    assert.ok(oneTimeAt >= 0 && monthlyAt > oneTimeAt);
    assert.ok(quarterlyAt > monthlyAt && annuallyAt > quarterlyAt);
    assert.match(html, /Totals by billing frequency/);
    assert.match(html, /not combined or converted to a yearly total/);
    assert.match(html, /data-field="frequency.one_time.subtotal"/);
    assert.match(html, /data-field="frequency.monthly.discount"/);
    assert.match(html, /data-field="frequency.quarterly.taxable"/);
    assert.match(html, /data-field="frequency.annually.tax"/);
    assert.match(html, /data-field="frequency.monthly.total"/);
    assert.match(html, /9\.90 USD/);
    assert.match(html, /19\.80 USD/);
    assert.match(html, /29\.70 USD/);
    assert.match(html, /39\.60 USD/);
    assert.doesNotMatch(html, /data-field="totals\.total"/);
    assert.doesNotMatch(html, /data-client-quote-totals="true"/);
    assert.doesNotMatch(html, /100\.00 USD|240\.00 USD|237\.60 USD/);

    const yen = editorDraftFromQuote(quoteFixture({}, "JPY"));
    yen.lines = [
      lineEdit("line-1", "Setup", "1500", "one_time"),
      lineEdit("line-2", "Care", "2000", "monthly"),
    ];
    const yenHtml = renderEditor(yen, { currencyCode: "JPY" });
    assert.match(yenHtml, /1500 JPY/);
    assert.match(yenHtml, /2000 JPY/);
    assert.doesNotMatch(yenHtml, /3500 JPY|24000 JPY|1\.500 JPY/);

    const fils = editorDraftFromQuote(quoteFixture({}, "BHD"));
    fils.lines = [
      lineEdit("line-1", "Setup", "1.050", "one_time"),
      lineEdit("line-2", "Care", "2.000", "quarterly"),
    ];
    const filsHtml = renderEditor(fils, { currencyCode: "BHD" });
    assert.match(filsHtml, /1\.050 BHD/);
    assert.match(filsHtml, /2\.000 BHD/);
  });

  it("rejects a fixed discount when billing frequencies are mixed", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    editor.lines = [
      lineEdit("line-1", "Setup", "50.00", "one_time"),
      lineEdit("line-2", "Care", "20.00", "monthly"),
    ];
    editor.discountKind = "none";
    const refused = setClientQuoteDiscountKind(editor, "fixed", "USD");
    assert.equal(refused.discountKind, "none");
    editor.discountKind = "fixed";
    editor.discountAmountText = "5.00";
    const preview = previewClientQuoteMoney(editor, "USD");
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.reason, "fixedDiscountMixed");
    assert.deepEqual(clientQuoteDraftBlockers(editor, "USD"), ["fixedDiscountMixed"]);
    const built = editorDraftToUpdateBody(editor, "USD");
    assert.equal(built.ok, false);
    if (built.ok) return;
    assert.equal(built.blockers[0], "fixedDiscountMixed");
    assert.match(
      clientQuoteBlockerMessage(messages, "fixedDiscountMixed"),
      /same billing frequency/,
    );
    const html = renderEditor(editor);
    assert.match(html, /data-client-quote-fixed-discount="unavailable"/);
    assert.match(html, /<option (?=[^>]*value="fixed")(?=[^>]*disabled="")[^>]*>/);
    assert.doesNotMatch(html, /data-field="totals\.total"/);
    assert.doesNotMatch(html, /data-client-quote-frequency-summary/);
    editor.discountKind = "percentage";
    editor.discountPercentText = "10";
    const percentage = previewClientQuoteMoney(editor, "USD");
    assert.equal(percentage.ok, true);
    if (!percentage.ok) return;
    assert.equal(percentage.preview.frequencyTotals[0]?.totals.discountMinor, 500);
    assert.equal(percentage.preview.frequencyTotals[1]?.totals.discountMinor, 200);
  });

  it("inserts a currency-matched template as an independent line and stops at 50", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    const template = hostingTemplate();
    const original = structuredClone(template);
    const eur = hostingTemplate({ currencyCode: "EUR", description: "Hébergement" });
    const compatible = compatibleClientQuoteTemplates(
      [
        { id: "usd-upper", ...template },
        { id: "eur", ...eur },
        { id: "usd-lower", ...hostingTemplate({ currencyCode: "usd" }) },
        { id: "bad", ...hostingTemplate({ currencyCode: "NOT-A-CODE" }) },
      ],
      "USD",
    );
    assert.deepEqual(
      compatible.map((item) => item.id),
      ["usd-upper", "usd-lower"],
    );
    assert.equal(insertClientQuoteTemplateLine(editor, eur, "USD"), editor);
    assert.equal(
      insertClientQuoteTemplateLine(
        editor,
        hostingTemplate({ deletedAt: "2026-10-10T00:00:00.000Z" }),
        "USD",
      ),
      editor,
    );
    const inserted = insertClientQuoteTemplateLine(editor, template, "USD");
    assert.notEqual(inserted, editor);
    const copied = copyClientQuoteTemplateToLine({
      template,
      currencyCode: "USD",
      lineId: "line-2",
    });
    const line = inserted.lines[1];
    assert.ok(line);
    assert.equal(line.id, "line-2");
    assert.notEqual(line.id, "usd-upper");
    assert.equal(line.description, copied.description);
    assert.equal(line.quantityText, "2.5");
    assert.equal(line.unitPriceText, "40.00");
    assert.equal(line.billingFrequency, "quarterly");
    assert.equal("templateId" in line, false);
    assert.deepEqual(template, original);
    const source = hostingTemplate();
    source.description = "Catalog renamed";
    source.unitPriceMinor = 1;
    source.billingFrequency = "annually";
    assert.equal(line.description, "Monthly hosting and backups");
    assert.equal(line.billingFrequency, "quarterly");
    const customized = {
      ...inserted,
      lines: inserted.lines.map((item, index) =>
        index === 1
          ? { ...item, description: "Custom hosting", unitPriceText: "55.00" }
          : item,
      ),
    };
    assert.equal(customized.lines[1]?.billingFrequency, "quarterly");
    assert.equal(template.description, original.description);
    const body = editorDraftToUpdateBody(customized, "USD");
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(JSON.stringify(body.body).includes("templateId"), false);
    assert.equal(body.body.draft.lineItems[1]?.description, "Custom hosting");
    assert.equal(body.body.draft.lineItems[1]?.billingFrequency, "quarterly");
    assert.equal(body.body.draft.lineItems[1]?.unitPriceMinor, 5500);

    let full = editorDraftFromQuote(quoteFixture());
    while (full.lines.length < CLIENT_QUOTE_FIELD_LIMITS.lineItems) {
      full = addClientQuoteLine(full, "USD");
    }
    assert.equal(full.lines.length, 50);
    assert.equal(insertClientQuoteTemplateLine(full, template, "USD"), full);
    assert.equal(addClientQuoteLine(full, "USD"), full);
    const fullHtml = renderEditor(full);
    const addTemplate = fullHtml.slice(
      fullHtml.indexOf('data-client-quote-add-template="true"'),
      fullHtml.indexOf('data-client-quote-add-template="true"') + 220,
    );
    assert.match(addTemplate, /disabled=""/);

    const loading = renderEditor(editor, {
      templatesOpen: true,
      templatesPhase: "loading",
    });
    assert.match(loading, /data-client-quote-add-template="true"/);
    assert.match(loading, /data-client-quote-template-loading="true"/);
    assert.match(loading, /Loading templates…/);
    assert.doesNotMatch(loading, /data-client-quote-template-empty/);

    const failed = renderEditor(editor, {
      templatesOpen: true,
      templatesPhase: "error",
    });
    assert.match(failed, /data-client-quote-template-error="true"/);
    assert.match(failed, /Templates could not be loaded/);
    assert.match(failed, /data-client-quote-template-retry="true"/);

    const empty = renderEditor(editor, {
      templatesOpen: true,
      templatesPhase: "ready",
      templateChoices: [],
    });
    assert.match(empty, /data-client-quote-template-empty="true"/);
    assert.match(empty, /No compatible templates/);

    const ready = renderEditor(editor, {
      templatesOpen: true,
      templatesPhase: "ready",
      templateChoices: [
        {
          id: "tmpl-1",
          name: template.name,
          description: template.description,
          unitPriceMinor: template.unitPriceMinor,
          currencyCode: "USD",
          billingFrequency: "quarterly",
        },
      ],
    });
    assert.match(ready, /data-client-quote-template="tmpl-1"/);
    assert.match(ready, /Managed hosting/);
    assert.match(ready, /Monthly hosting and backups/);
    assert.match(ready, /40\.00 USD/);
    assert.match(ready, /Quarterly/);
    const editorSource = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    );
    assert.match(editorSource, /\/api\/licensee\/client-quote-templates/);
    assert.match(
      read("lib/licensee/clientQuoteEditorModel.ts"),
      /copyClientQuoteTemplateToLine/,
    );
    assert.doesNotMatch(
      read("components/licensee/clientQuotes/ClientQuoteEditorView.tsx"),
      /calculateClientQuote/,
    );
    assert.equal(
      existsSync(join(ROOT, "app/licensee/client-quote-templates/page.tsx")),
      false,
    );
  });

  it("saves, issues, and revises frequency while ignoring client totals", () => {
    const editor = editorDraftFromQuote(quoteFixture());
    editor.lines = [
      lineEdit("line-1", "Setup", "50.00", "one_time"),
      lineEdit("line-2", "Care", "20.00", "monthly"),
    ];
    editor.discountKind = "percentage";
    editor.discountPercentText = "10";
    const built = editorDraftToUpdateBody(editor, "USD");
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal("currencyCode" in built.body.draft, false);
    assert.deepEqual(
      built.body.draft.lineItems.map((line) => line.billingFrequency),
      ["one_time", "monthly"],
    );
    const tampered = structuredClone(built.body.draft);
    tampered.totals = {
      subtotalMinor: 1,
      discountMinor: 1,
      taxableMinor: 1,
      taxMinor: 1,
      totalMinor: 1,
    };
    tampered.frequencyTotals = [];
    tampered.lineItems[0].lineTotalMinor = 1;
    const normalized = normalizeClientQuoteDraft(tampered, "USD");
    assert.notEqual(normalized.totals.totalMinor, 1);
    assert.equal(normalized.lineItems[0]?.lineTotalMinor, 5000);
    assert.equal(normalized.frequencyTotals?.[0]?.billingFrequency, "one_time");
    assert.equal(normalized.frequencyTotals?.[1]?.billingFrequency, "monthly");
    assert.equal(normalized.frequencyTotals?.[1]?.totals.totalMinor, 1800);
    assert.deepEqual(normalized.frequencyTotals, built.body.draft.frequencyTotals);

    const legacy = editorDraftFromQuote(quoteFixture());
    assert.equal(quoteFixture().draft.lineItems[0]?.billingFrequency, undefined);
    assert.equal(legacy.lines[0]?.billingFrequency, "one_time");
    const legacyBody = editorDraftToUpdateBody(legacy, "USD");
    assert.equal(legacyBody.ok, true);
    if (!legacyBody.ok) return;
    assert.equal(legacyBody.body.draft.lineItems[0]?.billingFrequency, "one_time");
    assert.equal(legacyBody.body.draft.frequencyTotals?.length, 1);
    assert.deepEqual(
      legacyBody.body.draft.totals,
      legacyBody.body.draft.frequencyTotals?.[0]?.totals,
    );

    const created = createDraftClientQuote({
      id: "11111111-1111-4111-8111-111111111111",
      licenseeAccountId: "22222222-2222-4222-8222-222222222222",
      organizationId: "33333333-3333-4333-8333-333333333333",
      requestedBy: null,
      contentLanguage: "fr",
      currencyCode: "USD",
      draft: built.body.draft,
      sourceEstimateId: null,
      sourceEstimateSnapshot: null,
      revisedFromQuoteId: null,
      createdAt: "2026-10-09T12:00:00.000Z",
    });
    const updated = updateDraftClientQuote(created, tampered, {
      updatedAt: "2026-10-09T12:05:00.000Z",
      contentLanguage: "fr",
    });
    assert.equal(updated.currency_code, "USD");
    assert.equal(updated.draft_json.lineItems[1]?.billingFrequency, "monthly");
    assert.notEqual(updated.draft_json.totals.totalMinor, 1);
    const issued = issueClientQuote(updated, {
      quoteNumber: "Q-2026-0099",
      issuedAt: "2026-10-09T12:06:00.000Z",
      updatedAt: "2026-10-09T12:06:00.000Z",
    });
    assert.equal(issued.issued_snapshot_json?.lineItems[0]?.billingFrequency, "one_time");
    assert.equal(issued.issued_snapshot_json?.lineItems[1]?.billingFrequency, "monthly");
    assert.deepEqual(
      issued.issued_snapshot_json?.frequencyTotals,
      issued.draft_json.frequencyTotals,
    );
    const revision = reviseIssuedClientQuote(issued, {
      id: "44444444-4444-4444-8444-444444444444",
      createdAt: "2026-10-09T13:00:00.000Z",
    });
    assert.equal(revision.status, "draft");
    assert.equal(revision.currency_code, "USD");
    assert.equal(issued.status, "issued");
    assert.deepEqual(
      revision.draft_json.lineItems.map((line) => line.billingFrequency),
      ["one_time", "monthly"],
    );
    assert.equal(revision.draft_json.frequencyTotals?.[1]?.billingFrequency, "monthly");

    const frozenEditor = editorDraftFromQuote({
      ...quoteFixture(),
      status: "issued",
      quoteNumber: "Q-2026-0099",
      issuedSnapshot: {
        ...issuedSnapshot(quoteFixture()),
        lineItems: normalized.lineItems,
        discount: normalized.discount,
        tax: normalized.tax,
        totals: normalized.totals,
        frequencyTotals: normalized.frequencyTotals,
      },
    });
    assert.equal(frozenEditor.lines[1]?.billingFrequency, "monthly");
    const issuedHtml = renderEditor(frozenEditor, {
      mode: "issued",
      quoteNumber: "Q-2026-0099",
      totals: normalized.totals,
      frequencyTotals: normalized.frequencyTotals,
      lineTotalsMinor: normalized.lineItems.map((line) => line.lineTotalMinor),
    });
    assert.match(issuedHtml, /data-client-quote-mode="issued"/);
    assert.match(issuedHtml, /data-field="line.line-2.billingFrequency"/);
    assert.match(issuedHtml, /Monthly/);
    assert.match(issuedHtml, /data-client-quote-frequency-summary="true"/);
    assert.doesNotMatch(issuedHtml, /<input|<textarea|<select/);
    assert.doesNotMatch(issuedHtml, /data-client-quote-add-template/);
    assert.doesNotMatch(issuedHtml, /data-field="totals\.total"/);

    const legacyIssued = renderEditor(editorDraftFromQuote(quoteFixture()), {
      mode: "issued",
      frequencyTotals: null,
      totals: quoteFixture().draft.totals,
    });
    assert.match(legacyIssued, /data-field="totals.total"/);
    assert.match(legacyIssued, /One-time/);
    assert.doesNotMatch(legacyIssued, /data-client-quote-frequency-summary/);
    assert.doesNotMatch(legacyIssued, /<select/);
  });

  it("labels frequency in the Master language and leaves authored text unchanged", () => {
    const editor = setClientQuoteLineBillingFrequency(
      editorDraftFromQuote(quoteFixture()),
      0,
      "monthly",
    );
    const french = getLicenseeLocalization("fr").messages;
    const html = renderEditor(editor, { messages: french });
    assert.match(html, /Fréquence de facturation/);
    assert.match(html, /Mensuel/);
    assert.match(html, /Ajouter depuis les modèles/);
    assert.match(html, /Website rebuild/);
    assert.match(html, /value="fr"/);
    assert.doesNotMatch(html, /Reconstruction|Refonte du site/);
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = getLicenseeLocalization(language).messages.clientQuotes;
      for (const frequency of CLIENT_QUOTE_BILLING_FREQUENCIES) {
        const label =
          frequency === "one_time"
            ? copy.frequencyOneTime
            : frequency === "monthly"
              ? copy.frequencyMonthly
              : frequency === "quarterly"
                ? copy.frequencyQuarterly
                : copy.frequencyAnnually;
        assert.ok(label.trim().length > 0, `${language} ${frequency}`);
      }
      assert.ok(copy.addFromTemplates.trim().length > 0);
      assert.ok(copy.templatesEmpty.trim().length > 0);
      assert.ok(copy.templatesLoading.trim().length > 0);
      assert.ok(copy.templatesLoadError.trim().length > 0);
      assert.ok(copy.frequencySummarySeparate.trim().length > 0);
    }
  });
});
