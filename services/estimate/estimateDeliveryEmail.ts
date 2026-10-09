/**
 * Client-facing Estimate delivery email (estimate_delivery_email_v1).
 *
 * Separate from the frozen estimate_v1 package. The model may return it as a
 * sibling on the same JSON object. Validation is server-authoritative and
 * throws; the generation pipeline soft-fails an invalid email to null.
 *
 * A Licensee Master may later replace the effective subject and body. That
 * edit is plain-text validation only. It does not re-run generation claim
 * filters, and it leaves the stored generated text in place.
 */

import { currencyMinorUnitScale } from "@/services/clientQuote/clientQuoteMoney";
import { assistantReplyContainsForbiddenEstimateClaims } from "@/services/estimate/athenaEstimateValidation";
import { ESTIMATE_COUNTRY_CURRENCY_MAP } from "@/services/estimate/estimateGeoCurrency";
import {
  isOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

export const ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION =
  "estimate_delivery_email_v1" as const;

export const ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS = 120 as const;
export const ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS = 2_000 as const;

export type EstimateDeliveryEmailV1 = {
  schemaVersion: typeof ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION;
  language: OrganizationLanguage;
  subject: string;
  body: string;
};

export type EstimateDeliveryEmailTextV1 = {
  subject: string;
  body: string;
};

/**
 * Durable athena_estimates.delivery_email_json record.
 * Separate from estimate_v1. Generation writes generated text and leaves
 * edited / editedAt null. A later edit may replace the effective text.
 */
export type EstimateDeliveryEmailRecordV1 = {
  schemaVersion: typeof ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION;
  language: OrganizationLanguage;
  generated: EstimateDeliveryEmailTextV1;
  edited: EstimateDeliveryEmailTextV1 | null;
  editedAt: string | null;
};

export type EffectiveEstimateDeliveryEmail = {
  subject: string;
  body: string;
  language: OrganizationLanguage;
  edited: boolean;
};

export class EstimateDeliveryEmailValidationError extends Error {
  readonly code = "INVALID_DELIVERY_EMAIL";
  readonly details: string[];

  constructor(details: string[]) {
    super(details[0] ?? "Estimate delivery email validation failed.");
    this.name = "EstimateDeliveryEmailValidationError";
    this.details = details;
  }
}

const KNOWN_CURRENCY_CODES = new Set(
  ESTIMATE_COUNTRY_CURRENCY_MAP.map((entry) => entry.currencyCode),
);

const CURRENCY_SYMBOLS: Record<string, RegExp> = {
  USD: /(?:US\$|(?<![A-Za-z])\$)/,
  EUR: /€/,
  GBP: /£/,
};

const PRIOR_DISCUSSION_PATTERNS: RegExp[] = [
  /\b(?:as we discussed|as discussed|as (?:i|we) promised|we agreed|as agreed|per our (?:call|meeting|agreement|conversation)|following our (?:call|meeting|conversation|email)|our (?:previous|prior|last|recent) (?:call|meeting|discussion|conversation))\b/i,
  /\b(?:comme convenu|comme promis|suite à notre (?:appel|réunion|échange)|lors de notre (?:appel|réunion)|nous avons convenu)\b/i,
  /\b(?:como acordamos|como comentamos|como prometido|tras nuestra (?:llamada|reunión))\b/i,
  /\b(?:come concordato|come discusso|come promesso|dopo la nostra (?:chiamata|riunione))\b/i,
  /\b(?:wie besprochen|wie vereinbart|wie versprochen|nach unserem (?:gespräch|anruf|meeting))\b/i,
  /\b(?:como combinamos|como discutimos|como prometido|após a nossa (?:chamada|reunião))\b/i,
];

const COMMITMENT_PATTERNS: RegExp[] = [
  /\b(?:guarantee(?:d|s)?|start date|we will start on|project starts on|kick-?off date)\b/i,
  /\b(?:garanti(?:e|t|es)?|garantizado|garantía|garantito|garanzia|garantiert|garantie|garantido|garantia)\b/i,
  /\b(?:special discount|exclusive discount|remise exceptionnelle|descuento especial|sconto speciale|sonderrabatt|desconto especial)\b/i,
  /\b\d+\s*%\s*(?:off|discount|remise|descuento|sconto|rabatt|desconto)\b/i,
  /\b(?:reserved|booked) (?:a |our )?(?:meeting|call)\b/i,
];

const INTERNAL_CLAIM_PATTERNS: RegExp[] = [
  /\bathena\b/i,
  /\bopenrouter\b/i,
  /\bgetoblic\b/i,
  /\b(?:gpt-?\d|claude|language model|ai model)\b/i,
  /\bpricing methodology\b/i,
  /\b(?:licensee margin|our margin|margin of \d+)\b/i,
  /\binternal reasoning\b/i,
  /\bchain[- ]of[- ]thought\b/i,
];

const SPAM_PATTERNS: RegExp[] = [
  /\b(?:act now|limited time|click here|once in a lifetime|risk[- ]free|100%\s*free)\b/i,
];

const DISCLAIMER_PATTERNS: RegExp[] = [
  /ai-assisted commercial guidance/i,
  /not a live market survey/i,
  /competitor quotation sourcing/i,
];

const EMAIL_ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_NUMBER =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]*)?\d{3}[\s.-]\d{3}[\s.-]\d{4}\b|\+\d{1,3}(?:[\s.-]?\d){7,14}\b/;
const TAX_IDENTIFIER =
  /\b(?:VAT|EIN|SIRET|SIREN|TVA|NIF|CIF|NIPC|USt-?IdNr|partita iva|tax id|tax number)\b/i;
