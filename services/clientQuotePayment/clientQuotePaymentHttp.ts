/**
 * CQ-STRIPE-1 Gate 2B — payment-link JSON parsing.
 * Charge amount, currency, and Stripe identifiers in the body are rejected.
 * depositMinor is only the split configuration; the server computes both charges.
 */

import type { ClientQuotePaymentDecision } from "@/services/clientQuotePayment/clientQuotePaymentTypes";

export type ClientQuotePaymentHttpFailure = {
  status: number;
  code: string;
  message: string;
};

const RECURRING = new Set(["monthly", "quarterly", "annually"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

export function parseClientQuotePaymentLinkBody(
  body: unknown,
): { decision: ClientQuotePaymentDecision } | ClientQuotePaymentHttpFailure {
  if (!isRecord(body)) {
    return { status: 400, code: "INVALID_BODY", message: "Request body must be an object." };
  }
  if (unknownKeys(body, new Set(["decision"]))) {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "The payment amount, currency, and Stripe identifiers are taken from the issued quotation.",
    };
  }
  const decision = body.decision;
  if (!isRecord(decision) || typeof decision.kind !== "string") {
    return {
      status: 400,
      code: "INVALID_BODY",
      message: "decision.kind must be one_time_full, one_time_split, or recurring.",
    };
  }
  if (decision.kind === "one_time_full") {
    if (unknownKeys(decision, new Set(["kind"]))) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "A full payment does not accept an amount or Stripe identifier.",
      };
    }
    return { decision: { kind: "one_time_full" } };
  }
  if (decision.kind === "one_time_split") {
    if (unknownKeys(decision, new Set(["kind", "depositMinor"]))) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "A split payment accepts only the deposit configuration.",
      };
    }
    const depositMinor = decision.depositMinor;
    if (typeof depositMinor !== "number" || !Number.isSafeInteger(depositMinor)) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "decision.depositMinor must be an integer minor-unit amount.",
      };
    }
    return { decision: { kind: "one_time_split", depositMinor } };
  }
  if (decision.kind === "recurring") {
    if (unknownKeys(decision, new Set(["kind", "billingFrequency"]))) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "A recurring payment does not accept an amount or Stripe identifier.",
      };
    }
    const billingFrequency = decision.billingFrequency;
    if (typeof billingFrequency !== "string" || !RECURRING.has(billingFrequency)) {
      return {
        status: 400,
        code: "INVALID_BODY",
        message: "decision.billingFrequency must be monthly, quarterly, or annually.",
      };
    }
    return {
      decision: {
        kind: "recurring",
        billingFrequency: billingFrequency as "monthly" | "quarterly" | "annually",
      },
    };
  }
  return {
    status: 400,
    code: "INVALID_BODY",
    message: "decision.kind must be one_time_full, one_time_split, or recurring.",
  };
}
