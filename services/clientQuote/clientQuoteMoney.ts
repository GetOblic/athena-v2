/**
 * Deterministic quotation arithmetic (EST-QUOTE-1C.1).
 *
 * Rounding contract: half away from zero, applied to nonnegative integers.
 * This is commercial half-up. It is not banker's half-to-even.
 *
 * A quotient N / D rounds away from zero when the remainder is at least
 * half of D (remainder * 2 >= D). Exact integers are unchanged.
 *
 * Calculation order, always in this sequence, inside each billing-frequency group:
 * 1. line extension = round(unitPriceMinor * quantityCoefficient / 10^quantityScale)
 * 2. subtotal = sum of that group's line extensions, in input order
 * 3. discount = fixed amount, or round(subtotal * ratePpm / 1_000_000)
 * 4. taxable amount = subtotal - discount
 * 5. tax = round(taxable amount * ratePpm / 1_000_000), or 0
 * 6. total = taxable amount + tax
 *
 * Groups follow one_time, monthly, quarterly, annually. A missing frequency is
 * one_time. Percentage discount and percentage tax are rounded independently
 * on each group. A fixed discount is allowed only when every line shares one
 * frequency. Recurring charges are not multiplied into an annual total, and
 * unlike billing periods are not added into the compatibility totals.
 *
 * One discount is applied: none, fixed, or percentage. Fixed and percentage
 * discounts are not stacked. Tax is an optional single percentage after discount.
 *
 * Percentage rates are integer parts per million of the whole: 1_000_000 = 100%.
 * Currency minor-unit scales follow ISO 4217 exponents. Codes not listed use 2.
 * Major-unit conversion parses a decimal string and never multiplies binary floats.
 * Results must fit in Number.MAX_SAFE_INTEGER. The final total is nonnegative;
 * a discount larger than the subtotal is rejected rather than clamped.
 */

import {
  CLIENT_QUOTE_BILLING_FREQUENCIES,
  CLIENT_QUOTE_FIELD_LIMITS,
  CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR,
  ClientQuoteCalculationError,
  isClientQuoteBillingFrequency,
  type ClientQuoteBillingFrequency,
  type ClientQuoteDiscount,
  type ClientQuoteFrequencyTotals,
  type ClientQuoteQuantity,
  type ClientQuoteTax,
  type ClientQuoteTotals,
} from "@/services/clientQuote/clientQuoteTypes";

export const CLIENT_QUOTE_ROUNDING_CONTRACT = "half-away-from-zero" as const;

export const CLIENT_QUOTE_CALCULATION_ORDER = [
  "line_extensions",
  "subtotal",
  "discount",
  "taxable_amount",
  "tax",
  "total",
] as const;

/**
 * Currencies a Master may explicitly select on an editable draft.
 * Both use a 2-digit minor unit, so a switch keeps integer minor amounts.
 */
export const CLIENT_QUOTE_SELECTABLE_CURRENCIES = ["USD", "EUR"] as const;

export type ClientQuoteSelectableCurrency =
  (typeof CLIENT_QUOTE_SELECTABLE_CURRENCIES)[number];

export function isClientQuoteSelectableCurrency(
  value: unknown,
): value is ClientQuoteSelectableCurrency {
  return value === "USD" || value === "EUR";
}

/** ISO 4217 minor-unit exponents that are not 2. */
export const CLIENT_QUOTE_CURRENCY_SCALE_OVERRIDES: Readonly<
  Record<string, 0 | 3 | 4>
> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4,
};

const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const POW10: bigint[] = [BigInt(1)];

for (let scale = 1; scale <= CLIENT_QUOTE_FIELD_LIMITS.quantityScale; scale += 1) {
  POW10.push(POW10[scale - 1] * BigInt(10));
}

function fail(message: string): never {
  throw new ClientQuoteCalculationError(message);
}

function pow10(scale: number): bigint {
  const cached = POW10[scale];
  if (cached === undefined) {
    fail("Decimal scale is not supported.");
  }
  return cached;
}