const HTML_TAG = /<\/?[a-z][^>\n]*>/i;
const SUBJECT_REPLY_PREFIX = /^(?:re|fwd|fw)\s*:/i;

const NUMBER_TOKEN_SOURCE =
  "\\d{1,3}(?:[ \\u00A0\\u202F\\u2009.,]\\d{3})+(?:[.,]\\d{1,4})?|\\d+(?:[.,]\\d{1,4})?";

function fail(details: string[]): never {
  throw new EstimateDeliveryEmailValidationError(details);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function digitsToBigInt(digits: string): bigint | null {
  if (!/^\d+$/.test(digits)) return null;
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return BigInt(normalized);
}

function minorFromParts(
  whole: string,
  fraction: string,
  scale: number,
): bigint | null {
  if (!/^\d+$/.test(whole)) return null;
  if (fraction.length > scale) return null;
  if (fraction && !/^\d+$/.test(fraction)) return null;
  return digitsToBigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

function ungroup(whole: string, groupChar: string): string | null {
  const parts = whole.split(groupChar);
  if (parts.some((part) => part.length === 0)) return null;
  if (parts.length === 1) return /^\d+$/.test(whole) ? whole : null;
  if (!/^\d{1,3}$/.test(parts[0] ?? "")) return null;
  for (const part of parts.slice(1)) {
    if (!/^\d{3}$/.test(part)) return null;
  }
  return parts.join("");
}

function toPlainDecimal(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (Number.isSafeInteger(amount)) return amount.toString();
  const raw = amount.toString();
  if (!/[eE]/.test(raw)) return raw;
  const match = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(raw);
  if (!match) return null;
  const digits = `${match[1]}${match[2] ?? ""}`;
  const exponent = Number(match[3]);
  if (!Number.isFinite(exponent)) return null;
  const point = (match[1]?.length ?? 0) + exponent;
  if (point >= digits.length) {
    return `${digits}${"0".repeat(point - digits.length)}`;
  }
  if (point <= 0) {
    return `0.${"0".repeat(-point)}${digits}`;
  }
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Half away from zero, at the currency's ISO minor-unit scale. */
function quantizeAmountToMinor(amount: number, scale: number): bigint | null {
  const plain = toPlainDecimal(amount);
  if (!plain) return null;
  const [whole, fraction = ""] = plain.split(".");
  if (!whole || !/^\d+$/.test(whole)) return null;
  if (fraction && !/^\d+$/.test(fraction)) return null;
  if (fraction.length <= scale) {
    return minorFromParts(whole, fraction, scale);
  }
  const kept = fraction.slice(0, scale);
  const rest = fraction.slice(scale);
  const minor = minorFromParts(whole, kept, scale);
  if (minor == null || !/^\d+$/.test(rest)) return null;
  const remainder = BigInt(rest);
  const half = BigInt(`1${"0".repeat(rest.length)}`);
  if (remainder * BigInt(2) >= half) return minor + BigInt(1);
  return minor;
}

function interpretCompact(compact: string, scale: number): bigint[] {
  if (!/^\d+(?:[.,]\d+)*$/.test(compact)) return [];
  const hasDot = compact.includes(".");
  const hasComma = compact.includes(",");
  const values: bigint[] = [];

  const push = (value: bigint | null) => {
    if (value != null && !values.some((existing) => existing === value)) {
      values.push(value);
    }
  };

  if (!hasDot && !hasComma) {
    push(minorFromParts(compact, "", scale));
    return values;
  }

  if (hasDot && hasComma) {
    const lastDot = compact.lastIndexOf(".");
    const lastComma = compact.lastIndexOf(",");
    const decimalIndex = Math.max(lastDot, lastComma);
    const decimalChar = compact[decimalIndex];
    const groupChar = decimalChar === "." ? "," : ".";
    const fraction = compact.slice(decimalIndex + 1);
    const whole = ungroup(compact.slice(0, decimalIndex), groupChar);
    if (whole && fraction.length > 0 && fraction.length <= scale) {
      push(minorFromParts(whole, fraction, scale));
    }
    return values;
  }

  const separator = hasDot ? "." : ",";
  const parts = compact.split(separator);
  const grouped = ungroup(compact, separator);
  if (grouped) push(minorFromParts(grouped, "", scale));
  if (parts.length === 2) {
    const whole = parts[0] ?? "";
    const fraction = parts[1] ?? "";
    if (fraction.length > 0 && fraction.length <= scale) {
      push(minorFromParts(whole, fraction, scale));
    }
  }
  return values;
}

function currencyWindowMatches(
  window: string,
  currencyCode: string,
): boolean {
  for (const match of window.matchAll(/\b[A-Za-z]{3}\b/g)) {
    const code = match[0].toUpperCase();
    if (code !== currencyCode && KNOWN_CURRENCY_CODES.has(code)) return false;
  }
  if (new RegExp(`\\b${currencyCode}\\b`, "i").test(window)) return true;
  const symbol = CURRENCY_SYMBOLS[currencyCode];
  return symbol ? symbol.test(window) : false;
}

function bodyReferencesAuthoritativePrice(
  body: string,
  amount: number,
  currencyCode: string,
): boolean {
  let scale: number;
  try {
    scale = currencyMinorUnitScale(currencyCode);
  } catch {
    return false;
  }
  const target = quantizeAmountToMinor(amount, scale);
  if (target == null) return false;

  for (const match of body.matchAll(new RegExp(NUMBER_TOKEN_SOURCE, "g"))) {
    if (match.index == null) continue;
    const compact = match[0].replace(/[\s\u00A0\u202F\u2009]/g, "");
    const values = interpretCompact(compact, scale);
    if (!values.some((value) => value === target)) continue;
    const start = match.index;
    const end = start + match[0].length;
    const window = body.slice(
      Math.max(0, start - 16),
      Math.min(body.length, end + 16),
    );
    if (currencyWindowMatches(window, currencyCode)) return true;
  }
  return false;
}

function requirePlainText(
  value: string,
  path: string,
  errors: string[],
  maxLength: number,
  singleLine: boolean,
): string | null {
  if (singleLine && /[\r\n]/.test(value)) {
    errors.push(`${path} must be a single line.`);
    return null;
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    errors.push(`${path} must be plain text.`);
    return null;
  }
  const normalized = (
    singleLine
      ? value.trim().replace(/[ \t\f\v]+/g, " ")
      : value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
  );
  if (!normalized) {
    errors.push(`${path} must be a non-empty string.`);
    return null;
  }
  if (normalized.length > maxLength) {
    errors.push(`${path} exceeds maximum length of ${maxLength} characters.`);
    return null;
  }
  if (HTML_TAG.test(normalized)) {
    errors.push(`${path} must be plain text.`);
    return null;
  }
  return normalized;
}

/**
 * Normalize and validate a model-authored delivery email.
 * Does not alter the Estimate package. Throws on every rejection.
 */
export function validateEstimateDeliveryEmail(input: {
  raw: unknown;
  language: OrganizationLanguage;
  recommendedClientPriceAmount: number;
  currencyCode: string;
}): EstimateDeliveryEmailV1 {
  const errors: string[] = [];
  if (!input.raw || typeof input.raw !== "object" || Array.isArray(input.raw)) {
    fail(["deliveryEmail must be an object."]);
  }
  const raw = input.raw as Record<string, unknown>;

  if (raw.schemaVersion !== ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION) {
    errors.push(
      `deliveryEmail.schemaVersion must be exactly "${ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION}".`,
    );
  }

  const language =
    typeof raw.language === "string" ? raw.language.trim().toLowerCase() : "";
  if (!isOrganizationLanguage(language)) {
    errors.push(
      "deliveryEmail.language must be one of en, fr, es, it, de, pt.",
    );
  } else if (language !== input.language) {
    errors.push(
      `deliveryEmail.language must be "${input.language}".`,
    );
  }

  const subject = requirePlainText(
    typeof raw.subject === "string" ? raw.subject : "",
    "deliveryEmail.subject",
    errors,
    ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS,
    true,
  );
  const body = requirePlainText(
    typeof raw.body === "string" ? raw.body : "",
    "deliveryEmail.body",
    errors,
    ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS,
    false,
  );

  if (subject && SUBJECT_REPLY_PREFIX.test(subject)) {
    errors.push("deliveryEmail.subject must not start with Re: or Fwd:.");
  }

  const currencyCode = input.currencyCode.trim().toUpperCase();
  if (body && !bodyReferencesAuthoritativePrice(body, input.recommendedClientPriceAmount, currencyCode)) {
    errors.push(
      "deliveryEmail.body must reference the validated recommended price and server currency.",
    );
  }

  const combined = [subject, body].filter((value): value is string => Boolean(value)).join("\n");
  if (combined) {
    if (matchesAny(combined, PRIOR_DISCUSSION_PATTERNS)) {
      errors.push(
        "deliveryEmail contains a fabricated prior-discussion claim.",
      );
    }
    if (matchesAny(combined, COMMITMENT_PATTERNS)) {
      errors.push("deliveryEmail contains a fabricated commitment claim.");
    }
    if (
      matchesAny(combined, INTERNAL_CLAIM_PATTERNS) ||
      matchesAny(combined, DISCLAIMER_PATTERNS) ||
      assistantReplyContainsForbiddenEstimateClaims(combined)
    ) {
      errors.push("deliveryEmail contains a prohibited internal claim.");
    }
    if (matchesAny(combined, SPAM_PATTERNS)) {
      errors.push("deliveryEmail contains a prohibited marketing claim.");
    }
    if (
      EMAIL_ADDRESS.test(combined) ||
      PHONE_NUMBER.test(combined) ||
      TAX_IDENTIFIER.test(combined)
    ) {
      errors.push("deliveryEmail contains invented contact or tax details.");
    }
  }

  if (errors.length > 0 || !subject || !body || !isOrganizationLanguage(language)) {
    fail(errors.length > 0 ? errors : ["deliveryEmail is malformed."]);
  }

  return {
    schemaVersion: ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION,
    language,
    subject,
    body,
  };
}

export function buildGeneratedEstimateDeliveryEmailRecord(
  email: EstimateDeliveryEmailV1,
): EstimateDeliveryEmailRecordV1 {
  return {
    schemaVersion: ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION,
    language: email.language,
    generated: {
      subject: email.subject,
      body: email.body,
    },
    edited: null,
    editedAt: null,
  };
}

function parseDeliveryEmailText(
  value: unknown,
): EstimateDeliveryEmailTextV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.subject !== "string" || typeof raw.body !== "string") {
    return null;
  }
  if (/[\r\n]/.test(raw.subject)) return null;
  const subject = raw.subject.trim().replace(/[ \t\f\v]+/g, " ");
  const body = raw.body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!subject || !body) return null;
  if (
    subject.length > ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS ||
    body.length > ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS
  ) {
    return null;
  }
  if (HTML_TAG.test(subject) || HTML_TAG.test(body)) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(`${subject}${body}`)) {
    return null;
  }
  return { subject, body };
}

