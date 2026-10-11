/**
 * CQ-STRIPE-1 Gate 2C — issued quotation payment-link presentation.
 * Amounts shown as charges come from the payment-links API.
 * The deposit field is only the split configuration, converted to minor units.
 * The remaining balance is shown only after the server returns it.
 */

import {
  currencyMinorUnitScale,
  majorAmountToMinorUnits,
} from "@/services/clientQuote/clientQuoteMoney";
import { ClientQuoteCalculationError } from "@/services/clientQuote/clientQuoteTypes";
import { CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR } from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export const CLIENT_QUOTE_PAYMENT_LINK_PURPOSES = [
  "one_time_full",
  "one_time_deposit",
  "one_time_balance",
  "monthly",
  "quarterly",
  "annually",
] as const;

export type ClientQuotePaymentLinkPurpose =
  (typeof CLIENT_QUOTE_PAYMENT_LINK_PURPOSES)[number];

export const CLIENT_QUOTE_PAYMENT_LINK_RECURRING = [
  "monthly",
  "quarterly",
  "annually",
] as const;

export type ClientQuotePaymentLinkRecurring =
  (typeof CLIENT_QUOTE_PAYMENT_LINK_RECURRING)[number];

const RECURRING_SET = new Set<string>(CLIENT_QUOTE_PAYMENT_LINK_RECURRING);
const PURPOSE_SET = new Set<string>(CLIENT_QUOTE_PAYMENT_LINK_PURPOSES);

const UNCERTAIN_CODES = new Set(["STRIPE_UNCERTAIN"]);
const UNRECOVERABLE_CODES = new Set([
  "STRIPE_LINK_UNRECOVERABLE",
  "STRIPE_PRICE_UNRECOVERABLE",
  "STRIPE_PRICE_MISMATCH",
]);

export type ClientQuotePaymentLinkRequest = {
  id: string;
  purpose: ClientQuotePaymentLinkPurpose;
  billingFrequency: "one_time" | ClientQuotePaymentLinkRecurring;
  currencyCode: "USD" | "EUR";
  currencyScale: 2;
  amountMinor: number;
  oneTimeCollectionMode: "full" | "split" | null;
  depositMinor: number | null;
  balanceMinor: number | null;
  paymentLinkUrl: string | null;
};

export type ClientQuotePaymentLinkEligibility = {
  expired: boolean;
  canCreatePaymentRequest: boolean;
  canInitiateStripe: boolean;
  blockedReason: string | null;
  oneTime: {
    amountMinor: number;
    fullSelectable: boolean;
    splitSelectable: boolean;
    existingMode: "full" | "split" | null;
  } | null;
  recurring: Array<{
    billingFrequency: ClientQuotePaymentLinkRecurring;
    amountMinor: number;
    selectable: boolean;
  }>;
};

export type ClientQuotePaymentLinkPayload = {
  paymentRequests: ClientQuotePaymentLinkRequest[];
  eligibility: ClientQuotePaymentLinkEligibility;
};

export type ClientQuotePaymentLinkDecision =
  | { kind: "one_time_full" }
  | { kind: "one_time_split"; depositMinor: number }
  | { kind: "recurring"; billingFrequency: ClientQuotePaymentLinkRecurring };

export type ClientQuotePaymentLinkFailureKind =
  | "failure"
  | "uncertain"
  | "unrecoverable";

export type ClientQuotePaymentLinkCard = {
  requestId: string;
  purpose: ClientQuotePaymentLinkPurpose;
  amountMinor: number;
  currencyCode: "USD" | "EUR";
  url: string | null;
};

