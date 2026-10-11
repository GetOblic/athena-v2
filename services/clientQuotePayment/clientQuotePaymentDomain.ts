/**
 * CQ-STRIPE-1 Gate 2A — amount extraction, collection mode, and eligibility.
 *
 * Amounts come only from the issued snapshot's frozen totalMinor.
 * frequencyTotals is authoritative when present. A snapshot issued before
 * recurring pricing omits that field; its one-time totalMinor is used only
 * when every line is one-time or omits billingFrequency.
 *
 * Discounts and taxes are not reapplied. Different frequencies are not summed.
 * Zero, duplicate, and unknown frequency groups are not chargeable.
 * Balance is frozen one-time total minus frozen deposit. It is not an amount
 * already paid.
 *
 * Expiry blocks a new intent. It does not erase a request that was recorded
 * while the quotation was still payable.
 *
 * validUntil, when present and readable, is the inclusive last civil day.
 * validForDays is used only when validUntil is absent: the last civil day is
 * the UTC issue date plus that many days. The expiry instant is the following
 * UTC midnight and is exclusive.
 */

import { createHash } from "node:crypto";
import { isClientQuoteSelectableCurrency } from "@/services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_ISSUED_SCHEMA_VERSION,
  type AthenaClientQuote,
} from "@/services/clientQuote/clientQuoteTypes";
import {
  CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR,
  CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION,
  CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT,
  clientQuotePaymentError,
  type ChargeableFrequencyGroup,
  type ClientQuotePaymentDecision,
  type ClientQuotePaymentQuote,
  type ClientQuotePaymentRequestInsert,
  type ClientQuotePaymentRequestParameters,
  type OneTimeCollectionConfiguration,
} from "@/services/clientQuotePayment/clientQuotePaymentTypes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_MINOR = Number.MAX_SAFE_INTEGER;
const MAX_VALID_FOR_DAYS = 3650;

const FREQUENCY_ORDER = ["one_time", "monthly", "quarterly", "annually"] as const;

type BillingFrequency = (typeof FREQUENCY_ORDER)[number];

type PreparedQuote = {
  expiresAt: string;
  groups: ChargeableFrequencyGroup[];
  licenseeAccountId: string;
  organizationId: string;
  sourceQuoteId: string;
  quoteNumber: string;
  quoteIssuedAt: string;
  currencyCode: "USD" | "EUR";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

function readCanonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const canonical = new Date(parsed).toISOString();
  if (canonical !== value) return null;
  return canonical;
}

function readMinor(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < 0 || value > MAX_MINOR) return null;
  return value;
}

function parseCivilDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function exclusiveExpiryInstant(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString();
}

function addUtcDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw clientQuotePaymentError(
        "AMOUNT_REJECTED",
        "Payment parameters must be finite JSON values.",
      );
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) {
    throw clientQuotePaymentError(
      "AMOUNT_REJECTED",
      "Payment parameters must be finite JSON values.",
    );
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) {
      throw clientQuotePaymentError(
        "AMOUNT_REJECTED",
        "Payment parameters must be finite JSON values.",
      );
    }
    sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Stripe idempotency key for one later create call.
 *
 * Inspected inputs, and only these inputs: `{ kind, parameters }`.
 * `parameters` is the sealed commercial object. It includes `sourceQuoteId`
 * and `purpose`, which is the durable intent identity (one row per quotation
 * and purpose). `kind` is `stripe_price` or `stripe_payment_link`, and the
 * prefix differs, so Price creation and Payment Link creation are separate
 * scopes even when the commercial parameters match.
 *
 * `requestedBy`, `createdAt`, the row UUID, and the caller's clock are not
 * inputs. A retry of the same decision therefore reproduces the same key
 * before and after the row exists. A persisted request UUID is not required:
 * quote and purpose are already inside the hashed parameters, and an even
 * deposit/balance split still differs by purpose when the minor amounts match.
 */