/**
 * Read mapping. Malformed JSON returns null and must not throw.
 * Does not re-run generation grounding checks.
 */
export function parseEstimateDeliveryEmailRecord(
  value: unknown,
): EstimateDeliveryEmailRecordV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION) return null;
  const language =
    typeof raw.language === "string" ? raw.language.trim().toLowerCase() : "";
  if (!isOrganizationLanguage(language)) return null;
  const generated = parseDeliveryEmailText(raw.generated);
  if (!generated) return null;

  let edited: EstimateDeliveryEmailTextV1 | null = null;
  if (raw.edited != null) {
    edited = parseDeliveryEmailText(raw.edited);
    if (!edited) return null;
  }

  if (raw.editedAt != null) {
    if (typeof raw.editedAt !== "string" || !raw.editedAt.trim()) return null;
  }

  return {
    schemaVersion: ESTIMATE_DELIVERY_EMAIL_SCHEMA_VERSION,
    language,
    generated,
    edited,
    editedAt:
      typeof raw.editedAt === "string" && raw.editedAt.trim()
        ? raw.editedAt.trim()
        : null,
  };
}

const REJECTED_DELIVERY_EMAIL_EDIT_FIELDS = new Set([
  "licenseeAccountId",
  "licensee_account_id",
  "organizationId",
  "organization_id",
  "organizationName",
  "organization_name",
  "estimateId",
  "estimate_id",
  "id",
  "status",
  "generated",
  "schemaVersion",
  "schema_version",
  "language",
  "edited",
  "editedAt",
  "edited_at",
  "package",
  "packageJson",
  "package_json",
  "requestJson",
  "request_json",
  "prospectGenerationContextJson",
  "prospect_generation_context_json",
]);