export type ClientQuotePaymentLinksViewModel = {
  phase: "loading" | "load_failed" | "ready";
  pending: boolean;
  pendingKey: string | null;
  expired: boolean;
  failure: { code: string; kind: ClientQuotePaymentLinkFailureKind } | null;
  recovery: "uncertain" | "unrecoverable" | "unfulfilled" | null;
  canRetrySame: boolean;
  currencyCode: "USD" | "EUR" | null;
  unavailable: "none" | "currency" | "no_charge";
  oneTime: null | {
    totalMinor: number | null;
    fullVisible: boolean;
    splitVisible: boolean;
    selected: "full" | "split" | null;
    locked: "full" | "split" | null;
    showChoice: boolean;
    showFullCreate: boolean;
    showSplitCreate: boolean;
    splitCreateEnabled: boolean;
    showDepositEntry: boolean;
    depositStatus: "empty" | "invalid" | "below_minimum" | "ready";
    serverBalanceMinor: number | null;
    completeFull: boolean;
    completeSplit: boolean;
    cards: ClientQuotePaymentLinkCard[];
  };
  recurring: Array<{
    billingFrequency: ClientQuotePaymentLinkRecurring;
    amountMinor: number;
    currencyCode: "USD" | "EUR";
    canCreate: boolean;
    card: ClientQuotePaymentLinkCard | null;
    canComplete: boolean;
  }>;
};

export type ClientQuotePaymentLinksBuildInput = {
  phase: "loading" | "load_failed" | "ready";
  pendingKey: string | null;
  failureCode: string | null;
  canRetrySame: boolean;
  payload: ClientQuotePaymentLinkPayload | null;
  choice: "full" | "split" | null;
  depositText: string;
  currencyCode: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function currencyOf(value: unknown): "USD" | "EUR" | null {
  return value === "USD" || value === "EUR" ? value : null;
}

function minorOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function nullableMinor(value: unknown): number | null | undefined {
  if (value == null) return null;
  return minorOf(value);
}

export function paymentLinkFailureKind(
  code: string | null,
): ClientQuotePaymentLinkFailureKind {
  if (code && UNCERTAIN_CODES.has(code)) return "uncertain";
  if (code && UNRECOVERABLE_CODES.has(code)) return "unrecoverable";
  return "failure";
}

export function paymentLinkEffectMethod(
  trigger: "mount" | "retry_load" | "user_create" | "user_retry_same" | "user_complete",
): "GET" | "POST" {
  if (trigger === "mount" || trigger === "retry_load") return "GET";
  return "POST";
}

export async function runExclusivePaymentLinkAction(
  lock: { current: boolean },
  action: () => Promise<void>,
): Promise<"started" | "ignored"> {
  if (lock.current) return "ignored";
  lock.current = true;
  try {
    await action();
    return "started";
  } finally {
    lock.current = false;
  }
}

export function clientQuotePaymentLinkRequestBody(
  decision: ClientQuotePaymentLinkDecision,
): { decision: ClientQuotePaymentLinkDecision } {
  if (decision.kind === "one_time_full") {
    return { decision: { kind: "one_time_full" } };
  }
  if (decision.kind === "one_time_split") {
    return {
      decision: { kind: "one_time_split", depositMinor: decision.depositMinor },
    };
  }
  return {
    decision: {
      kind: "recurring",
      billingFrequency: decision.billingFrequency,
    },
  };
}

export function completionDecisionFor(
  requests: readonly ClientQuotePaymentLinkRequest[],
  key: "one_time_full" | "one_time_split" | ClientQuotePaymentLinkRecurring,
): ClientQuotePaymentLinkDecision | null {
  if (key === "one_time_full") return { kind: "one_time_full" };
  if (key === "one_time_split") {
    const deposit = requests.find((row) => row.purpose === "one_time_deposit");
    const balance = requests.find((row) => row.purpose === "one_time_balance");
    const depositMinor = deposit?.depositMinor ?? balance?.depositMinor ?? null;
    if (depositMinor == null) return null;
    return { kind: "one_time_split", depositMinor };
  }
  return { kind: "recurring", billingFrequency: key };
}

export function samePaymentLinkDecision(
  left: ClientQuotePaymentLinkDecision,
  right: ClientQuotePaymentLinkDecision,
): boolean {
  return (
    JSON.stringify(clientQuotePaymentLinkRequestBody(left)) ===
    JSON.stringify(clientQuotePaymentLinkRequestBody(right))
  );
}

export function depositMajorUnitsToMinor(
  text: string,
  currencyCode: string,
):
  | { ok: true; depositMinor: number }
  | { ok: false; reason: "empty" | "invalid" | "below_minimum" } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let scale = 2;
  try {
    scale = currencyMinorUnitScale(currencyCode);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      return { ok: false, reason: "invalid" };
    }
    throw error;
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match || (match[2]?.length ?? 0) > scale) {
    return { ok: false, reason: "invalid" };
  }
  let depositMinor: number;
  try {
    depositMinor = majorAmountToMinorUnits(trimmed, currencyCode);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      return { ok: false, reason: "invalid" };
    }
    throw error;
  }
  if (!Number.isSafeInteger(depositMinor) || depositMinor < 0) {
    return { ok: false, reason: "invalid" };
  }
  if (depositMinor < CLIENT_QUOTE_PAYMENT_COMPONENT_MINIMUM_MINOR) {
    return { ok: false, reason: "below_minimum" };
  }
  return { ok: true, depositMinor };
}

