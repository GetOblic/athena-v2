/**
 * Template field validation (EST-QUOTE-2B.2).
 * Quantity bounds, currency codes, and billing frequencies come from the
 * quotation contracts. This module does not price a line or convert currency.
 */

import { normalizeCurrencyCode } from "@/services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_FIELD_LIMITS,
  ClientQuoteCalculationError,
  ClientQuoteValidationError,
  isClientQuoteBillingFrequency,
  type ClientQuoteBillingFrequency,
  type ClientQuoteQuantity,
} from "@/services/clientQuote/clientQuoteTypes";
import {
  CLIENT_QUOTE_TEMPLATE_NAME_MAX,
  type ClientQuoteTemplateInput,
  type ClientQuoteTemplatePatch,
} from "@/services/clientQuote/clientQuoteTemplateTypes";

const OWNERSHIP_KEYS = [
  "licenseeAccountId",
  "licensee_account_id",
  "organizationId",
  "organization_id",
] as const;

function fail(details: string[]): never {
  throw new ClientQuoteValidationError(details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNoOwnershipFields(body: Record<string, unknown>): void {
  for (const key of OWNERSHIP_KEYS) {
    if (Object.hasOwn(body, key)) {
      fail(["Licensee ownership cannot be supplied by the client."]);
    }
  }
}

function requireText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string") {
    fail([`${path} must be a non-empty string.`]);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    fail([`${path} must be a non-empty string.`]);
  }
  if (trimmed.includes("\u0000")) {
    fail([`${path} contains an invalid character.`]);
  }
  if (trimmed.length > max) {
    fail([`${path} exceeds maximum length of ${max} characters.`]);
  }
  return trimmed;
}

export function parseClientQuoteTemplateQuantity(
  value: unknown,
): ClientQuoteQuantity {
  if (!isRecord(value)) {
    fail(["quantity must be an object with coefficient and scale."]);
  }
  const scale = value.scale;
  if (
    typeof scale !== "number" ||
    !Number.isSafeInteger(scale) ||
    scale < 0 ||
    scale > CLIENT_QUOTE_FIELD_LIMITS.quantityScale
  ) {
    fail(["quantity.scale must be an integer from 0 to 4."]);
  }
  const coefficient = value.coefficient;
  if (
    typeof coefficient !== "number" ||
    !Number.isSafeInteger(coefficient) ||
    coefficient < 1 ||
    coefficient > CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient
  ) {
    fail(["quantity.coefficient must be a positive integer."]);
  }
  return { coefficient, scale };
}

export function parseClientQuoteTemplateUnitPrice(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    fail([
      "unitPriceMinor must be a nonnegative integer minor-unit amount.",
    ]);
  }
  return value;
}

export function parseClientQuoteTemplateCurrency(value: unknown): string {
  try {
    return normalizeCurrencyCode(value);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      fail([error.message]);
    }
    throw error;
  }
}

export function parseClientQuoteTemplateBillingFrequency(
  value: unknown,
): ClientQuoteBillingFrequency {
  if (!isClientQuoteBillingFrequency(value)) {
    fail([
      "billingFrequency must be one_time, monthly, quarterly, or annually.",
    ]);
  }
  return value;
}

function parseCommercialFields(
  body: Record<string, unknown>,
): ClientQuoteTemplateInput {
  return {
    name: requireText(body.name, "name", CLIENT_QUOTE_TEMPLATE_NAME_MAX),
    description: requireText(
      body.description,
      "description",
      CLIENT_QUOTE_FIELD_LIMITS.lineDescription,
    ),
    quantity: parseClientQuoteTemplateQuantity(body.quantity),
    unitPriceMinor: parseClientQuoteTemplateUnitPrice(body.unitPriceMinor),
    currencyCode: parseClientQuoteTemplateCurrency(body.currencyCode),
    billingFrequency: parseClientQuoteTemplateBillingFrequency(
      body.billingFrequency,
    ),
  };
}

export function parseClientQuoteTemplateBody(
  body: unknown,
): ClientQuoteTemplateInput {
  if (!isRecord(body)) {
    fail(["Request body must be an object."]);
  }
  assertNoOwnershipFields(body);
  return parseCommercialFields(body);
}

export function parseClientQuoteTemplatePatch(
  body: unknown,
): ClientQuoteTemplatePatch {
  if (!isRecord(body)) {
    fail(["Request body must be an object."]);
  }
  assertNoOwnershipFields(body);
  const patch: ClientQuoteTemplatePatch = {};
  let seen = false;
  if (Object.hasOwn(body, "name")) {
    patch.name = requireText(body.name, "name", CLIENT_QUOTE_TEMPLATE_NAME_MAX);
    seen = true;
  }
  if (Object.hasOwn(body, "description")) {
    patch.description = requireText(
      body.description,
      "description",
      CLIENT_QUOTE_FIELD_LIMITS.lineDescription,
    );
    seen = true;
  }
  if (Object.hasOwn(body, "quantity")) {
    patch.quantity = parseClientQuoteTemplateQuantity(body.quantity);
    seen = true;
  }
  if (Object.hasOwn(body, "unitPriceMinor")) {
    patch.unitPriceMinor = parseClientQuoteTemplateUnitPrice(body.unitPriceMinor);
    seen = true;
  }
  if (Object.hasOwn(body, "currencyCode")) {
    patch.currencyCode = parseClientQuoteTemplateCurrency(body.currencyCode);
    seen = true;
  }
  if (Object.hasOwn(body, "billingFrequency")) {
    patch.billingFrequency = parseClientQuoteTemplateBillingFrequency(
      body.billingFrequency,
    );
    seen = true;
  }
  if (!seen) {
    fail(["At least one template field is required."]);
  }
  return patch;
}