export class EstimateDeliveryEmailEditError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "ESTIMATE_NOT_READY"
    | "EMAIL_NOT_AVAILABLE"
    | "PERSISTENCE_FAILED";

  constructor(
    code: EstimateDeliveryEmailEditError["code"],
    message: string,
  ) {
    super(message);
    this.name = "EstimateDeliveryEmailEditError";
    this.code = code;
  }
}

const DELIVERY_EMAIL_EDIT_HTTP_STATUS = {
  UNAUTHORIZED: 401,
  LICENSEE_ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  INVALID_DELIVERY_EMAIL: 400,
  ESTIMATE_NOT_READY: 409,
  EMAIL_NOT_AVAILABLE: 409,
  PERSISTENCE_FAILED: 500,
} as const;

export function estimateDeliveryEmailEditHttpStatus(
  code: keyof typeof DELIVERY_EMAIL_EDIT_HTTP_STATUS,
): number {
  return DELIVERY_EMAIL_EDIT_HTTP_STATUS[code];
}

/**
 * Licensee-authored subject and body.
 * Trims surrounding whitespace and enforces the same plain-text bounds as
 * generated email. Does not check pricing, claims, or model grounding.
 * Rejects ownership fields and generated-record fields.
 */
export function validateLicenseeEstimateDeliveryEmailEdit(
  input: unknown,
): EstimateDeliveryEmailTextV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail(["Delivery email edit must be an object."]);
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const rejected = Object.keys(raw).filter((key) =>
    REJECTED_DELIVERY_EMAIL_EDIT_FIELDS.has(key),
  );
  if (rejected.length > 0) {
    errors.push(
      "Delivery email edit must not include ownership or generated fields.",
    );
  }
  const unsupported = Object.keys(raw).filter(
    (key) => key !== "subject" && key !== "body" && !rejected.includes(key),
  );
  if (unsupported.length > 0) {
    errors.push("Delivery email edit contains unsupported fields.");
  }

  let subject: string | null = null;
  if (typeof raw.subject !== "string") {
    errors.push("subject must be a string.");
  } else {
    subject = requirePlainText(
      raw.subject,
      "subject",
      errors,
      ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS,
      true,
    );
  }

  let body: string | null = null;
  if (typeof raw.body !== "string") {
    errors.push("body must be a string.");
  } else {
    body = requirePlainText(
      raw.body,
      "body",
      errors,
      ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS,
      false,
    );
  }

  if (errors.length > 0 || !subject || !body) {
    fail(errors.length > 0 ? errors : ["Delivery email edit is malformed."]);
  }

  return { subject, body };
}

/**
 * Replace only the edited overlay. schemaVersion, language, and generated
 * text are copied from the stored record.
 */
export function applyLicenseeEstimateDeliveryEmailEdit(
  record: EstimateDeliveryEmailRecordV1,
  text: EstimateDeliveryEmailTextV1,
  editedAt: string,
): EstimateDeliveryEmailRecordV1 {
  return {
    schemaVersion: record.schemaVersion,
    language: record.language,
    generated: {
      subject: record.generated.subject,
      body: record.generated.body,
    },
    edited: {
      subject: text.subject,
      body: text.body,
    },
    editedAt,
  };
}

/** Effective subject/body: edited when present, otherwise generated. */
export function toEffectiveEstimateDeliveryEmail(
  record: EstimateDeliveryEmailRecordV1 | null,
): EffectiveEstimateDeliveryEmail | null {
  if (!record) return null;
  const text = record.edited ?? record.generated;
  return {
    subject: text.subject,
    body: text.body,
    language: record.language,
    edited: record.edited != null,
  };
}
