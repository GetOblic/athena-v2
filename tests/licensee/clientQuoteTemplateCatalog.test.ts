/**
 * EST-QUOTE-2B.4 — Licensee service-template catalog UI.
 * Mocked presentation and payload checks. No database and no model calls.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientQuoteLibraryView } from "../../components/licensee/clientQuotes/ClientQuoteLibraryView";
import {
  ClientQuoteTemplateCatalogView,
  type ClientQuoteTemplateFormState,
} from "../../components/licensee/clientQuotes/ClientQuoteTemplateCatalogView";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import {
  buildClientQuoteTemplateRequest,
  clientQuoteTemplateCurrencyOptions,
  clientQuoteTemplateFormFromTemplate,
  emptyClientQuoteTemplateForm,
  filterClientQuoteTemplates,
  type ClientQuoteTemplateFormValues,
} from "../../lib/licensee/clientQuoteTemplateCatalogModel";
import {
  CLIENT_QUOTE_TEMPLATE_STABLE_ERROR_CODES,
  clientQuoteTemplateErrorMessage,
  clientQuoteTemplateFrequencyLabels,
} from "../../lib/licensee/clientQuoteTemplateCatalogMessages";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { copyClientQuoteTemplateToLine } from "../../services/clientQuote/clientQuoteTemplateCopy";
import type { PublicClientQuoteTemplate } from "../../services/clientQuote/clientQuoteTemplatePublic";
import {
  CLIENT_QUOTE_BILLING_FREQUENCIES,
  type ClientQuoteBillingFrequency,
} from "../../services/clientQuote/clientQuoteTypes";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();
const messages = getLicenseeLocalization("en").messages;

const CATALOG_FILES = [
  "app/licensee/client-quotes/templates/page.tsx",
  "components/licensee/clientQuotes/ClientQuoteTemplateCatalogView.tsx",
  "components/licensee/clientQuotes/LicenseeClientQuoteTemplateCatalog.tsx",
  "lib/licensee/clientQuoteTemplateCatalogModel.ts",
  "lib/licensee/clientQuoteTemplateCatalogMessages.ts",
];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.keys(value as object)
    .sort()
    .flatMap((key) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return collectKeyPaths((value as Record<string, unknown>)[key], next);
    });
}

function template(overrides: Partial<PublicClientQuoteTemplate> = {}): PublicClientQuoteTemplate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Managed hosting",
    description: "Monthly hosting and backups",
    quantity: { coefficient: 1, scale: 0 },
    unitPriceMinor: 1999,
    currencyCode: "USD",
    billingFrequency: "monthly",
    createdAt: "2026-10-09T12:00:00.000Z",
    updatedAt: "2026-10-09T12:00:00.000Z",
    ...overrides,
  };
}

function values(
  overrides: Partial<ClientQuoteTemplateFormValues> = {},
): ClientQuoteTemplateFormValues {
  return {
    ...emptyClientQuoteTemplateForm(),
    name: "Care plan",
    description: "Backups and monitoring",
    quantityText: "1",
    unitPriceText: "19.99",
    currencyCode: "USD",
    billingFrequency: "monthly",
    ...overrides,
  };
}

function renderCatalog(
  overrides: Partial<Parameters<typeof ClientQuoteTemplateCatalogView>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(ClientQuoteTemplateCatalogView, {
      phase: "ready",
      templates: [],
      error: null,
      notice: null,
      locale: "en-US",
      messages,
      form: null,
      mask: null,
      onRetry: () => undefined,
      onCreate: () => undefined,
      onEdit: () => undefined,
      onCancelForm: () => undefined,
      onChangeForm: () => undefined,
      onSubmitForm: () => undefined,
      onRequestMask: () => undefined,
      onCancelMask: () => undefined,
      onConfirmMask: () => undefined,
      ...overrides,
    }),
  );
}

function formState(
  overrides: Partial<ClientQuoteTemplateFormState> = {},
): ClientQuoteTemplateFormState {
  return {
    mode: "create",
    templateId: null,
    originalCurrencyCode: null,
    values: values(),
    fieldErrors: {},
    formError: null,
    pending: false,
    ...overrides,
  };
}

describe("service template catalog authorization and navigation", () => {
  it("protects the catalog page as an active Licensee Master", () => {
    const page = read("app/licensee/client-quotes/templates/page.tsx");
    assert.match(page, /redirect\("\/licensee\/login"\)/);
    assert.match(page, /getLicenseeAccountByUserId/);
    assert.match(page, /\/api\/licensee\/master-marker\?action=clear/);
    assert.match(page, /This Master account has been deactivated/);
    assert.match(page, /\/api\/licensee\/master-marker\?action=refresh/);
    assert.match(page, /getLicenseeLocalization/);
    assert.match(page, /messages\.common\.backToMasterDashboard/);
    assert.match(page, /LicenseeClientQuoteTemplateCatalog/);
    assert.doesNotMatch(page, /getTenantLocalization|requireCurrentOrganizationContext/);
    assert.doesNotMatch(page, /DashboardSidebar|navigator\.language/);
    assert.doesNotMatch(page, /athena_client_quote_templates|\.from\(/);
  });

  it("links the client quotation library to the catalog and not the Master dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(ClientQuoteLibraryView, {
        phase: "ready",
        quotes: [],
        error: null,
        locale: "en-US",
        messages,
        onRetry: () => undefined,
      }),
    );
    assert.match(html, /data-client-quote-manage-templates="true"/);
    assert.match(html, /href="\/licensee\/client-quotes\/templates"/);
    assert.match(html, /Manage Service Templates/);
    const library = read("components/licensee/clientQuotes/ClientQuoteLibraryView.tsx");
    assert.match(library, /messages\.clientQuoteTemplates\.manageAction/);
    const dashboard = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(dashboard, /href="\/licensee\/client-quotes"/);
    assert.doesNotMatch(dashboard, /\/licensee\/client-quotes\/templates/);
  });
});

describe("service template form, currency, and precision", () => {
  it("builds integer minor units for every frequency without binary floating point", () => {
    assert.equal(Math.floor(19.99 * 100), 1998);
    for (const billingFrequency of CLIENT_QUOTE_BILLING_FREQUENCIES) {
      const built = buildClientQuoteTemplateRequest(
        values({ billingFrequency, unitPriceText: "19.99", quantityText: "1.25" }),
        { originalCurrencyCode: null },
      );
      assert.equal(built.ok, true, billingFrequency);
      if (!built.ok) return;
      assert.equal(built.body.billingFrequency, billingFrequency);
      assert.equal(built.body.unitPriceMinor, 1999);
      assert.deepEqual(built.body.quantity, { coefficient: 125, scale: 2 });
      assert.equal(Number.isSafeInteger(built.body.unitPriceMinor), true);
    }
    const cents = buildClientQuoteTemplateRequest(
      values({ unitPriceText: "0.10" }),
      { originalCurrencyCode: null },
    );
    const more = buildClientQuoteTemplateRequest(
      values({ unitPriceText: "0.20" }),
      { originalCurrencyCode: null },
    );
    assert.equal(cents.ok && more.ok, true);
    if (!cents.ok || !more.ok) return;
    assert.equal(cents.body.unitPriceMinor + more.body.unitPriceMinor, 30);
    const rounded = buildClientQuoteTemplateRequest(
      values({ unitPriceText: "10.005" }),
      { originalCurrencyCode: null },
    );
    assert.equal(rounded.ok, true);
    if (!rounded.ok) return;
    assert.equal(rounded.body.unitPriceMinor, 1001);
    const keys = Object.keys(rounded.body).sort();
    assert.deepEqual(keys, [
      "billingFrequency",
      "currencyCode",
      "description",
      "name",
      "quantity",
      "unitPriceMinor",
    ]);
    assert.equal(JSON.stringify(rounded.body).includes("licenseeAccountId"), false);
    assert.equal(JSON.stringify(rounded.body).includes("organizationId"), false);
  });

  it("offers USD and EUR for new templates and keeps other ISO currencies editable", () => {
    assert.deepEqual(clientQuoteTemplateCurrencyOptions(null), ["USD", "EUR"]);
    assert.deepEqual(clientQuoteTemplateCurrencyOptions("usd"), ["USD", "EUR"]);
    assert.deepEqual(clientQuoteTemplateCurrencyOptions("GBP"), ["GBP", "USD", "EUR"]);
    assert.deepEqual(clientQuoteTemplateCurrencyOptions("jpy"), ["JPY"]);
    assert.deepEqual(clientQuoteTemplateCurrencyOptions("KWD"), ["KWD"]);

    const created = buildClientQuoteTemplateRequest(values({ currencyCode: "EUR" }), {
      originalCurrencyCode: null,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.body.currencyCode, "EUR");
    assert.equal(created.body.unitPriceMinor, 1999);

    const blocked = buildClientQuoteTemplateRequest(values({ currencyCode: "JPY" }), {
      originalCurrencyCode: null,
    });
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.deepEqual(blocked.fields, ["currency"]);

    const yen = buildClientQuoteTemplateRequest(
      values({ currencyCode: "JPY", unitPriceText: "1500", quantityText: "2" }),
      { originalCurrencyCode: "JPY" },
    );
    assert.equal(yen.ok, true);
    if (!yen.ok) return;
    assert.equal(yen.body.unitPriceMinor, 1500);
    assert.deepEqual(yen.body.quantity, { coefficient: 2, scale: 0 });

    const fils = buildClientQuoteTemplateRequest(
      values({ currencyCode: "KWD", unitPriceText: "1.234" }),
      { originalCurrencyCode: "KWD" },
    );
    assert.equal(fils.ok, true);
    if (!fils.ok) return;
    assert.equal(fils.body.unitPriceMinor, 1234);

    const moved = buildClientQuoteTemplateRequest(
      values({ currencyCode: "EUR", unitPriceText: "40.00" }),
      { originalCurrencyCode: "GBP" },
    );
    assert.equal(moved.ok, true);
    if (!moved.ok) return;
    assert.equal(moved.body.currencyCode, "EUR");
    assert.equal(moved.body.unitPriceMinor, 4000);

    const reinterpreted = buildClientQuoteTemplateRequest(
      values({ currencyCode: "EUR", unitPriceText: "1500" }),
      { originalCurrencyCode: "JPY" },
    );
    assert.equal(reinterpreted.ok, false);
    if (reinterpreted.ok) return;
    assert.ok(reinterpreted.fields.includes("currency"));

    const jpyForm = clientQuoteTemplateFormFromTemplate(
      template({
        currencyCode: "JPY",
        unitPriceMinor: 1500,
        quantity: { coefficient: 25, scale: 1 },
        billingFrequency: "annually",
      }),
    );
    assert.equal(jpyForm.unitPriceText, "1500");
    assert.equal(jpyForm.quantityText, "2.5");
    assert.equal(jpyForm.currencyCode, "JPY");
    const usdForm = clientQuoteTemplateFormFromTemplate(template());
    assert.equal(usdForm.unitPriceText, "19.99");
  });

  it("rejects incomplete fields and renders create, edit, USD, EUR, and all frequencies", () => {
    const missing = buildClientQuoteTemplateRequest(
      values({ name: "  ", description: "", quantityText: "0", unitPriceText: "", billingFrequency: "weekly" }),
      { originalCurrencyCode: null },
    );
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.deepEqual(missing.fields, [
      "name",
      "description",
      "quantity",
      "unitPrice",
      "frequency",
    ]);

    const createHtml = renderCatalog({ form: formState() });
    assert.match(createHtml, /data-quote-template-form="create"/);
    assert.match(createHtml, /Create template/);
    assert.match(createHtml, /Service name/);
    assert.match(createHtml, /data-quote-template-save="true"/);
    assert.match(createHtml, />Save</);
    assert.match(createHtml, />Cancel</);
    const createCurrency = createHtml.slice(
      createHtml.indexOf('data-quote-template-currency="true"'),
      createHtml.indexOf('data-quote-template-frequency="true"'),
    );
    assert.match(createCurrency, /value="USD"/);
    assert.match(createCurrency, /value="EUR"/);
    assert.doesNotMatch(createCurrency, /value="JPY"|value="GBP"/);
    for (const frequency of CLIENT_QUOTE_BILLING_FREQUENCIES) {
      assert.match(createHtml, new RegExp(`value="${frequency}"`));
    }

    const editHtml = renderCatalog({
      form: formState({
        mode: "edit",
        templateId: template().id,
        originalCurrencyCode: "JPY",
        values: clientQuoteTemplateFormFromTemplate(
          template({ currencyCode: "JPY", unitPriceMinor: 1500, billingFrequency: "quarterly" }),
        ),
      }),
    });
    assert.match(editHtml, /data-quote-template-form="edit"/);
    assert.match(editHtml, /Edit template/);
    assert.match(editHtml, /value="1500"/);
    assert.match(editHtml, /value="JPY"/);
    assert.match(editHtml, /value="quarterly"/);
    const editCurrency = editHtml.slice(
      editHtml.indexOf('data-quote-template-currency="true"'),
      editHtml.indexOf('data-quote-template-frequency="true"'),
    );
    assert.match(editCurrency, /value="JPY"/);
    assert.doesNotMatch(editCurrency, /value="USD"|value="EUR"/);

    const invalid = renderCatalog({
      form: formState({
        fieldErrors: { name: messages.clientQuoteTemplates.errors.nameRequired },
        formError: messages.clientQuoteTemplates.errors.validation,
        pending: true,
      }),
    });
    assert.match(invalid, /data-quote-template-field-error="name"/);
    assert.match(invalid, /Enter a service name/);
    assert.match(invalid, /data-quote-template-form-error="true"/);
    assert.match(invalid, /Saving…/);
    assert.match(invalid, /disabled=""/);
  });
});

describe("service template search, empty states, and masking", () => {
  const labels = {
    frequency: clientQuoteTemplateFrequencyLabels(messages),
    currency: {
      USD: messages.clientQuoteTemplates.currencyUsd,
      EUR: messages.clientQuoteTemplates.currencyEur,
    },
  };

  it("filters instantly without reordering and shows empty and no-result states", () => {
    const rows = [
      template({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Zebra care", currencyCode: "USD" }),
      template({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Alpha setup",
        description: "Launch workshop",
        currencyCode: "EUR",
        billingFrequency: "one_time" as ClientQuoteBillingFrequency,
      }),
    ];
    const untouched = filterClientQuoteTemplates(rows, "   ", labels);
    assert.deepEqual(
      untouched.map((row) => row.name),
      ["Zebra care", "Alpha setup"],
    );
    assert.deepEqual(
      filterClientQuoteTemplates(rows, "  EURO ", labels).map((row) => row.name),
      ["Alpha setup"],
    );
    assert.deepEqual(
      filterClientQuoteTemplates(rows, "HOSTING", labels).map((row) => row.name),
      ["Zebra care"],
    );
    assert.deepEqual(
      filterClientQuoteTemplates(rows, "one_time", labels).map((row) => row.name),
      ["Alpha setup"],
    );
    const french = clientQuoteTemplateFrequencyLabels(getLicenseeLocalization("fr").messages);
    assert.deepEqual(
      filterClientQuoteTemplates(rows, "  mensuel ", {
        frequency: french,
        currency: labels.currency,
      }).map((row) => row.name),
      ["Zebra care"],
    );
    assert.equal(filterClientQuoteTemplates(rows, "missing", labels).length, 0);
    assert.doesNotMatch(read("lib/licensee/clientQuoteTemplateCatalogModel.ts"), /\.sort\(/);

    const empty = renderCatalog();
    assert.match(empty, /data-quote-template-empty="true"/);
    assert.match(empty, /No templates/);
    assert.match(empty, /Create Service Template/);
    assert.doesNotMatch(empty, /data-quote-template-search=/);
    assert.doesNotMatch(empty, /data-quote-template-search-empty/);

    const none = renderCatalog({ templates: rows, searchQuery: "missing" });
    assert.match(none, /data-quote-template-search-empty="true"/);
    assert.match(none, /No search results/);
    assert.doesNotMatch(none, /data-quote-template-row=/);

    const found = renderCatalog({ templates: rows, searchQuery: " zebra " });
    assert.match(found, /data-quote-template-row="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"/);
    assert.match(found, /19\.99 USD/);
    assert.match(found, /Monthly/);
    assert.doesNotMatch(found, /Alpha setup/);
    assert.match(found, /data-quote-template-search-clear="true"/);

    const loading = renderCatalog({ phase: "loading", templates: rows });
    assert.match(loading, /data-quote-template-loading="true"/);
    assert.match(loading, /Loading templates…/);
    const failed = renderCatalog({
      phase: "error",
      error: messages.clientQuoteTemplates.errors.generic,
    });
    assert.match(failed, /role="alert"/);
    assert.match(failed, /data-quote-template-retry="true"/);
  });

  it("confirms masking with name, currency, price, and frequency, and cancel does not delete", () => {
    const row = template({ currencyCode: "JPY", unitPriceMinor: 1500, billingFrequency: "annually" });
    const html = renderCatalog({
      templates: [row],
      mask: { template: row, pending: false, error: null },
    });
    assert.match(html, /data-quote-template-mask="true"/);
    assert.match(html, /data-quote-template-mask-name="true"/);
    assert.match(html, /Managed hosting/);
    assert.match(html, /data-quote-template-mask-currency="true"/);
    assert.match(html, />JPY</);
    assert.match(html, /data-quote-template-mask-price="true"/);
    assert.match(html, />1500</);
    assert.match(html, /data-quote-template-mask-frequency="true"/);
    assert.match(html, /Annually/);
    assert.match(html, /data-quote-template-mask-cancel="true"/);
    assert.match(html, /data-quote-template-mask-confirm="true"/);
    assert.match(html, /Delete template/);
    assert.match(html, /Quotations that already copied its values stay unchanged/);

    const source = read(
      "components/licensee/clientQuotes/LicenseeClientQuoteTemplateCatalog.tsx",
    );
    const cancel = source.slice(
      source.indexOf("function cancelMask()"),
      source.indexOf("async function confirmMask()"),
    );
    assert.match(cancel, /setMask\(null\)/);
    assert.doesNotMatch(cancel, /fetch|DELETE/);
    assert.match(source, /maskLock\.current/);
    assert.match(source, /saveLock\.current/);
    assert.match(source, /method: "DELETE"/);
    assert.match(source, /method: templateId \? "PATCH" : "POST"/);
    assert.match(source, /\/api\/licensee\/client-quote-templates\/\$\{templateId\}/);
    assert.doesNotMatch(source, /\/api\/licensee\/client-quotes/);
    assert.doesNotMatch(source, /licenseeAccountId|organizationId|organization_id/);
    assert.doesNotMatch(source, /restore|undelete/i);
    const route = read("app/api/licensee/client-quote-templates/[id]/route.ts");
    assert.match(route, /maskClientQuoteTemplateForMaster/);
    assert.match(route, /export async function DELETE/);
    assert.match(route, /export async function PATCH/);
    assert.doesNotMatch(route, /\.delete\(/);
  });
});

describe("service template boundaries", () => {
  it("keeps copied quotation lines independent of later catalog edits", () => {
    const sourceTemplate = {
      name: "Care plan",
      description: "Backups and monitoring",
      quantity: { coefficient: 15, scale: 1 },
      unitPriceMinor: 1999,
      currencyCode: "USD",
      billingFrequency: "monthly" as const,
    };
    const line = copyClientQuoteTemplateToLine({
      template: sourceTemplate,
      currencyCode: "USD",
      lineId: "line-1",
    });
    line.unitPriceMinor = 1;
    line.description = "Changed on the quotation";
    assert.equal(sourceTemplate.unitPriceMinor, 1999);
    assert.equal(sourceTemplate.description, "Backups and monitoring");
    assert.equal("templateId" in line, false);
    assert.equal(JSON.stringify(line).includes("templateId"), false);
    const built = buildClientQuoteTemplateRequest(values({ unitPriceText: "40.00" }), {
      originalCurrencyCode: null,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.body.unitPriceMinor, 4000);
    assert.equal(line.unitPriceMinor, 1);
  });

  it("preserves the template API contract, the GHL quote, and stays free of AI and workers", () => {
    const collection = read("app/api/licensee/client-quote-templates/route.ts");
    const item = read("app/api/licensee/client-quote-templates/[id]/route.ts");
    assert.match(collection, /export async function GET/);
    assert.match(collection, /export async function POST/);
    assert.match(collection, /listClientQuoteTemplatesForMaster/);
    assert.match(collection, /createClientQuoteTemplateForMaster/);
    assert.match(item, /updateClientQuoteTemplateForMaster/);
    assert.match(item, /toPublicClientQuoteTemplate/);
    assert.doesNotMatch(collection, /licenseeAccountId/);
    assert.doesNotMatch(item, /organizationId/);

    const quotePage = read("app/licensee/quote/page.tsx");
    assert.match(quotePage, /AthenaQuoteFormEmbed/);
    assert.doesNotMatch(
      quotePage,
      /client-quote-templates|client-quotes\/templates|clientQuoteTemplate|billingFrequency/,
    );
    const editor = read("components/licensee/clientQuotes/LicenseeClientQuoteEditor.tsx");
    assert.match(editor, /\/api\/licensee\/client-quote-templates/);
    assert.doesNotMatch(
      editor,
      /client-quote-templates[\s\S]{0,180}method:\s*"(POST|PATCH|DELETE)"/,
    );
    for (const file of [
      ...CATALOG_FILES,
      "app/licensee/quote/page.tsx",
      "services/clientQuote/clientQuoteMoney.ts",
      "services/clientQuote/pdf/renderClientQuotePdf.ts",
    ]) {
      assert.doesNotMatch(read(file), /openrouter|openai|anthropic|workers\//i);
    }
    assert.doesNotMatch(
      read("lib/licensee/clientQuoteTemplateCatalogModel.ts"),
      /calculateClientQuote|parseFloat|supabase/i,
    );
    assert.doesNotMatch(
      read("components/licensee/clientQuotes/LicenseeClientQuoteTemplateCatalog.tsx"),
      /translate\(|workers\/|openrouter/i,
    );
  });

  it("matches catalog keys in all six Master languages", () => {
    const dictionaries: Record<OrganizationLanguage, typeof en> = {
      en,
      fr,
      es,
      it: itMessages,
      de,
      pt,
    };
    const canonical = collectKeyPaths(en.licensee.clientQuoteTemplates);
    for (const key of [
      "manageAction",
      "createAction",
      "createTitle",
      "editTitle",
      "serviceName",
      "description",
      "quantity",
      "unitPrice",
      "currency",
      "billingFrequency",
      "searchLabel",
      "emptyTitle",
      "searchEmptyTitle",
      "deleteDialogTitle",
      "deleteDialogBody",
      "cancel",
      "save",
      "createSuccess",
      "updateSuccess",
      "deleteSuccess",
      "errors.generic",
      "errors.nameRequired",
      "errors.currencyInvalid",
    ]) {
      assert.ok(canonical.includes(key), key);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(dictionaries[language].licensee.clientQuoteTemplates);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing template catalog keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra template catalog keys`,
      );
      const localized = getLicenseeLocalization(language).messages;
      const copy = localized.clientQuoteTemplates;
      assert.ok(copy.manageAction.trim().length > 0);
      assert.ok(copy.emptyTitle.trim().length > 0);
      assert.ok(copy.searchEmptyTitle.trim().length > 0);
      if (language !== "en") {
        assert.notEqual(copy.manageAction, en.licensee.clientQuoteTemplates.manageAction);
        assert.notEqual(copy.emptyTitle, en.licensee.clientQuoteTemplates.emptyTitle);
        assert.notEqual(copy.searchEmptyTitle, en.licensee.clientQuoteTemplates.searchEmptyTitle);
        assert.notEqual(copy.deleteDialogBody, en.licensee.clientQuoteTemplates.deleteDialogBody);
        assert.notEqual(copy.save, en.licensee.clientQuoteTemplates.save);
        assert.notEqual(copy.billingFrequency, en.licensee.clientQuoteTemplates.billingFrequency);
      }
      for (const code of CLIENT_QUOTE_TEMPLATE_STABLE_ERROR_CODES) {
        const text = clientQuoteTemplateErrorMessage(localized, code);
        assert.ok(text.trim().length > 0, `${language} ${code}`);
        if (code !== "CLIENT_QUOTE_FAILED") {
          assert.notEqual(text, localized.clientQuoteTemplates.errors.generic, `${language} ${code}`);
        }
      }
      assert.equal(
        clientQuoteTemplateErrorMessage(localized, "NOT_A_REAL_CODE"),
        localized.clientQuoteTemplates.errors.generic,
      );
    }
  });
});