export function clientQuotePaymentStripeIdempotencyKey(
  kind: "stripe_price" | "stripe_payment_link",
  parameters: ClientQuotePaymentRequestParameters,
): string {
  const prefix = kind === "stripe_price" ? "cqpr_price_v1_" : "cqpr_link_v1_";
  const digest = createHash("sha256")
    .update(canonicalJson({ kind, parameters }))
    .digest("hex");
  return `${prefix}${digest}`;
}

function legacyLinesAreOneTime(lineItems: unknown): boolean {
  if (!Array.isArray(lineItems) || lineItems.length < 1) return false;
  for (const line of lineItems) {
    if (!isRecord(line)) return false;
    if (!Object.prototype.hasOwnProperty.call(line, "billingFrequency")) continue;
    const frequency = line.billingFrequency;
    if (frequency == null || frequency === "one_time") continue;
    return false;
  }
  return true;
}

function groupFromTotal(
  billingFrequency: BillingFrequency,
  totalMinor: number,
  amountSource: ChargeableFrequencyGroup["amountSource"],
): ChargeableFrequencyGroup | null {
  if (totalMinor <= 0) return null;
  return { billingFrequency, amountMinor: totalMinor, amountSource };
}

/**
 * Chargeable groups in canonical frequency order.
 * Returns an empty list when nothing on the snapshot can be charged.
 * Does not throw for a malformed group.
 */
export function extractChargeableFrequencyGroups(
  snapshot: unknown,
): ChargeableFrequencyGroup[] {
  if (!isRecord(snapshot)) return [];
  if (snapshot.schemaVersion !== CLIENT_QUOTE_ISSUED_SCHEMA_VERSION) return [];

  const frequencyTotals = snapshot.frequencyTotals;
  const legacy =
    !Object.prototype.hasOwnProperty.call(snapshot, "frequencyTotals") ||
    frequencyTotals == null;
  if (legacy) {
    if (!legacyLinesAreOneTime(snapshot.lineItems) || !isRecord(snapshot.totals)) {
      return [];
    }
    const totalMinor = readMinor(snapshot.totals.totalMinor);
    if (totalMinor == null) return [];
    const group = groupFromTotal("one_time", totalMinor, "legacy_one_time_totals");
    return group ? [group] : [];
  }

  if (!Array.isArray(frequencyTotals)) return [];

  const seen = new Map<BillingFrequency, number[]>();
  for (const entry of frequencyTotals) {
    if (!isRecord(entry)) continue;
    const frequency = entry.billingFrequency;
    if (
      frequency !== "one_time" &&
      frequency !== "monthly" &&
      frequency !== "quarterly" &&
      frequency !== "annually"
    ) {
      continue;
    }
    const totals = isRecord(entry.totals) ? entry.totals : null;
    const totalMinor = totals ? readMinor(totals.totalMinor) : null;
    const bucket = seen.get(frequency) ?? [];
    bucket.push(totalMinor ?? Number.NaN);
    seen.set(frequency, bucket);
  }

  const groups: ChargeableFrequencyGroup[] = [];
  for (const frequency of FREQUENCY_ORDER) {
    const amounts = seen.get(frequency);
    if (!amounts || amounts.length !== 1) continue;
    const totalMinor = amounts[0];
    if (totalMinor == null || !Number.isSafeInteger(totalMinor)) continue;
    const group = groupFromTotal(frequency, totalMinor, "frequency_totals");
    if (group) groups.push(group);
  }
  return groups;
}

function resolveExpiryInstant(
  snapshot: Record<string, unknown>,
  issuedAt: string,
): string {
  if (!isRecord(snapshot.validity)) {
    throw clientQuotePaymentError(
      "VALIDITY_UNREADABLE",
      "Quotation validity cannot be read.",
    );
  }
  const validity = snapshot.validity;
  if (validity.validUntil != null) {
    if (typeof validity.validUntil !== "string") {
      throw clientQuotePaymentError(
        "VALIDITY_UNREADABLE",
        "Quotation validity cannot be read.",
      );
    }
    const civil = parseCivilDate(validity.validUntil);
    if (!civil) {
      throw clientQuotePaymentError(
        "VALIDITY_UNREADABLE",
        "Quotation validity cannot be read.",
      );
    }
    return exclusiveExpiryInstant(civil.year, civil.month, civil.day);
  }

  const days = validity.validForDays;
  if (
    typeof days !== "number" ||
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > MAX_VALID_FOR_DAYS
  ) {
    throw clientQuotePaymentError(
      "VALIDITY_UNREADABLE",
      "Quotation validity cannot be read.",
    );
  }
  const issuedCivil = parseCivilDate(issuedAt.slice(0, 10));
  if (!issuedCivil) {
    throw clientQuotePaymentError(
      "VALIDITY_UNREADABLE",
      "Quotation validity cannot be read.",
    );
  }
  const last = addUtcDays(issuedCivil.year, issuedCivil.month, issuedCivil.day, days);
  return exclusiveExpiryInstant(last.year, last.month, last.day);
}