export function normalizeCurrencyCode(currencyCode: unknown): string {
  if (typeof currencyCode !== "string") {
    fail("Currency code must be a 3-letter ISO code.");
  }
  const code = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    fail("Currency code must be a 3-letter ISO code.");
  }
  return code;
}

export function currencyMinorUnitScale(currencyCode: unknown): number {
  const code = normalizeCurrencyCode(currencyCode);
  return CLIENT_QUOTE_CURRENCY_SCALE_OVERRIDES[code] ?? 2;
}

/**
 * Divide a nonnegative integer numerator by a positive denominator.
 * Rounds half away from zero.
 */
export function divRoundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= BigInt(0)) {
    fail("Division denominator must be positive.");
  }
  if (numerator < BigInt(0)) {
    fail("Monetary division does not accept negative amounts.");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BigInt(2) >= denominator) {
    return quotient + BigInt(1);
  }
  return quotient;
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, "");
  return stripped.length > 0 ? stripped : "0";
}

function expandPlainDecimal(text: string): string {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) {
    fail("Amount is not a decimal value.");
  }
  const exponentText = match[3];
  if (exponentText == null) {
    return match[2] == null ? match[1] : `${match[1]}.${match[2]}`;
  }
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || exponent > 24 || exponent < -24) {
    fail("Amount magnitude is not supported.");
  }
  const digits = `${match[1]}${match[2] ?? ""}`;
  const point = match[1].length + exponent;
  if (point <= 0) {
    return `0.${"0".repeat(-point)}${digits}`;
  }
  if (point >= digits.length) {
    return stripLeadingZeros(digits + "0".repeat(point - digits.length));
  }
  return `${stripLeadingZeros(digits.slice(0, point))}.${digits.slice(point)}`;
}

function finiteNumberToPlainDecimal(amount: number): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    fail("Amount must be a finite number.");
  }
  if (Object.is(amount, -0) || amount < 0) {
    fail("Amount must be nonnegative.");
  }
  return expandPlainDecimal(amount.toString());
}

function plainDecimalToMinorUnits(plain: string, scale: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(plain);
  if (!match) {
    fail("Amount is not a decimal value.");
  }
  const whole = stripLeadingZeros(match[1]);
  const frac = match[2] ?? "";
  if (whole.length > 16 || frac.length > 40) {
    fail("Amount magnitude is not supported.");
  }
  const kept = frac.slice(0, scale).padEnd(scale, "0");
  const roundDigit = frac.length > scale ? Number(frac[scale]) : 0;
  let minor = BigInt(whole) * pow10(scale);
  if (scale > 0) {
    minor += BigInt(kept);
  }
  if (roundDigit >= 5) {
    minor += BigInt(1);
  }
  if (minor > MAX_MINOR) {
    fail("Calculated amount exceeds the supported maximum.");
  }
  return minor;
}

/**
 * Convert a major-unit decimal to integer minor units of the currency.
 * Accepts a finite number or a decimal string. Zero is a valid conversion;
 * callers that need a positive price reject it themselves.
 */
export function majorAmountToMinorUnits(
  amount: number | string,
  currencyCode: unknown,
): number {
  const scale = currencyMinorUnitScale(currencyCode);
  const plain =
    typeof amount === "number"
      ? finiteNumberToPlainDecimal(amount)
      : typeof amount === "string"
        ? expandPlainDecimal(amount.trim())
        : fail("Amount must be a finite number or a decimal string.");
  return Number(plainDecimalToMinorUnits(plain, scale));
}

function requireSafeInteger(
  value: unknown,
  message: string,
  bounds: { min: number; max: number },
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < bounds.min ||
    value > bounds.max
  ) {
    fail(message);
  }
  return value;
}

function parseQuantity(value: unknown): ClientQuoteQuantity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Quantity must be an object with coefficient and scale.");
  }
  const raw = value as { coefficient?: unknown; scale?: unknown };
  const scale = requireSafeInteger(
    raw.scale,
    "Quantity scale must be an integer from 0 to 4.",
    { min: 0, max: CLIENT_QUOTE_FIELD_LIMITS.quantityScale },
  );
  const coefficient = requireSafeInteger(
    raw.coefficient,
    "Quantity coefficient must be a positive integer.",
    {
      min: 1,
      max: CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient,
    },
  );
  return { coefficient, scale };
}

