/**
 * CQ-STRIPE-1 Gate 2C — issued quotation payment-link UI.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientQuoteEditorView } from "../../components/licensee/clientQuotes/ClientQuoteEditorView";
import { ClientQuotePaymentLinksSection } from "../../components/licensee/clientQuotes/ClientQuotePaymentLinksSection";
import { paymentLinkRetryMatchesLast } from "../../components/licensee/clientQuotes/ClientQuotePaymentLinks";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import type { ClientQuoteEditorDraft } from "../../lib/licensee/clientQuoteEditorModel";
import { clientQuotePaymentLinkErrorMessage } from "../../lib/licensee/clientQuotePaymentLinksMessages";
import {
  buildClientQuotePaymentLinksView,
  clientQuotePaymentLinkRequestBody,
  completionDecisionFor,
  copyClientQuotePaymentLinkUrl,
  depositMajorUnitsToMinor,
  paymentLinkDecisionAllowed,
  paymentLinkEffectMethod,
  paymentLinkHref,
  runExclusivePaymentLinkAction,
  type ClientQuotePaymentLinkPayload,
  type ClientQuotePaymentLinkRequest,
  type ClientQuotePaymentLinksBuildInput,
} from "../../lib/licensee/clientQuotePaymentLinksModel";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";

const ROOT = process.cwd();
const messages = getLicenseeLocalization("en").messages;
const QUOTE = "11111111-1111-4111-8111-111111111111";
const LINK = "https://buy.stripe.com/test_aE1234567890abcd";
const FORBIDDEN_STATUS = /\b(Paid|Unpaid|Collected|Outstanding|Subscription Active)\b/;

const CATALOGS = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
} as const;

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
    paths.push(...collectKeyPaths((value as Record<string, unknown>)[key], next));
  }
  return paths;
}

function collectLeaves(value: unknown, prefix = ""): Array<{ path: string; text: string }> {
  if (typeof value === "string") return prefix ? [{ path: prefix, text: value }] : [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as object).flatMap((key) =>
    collectLeaves((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key),
  );
}

function address() {
  return { line1: "", line2: "", city: "", region: "", postalCode: "", country: "" };
}

function editorDraft(): ClientQuoteEditorDraft {
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
    scopeSummary: "Rebuild the site.",
    lines: [],
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
    contentLanguage: "en",
  };
}

function renderEditor(mode: "draft" | "issued", downloadQuoteId: string | null = null) {
  return renderToStaticMarkup(
    createElement(ClientQuoteEditorView, {
      mode,
      quoteNumber: mode === "issued" ? "Q-2026-0007" : null,
      issuedAtLabel: mode === "issued" ? "Oct 2, 2026" : null,
      currencyCode: "USD",
      editor: editorDraft(),
      lineTotalsMinor: [],
      totals: null,
      locale: "en-US",
      messages,
      pending: null,
      notice: null,
      error: null,
      missingRequirements: [],
      revisedFromQuoteId: null,
      downloadQuoteId,
      onChange: () => undefined,
      onSave: () => undefined,
      onIssue: () => undefined,
      onRevise: () => undefined,
    }),
  );
}

function request(
  overrides: Partial<ClientQuotePaymentLinkRequest> & Pick<ClientQuotePaymentLinkRequest, "purpose">,
): ClientQuotePaymentLinkRequest {
  return {
    id: `req-${overrides.purpose}`,
    billingFrequency: overrides.purpose === "monthly" || overrides.purpose === "quarterly" || overrides.purpose === "annually"
      ? overrides.purpose
      : "one_time",
    currencyCode: "USD",
    currencyScale: 2,
    amountMinor: 10_000,
    oneTimeCollectionMode: null,
    depositMinor: null,
    balanceMinor: null,
    paymentLinkUrl: null,
    ...overrides,
  };
}

function payload(overrides: Partial<ClientQuotePaymentLinkPayload> = {}): ClientQuotePaymentLinkPayload {
  return {
    paymentRequests: [],
    eligibility: {
      expired: false,
      canCreatePaymentRequest: true,
      canInitiateStripe: true,
      blockedReason: null,
      oneTime: {
        amountMinor: 100_000,
        fullSelectable: true,
        splitSelectable: true,
        existingMode: null,
      },
      recurring: [
        { billingFrequency: "monthly", amountMinor: 20_000, selectable: true },
      ],
    },
    ...overrides,
  };
}

function viewInput(
  overrides: Partial<ClientQuotePaymentLinksBuildInput> = {},
): ClientQuotePaymentLinksBuildInput {
  return {
    phase: "ready",
    pendingKey: null,
    failureCode: null,
    canRetrySame: false,
    payload: payload(),
    choice: null,
    depositText: "",
    currencyCode: "USD",
    ...overrides,
  };
}

function renderPayments(
  overrides: Partial<ClientQuotePaymentLinksBuildInput> = {},
  section: { depositText?: string; copiedRequestId?: string | null } = {},
) {
  const input = viewInput(overrides);
  const view = buildClientQuotePaymentLinksView(input);
  const html = renderToStaticMarkup(
    createElement(ClientQuotePaymentLinksSection, {
      messages,
      view,
      depositText: section.depositText ?? input.depositText,
      copiedRequestId: section.copiedRequestId ?? null,
      copyFailed: false,
    }),
  );
  return { view, html };
}

describe("issued client quote payment links", () => {
  it("shows payment links on an issued quotation and keeps the existing actions", () => {
    const draft = renderEditor("draft", QUOTE);
    assert.equal(draft.includes("data-client-quote-payments"), false);
    assert.match(draft, /data-client-quote-save="true"/);
    assert.match(draft, /data-client-quote-issue="true"/);

    const issuedWithoutId = renderEditor("issued", null);
    assert.equal(issuedWithoutId.includes("data-client-quote-payments"), false);
    assert.match(issuedWithoutId, /data-client-quote-revise="true"/);

    const issued = renderEditor("issued", QUOTE);
    assert.match(issued, /data-client-quote-mode="issued"/);
    assert.match(issued, /data-client-quote-payments="issued"/);
    assert.match(issued, /data-client-quote-payments-phase="loading"/);
    assert.match(issued, /data-client-quote-payment-auto-retry="false"/);
    assert.match(issued, /data-create-client-invoice="detail"/);
    assert.match(issued, /data-client-quote-download-pdf="true"/);
    assert.match(issued, /data-client-quote-revise="true"/);
    assert.doesNotMatch(issued, /<input|<textarea|<select/);
    assert.doesNotMatch(issued, FORBIDDEN_STATUS);

    const viewSource = read("components/licensee/clientQuotes/ClientQuoteEditorView.tsx");
    assert.match(viewSource, /ClientDocumentSendByEmailLink/);
    assert.doesNotMatch(viewSource, /\bfetch\s*\(/);
    const paymentSource = read("components/licensee/clientQuotes/ClientQuotePaymentLinks.tsx");
    assert.match(paymentSource, /\/api\/licensee\/client-quotes\/\$\{encodeURIComponent\(quoteId\)\}\/payment-links/);
    assert.match(paymentSource, /method:\s*"GET"/);
    assert.match(paymentSource, /method:\s*"POST"/);
    assert.doesNotMatch(paymentSource, /setTimeout\(|setInterval\(|sk_live|sk_test|api\.stripe\.com/);
    assert.doesNotMatch(
      read("lib/licensee/clientQuotePaymentLinksModel.ts"),
      /amountMinor\s*-\s*|oneTimeTotalMinor\s*-/,
    );
  });

  it("offers full or split until one mode is frozen, then keeps the pair together", () => {
    const choosing = renderPayments({
      payload: payload({
        eligibility: {
          expired: false,
          canCreatePaymentRequest: true,
          canInitiateStripe: true,
          blockedReason: null,
          oneTime: {
            amountMinor: 100_000,
            fullSelectable: true,
            splitSelectable: true,
            existingMode: null,
          },
          recurring: [],
        },
      }),
    });
    assert.match(choosing.html, /data-client-quote-payment-option="full"/);
    assert.match(choosing.html, /data-client-quote-payment-option="split"/);
    assert.equal(choosing.html.includes("data-client-quote-payment-create"), false);
    assert.equal(choosing.view.oneTime?.serverBalanceMinor, null);

    const full = renderPayments({
      choice: "full",
      payload: payload({
        eligibility: {
          expired: false,
          canCreatePaymentRequest: true,
          canInitiateStripe: true,
          blockedReason: null,
          oneTime: {
            amountMinor: 100_000,
            fullSelectable: true,
            splitSelectable: true,
            existingMode: null,
          },
          recurring: [],
        },
      }),
    });
    assert.match(full.html, /data-client-quote-payment-create="one_time_full"/);
    assert.equal(full.html.includes("data-client-quote-payment-create=\"one_time_split\""), false);
    assert.equal(full.view.oneTime?.showDepositEntry, false);

    const split = renderPayments(
      {
        choice: "split",
        depositText: "250.00",
        payload: payload({
          eligibility: {
            expired: false,
            canCreatePaymentRequest: true,
            canInitiateStripe: true,
            blockedReason: null,
            oneTime: {
              amountMinor: 100_000,
              fullSelectable: true,
              splitSelectable: true,
              existingMode: null,
            },
            recurring: [],
          },
        }),
      },
      { depositText: "250.00" },
    );
    assert.match(split.html, /data-client-quote-payment-create="one_time_split"/);
    assert.match(split.html, /data-client-quote-payment-deposit="true"/);
    assert.match(split.html, /data-client-quote-payment-balance="pending"/);
    assert.match(split.html, /data-client-quote-payment-balance-pending="true"/);
    assert.equal(split.view.oneTime?.serverBalanceMinor, null);
    assert.equal(split.html.includes("750.00"), false);
    assert.equal(split.html.includes("data-client-quote-payment-create=\"one_time_full\""), false);
    const splitCreates = split.html.match(/data-client-quote-payment-create="one_time_split"/g) ?? [];
    assert.equal(splitCreates.length, 1);

    const fullOnly = renderPayments({
      payload: payload({
        eligibility: {
          expired: false,
          canCreatePaymentRequest: true,
          canInitiateStripe: true,
          blockedReason: null,
          oneTime: {
            amountMinor: 8_000,
            fullSelectable: true,
            splitSelectable: false,
            existingMode: null,
          },
          recurring: [],
        },
      }),
    });
    assert.equal(fullOnly.html.includes("data-client-quote-payment-option="), false);
    assert.match(fullOnly.html, /data-client-quote-payment-create="one_time_full"/);
    assert.equal(fullOnly.html.includes("data-client-quote-payment-split-entry"), false);

    const frozenSplit = payload({
      paymentRequests: [
        request({
          purpose: "one_time_deposit",
          amountMinor: 25_000,
          oneTimeCollectionMode: "split",
          depositMinor: 25_000,
          balanceMinor: 75_000,
          paymentLinkUrl: LINK,
        }),
        request({
          id: "req-balance",
          purpose: "one_time_balance",
          amountMinor: 75_000,
          oneTimeCollectionMode: "split",
          depositMinor: 25_000,
          balanceMinor: 75_000,
          paymentLinkUrl: "https://buy.stripe.com/test_balancebalance1",
        }),
      ],
      eligibility: {
        expired: false,
        canCreatePaymentRequest: true,
        canInitiateStripe: true,
        blockedReason: null,
        oneTime: {
          amountMinor: 100_000,
          fullSelectable: false,
          splitSelectable: false,
          existingMode: "split",
        },
        recurring: [],
      },
    });
    const locked = renderPayments({ payload: frozenSplit, choice: "full" });
    assert.equal(locked.view.oneTime?.locked, "split");
    assert.equal(locked.view.oneTime?.selected, "split");
    assert.equal(locked.html.includes("data-client-quote-payment-option=\"full\""), false);
    assert.match(locked.html, /data-client-quote-payment-full="hidden"/);
    assert.match(locked.html, /data-client-quote-payment-split="locked"/);
    assert.match(locked.html, /data-client-quote-payment-balance="server"/);
    assert.match(locked.html, /data-client-quote-payment-balance-minor="75000"/);
    assert.match(locked.html, /750\.00 USD/);
    assert.equal(
      paymentLinkDecisionAllowed({
        eligibility: frozenSplit.eligibility,
        requests: frozenSplit.paymentRequests,
        decision: { kind: "one_time_full" },
        recovery: null,
      }),
      false,
    );
    const fullBody = clientQuotePaymentLinkRequestBody({ kind: "one_time_full" });
    assert.deepEqual(fullBody, { decision: { kind: "one_time_full" } });
    const splitBody = clientQuotePaymentLinkRequestBody({
      kind: "one_time_split",
      depositMinor: 25_000,
    });
    assert.deepEqual(Object.keys(splitBody), ["decision"]);
    assert.deepEqual(Object.keys(splitBody.decision), ["kind", "depositMinor"]);
    assert.equal("amountMinor" in splitBody, false);
    assert.equal("currencyCode" in splitBody, false);
  });

  it("shows only chargeable recurring frequencies and keeps each link separate", () => {
    const mixed = renderPayments({
      payload: payload({
        eligibility: {
          expired: false,
          canCreatePaymentRequest: true,
          canInitiateStripe: true,
          blockedReason: null,
          oneTime: null,
          recurring: [
            { billingFrequency: "monthly", amountMinor: 20_000, selectable: true },
            { billingFrequency: "quarterly", amountMinor: 40, selectable: false },
          ],
        },
      }),
    });
    assert.match(mixed.html, /data-client-quote-payment-frequency="monthly"/);
    assert.match(mixed.html, /data-client-quote-payment-create="monthly"/);
    assert.equal(mixed.html.includes("data-client-quote-payment-frequency=\"quarterly\""), false);
    assert.equal(mixed.html.includes("data-client-quote-payment-frequency=\"annually\""), false);
    assert.equal(mixed.view.oneTime, null);

    const existingQuarter = renderPayments({
      payload: payload({
        paymentRequests: [
          request({
            purpose: "quarterly",
            amountMinor: 40_000,
            paymentLinkUrl: LINK,
          }),
        ],
        eligibility: {
          expired: false,
          canCreatePaymentRequest: false,
          canInitiateStripe: false,
          blockedReason: null,
          oneTime: null,
          recurring: [
            { billingFrequency: "quarterly", amountMinor: 40_000, selectable: false },
          ],
        },
      }),
    });
    assert.match(existingQuarter.html, /data-client-quote-payment-frequency="quarterly"/);
    assert.match(existingQuarter.html, /data-client-quote-payment-link="quarterly"/);
    assert.equal(existingQuarter.html.includes("data-client-quote-payment-create=\"quarterly\""), false);
    const recurringBody = clientQuotePaymentLinkRequestBody({
      kind: "recurring",
      billingFrequency: "monthly",
    });
    assert.deepEqual(recurringBody, {
      decision: { kind: "recurring", billingFrequency: "monthly" },
    });
    assert.deepEqual(Object.keys(recurringBody.decision), ["kind", "billingFrequency"]);
  });

  it("copies and opens the server payment URL", async () => {
    const created = renderPayments(
      {
        payload: payload({
          paymentRequests: [
            request({
              purpose: "one_time_full",
              amountMinor: 100_000,
              oneTimeCollectionMode: "full",
              paymentLinkUrl: LINK,
            }),
          ],
          eligibility: {
            expired: false,
            canCreatePaymentRequest: false,
            canInitiateStripe: false,
            blockedReason: null,
            oneTime: {
              amountMinor: 100_000,
              fullSelectable: false,
              splitSelectable: false,
              existingMode: "full",
            },
            recurring: [],
          },
        }),
      },
      { copiedRequestId: "req-one_time_full" },
    );
    assert.match(created.html, /1000\.00 USD/);
    assert.match(created.html, /Full payment/);
    assert.match(created.html, new RegExp(`data-client-quote-payment-copy-url="${LINK}"`));
    assert.match(created.html, new RegExp(`href="${LINK}"`));
    assert.match(created.html, /data-client-quote-payment-open-url="https:\/\/buy\.stripe\.com\/test_aE1234567890abcd"/);
    assert.match(created.html, /target="_blank"/);
    assert.match(created.html, /rel="noopener noreferrer"/);
    assert.match(created.html, /data-client-quote-payment-copied="true"/);
    assert.match(created.html, /Copied/);
    assert.doesNotMatch(created.html, FORBIDDEN_STATUS);
    assert.equal(paymentLinkHref("javascript:alert(1)"), null);
    const written: string[] = [];
    await copyClientQuotePaymentLinkUrl(LINK, async (value) => {
      written.push(value);
    });
    assert.deepEqual(written, [LINK]);
    assert.equal(
      paymentLinkRetryMatchesLast(
        { kind: "one_time_full" },
        { kind: "one_time_full" },
      ),
      true,
    );
    assert.equal(
      paymentLinkRetryMatchesLast({ kind: "one_time_full" }, { kind: "recurring", billingFrequency: "monthly" }),
      false,
    );
  });

  it("keeps existing links on an expired quotation and does not start a new request", () => {
    const expired = renderPayments({
      payload: payload({
        paymentRequests: [
          request({
            purpose: "monthly",
            amountMinor: 20_000,
            paymentLinkUrl: LINK,
          }),
        ],
        eligibility: {
          expired: true,
          canCreatePaymentRequest: false,
          canInitiateStripe: false,
          blockedReason: "QUOTE_EXPIRED",
          oneTime: {
            amountMinor: 100_000,
            fullSelectable: false,
            splitSelectable: false,
            existingMode: null,
          },
          recurring: [
            { billingFrequency: "monthly", amountMinor: 20_000, selectable: false },
            { billingFrequency: "annually", amountMinor: 50_000, selectable: false },
          ],
        },
      }),
    });
    assert.match(expired.html, /data-client-quote-payment-expired="true"/);
    assert.match(expired.html, /does not deactivate it in Stripe/);
    assert.match(expired.html, new RegExp(`data-client-quote-payment-copy-url="${LINK}"`));
    assert.equal(expired.html.includes("data-client-quote-payment-create="), false);
    assert.equal(expired.html.includes("data-client-quote-payment-complete="), false);
    assert.equal(expired.html.includes("data-client-quote-payment-frequency=\"annually\""), false);
    assert.equal(
      paymentLinkDecisionAllowed({
        eligibility: expired.view.expired
          ? payload({
              eligibility: {
                expired: true,
                canCreatePaymentRequest: false,
                canInitiateStripe: false,
                blockedReason: "QUOTE_EXPIRED",
                oneTime: null,
                recurring: [],
              },
            }).eligibility
          : payload().eligibility,
        requests: [],
        decision: { kind: "one_time_full" },
        recovery: null,
      }),
      false,
    );
  });

  it("shows failure and recovery without an automatic Stripe retry", async () => {
    assert.equal(paymentLinkEffectMethod("mount"), "GET");
    assert.equal(paymentLinkEffectMethod("retry_load"), "GET");
    assert.equal(paymentLinkEffectMethod("user_create"), "POST");
    assert.equal(paymentLinkEffectMethod("user_retry_same"), "POST");
    assert.equal(paymentLinkEffectMethod("user_complete"), "POST");

    const uncertain = renderPayments({
      failureCode: "STRIPE_UNCERTAIN",
      canRetrySame: true,
      choice: "full",
    });
    assert.equal(uncertain.view.recovery, "uncertain");
    assert.match(uncertain.html, /data-client-quote-payment-auto-retry="false"/);
    assert.match(uncertain.html, /data-client-quote-payment-retry-same="true"/);
    assert.match(uncertain.html, /will not retry it automatically/);
    assert.equal(uncertain.html.includes("data-client-quote-payment-create="), false);
    assert.equal(clientQuotePaymentLinkErrorMessage(messages, "STRIPE_UNCERTAIN"), messages.clientQuotes.payments.errors.uncertain);

    const unrecoverable = renderPayments({ failureCode: "STRIPE_LINK_UNRECOVERABLE", choice: "full" });
    assert.equal(unrecoverable.view.recovery, "unrecoverable");
    assert.match(unrecoverable.html, /Create a new issued quotation/);
    assert.equal(unrecoverable.html.includes("data-client-quote-payment-retry-same"), false);
    assert.equal(unrecoverable.html.includes("data-client-quote-payment-create="), false);

    const failed = renderPayments({ failureCode: "STRIPE_REJECTED", choice: "full" });
    assert.equal(failed.view.recovery, null);
    assert.match(failed.html, /data-client-quote-payment-error="STRIPE_REJECTED"/);
    assert.match(failed.html, /Stripe did not accept this payment link/);
    assert.match(failed.html, /data-client-quote-payment-create="one_time_full"/);

    const loadingFailed = renderPayments({ phase: "load_failed", payload: null, failureCode: "PAYMENT_LINK_FAILED" });
    assert.match(loadingFailed.html, /data-client-quote-payment-load-failed="true"/);
    assert.match(loadingFailed.html, /Try again/);

    const pending = renderPayments({ choice: "full", pendingKey: "one_time_full" });
    assert.match(pending.html, /data-client-quote-payment-pending="true"/);
    assert.match(pending.html, /Creating the payment link/);
    assert.match(pending.html, /disabled=""/);

    const unfinished = payload({
      paymentRequests: [
        request({
          purpose: "one_time_full",
          amountMinor: 100_000,
          oneTimeCollectionMode: "full",
          paymentLinkUrl: null,
        }),
      ],
      eligibility: {
        expired: false,
        canCreatePaymentRequest: false,
        canInitiateStripe: true,
        blockedReason: null,
        oneTime: {
          amountMinor: 100_000,
          fullSelectable: false,
          splitSelectable: false,
          existingMode: "full",
        },
        recurring: [],
      },
    });
    const recovery = renderPayments({ payload: unfinished });
    assert.equal(recovery.view.recovery, "unfulfilled");
    assert.match(recovery.html, /data-client-quote-payment-complete="one_time_full"/);
    assert.match(recovery.html, /will not retry it automatically/);
    assert.equal(recovery.html.includes("data-client-quote-payment-create="), false);
    assert.deepEqual(completionDecisionFor(unfinished.paymentRequests, "one_time_full"), {
      kind: "one_time_full",
    });

    const lock = { current: false };
    let started = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runExclusivePaymentLinkAction(lock, async () => {
      started += 1;
      await gate;
    });
    const second = await runExclusivePaymentLinkAction(lock, async () => {
      started += 1;
    });
    assert.equal(second, "ignored");
    assert.equal(started, 1);
    release();
    assert.equal(await first, "started");
    assert.equal(lock.current, false);

    assert.deepEqual(depositMajorUnitsToMinor("250.00", "USD"), { ok: true, depositMinor: 25_000 });
    assert.deepEqual(depositMajorUnitsToMinor("250.5", "EUR"), { ok: true, depositMinor: 25_050 });
    assert.equal(depositMajorUnitsToMinor("0.49", "USD").ok, false);
    assert.equal(depositMajorUnitsToMinor("12.345", "USD").ok, false);
    assert.equal(depositMajorUnitsToMinor("", "USD").ok, false);
  });

  it("uses the same payment-link keys in EN, FR, ES, IT, DE, and PT", () => {
    const canonical = collectKeyPaths(en.licensee.clientQuotes.payments);
    assert.ok(canonical.includes("payments.title") === false);
    assert.ok(canonical.includes("title"));
    assert.ok(canonical.includes("errors.uncertain"));
    assert.ok(canonical.includes("expired"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const payments = CATALOGS[language].licensee.clientQuotes.payments;
      assert.deepEqual(collectKeyPaths(payments), canonical, language);
      for (const leaf of collectLeaves(payments)) {
        assert.ok(leaf.text.trim().length > 0, `${language} ${leaf.path}`);
        assert.doesNotMatch(leaf.text, FORBIDDEN_STATUS, `${language} ${leaf.path}`);
      }
      if (language !== "en") {
        assert.notEqual(payments.title, en.licensee.clientQuotes.payments.title);
        assert.notEqual(payments.intro, en.licensee.clientQuotes.payments.intro);
        assert.notEqual(payments.expired, en.licensee.clientQuotes.payments.expired);
        assert.notEqual(payments.openInStripe, en.licensee.clientQuotes.payments.openInStripe);
        assert.notEqual(payments.uncertain, en.licensee.clientQuotes.payments.uncertain);
        assert.notEqual(payments.unrecoverable, en.licensee.clientQuotes.payments.unrecoverable);
        assert.notEqual(payments.purposeMonthly, en.licensee.clientQuotes.payments.purposeMonthly);
        assert.notEqual(payments.errors.generic, en.licensee.clientQuotes.payments.errors.generic);
      }
      const localized = getLicenseeLocalization(language).messages;
      const html = renderToStaticMarkup(
        createElement(ClientQuotePaymentLinksSection, {
          messages: localized,
          view: buildClientQuotePaymentLinksView(viewInput({ phase: "loading", payload: null })),
          depositText: "",
          copiedRequestId: null,
          copyFailed: false,
        }),
      );
      assert.match(html, new RegExp(localized.clientQuotes.payments.title));
      assert.match(html, new RegExp(localized.clientQuotes.payments.loading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const french = getLicenseeLocalization("fr").messages;
    assert.equal(
      clientQuotePaymentLinkErrorMessage(french, "QUOTE_EXPIRED"),
      french.clientQuotes.payments.errors.expired,
    );
    assert.notEqual(
      clientQuotePaymentLinkErrorMessage(french, "QUOTE_EXPIRED"),
      messages.clientQuotes.payments.errors.expired,
    );
  });
});