function prepareQuote(quote: ClientQuotePaymentQuote): PreparedQuote {
  if (quote.status !== "issued") {
    throw clientQuotePaymentError(
      "QUOTE_NOT_ISSUED",
      "Only an issued quotation can start a payment request.",
    );
  }
  if (quote.deletedAt != null) {
    throw clientQuotePaymentError(
      "QUOTE_MASKED",
      "A masked quotation cannot start a payment request.",
    );
  }
  if (!isRecord(quote.issuedSnapshot)) {
    throw clientQuotePaymentError(
      "SNAPSHOT_UNUSABLE",
      "The issued quotation snapshot cannot be used for a payment request.",
    );
  }
  const snapshot = quote.issuedSnapshot;
  if (snapshot.schemaVersion !== CLIENT_QUOTE_ISSUED_SCHEMA_VERSION) {
    throw clientQuotePaymentError(
      "SNAPSHOT_UNUSABLE",
      "The issued quotation snapshot cannot be used for a payment request.",
    );
  }

  const sourceQuoteId = readUuid(snapshot.quoteId);
  const licenseeAccountId = readUuid(snapshot.licenseeAccountId);
  const organizationId = readUuid(snapshot.organizationId);
  const quoteIssuedAt = readCanonicalTimestamp(snapshot.issuedAt);
  const rowIssuedAt = readCanonicalTimestamp(quote.issuedAt);
  const quoteNumber =
    typeof snapshot.quoteNumber === "string" ? snapshot.quoteNumber : null;
  if (
    !sourceQuoteId ||
    !licenseeAccountId ||
    !organizationId ||
    !quoteIssuedAt ||
    !rowIssuedAt ||
    !quoteNumber ||
    sourceQuoteId !== quote.id ||
    licenseeAccountId !== quote.licenseeAccountId ||
    organizationId !== quote.organizationId ||
    quoteIssuedAt !== rowIssuedAt ||
    quoteNumber !== quote.quoteNumber
  ) {
    throw clientQuotePaymentError(
      "SNAPSHOT_UNUSABLE",
      "The issued quotation snapshot cannot be used for a payment request.",
    );
  }

  const currencyCode = snapshot.currencyCode;
  if (!isClientQuoteSelectableCurrency(currencyCode) || snapshot.currencyScale !== 2) {
    throw clientQuotePaymentError(
      "CURRENCY_NOT_SUPPORTED",
      "Payment requests require USD or EUR with minor-unit scale 2.",
    );
  }
  if (quote.currencyCode !== currencyCode) {
    throw clientQuotePaymentError(
      "SNAPSHOT_UNUSABLE",
      "The issued quotation snapshot cannot be used for a payment request.",
    );
  }

  return {
    expiresAt: resolveExpiryInstant(snapshot, quoteIssuedAt),
    groups: extractChargeableFrequencyGroups(snapshot),
    licenseeAccountId,
    organizationId,
    sourceQuoteId,
    quoteNumber,
    quoteIssuedAt,
    currencyCode,
  };
}

function assertPayableNow(expiresAt: string, now: string): void {
  const nowStamp = readCanonicalTimestamp(now);
  const expiryMs = Date.parse(expiresAt);
  if (!nowStamp || !Number.isFinite(expiryMs)) {
    throw clientQuotePaymentError(
      "VALIDITY_UNREADABLE",
      "The payment clock must be a canonical UTC timestamp.",
    );
  }
  if (Date.parse(nowStamp) >= expiryMs) {
    throw clientQuotePaymentError(
      "QUOTE_EXPIRED",
      "This quotation has expired. A new payment request cannot be started.",
    );
  }
}