function parseRatePpm(value: unknown, path: string): number {
  return requireSafeInteger(
    value,
    `${path} must be an integer from 0 to 1000000.`,
    { min: 0, max: CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR },
  );
}

function lineExtensionMinor(input: {
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
}): bigint {
  const unitPrice = BigInt(input.unitPriceMinor);
  const coefficient = BigInt(input.quantity.coefficient);
  return divRoundHalfAwayFromZero(
    unitPrice * coefficient,
    pow10(input.quantity.scale),
  );
}

function toSafeMinor(value: bigint, message: string): number {
  if (value < BigInt(0) || value > MAX_MINOR) {
    fail(message);
  }
  return Number(value);
}

export type ClientQuoteCalculationLine = {
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
  /** Missing and null normalize to one_time. */
  billingFrequency?: ClientQuoteBillingFrequency | null;
};

export type ClientQuoteCalculationResult = {
  currencyCode: string;
  currencyScale: number;
  /** Line extensions in input order, not grouped order. */
  lineTotalsMinor: number[];
  /**
   * Compatibility total. Single-frequency quotations equal that group.
   * Mixed quotations mirror one_time when that group exists, otherwise
   * a zero-valued object. This is not a combined or annualized contract value.
   */
  totals: ClientQuoteTotals;
  /** Authoritative per-frequency totals in canonical order. */
  frequencyTotals: ClientQuoteFrequencyTotals[];
};

function readBillingFrequency(line: object): ClientQuoteBillingFrequency {
  const value = (line as { billingFrequency?: unknown }).billingFrequency;
  if (value == null) return "one_time";
  if (isClientQuoteBillingFrequency(value)) return value;
  fail("billingFrequency must be one_time, monthly, quarterly, or annually.");
}

function copyTotals(totals: ClientQuoteTotals): ClientQuoteTotals {
  return {
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    taxableMinor: totals.taxableMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
  };
}

/**
 * Mixed quotations with no one_time lines expose this zero object as totals.
 * It is a compatibility placeholder, not a commercial sum.
 */
function zeroCompatibilityTotals(): ClientQuoteTotals {
  return {
    subtotalMinor: 0,
    discountMinor: 0,
    taxableMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
  };
}

function compatibilityTotals(
  frequencyTotals: readonly ClientQuoteFrequencyTotals[],
): ClientQuoteTotals {
  if (frequencyTotals.length === 1) {
    return copyTotals(frequencyTotals[0].totals);
  }
  const oneTime = frequencyTotals.find(
    (group) => group.billingFrequency === "one_time",
  );
  if (oneTime) return copyTotals(oneTime.totals);
  return zeroCompatibilityTotals();
}

function adjustmentTotals(
  subtotal: bigint,
  discountInput: ClientQuoteDiscount,
  taxInput: ClientQuoteTax,
): { discount: bigint; taxable: bigint; tax: bigint; total: bigint } {
  let discount = BigInt(0);
  if (discountInput.kind === "none") {
    discount = BigInt(0);
  } else if (discountInput.kind === "fixed") {
    const amountMinor = requireSafeInteger(
      discountInput.amountMinor,
      "Discount amount must be a nonnegative integer minor-unit amount.",
      { min: 0, max: Number.MAX_SAFE_INTEGER },
    );
    discount = BigInt(amountMinor);
    if (discount > subtotal) {
      fail("Fixed discount exceeds the subtotal.");
    }
  } else if (discountInput.kind === "percentage") {
    const ratePpm = parseRatePpm(discountInput.ratePpm, "Discount rate");
    discount = divRoundHalfAwayFromZero(
      subtotal * BigInt(ratePpm),
      BigInt(CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR),
    );
    if (discount > subtotal) {
      fail("Percentage discount exceeds the subtotal.");
    }
  } else {
    fail("Discount kind must be none, fixed, or percentage.");
  }

  const taxable = subtotal - discount;
  if (taxable < BigInt(0)) {
    fail("Final total must be nonnegative.");
  }

  let tax = BigInt(0);
  if (taxInput.kind === "none") {
    tax = BigInt(0);
  } else if (taxInput.kind === "percentage") {
    const ratePpm = parseRatePpm(taxInput.ratePpm, "Tax rate");
    tax = divRoundHalfAwayFromZero(
      taxable * BigInt(ratePpm),
      BigInt(CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR),
    );
  } else {
    fail("Tax kind must be none or percentage.");
  }

  const total = taxable + tax;
  if (total < BigInt(0)) {
    fail("Final total must be nonnegative.");
  }
  if (total > MAX_MINOR || tax > MAX_MINOR) {
    fail("Calculated amount exceeds the supported maximum.");
  }

  return { discount, taxable, tax, total };
}