export function paymentLinkHref(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function copyClientQuotePaymentLinkUrl(
  url: string,
  write: (value: string) => Promise<void>,
): Promise<void> {
  const href = paymentLinkHref(url);
  if (!href) throw new Error("Payment link URL is missing.");
  await write(href);
}

function parseRequest(value: unknown): ClientQuotePaymentLinkRequest | null {
  if (!isRecord(value)) return null;
  const purpose = value.purpose;
  const billingFrequency = value.billingFrequency;
  const currencyCode = currencyOf(value.currencyCode);
  const amountMinor = minorOf(value.amountMinor);
  const depositMinor = nullableMinor(value.depositMinor);
  const balanceMinor = nullableMinor(value.balanceMinor);
  if (
    typeof purpose !== "string" ||
    !PURPOSE_SET.has(purpose) ||
    (billingFrequency !== "one_time" &&
      (typeof billingFrequency !== "string" || !RECURRING_SET.has(billingFrequency))) ||
    !currencyCode ||
    value.currencyScale !== 2 ||
    amountMinor == null ||
    depositMinor === undefined ||
    balanceMinor === undefined ||
    typeof value.id !== "string" ||
    !value.id
  ) {
    return null;
  }
  const mode = value.oneTimeCollectionMode;
  if (mode != null && mode !== "full" && mode !== "split") return null;
  const url = value.paymentLinkUrl;
  if (url != null && typeof url !== "string") return null;
  return {
    id: value.id,
    purpose: purpose as ClientQuotePaymentLinkPurpose,
    billingFrequency: billingFrequency as ClientQuotePaymentLinkRequest["billingFrequency"],
    currencyCode,
    currencyScale: 2,
    amountMinor,
    oneTimeCollectionMode: mode ?? null,
    depositMinor,
    balanceMinor,
    paymentLinkUrl: url ?? null,
  };
}

function parseEligibility(value: unknown): ClientQuotePaymentLinkEligibility | null {
  if (!isRecord(value)) return null;
  if (typeof value.expired !== "boolean") return null;
  if (typeof value.canCreatePaymentRequest !== "boolean") return null;
  if (typeof value.canInitiateStripe !== "boolean") return null;
  const blockedReason =
    value.blockedReason == null
      ? null
      : typeof value.blockedReason === "string"
        ? value.blockedReason
        : undefined;
  if (blockedReason === undefined) return null;
  let oneTime: ClientQuotePaymentLinkEligibility["oneTime"] = null;
  if (value.oneTime != null) {
    if (!isRecord(value.oneTime)) return null;
    const amountMinor = minorOf(value.oneTime.amountMinor);
    const mode = value.oneTime.existingMode;
    if (
      amountMinor == null ||
      typeof value.oneTime.fullSelectable !== "boolean" ||
      typeof value.oneTime.splitSelectable !== "boolean" ||
      (mode != null && mode !== "full" && mode !== "split")
    ) {
      return null;
    }
    oneTime = {
      amountMinor,
      fullSelectable: value.oneTime.fullSelectable,
      splitSelectable: value.oneTime.splitSelectable,
      existingMode: mode ?? null,
    };
  }
  if (!Array.isArray(value.recurring)) return null;
  const recurring: ClientQuotePaymentLinkEligibility["recurring"] = [];
  for (const row of value.recurring) {
    if (!isRecord(row)) return null;
    const amountMinor = minorOf(row.amountMinor);
    if (
      typeof row.billingFrequency !== "string" ||
      !RECURRING_SET.has(row.billingFrequency) ||
      amountMinor == null ||
      typeof row.selectable !== "boolean"
    ) {
      return null;
    }
    recurring.push({
      billingFrequency: row.billingFrequency as ClientQuotePaymentLinkRecurring,
      amountMinor,
      selectable: row.selectable,
    });
  }
  return {
    expired: value.expired,
    canCreatePaymentRequest: value.canCreatePaymentRequest,
    canInitiateStripe: value.canInitiateStripe,
    blockedReason,
    oneTime,
    recurring,
  };
}

export function parseClientQuotePaymentLinkPayload(
  value: unknown,
): ClientQuotePaymentLinkPayload | null {
  if (!isRecord(value) || value.ok !== true) return null;
  if (!Array.isArray(value.paymentRequests)) return null;
  const paymentRequests: ClientQuotePaymentLinkRequest[] = [];
  for (const row of value.paymentRequests) {
    const parsed = parseRequest(row);
    if (!parsed) return null;
    paymentRequests.push(parsed);
  }
  const eligibility = parseEligibility(value.eligibility);
  if (!eligibility) return null;
  return { paymentRequests, eligibility };
}

export function paymentLinkDecisionAllowed(input: {
  eligibility: ClientQuotePaymentLinkEligibility;
  requests: readonly ClientQuotePaymentLinkRequest[];
  decision: ClientQuotePaymentLinkDecision;
  recovery: ClientQuotePaymentLinksViewModel["recovery"];
}): boolean {
  if (input.recovery === "unrecoverable") return false;
  if (input.eligibility.expired && input.recovery !== "uncertain") return false;
  if (input.recovery === "uncertain") return false;
  const requests = input.requests;
  const decision = input.decision;
  if (decision.kind === "one_time_full") {
    if (input.eligibility.oneTime?.existingMode === "split") return false;
    if (
      requests.some(
        (row) => row.purpose === "one_time_deposit" || row.purpose === "one_time_balance",
      )
    ) {
      return false;
    }
    const existing = requests.find((row) => row.purpose === "one_time_full");
    if (existing) {
      return !paymentLinkHref(existing.paymentLinkUrl) && input.eligibility.canInitiateStripe;
    }
    return Boolean(input.eligibility.oneTime?.fullSelectable);
  }
  if (decision.kind === "one_time_split") {
    if (input.eligibility.oneTime?.existingMode === "full") return false;
    if (requests.some((row) => row.purpose === "one_time_full")) return false;
    const deposit = requests.find((row) => row.purpose === "one_time_deposit");
    const balance = requests.find((row) => row.purpose === "one_time_balance");
    if (deposit || balance) {
      const missing = !paymentLinkHref(deposit?.paymentLinkUrl) || !paymentLinkHref(balance?.paymentLinkUrl);
      const frozenDeposit = deposit?.depositMinor ?? balance?.depositMinor ?? null;
      return (
        missing &&
        frozenDeposit != null &&
        input.eligibility.canInitiateStripe &&
        frozenDeposit === decision.depositMinor
      );
    }
    return Boolean(input.eligibility.oneTime?.splitSelectable);
  }
  const existing = requests.find((row) => row.purpose === decision.billingFrequency);
  if (existing) {
    return !paymentLinkHref(existing.paymentLinkUrl) && input.eligibility.canInitiateStripe;
  }
  return Boolean(
    input.eligibility.recurring.find(
      (row) => row.billingFrequency === decision.billingFrequency,
    )?.selectable,
  );
}

function cardFor(request: ClientQuotePaymentLinkRequest): ClientQuotePaymentLinkCard {
  return {
    requestId: request.id,
    purpose: request.purpose,
    amountMinor: request.amountMinor,
    currencyCode: request.currencyCode,
    url: paymentLinkHref(request.paymentLinkUrl),
  };
}

function blocksCreates(recovery: ClientQuotePaymentLinksViewModel["recovery"]): boolean {
  return recovery === "uncertain" || recovery === "unrecoverable";
}

export function buildClientQuotePaymentLinksView(
  input: ClientQuotePaymentLinksBuildInput,
): ClientQuotePaymentLinksViewModel {
  const pending = input.pendingKey != null;
  const base = {
    pending,
    pendingKey: input.pendingKey,
    canRetrySame: false,
    currencyCode: currencyOf(input.currencyCode),
    expired: false,
    failure: null,
    recovery: null,
    unavailable: "none" as const,
    oneTime: null,
    recurring: [],
  };
  if (input.phase === "loading") {
    return { ...base, phase: "loading" };
  }
  if (input.phase === "load_failed" || !input.payload) {
    return {
      ...base,
      phase: "load_failed",
      failure: {
        code: input.failureCode ?? "PAYMENT_LINK_FAILED",
        kind: "failure",
      },
    };
  }
  const { eligibility, paymentRequests } = input.payload;
  const requestCurrency = paymentRequests[0]?.currencyCode ?? null;
  const currencyCode = requestCurrency ?? currencyOf(input.currencyCode);
  const activeFailure = input.failureCode
    ? { code: input.failureCode, kind: paymentLinkFailureKind(input.failureCode) }
    : !eligibility.expired &&
        eligibility.blockedReason &&
        paymentRequests.length === 0
      ? {
          code: eligibility.blockedReason,
          kind: paymentLinkFailureKind(eligibility.blockedReason),
        }
      : null;
  const missingUrl = paymentRequests.some((row) => paymentLinkHref(row.paymentLinkUrl) == null);
  const recovery: ClientQuotePaymentLinksViewModel["recovery"] =
    activeFailure?.kind === "uncertain"
      ? "uncertain"
      : activeFailure?.kind === "unrecoverable"
        ? "unrecoverable"
        : missingUrl && eligibility.canInitiateStripe && !eligibility.expired
          ? "unfulfilled"
          : null;
  const holdCreates = blocksCreates(recovery);
  const fullRequest =
    paymentRequests.find((row) => row.purpose === "one_time_full") ?? null;
  const depositRequest =
    paymentRequests.find((row) => row.purpose === "one_time_deposit") ?? null;
  const balanceRequest =
    paymentRequests.find((row) => row.purpose === "one_time_balance") ?? null;
  const mode = eligibility.oneTime?.existingMode ?? null;
  const splitIntent = mode === "split" || Boolean(depositRequest || balanceRequest);
  const fullIntent = mode === "full" || Boolean(fullRequest);
  const fullVisible =
    fullIntent ||
    (!splitIntent && Boolean(eligibility.oneTime?.fullSelectable));
  const splitVisible =
    splitIntent ||
    (!fullIntent && Boolean(eligibility.oneTime?.splitSelectable));
  const locked: "full" | "split" | null = splitIntent ? "split" : fullIntent ? "full" : null;
  let selected = locked ?? input.choice;
  if (selected == null && fullVisible && !splitVisible) selected = "full";
  if (selected == null && splitVisible && !fullVisible) selected = "split";
  if (selected === "full" && !fullVisible) selected = null;
  if (selected === "split" && !splitVisible) selected = null;
  const deposit = depositMajorUnitsToMinor(input.depositText, currencyCode ?? input.currencyCode);
  const showFullCreate =
    selected === "full" &&
    !fullRequest &&
    fullVisible &&
    !eligibility.expired &&
    !holdCreates;
  const showDepositEntry =
    selected === "split" &&
    !depositRequest &&
    !balanceRequest &&
    splitVisible &&
    !eligibility.expired &&
    !holdCreates;
  const showSplitCreate = showDepositEntry;
  const cards = [fullRequest, depositRequest, balanceRequest]
    .filter((row): row is ClientQuotePaymentLinkRequest => row != null)
    .map(cardFor);
  const oneTime =
    fullVisible || splitVisible || cards.length > 0
      ? {
          totalMinor: eligibility.oneTime?.amountMinor ?? fullRequest?.amountMinor ?? null,
          fullVisible,
          splitVisible,
          selected,
          locked,
          showChoice: locked == null && fullVisible && splitVisible,
          showFullCreate,
          showSplitCreate,
          splitCreateEnabled: showSplitCreate && deposit.ok,
          showDepositEntry,
          depositStatus: deposit.ok
            ? ("ready" as const)
            : deposit.reason === "empty"
              ? ("empty" as const)
              : deposit.reason === "below_minimum"
                ? ("below_minimum" as const)
                : ("invalid" as const),
          serverBalanceMinor: balanceRequest?.amountMinor ?? null,
          completeFull: Boolean(
            fullRequest &&
              paymentLinkHref(fullRequest.paymentLinkUrl) == null &&
              eligibility.canInitiateStripe &&
              !eligibility.expired &&
              !holdCreates,
          ),
          completeSplit: Boolean(
            (depositRequest || balanceRequest) &&
              (paymentLinkHref(depositRequest?.paymentLinkUrl) == null ||
                paymentLinkHref(balanceRequest?.paymentLinkUrl) == null) &&
              eligibility.canInitiateStripe &&
              !eligibility.expired &&
              !holdCreates &&
              (depositRequest?.depositMinor ?? balanceRequest?.depositMinor) != null,
          ),
          cards,
        }
      : null;
  const recurringByFrequency = new Map<
    ClientQuotePaymentLinkRecurring,
    ClientQuotePaymentLinksViewModel["recurring"][number]
  >();
  for (const frequency of CLIENT_QUOTE_PAYMENT_LINK_RECURRING) {
    const offered = eligibility.recurring.find((row) => row.billingFrequency === frequency);
    const request =
      paymentRequests.find((row) => row.purpose === frequency) ?? null;
    if (!request && !offered?.selectable) continue;
    const amountMinor = request?.amountMinor ?? offered?.amountMinor ?? null;
    if (amountMinor == null) continue;
    const rowCurrency = request?.currencyCode ?? currencyCode;
    if (!rowCurrency) continue;
    if (!rowCurrency) continue;
    recurringByFrequency.set(frequency, {
      billingFrequency: frequency,
      amountMinor,
      currencyCode: rowCurrency,
      canCreate: Boolean(offered?.selectable && !request && !eligibility.expired && !holdCreates),
      card: request ? cardFor(request) : null,
      canComplete: Boolean(
        request &&
          paymentLinkHref(request.paymentLinkUrl) == null &&
          eligibility.canInitiateStripe &&
          !eligibility.expired &&
          !holdCreates,
      ),
    });
  }
  const recurring = [...recurringByFrequency.values()];
  const hasCharge =
    Boolean(oneTime) || recurring.length > 0 || paymentRequests.length > 0;
  const unavailable =
    eligibility.blockedReason === "CURRENCY_NOT_SUPPORTED"
      ? "currency"
      : !hasCharge
        ? "no_charge"
        : "none";
  return {
    phase: "ready",
    pending,
    pendingKey: input.pendingKey,
    expired: eligibility.expired,
    failure: activeFailure,
    recovery,
    canRetrySame: recovery === "uncertain" && input.canRetrySame,
    currencyCode,
    unavailable,
    oneTime,
    recurring,
  };
}