/**
 * Exclusive UTC instant at which a new payment request becomes ineligible.
 * Does not inspect an existing payment request.
 */
export function clientQuotePaymentExpiresAt(quote: ClientQuotePaymentQuote): string {
  return prepareQuote(quote).expiresAt;
}

export function toClientQuotePaymentQuote(
  quote: AthenaClientQuote,
): ClientQuotePaymentQuote {
  return {
    id: quote.id,
    licenseeAccountId: quote.licensee_account_id,
    organizationId: quote.organization_id,
    status: quote.status,
    deletedAt: quote.deleted_at,
    currencyCode: quote.currency_code,
    quoteNumber: quote.quote_number,
    issuedAt: quote.issued_at,
    issuedSnapshot: quote.issued_snapshot_json,
  };
}

/**
 * Frozen one-time collection. Split balance is total minus deposit.
 * There is no paid-amount input.
 */
export function configureOneTimeCollection(
  oneTimeTotalMinor: number,
  choice: { mode: "full" } | { mode: "split"; depositMinor: number },
): OneTimeCollectionConfiguration {
  if (!Number.isSafeInteger(oneTimeTotalMinor) || oneTimeTotalMinor <= 0) {
    throw clientQuotePaymentError(
      "FREQUENCY_NOT_CHARGEABLE",
      "The frozen one-time total is not chargeable.",
    );
  }
  if (choice.mode === "full") {
    if (oneTimeTotalMinor < CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR) {
      throw clientQuotePaymentError(
        "AMOUNT_REJECTED",
        "A charge must be an integer of at least 50 minor units.",
      );
    }
    return Object.freeze({
      mode: "full",
      oneTimeTotalMinor,
      amountMinor: oneTimeTotalMinor,
    });
  }
  const depositMinor = choice.depositMinor;
  if (!Number.isSafeInteger(depositMinor) || depositMinor < CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR) {
    throw clientQuotePaymentError(
      "DEPOSIT_BELOW_MINIMUM",
      "Deposit must be an integer of at least 50 minor units.",
    );
  }
  const balanceMinor = oneTimeTotalMinor - depositMinor;
  if (
    !Number.isSafeInteger(balanceMinor) ||
    balanceMinor < CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR
  ) {
    throw clientQuotePaymentError(
      "BALANCE_BELOW_MINIMUM",
      "Balance must be an integer of at least 50 minor units. Balance is the frozen one-time total minus the frozen deposit.",
    );
  }
  return Object.freeze({
    mode: "split",
    oneTimeTotalMinor,
    depositMinor,
    balanceMinor,
  });
}

function findGroup(
  groups: readonly ChargeableFrequencyGroup[],
  frequency: BillingFrequency,
): ChargeableFrequencyGroup {
  const group = groups.find((entry) => entry.billingFrequency === frequency);
  if (!group) {
    throw clientQuotePaymentError(
      "FREQUENCY_NOT_CHARGEABLE",
      "This billing frequency has no positive frozen total.",
    );
  }
  return group;
}

function parametersFor(input: {
  prepared: PreparedQuote;
  purpose: ClientQuotePaymentRequestParameters["purpose"];
  billingFrequency: BillingFrequency;
  amountMinor: number;
  amountSource: ChargeableFrequencyGroup["amountSource"];
  oneTimeCollectionMode: "full" | "split" | null;
  oneTimeTotalMinor: number | null;
  depositMinor: number | null;
  balanceMinor: number | null;
}): ClientQuotePaymentRequestParameters {
  return {
    schemaVersion: CLIENT_QUOTE_PAYMENT_REQUEST_SCHEMA_VERSION,
    settlementAccount: CLIENT_QUOTE_PAYMENT_SETTLEMENT_ACCOUNT,
    licenseeAccountId: input.prepared.licenseeAccountId,
    organizationId: input.prepared.organizationId,
    sourceQuoteId: input.prepared.sourceQuoteId,
    quoteNumber: input.prepared.quoteNumber,
    quoteIssuedAt: input.prepared.quoteIssuedAt,
    purpose: input.purpose,
    billingFrequency: input.billingFrequency,
    currencyCode: input.prepared.currencyCode,
    currencyScale: 2,
    amountMinor: input.amountMinor,
    amountSource: input.amountSource,
    oneTimeCollectionMode: input.oneTimeCollectionMode,
    oneTimeTotalMinor: input.oneTimeTotalMinor,
    depositMinor: input.depositMinor,
    balanceMinor: input.balanceMinor,
  };
}

