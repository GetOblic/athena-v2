/**
 * EST-QUOTE-2B.3A — draft currency selection and Prospect Create Quote entry.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { ProspectCreateQuoteCta } from "../../components/prospects/ProspectCreateQuoteCta";
import { ProspectDetailHeader } from "../../components/prospects/ProspectDetailHeader";
import {
  resolveEstimateCreateQuotePreselection,
  resolveRequestedProspectSelection,
} from "../../lib/licensee/estimateCreateQuotePreselection";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import {
  clientQuoteCurrencyOptions,
  clientQuoteDraftHasPricedAmount,
  compatibleClientQuoteTemplates,
  decideClientQuoteCurrencyChange,
  editorDraftToUpdateBody,
  insertClientQuoteTemplateLine,
  previewClientQuoteMoney,
  type ClientQuoteEditorDraft,
} from "../../lib/licensee/clientQuoteEditorModel";
import { prospectCreateQuoteEstimateHref } from "../../lib/licensee/prospectCreateQuoteHref";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  buildLicenseeOriginCookieValue,
} from "../../services/licensee/licenseeOriginCookie";
import { majorAmountToMinorUnits } from "../../services/clientQuote/clientQuoteMoney";
import {
  IssuedClientQuoteImmutableError,
  type ClientQuoteBillingFrequency,
} from "../../services/clientQuote/clientQuoteTypes";
import {
  confirmProspectCreateQuoteAccess,
  evaluateProspectCreateQuoteOrigin,
} from "../../lib/licensee/prospectCreateQuoteAccess";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

process.env.ATHENA_LICENSEE_HANDOFF_SECRET ??= "est-quote-2b3a-test-secret";

const ROOT = process.cwd();
const messages = getLicenseeLocalization("en").messages;
const ORG = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
const PROSPECT = "44444444-4444-4444-8444-444444444444";
const MASTER = "55555555-5555-4555-8555-555555555555";
const LICENSEE = "66666666-6666-4666-8666-666666666666";
const OTHER_LICENSEE = "77777777-7777-4777-8777-777777777777";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function address() {
  return {
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  };
}

function editor(lines: ClientQuoteEditorDraft["lines"]): ClientQuoteEditorDraft {
  return {
    issuer: {
      legalName: "Acme Legal",
      tradingName: "",
      postalAddress: address(),
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
      postalAddress: address(),
      phone: "",
      email: "",
      taxIdentifier: "",
    },
    projectTitle: "Website rebuild",
    scopeSummary: "Rebuild the marketing site.",
    lines,
    discountKind: "none",
    discountAmountText: "",
    discountPercentText: "",
    taxKind: "none",
    taxPercentText: "",
    taxLabel: "",
    paymentSummary: "Due on receipt.",
    paymentScheduleNote: "",
    validForDaysText: "30",
    validUntil: "",
    validityNote: "",
    appendixEnabled: false,
    appendixSections: [],
    contentLanguage: "fr",
  };
}

function line(
  id: string,
  price: string,
  frequency: ClientQuoteBillingFrequency,
): ClientQuoteEditorDraft["lines"][number] {
  return {
    id,
    description: id,
    quantityText: "1",
    unitPriceText: price,
    billingFrequency: frequency,
  };
}

function renderCurrency(
  draft: ClientQuoteEditorDraft,
  currencyCode: string,
  pendingCurrencyCode: string | null = null,
) {
  const preview = previewClientQuoteMoney(draft, currencyCode);
  return renderToStaticMarkup(
    createElement(ClientQuoteEditorView, {
      mode: "draft",
      quoteNumber: null,
      issuedAtLabel: null,
      currencyCode,
      pendingCurrencyCode,
      editor: draft,
      lineTotalsMinor: preview.ok ? preview.preview.lineTotalsMinor : null,
      totals: preview.ok ? preview.preview.totals : null,
      frequencyTotals: preview.ok ? preview.preview.frequencyTotals : null,
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
}

describe("quotation currency selection", () => {
  it("offers USD and EUR, confirms priced changes, and keeps minor units", () => {
    assert.deepEqual(clientQuoteCurrencyOptions("USD"), ["USD", "EUR"]);
    assert.deepEqual(clientQuoteCurrencyOptions("eur"), ["USD", "EUR"]);
    assert.deepEqual(clientQuoteCurrencyOptions("GBP"), ["GBP", "USD", "EUR"]);
    assert.equal(clientQuoteCurrencyOptions("JPY"), null);

    const priced = editor([
      line("line-1", "19.99", "monthly"),
      line("line-2", "40.00", "annually"),
    ]);
    const before = structuredClone(priced);
    const same = decideClientQuoteCurrencyChange({
      currentCurrency: "USD",
      nextCurrency: "USD",
      editor: priced,
    });
    assert.equal(same.action, "ignore");
    const pending = decideClientQuoteCurrencyChange({
      currentCurrency: "USD",
      nextCurrency: "EUR",
      editor: priced,
    });
    assert.deepEqual(pending, { action: "confirm", currencyCode: "EUR" });
    assert.deepEqual(priced, before);
    assert.equal(clientQuoteDraftHasPricedAmount(priced, "USD"), true);

    const zero = editor([line("line-1", "0.00", "one_time")]);
    assert.deepEqual(
      decideClientQuoteCurrencyChange({
        currentCurrency: "USD",
        nextCurrency: "EUR",
        editor: zero,
      }),
      { action: "apply", currencyCode: "EUR" },
    );
    assert.deepEqual(
      decideClientQuoteCurrencyChange({
        currentCurrency: "JPY",
        nextCurrency: "EUR",
        editor: priced,
      }),
      { action: "reject" },
    );
    assert.deepEqual(
      decideClientQuoteCurrencyChange({
        currentCurrency: "USD",
        nextCurrency: "GBP",
        editor: priced,
      }),
      { action: "reject" },
    );

    const usdPreview = previewClientQuoteMoney(priced, "USD");
    const eurPreview = previewClientQuoteMoney(priced, "EUR");
    assert.equal(usdPreview.ok && eurPreview.ok, true);
    if (!usdPreview.ok || !eurPreview.ok) return;
    assert.equal(eurPreview.preview.currencyCode, "EUR");
    assert.equal(eurPreview.preview.currencyScale, 2);
    assert.deepEqual(eurPreview.preview.lineTotalsMinor, usdPreview.preview.lineTotalsMinor);
    assert.deepEqual(
      eurPreview.preview.frequencyTotals.map((group) => group.billingFrequency),
      ["monthly", "annually"],
    );
    assert.deepEqual(
      eurPreview.preview.frequencyTotals.map((group) => group.totals),
      usdPreview.preview.frequencyTotals.map((group) => group.totals),
    );
    assert.equal(priced.lines[0]?.unitPriceText, "19.99");
    assert.equal(majorAmountToMinorUnits("19.99", "USD"), majorAmountToMinorUnits("19.99", "EUR"));

    const saved = editorDraftToUpdateBody(priced, "EUR", { explicitCurrencyCode: "EUR" });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.body.currencyCode, "EUR");
    assert.equal(saved.body.draft.lineItems[0]?.unitPriceMinor, 1999);
    assert.equal(saved.body.draft.lineItems[0]?.billingFrequency, "monthly");
    assert.equal(saved.body.contentLanguage, "fr");
    assert.notEqual(saved.body.draft.totals.totalMinor, 1);
    const omitted = editorDraftToUpdateBody(priced, "USD");
    assert.equal(omitted.ok, true);
    if (!omitted.ok) return;
    assert.equal("currencyCode" in omitted.body, false);

    const html = renderCurrency(priced, "USD", "EUR");
    assert.match(html, /data-client-quote-currency-selectable="true"/);
    assert.match(html, /data-field="currencyCode"/);
    assert.match(html, /value="USD"/);
    assert.match(html, /data-client-quote-currency-confirm="true"/);
    assert.match(html, /data-client-quote-currency-cancel="true"/);
    assert.match(html, /does not convert/);
    assert.match(html, /Change currency/);
    assert.match(html, /Cancel/);
    const issued = renderToStaticMarkup(
      createElement(ClientQuoteEditorView, {
        mode: "issued",
        quoteNumber: "Q-2026-0001",
        issuedAtLabel: "Oct 2, 2026",
        currencyCode: "EUR",
        editor: priced,
        lineTotalsMinor: eurPreview.preview.lineTotalsMinor,
        totals: eurPreview.preview.totals,
        frequencyTotals: eurPreview.preview.frequencyTotals,
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
    assert.match(issued, /data-client-quote-currency="EUR"/);
    assert.doesNotMatch(issued, /data-field="currencyCode"/);
    assert.match(issued, /cannot be changed/);
  });

  it("refilters templates by the selected currency and does not convert them", () => {
    const quantity = { coefficient: 1, scale: 0 as const };
    const templates = [
      {
        id: "usd",
        name: "Setup",
        description: "Setup",
        quantity,
        unitPriceMinor: 5000,
        currencyCode: "USD",
        billingFrequency: "one_time" as const,
      },
      {
        id: "eur",
        name: "Care",
        description: "Care",
        quantity,
        unitPriceMinor: 2000,
        currencyCode: "EUR",
        billingFrequency: "monthly" as const,
      },
    ];
    assert.deepEqual(
      compatibleClientQuoteTemplates(templates, "USD").map((item) => item.id),
      ["usd"],
    );
    assert.deepEqual(
      compatibleClientQuoteTemplates(templates, "EUR").map((item) => item.id),
      ["eur"],
    );
    const draft = editor([line("line-1", "10.00", "one_time")]);
    const rejected = insertClientQuoteTemplateLine(draft, templates[1], "USD");
    assert.equal(rejected, draft);
    const inserted = insertClientQuoteTemplateLine(draft, templates[1], "EUR");
    assert.equal(inserted.lines.length, 2);
    assert.equal(inserted.lines[1]?.unitPriceText, "20.00");
    assert.equal(inserted.lines[1]?.billingFrequency, "monthly");
    assert.equal(inserted.lines[0]?.unitPriceText, "10.00");
    const editorSource = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx",
    );
    assert.match(editorSource, /compatibleClientQuoteTemplates\(templates, activeCurrency\)/);
    assert.match(editorSource, /explicitCurrencyCode/);
    assert.doesNotMatch(
      [
        editorSource,
        read("lib/licensee/clientQuoteEditorModel.ts"),
        read("services/clientQuote/clientQuoteLifecycle.ts"),
        read("services/clientQuote/clientQuoteService.ts"),
      ].join("\n"),
      /exchangerate|openexchangerates|fixer\.io|frankfurter|convertCurrency|exchangeRate/i,
    );
  });

  it("rejects an issued currency edit in the lifecycle and preserves the issued source", async () => {
    const { createDraftClientQuote, issueClientQuote, reviseIssuedClientQuote, updateDraftClientQuote, resolveApprovedClientQuoteCurrency } =
      await import("../../services/clientQuote/clientQuoteLifecycle");
    const { CLIENT_QUOTE_DRAFT_SCHEMA_VERSION, CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION } =
      await import("../../services/clientQuote/clientQuoteTypes");
    const { ATHENA_ESTIMATE_SCHEMA_VERSION } = await import(
      "../../services/estimate/athenaEstimateTypes"
    );
    const built = editorDraftToUpdateBody(
      editor([line("line-1", "10.00", "monthly")]),
      "USD",
    );
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const draft = createDraftClientQuote({
      id: "11111111-1111-4111-8111-111111111111",
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
      requestedBy: MASTER,
      contentLanguage: "fr",
      currencyCode: "USD",
      draft: {
        ...built.body.draft,
        schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
      },
      sourceEstimateId: "88888888-8888-4888-8888-888888888888",
      sourceEstimateSnapshot: {
        schemaVersion: CLIENT_QUOTE_SOURCE_ESTIMATE_SCHEMA_VERSION,
        estimateId: "88888888-8888-4888-8888-888888888888",
        organizationId: ORG,
        organizationNameSnapshot: "Northwind",
        estimateSchemaVersion: ATHENA_ESTIMATE_SCHEMA_VERSION,
        currencyCode: "USD",
        recommendedClientPriceMinor: 1000,
      },
      revisedFromQuoteId: null,
      createdAt: "2026-10-09T12:00:00.000Z",
    });
    assert.equal(resolveApprovedClientQuoteCurrency("GBP", "EUR"), "EUR");
    assert.throws(
      () => resolveApprovedClientQuoteCurrency("JPY", "USD"),
      /minor-unit scale/,
    );
    const changed = updateDraftClientQuote(draft, built.body.draft, {
      updatedAt: "2026-10-09T12:05:00.000Z",
      currencyCode: "EUR",
    });
    assert.equal(changed.currency_code, "EUR");
    assert.equal(changed.draft_json.lineItems[0]?.unitPriceMinor, 1000);
    assert.equal(changed.source_estimate_snapshot?.currencyCode, "USD");
    assert.equal(changed.source_estimate_snapshot?.recommendedClientPriceMinor, 1000);
    const issued = issueClientQuote(changed, {
      quoteNumber: "Q-2026-0004",
      issuedAt: "2026-10-09T12:06:00.000Z",
      updatedAt: "2026-10-09T12:06:00.000Z",
    });
    assert.equal(issued.issued_snapshot_json?.currencyCode, "EUR");
    assert.throws(
      () =>
        updateDraftClientQuote(issued, issued.draft_json, {
          updatedAt: "2026-10-09T12:07:00.000Z",
          currencyCode: "USD",
        }),
      (error: unknown) => error instanceof IssuedClientQuoteImmutableError,
    );
    const revision = reviseIssuedClientQuote(issued, {
      id: "99999999-9999-4999-8999-999999999999",
      createdAt: "2026-10-09T12:08:00.000Z",
    });
    assert.equal(revision.currency_code, "EUR");
    assert.equal(revision.status, "draft");
    const revisionUsd = updateDraftClientQuote(revision, revision.draft_json, {
      updatedAt: "2026-10-09T12:09:00.000Z",
      currencyCode: "USD",
    });
    assert.equal(revisionUsd.currency_code, "USD");
    assert.equal(issued.currency_code, "EUR");
  });
});

describe("Prospect Create Quote entry", () => {
  const subAccounts = [
    { organizationId: ORG },
    { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ];

  it("preselects only an owned organization and a selectable Prospect", () => {
    const quiet = resolveEstimateCreateQuotePreselection({
      subAccounts,
    });
    assert.equal(quiet.organizationId, ORG);
    assert.equal(quiet.requestedProspectId, null);
    assert.equal(quiet.notice, null);

    const selected = resolveEstimateCreateQuotePreselection({
      requestedOrganizationId: ORG,
      requestedProspectId: PROSPECT,
      subAccounts,
    });
    assert.equal(selected.organizationId, ORG);
    assert.equal(selected.requestedProspectId, PROSPECT);
    assert.deepEqual(
      resolveRequestedProspectSelection({
        requestedProspectId: selected.requestedProspectId,
        selectableProspectIds: [PROSPECT],
      }),
      { prospectId: PROSPECT, available: true },
    );

    const foreign = resolveEstimateCreateQuotePreselection({
      requestedOrganizationId: OTHER_ORG,
      requestedProspectId: PROSPECT,
      subAccounts,
    });
    assert.equal(foreign.organizationId, ORG);
    assert.equal(foreign.requestedProspectId, null);
    assert.equal(foreign.notice, "organization");

    const stale = resolveRequestedProspectSelection({
      requestedProspectId: PROSPECT,
      selectableProspectIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    });
    assert.deepEqual(stale, { prospectId: null, available: false });
    const invalidProspect = resolveEstimateCreateQuotePreselection({
      requestedOrganizationId: ORG,
      requestedProspectId: "not-a-prospect",
      subAccounts,
    });
    assert.equal(invalidProspect.organizationId, ORG);
    assert.equal(invalidProspect.notice, "prospect");
    assert.equal(invalidProspect.requestedProspectId, null);
  });

  it("shows Create Quote only for the Master origin of this organization", async () => {
    const cookie = buildLicenseeOriginCookieValue({
      masterUserId: MASTER,
      licenseeAccountId: LICENSEE,
      organizationId: ORG,
    });
    const origin = evaluateProspectCreateQuoteOrigin({
      organizationId: ORG,
      prospectId: PROSPECT,
      originCookieValue: cookie,
    });
    assert.ok(origin);
    const access = await confirmProspectCreateQuoteAccess(origin!, {
      getAccount: async () => ({ id: LICENSEE, defaultLanguage: "fr" }),
      isMasterActive: async () => true,
      ownsSubAccount: async (licenseeAccountId, organizationId) =>
        licenseeAccountId === LICENSEE && organizationId === ORG,
    });
    assert.equal(access?.language, "fr");
    assert.equal(
      access?.href,
      prospectCreateQuoteEstimateHref(ORG, PROSPECT),
    );

    assert.equal(
      evaluateProspectCreateQuoteOrigin({
        organizationId: ORG,
        prospectId: PROSPECT,
        originCookieValue: null,
      }),
      null,
    );
    assert.equal(
      evaluateProspectCreateQuoteOrigin({
        organizationId: ORG,
        prospectId: PROSPECT,
        originCookieValue: buildLicenseeOriginCookieValue({
          masterUserId: MASTER,
          licenseeAccountId: LICENSEE,
          organizationId: OTHER_ORG,
        }),
      }),
      null,
    );
    assert.equal(
      evaluateProspectCreateQuoteOrigin({
        organizationId: ORG,
        prospectId: PROSPECT,
        originCookieValue: buildLicenseeOriginCookieValue({
          masterUserId: MASTER,
          licenseeAccountId: LICENSEE,
          organizationId: ORG,
          nowMs: Date.now() - 9 * 60 * 60 * 1000,
        }),
      }),
      null,
    );
    const denied = await confirmProspectCreateQuoteAccess(origin!, {
      getAccount: async () => ({ id: OTHER_LICENSEE, defaultLanguage: "en" }),
      isMasterActive: async () => true,
      ownsSubAccount: async () => true,
    });
    assert.equal(denied, null);
    const inactive = await confirmProspectCreateQuoteAccess(origin!, {
      getAccount: async () => ({ id: LICENSEE, defaultLanguage: "en" }),
      isMasterActive: async () => false,
      ownsSubAccount: async () => true,
    });
    assert.equal(inactive, null);
    const otherLicensee = await confirmProspectCreateQuoteAccess(origin!, {
      getAccount: async () => ({ id: LICENSEE, defaultLanguage: "en" }),
      isMasterActive: async () => true,
      ownsSubAccount: async () => false,
    });
    assert.equal(otherLicensee, null);

    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /resolveProspectCreateQuoteAccess/);
    assert.match(page, /createQuoteAccess \?/);
    assert.doesNotMatch(page, /licenseeMasterMarker|licenseeOriginCookie/);
    assert.doesNotMatch(page, /document\.cookie|cookies\(\)/);
    const cta = read("components/prospects/ProspectCreateQuoteCta.tsx");
    assert.match(cta, /return_to_master/);
    assert.match(cta, /window\.location\.assign\(href\)/);
    assert.doesNotMatch(cta, /\/api\/licensee\/estimate/);
    const html = renderToStaticMarkup(
      createElement(ProspectCreateQuoteCta, {
        href: access!.href,
        language: "fr",
      }),
    );
    assert.match(html, /Créer un devis/);
    assert.match(html, /organizationId=22222222-2222-4222-8222-222222222222/);
    assert.match(html, /prospectId=44444444-4444-4444-8444-444444444444/);
    const hidden = renderToStaticMarkup(
      createElement(ProspectDetailHeader, {
        backLabel: "Prospects",
        eyebrow: "Prospect",
        title: "Northwind",
        intelligenceLabel: "Ready",
        intelligenceStatus: "ready",
        ready: true,
        hasDiscussion: false,
        askAthenaLabel: "Ask",
        addObservationLabel: "Add",
        editProfileLabel: "Edit",
        openWebsiteLabel: "Site",
        completenessScore: null,
        generateActions: null,
        researchAction: null,
        lifecycleAction: null,
        intelligenceGroupLabel: "Intelligence",
        prospectToolsLabel: "Tools",
        directoryGroupLabel: "Directory",
      }),
    );
    assert.doesNotMatch(hidden, /data-prospect-header-action="create-quote"/);
  });

  it("does not change Estimate creation or the GHL quote", () => {
    const client = read("components/licensee/estimate/LicenseeEstimateClient.tsx");
    const page = read("app/licensee/estimate/page.tsx");
    assert.match(client, /resolveEstimateCreateQuotePreselection/);
    assert.match(client, /resolveRequestedProspectSelection/);
    assert.match(page, /readEstimateQueryValue/);
    assert.match(client, /method: "POST"/);
    assert.match(client, /fetch\("\/api\/licensee\/estimate"/);
    assert.doesNotMatch(client, /useEffect\(\(\) => \{[\s\S]{0,180}handleSubmit/);
    assert.doesNotMatch(read("app/api/licensee/estimate/route.ts"), /searchParams/);
    assert.doesNotMatch(read("services/estimate/athenaEstimateOrchestration.ts"), /requestedOrganizationId/);
    const ghl = read("app/licensee/quote/page.tsx");
    const publicQuote = read("app/quote/page.tsx");
    assert.match(ghl, /AthenaQuoteFormEmbed/);
    assert.doesNotMatch(ghl, /clientQuote|createQuoteFromProspect|currencyCode/);
    assert.doesNotMatch(publicQuote, /clientQuote|ProspectCreateQuoteCta/);
  });
});

describe("currency and Create Quote copy", () => {
    const catalogs = { en, fr, es, it: itMessages, de, pt };

  it("keeps the new Master strings in all six languages", () => {
    assert.deepEqual(ORGANIZATION_LANGUAGES, ["en", "fr", "es", "it", "de", "pt"]);
    const quoteKeys = [
      "currencyLabel",
      "currencyHint",
      "currencyUsd",
      "currencyEur",
      "currencyChangeTitle",
      "currencyChangeBody",
      "currencyChangeConfirm",
      "currencyChangeCancel",
      "currencyIssuedLocked",
    ] as const;
    const estimateKeys = [
      "preselectionUnavailable",
      "preselectionProspectUnavailable",
      "createQuoteFromProspect",
      "createQuoteFromProspectHint",
      "createQuoteOpening",
      "createQuoteOpenFailed",
    ] as const;
    for (const key of quoteKeys) {
      const values = new Set<string>();
      for (const catalog of Object.values(catalogs)) {
        const value = catalog.licensee.clientQuotes[key];
        assert.equal(typeof value, "string");
        assert.ok(value.trim().length > 2);
        values.add(value);
      }
      if (key !== "currencyEur") assert.ok(values.size > 1);
    }
    for (const key of estimateKeys) {
      const values = new Set<string>();
      for (const catalog of Object.values(catalogs)) {
        const value = catalog.licensee.estimate[key];
        assert.equal(typeof value, "string");
        assert.ok(value.trim().length > 2);
        values.add(value);
      }
      assert.ok(values.size > 1);
    }
    assert.match(en.licensee.clientQuotes.currencyHint, /does not convert/);
    assert.match(en.licensee.clientQuotes.currencyHint, /screen language/);
    assert.match(fr.licensee.clientQuotes.currencyChangeBody, /ne les convertit pas/);
    assert.equal(en.licensee.estimate.createQuoteFromProspect, "Create Quote");
    assert.notEqual(
      en.licensee.clientQuotes.currencyChangeCancel,
      fr.licensee.clientQuotes.currencyChangeCancel,
    );
  });
});