export function calculateClientQuote(input: {
  currencyCode: unknown;
  lineItems: readonly ClientQuoteCalculationLine[];
  discount: ClientQuoteDiscount;
  tax: ClientQuoteTax;
}): ClientQuoteCalculationResult {
  const currencyCode = normalizeCurrencyCode(input.currencyCode);
  const currencyScale = currencyMinorUnitScale(currencyCode);

  if (!Array.isArray(input.lineItems)) {
    fail("Line items must be an array.");
  }
  if (input.lineItems.length < 1) {
    fail("At least one line item is required.");
  }
  if (input.lineItems.length > CLIENT_QUOTE_FIELD_LIMITS.lineItems) {
    fail("Too many line items.");
  }

  const lineTotals: bigint[] = [];
  const grouped = new Map<ClientQuoteBillingFrequency, bigint[]>();
  for (const line of input.lineItems) {
    if (!line || typeof line !== "object") {
      fail("Line item must be an object.");
    }
    const quantity = parseQuantity(line.quantity);
    const unitPriceMinor = requireSafeInteger(
      line.unitPriceMinor,
      "Unit price must be a nonnegative integer minor-unit amount.",
      { min: 0, max: Number.MAX_SAFE_INTEGER },
    );
    const billingFrequency = readBillingFrequency(line);
    const extension = lineExtensionMinor({ quantity, unitPriceMinor });
    if (extension > MAX_MINOR) {
      fail("Calculated amount exceeds the supported maximum.");
    }
    const bucket = grouped.get(billingFrequency) ?? [];
    bucket.push(extension);
    grouped.set(billingFrequency, bucket);
    lineTotals.push(extension);
  }

  if (input.discount.kind === "fixed" && grouped.size > 1) {
    fail(
      "Fixed discount requires every line to use the same billing frequency.",
    );
  }

  const frequencyTotals: ClientQuoteFrequencyTotals[] = [];
  for (const billingFrequency of CLIENT_QUOTE_BILLING_FREQUENCIES) {
    const extensions = grouped.get(billingFrequency);
    if (!extensions || extensions.length === 0) continue;
    let subtotal = BigInt(0);
    for (const extension of extensions) {
      subtotal += extension;
      if (subtotal > MAX_MINOR) {
        fail("Calculated amount exceeds the supported maximum.");
      }
    }
    const adjusted = adjustmentTotals(subtotal, input.discount, input.tax);
    frequencyTotals.push({
      billingFrequency,
      totals: {
        subtotalMinor: toSafeMinor(
          subtotal,
          "Calculated amount exceeds the supported maximum.",
        ),
        discountMinor: toSafeMinor(
          adjusted.discount,
          "Calculated amount exceeds the supported maximum.",
        ),
        taxableMinor: toSafeMinor(
          adjusted.taxable,
          "Calculated amount exceeds the supported maximum.",
        ),
        taxMinor: toSafeMinor(
          adjusted.tax,
          "Calculated amount exceeds the supported maximum.",
        ),
        totalMinor: toSafeMinor(
          adjusted.total,
          "Calculated amount exceeds the supported maximum.",
        ),
      },
    });
  }

  return {
    currencyCode,
    currencyScale,
    lineTotalsMinor: lineTotals.map((line) =>
      toSafeMinor(line, "Calculated amount exceeds the supported maximum."),
    ),
    totals: compatibilityTotals(frequencyTotals),
    frequencyTotals,
  };
}