function seal(
  parameters: ClientQuotePaymentRequestParameters,
): ClientQuotePaymentRequestInsert {
  const frozen = structuredClone(parameters);
  return {
    requestParameters: frozen,
    stripePriceIdempotencyKey: clientQuotePaymentStripeIdempotencyKey("stripe_price", frozen),
    stripePaymentLinkIdempotencyKey: clientQuotePaymentStripeIdempotencyKey(
      "stripe_payment_link",
      frozen,
    ),
  };
}

/**
 * Plans the insert payload for one collection decision.
 * Does not read existing payment requests and does not write.
 */
export function planClientQuotePaymentRequestIntents(
  quote: ClientQuotePaymentQuote,
  input: { now: string; decision: ClientQuotePaymentDecision },
): ClientQuotePaymentRequestInsert[] {
  const prepared = prepareQuote(quote);
  assertPayableNow(prepared.expiresAt, input.now);

  if (input.decision.kind === "recurring") {
    const group = findGroup(prepared.groups, input.decision.billingFrequency);
    if (group.amountMinor < CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR) {
      throw clientQuotePaymentError(
        "AMOUNT_REJECTED",
        "A charge must be an integer of at least 50 minor units.",
      );
    }
    return [
      seal(
        parametersFor({
          prepared,
          purpose: input.decision.billingFrequency,
          billingFrequency: input.decision.billingFrequency,
          amountMinor: group.amountMinor,
          amountSource: group.amountSource,
          oneTimeCollectionMode: null,
          oneTimeTotalMinor: null,
          depositMinor: null,
          balanceMinor: null,
        }),
      ),
    ];
  }

  const oneTime = findGroup(prepared.groups, "one_time");
  if (input.decision.kind === "one_time_full") {
    const collection = configureOneTimeCollection(oneTime.amountMinor, { mode: "full" });
    if (collection.mode !== "full") {
      throw clientQuotePaymentError(
        "FREQUENCY_NOT_CHARGEABLE",
        "The frozen one-time total is not chargeable.",
      );
    }
    return [
      seal(
        parametersFor({
          prepared,
          purpose: "one_time_full",
          billingFrequency: "one_time",
          amountMinor: collection.amountMinor,
          amountSource: oneTime.amountSource,
          oneTimeCollectionMode: "full",
          oneTimeTotalMinor: collection.oneTimeTotalMinor,
          depositMinor: null,
          balanceMinor: null,
        }),
      ),
    ];
  }

  const collection = configureOneTimeCollection(oneTime.amountMinor, {
    mode: "split",
    depositMinor: input.decision.depositMinor,
  });
  if (collection.mode !== "split") {
    throw clientQuotePaymentError(
      "PAIR_INCOMPLETE",
      "A split collection must record the deposit and the balance together.",
    );
  }
  const shared = {
    prepared,
    billingFrequency: "one_time" as const,
    amountSource: oneTime.amountSource,
    oneTimeCollectionMode: "split" as const,
    oneTimeTotalMinor: collection.oneTimeTotalMinor,
    depositMinor: collection.depositMinor,
    balanceMinor: collection.balanceMinor,
  };
  return [
    seal(
      parametersFor({
        ...shared,
        purpose: "one_time_deposit",
        amountMinor: collection.depositMinor,
      }),
    ),
    seal(
      parametersFor({
        ...shared,
        purpose: "one_time_balance",
        amountMinor: collection.balanceMinor,
      }),
    ),
  ];
}
