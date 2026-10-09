/**
 * Structural validation for quotation payloads.
 * Totals are always replaced by calculateClientQuote. Client totals are ignored.
 */

import {
  OrganizationLanguageInvalidError,
  parseOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";
import {
  normalizeBrandFont,
  parseOptionalBrandHexColor,
} from "@/services/identity/brandIdentity";
import {
  calculateClientQuote,
  currencyMinorUnitScale,
  normalizeCurrencyCode,
} from "@/services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_FIELD_LIMITS,
  CLIENT_QUOTE_LOGO_CONTENT_HASH_LENGTH,
  CLIENT_QUOTE_LOGO_MIME_TYPES,
  CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR,
  ClientQuoteCalculationError,
  ClientQuoteValidationError,
  emptyClientQuoteIssuedBrand,
  emptyClientQuotePostalAddress,
  type ClientQuoteAppendix,
  type ClientQuoteCustomerSnapshot,
  type ClientQuoteDiscount,
  type ClientQuoteDraftV1,
  type ClientQuoteIssuedBrandSnapshot,
  type ClientQuoteIssuedLogoSnapshot,
  type ClientQuoteIssuerSnapshot,
  type ClientQuoteLineItem,
  type ClientQuoteLogoMimeType,
  type ClientQuotePaymentTerms,
  type ClientQuotePostalAddress,
  type ClientQuoteQuantity,
  type ClientQuoteTax,
  type ClientQuoteValidity,
} from "@/services/clientQuote/clientQuoteTypes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LINE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const QUOTE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(details: string[]): never {
  throw new ClientQuoteValidationError(details);
}

export function assertUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    fail([`${label} must be a UUID.`]);
  }
  return value.trim().toLowerCase();
}

export function assertUtcTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value)) {
    fail([`${label} must be a UTC timestamp in toISOString form.`]);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail([`${label} must be a real UTC timestamp.`]);
  }
  return value;
}

export function assertQuoteNumber(value: unknown): string {
  if (typeof value !== "string") {
    fail(["quoteNumber must be a string."]);
  }
  const trimmed = value.trim();
  if (!QUOTE_NUMBER_PATTERN.test(trimmed)) {
    fail([
      "quoteNumber must be 1 to 40 characters using letters, digits, and . _ / -.",
    ]);
  }
  return trimmed;
}

export function parseClientQuoteContentLanguage(
  value: unknown,
): OrganizationLanguage {
  try {
    return parseOrganizationLanguage(value);
  } catch (error) {
    if (error instanceof OrganizationLanguageInvalidError) {
      fail(["contentLanguage must be one of en, fr, es, it, de, pt."]);
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushText(
  errors: string[],
  value: unknown,
  path: string,
  max: number,
  required: boolean,
): string | null {
  if (value == null || value === "") {
    if (required) {
      errors.push(`${path} must be a non-empty string.`);
    }
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${path} must be a string.`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      errors.push(`${path} must be a non-empty string.`);
    }
    return null;
  }
  if (trimmed.includes("\u0000")) {
    errors.push(`${path} contains an invalid character.`);
    return null;
  }
  if (trimmed.length > max) {
    errors.push(`${path} exceeds maximum length of ${max} characters.`);
    return null;
  }
  return trimmed;
}

function parsePostalAddress(
  value: unknown,
  path: string,
  errors: string[],
): ClientQuotePostalAddress {
  if (value == null) {
    return emptyClientQuotePostalAddress();
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return emptyClientQuotePostalAddress();
  }
  return {
    line1: pushText(errors, value.line1, `${path}.line1`, CLIENT_QUOTE_FIELD_LIMITS.addressLine, false),
    line2: pushText(errors, value.line2, `${path}.line2`, CLIENT_QUOTE_FIELD_LIMITS.addressLine, false),
    city: pushText(errors, value.city, `${path}.city`, CLIENT_QUOTE_FIELD_LIMITS.city, false),
    region: pushText(errors, value.region, `${path}.region`, CLIENT_QUOTE_FIELD_LIMITS.region, false),
    postalCode: pushText(
      errors,
      value.postalCode,
      `${path}.postalCode`,
      CLIENT_QUOTE_FIELD_LIMITS.postalCode,
      false,
    ),
    country: pushText(
      errors,
      value.country,
      `${path}.country`,
      CLIENT_QUOTE_FIELD_LIMITS.country,
      false,
    ),
  };
}

function parseEmail(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  const email = pushText(errors, value, path, CLIENT_QUOTE_FIELD_LIMITS.email, false);
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push(`${path} must be an email address.`);
    return null;
  }
  return email;
}

function parseWebsite(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  const website = pushText(
    errors,
    value,
    path,
    CLIENT_QUOTE_FIELD_LIMITS.website,
    false,
  );
  if (website && /\s/.test(website)) {
    errors.push(`${path} must not contain whitespace.`);
    return null;
  }
  return website;
}

function parseIssuer(
  value: unknown,
  errors: string[],
): ClientQuoteIssuerSnapshot | null {
  if (!isRecord(value)) {
    errors.push("issuer must be an object.");
    return null;
  }
  // Drafts may omit the legal name so a quotation can be saved before
  // Own Company legal details exist. Issue still requires it.
  const legalName = pushText(
    errors,
    value.legalName,
    "issuer.legalName",
    CLIENT_QUOTE_FIELD_LIMITS.legalName,
    false,
  );
  return {
    legalName: legalName ?? "",
    tradingName: pushText(
      errors,
      value.tradingName,
      "issuer.tradingName",
      CLIENT_QUOTE_FIELD_LIMITS.tradingName,
      false,
    ),
    postalAddress: parsePostalAddress(value.postalAddress, "issuer.postalAddress", errors),
    phone: pushText(errors, value.phone, "issuer.phone", CLIENT_QUOTE_FIELD_LIMITS.phone, false),
    email: parseEmail(value.email, "issuer.email", errors),
    website: parseWebsite(value.website, "issuer.website", errors),
    registrationNumber: pushText(
      errors,
      value.registrationNumber,
      "issuer.registrationNumber",
      CLIENT_QUOTE_FIELD_LIMITS.registrationNumber,
      false,
    ),
    taxIdentifier: pushText(
      errors,
      value.taxIdentifier,
      "issuer.taxIdentifier",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier,
      false,
    ),
    taxIdentifierLabel: pushText(
      errors,
      value.taxIdentifierLabel,
      "issuer.taxIdentifierLabel",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel,
      false,
    ),
    contactName: pushText(
      errors,
      value.contactName,
      "issuer.contactName",
      CLIENT_QUOTE_FIELD_LIMITS.contactName,
      false,
    ),
    jobTitle: pushText(
      errors,
      value.jobTitle,
      "issuer.jobTitle",
      CLIENT_QUOTE_FIELD_LIMITS.jobTitle,
      false,
    ),
    additionalNote: pushText(
      errors,
      value.additionalNote,
      "issuer.additionalNote",
      CLIENT_QUOTE_FIELD_LIMITS.additionalNote,
      false,
    ),
  };
}

function parseCustomer(
  value: unknown,
  errors: string[],
): ClientQuoteCustomerSnapshot | null {
  if (!isRecord(value)) {
    errors.push("customer must be an object.");
    return null;
  }
  const name = pushText(
    errors,
    value.name,
    "customer.name",
    CLIENT_QUOTE_FIELD_LIMITS.customerName,
    true,
  );
  return {
    name: name ?? "",
    contactName: pushText(
      errors,
      value.contactName,
      "customer.contactName",
      CLIENT_QUOTE_FIELD_LIMITS.contactName,
      false,
    ),
    jobTitle: pushText(
      errors,
      value.jobTitle,
      "customer.jobTitle",
      CLIENT_QUOTE_FIELD_LIMITS.jobTitle,
      false,
    ),
    postalAddress: parsePostalAddress(
      value.postalAddress,
      "customer.postalAddress",
      errors,
    ),
    phone: pushText(
      errors,
      value.phone,
      "customer.phone",
      CLIENT_QUOTE_FIELD_LIMITS.phone,
      false,
    ),
    email: parseEmail(value.email, "customer.email", errors),
    taxIdentifier: pushText(
      errors,
      value.taxIdentifier,
      "customer.taxIdentifier",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifier,
      false,
    ),
  };
}

function parseQuantity(
  value: unknown,
  path: string,
  errors: string[],
): ClientQuoteQuantity | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const scale = value.scale;
  const coefficient = value.coefficient;
  let ok = true;
  if (
    typeof scale !== "number" ||
    !Number.isSafeInteger(scale) ||
    scale < 0 ||
    scale > CLIENT_QUOTE_FIELD_LIMITS.quantityScale
  ) {
    errors.push(`${path}.scale must be an integer from 0 to 4.`);
    ok = false;
  }
  if (
    typeof coefficient !== "number" ||
    !Number.isSafeInteger(coefficient) ||
    coefficient < 1 ||
    coefficient > CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient
  ) {
    errors.push(`${path}.coefficient must be a positive integer.`);
    ok = false;
  }
  if (!ok || typeof scale !== "number" || typeof coefficient !== "number") {
    return null;
  }
  return { coefficient, scale };
}

function parseLineItems(
  value: unknown,
  errors: string[],
): Array<Omit<ClientQuoteLineItem, "lineTotalMinor">> | null {
  if (!Array.isArray(value)) {
    errors.push("lineItems must be an array.");
    return null;
  }
  if (value.length < 1) {
    errors.push("At least one line item is required.");
    return null;
  }
  if (value.length > CLIENT_QUOTE_FIELD_LIMITS.lineItems) {
    errors.push("Too many line items.");
    return null;
  }
  const items: Array<Omit<ClientQuoteLineItem, "lineTotalMinor">> = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const path = `lineItems[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    const id = pushText(errors, raw.id, `${path}.id`, 64, true);
    if (id && !LINE_ID_PATTERN.test(id)) {
      errors.push(`${path}.id contains unsupported characters.`);
    }
    if (id && seen.has(id)) {
      errors.push(`${path}.id must be unique.`);
    }
    if (id) seen.add(id);
    const description = pushText(
      errors,
      raw.description,
      `${path}.description`,
      CLIENT_QUOTE_FIELD_LIMITS.lineDescription,
      true,
    );
    const quantity = parseQuantity(raw.quantity, `${path}.quantity`, errors);
    const unitPriceMinor = raw.unitPriceMinor;
    if (
      typeof unitPriceMinor !== "number" ||
      !Number.isSafeInteger(unitPriceMinor) ||
      unitPriceMinor < 0
    ) {
      errors.push(
        `${path}.unitPriceMinor must be a nonnegative integer minor-unit amount.`,
      );
    }
    if (!id || !description || !quantity || typeof unitPriceMinor !== "number") {
      continue;
    }
    items.push({ id, description, quantity, unitPriceMinor });
  }
  if (items.length !== value.length) return null;
  return items;
}

function parseRate(
  value: unknown,
  path: string,
  errors: string[],
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR
  ) {
    errors.push(`${path} must be an integer from 0 to 1000000.`);
    return null;
  }
  return value;
}

function parseDiscount(value: unknown, errors: string[]): ClientQuoteDiscount | null {
  if (!isRecord(value)) {
    errors.push("discount must be an object.");
    return null;
  }
  if (value.kind === "none") return { kind: "none" };
  if (value.kind === "fixed") {
    if (
      typeof value.amountMinor !== "number" ||
      !Number.isSafeInteger(value.amountMinor) ||
      value.amountMinor < 0
    ) {
      errors.push(
        "discount.amountMinor must be a nonnegative integer minor-unit amount.",
      );
      return null;
    }
    return { kind: "fixed", amountMinor: value.amountMinor };
  }
  if (value.kind === "percentage") {
    const ratePpm = parseRate(value.ratePpm, "discount.ratePpm", errors);
    if (ratePpm == null) return null;
    return { kind: "percentage", ratePpm };
  }
  errors.push("discount.kind must be none, fixed, or percentage.");
  return null;
}

function parseTax(value: unknown, errors: string[]): ClientQuoteTax | null {
  if (!isRecord(value)) {
    errors.push("tax must be an object.");
    return null;
  }
  if (value.kind === "none") return { kind: "none" };
  if (value.kind === "percentage") {
    const ratePpm = parseRate(value.ratePpm, "tax.ratePpm", errors);
    const label = pushText(
      errors,
      value.label,
      "tax.label",
      CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel,
      false,
    );
    if (ratePpm == null) return null;
    return { kind: "percentage", ratePpm, label };
  }
  errors.push("tax.kind must be none or percentage.");
  return null;
}

function parsePaymentTerms(
  value: unknown,
  errors: string[],
): ClientQuotePaymentTerms | null {
  if (!isRecord(value)) {
    errors.push("paymentTerms must be an object.");
    return null;
  }
  const summary = pushText(
    errors,
    value.summary ?? "",
    "paymentTerms.summary",
    CLIENT_QUOTE_FIELD_LIMITS.paymentSummary,
    false,
  );
  return {
    summary: summary ?? "",
    scheduleNote: pushText(
      errors,
      value.scheduleNote,
      "paymentTerms.scheduleNote",
      CLIENT_QUOTE_FIELD_LIMITS.paymentScheduleNote,
      false,
    ),
  };
}

function parseIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function parseValidity(value: unknown, errors: string[]): ClientQuoteValidity | null {
  if (!isRecord(value)) {
    errors.push("validity must be an object.");
    return null;
  }
  let validForDays: number | null = null;
  if (value.validForDays != null) {
    if (
      typeof value.validForDays !== "number" ||
      !Number.isSafeInteger(value.validForDays) ||
      value.validForDays < 1 ||
      value.validForDays > CLIENT_QUOTE_FIELD_LIMITS.validForDays
    ) {
      errors.push("validity.validForDays must be an integer from 1 to 3650.");
    } else {
      validForDays = value.validForDays;
    }
  }
  let validUntil: string | null = null;
  if (value.validUntil != null) {
    if (typeof value.validUntil !== "string" || !parseIsoDate(value.validUntil)) {
      errors.push("validity.validUntil must be a real YYYY-MM-DD date.");
    } else {
      validUntil = value.validUntil;
    }
  }
  return {
    validForDays,
    validUntil,
    note: pushText(
      errors,
      value.note,
      "validity.note",
      CLIENT_QUOTE_FIELD_LIMITS.validityNote,
      false,
    ),
  };
}

function parseAppendix(value: unknown, errors: string[]): ClientQuoteAppendix {
  if (value == null) {
    return { enabled: false, sections: [] };
  }
  if (!isRecord(value)) {
    errors.push("appendix must be an object.");
    return { enabled: false, sections: [] };
  }
  const enabled = value.enabled == null ? false : value.enabled;
  if (typeof enabled !== "boolean") {
    errors.push("appendix.enabled must be a boolean.");
  }
  const sectionsRaw = value.sections == null ? [] : value.sections;
  if (!Array.isArray(sectionsRaw)) {
    errors.push("appendix.sections must be an array.");
    return { enabled: false, sections: [] };
  }
  if (sectionsRaw.length > CLIENT_QUOTE_FIELD_LIMITS.appendixSections) {
    errors.push("Too many appendix sections.");
  }
  const sections: ClientQuoteAppendix["sections"] = [];
  for (let index = 0; index < sectionsRaw.length; index += 1) {
    const raw = sectionsRaw[index];
    const path = `appendix.sections[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    const heading = pushText(
      errors,
      raw.heading,
      `${path}.heading`,
      CLIENT_QUOTE_FIELD_LIMITS.appendixHeading,
      true,
    );
    const body = pushText(
      errors,
      raw.body,
      `${path}.body`,
      CLIENT_QUOTE_FIELD_LIMITS.appendixBody,
      true,
    );
    if (heading && body) sections.push({ heading, body });
  }
  return {
    enabled: enabled === true,
    sections,
  };
}

/**
 * Validate a draft and replace totals, line totals, and currency scale
 * with the domain calculation. Supplied totals are never read.
 */
export function normalizeClientQuoteDraft(
  input: unknown,
  currencyCode: unknown,
): ClientQuoteDraftV1 {
  const errors: string[] = [];
  if (!isRecord(input)) {
    fail(["draft must be an object."]);
  }
  if (input.schemaVersion !== CLIENT_QUOTE_DRAFT_SCHEMA_VERSION) {
    errors.push("draft.schemaVersion must be client_quote_draft_v1.");
  }

  let resolvedCurrency = "";
  let expectedScale = 0;
  let currencyKnown = false;
  try {
    resolvedCurrency = normalizeCurrencyCode(currencyCode);
    expectedScale = currencyMinorUnitScale(resolvedCurrency);
    currencyKnown = true;
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      errors.push(error.message);
    } else {
      throw error;
    }
  }

  if (
    currencyKnown &&
    input.currencyScale != null &&
    input.currencyScale !== expectedScale
  ) {
    errors.push("currencyScale does not match the currency's minor-unit scale.");
  }

  const issuer = parseIssuer(input.issuer, errors);
  const customer = parseCustomer(input.customer, errors);
  const projectTitle = pushText(
    errors,
    input.projectTitle,
    "projectTitle",
    CLIENT_QUOTE_FIELD_LIMITS.projectTitle,
    true,
  );
  const scopeSummary = pushText(
    errors,
    input.scopeSummary,
    "scopeSummary",
    CLIENT_QUOTE_FIELD_LIMITS.scopeSummary,
    true,
  );
  const lineItems = parseLineItems(input.lineItems, errors);
  const paymentTerms = parsePaymentTerms(input.paymentTerms, errors);
  const validity = parseValidity(input.validity, errors);
  const appendix = parseAppendix(input.appendix, errors);
  const discount = parseDiscount(input.discount, errors);
  const tax = parseTax(input.tax, errors);

  if (errors.length > 0) {
    fail(errors);
  }
  if (
    !issuer ||
    !customer?.name ||
    !projectTitle ||
    !scopeSummary ||
    !lineItems ||
    !paymentTerms ||
    !validity ||
    !discount ||
    !tax
  ) {
    fail(["Client quote validation failed."]);
  }

  let calculated;
  try {
    calculated = calculateClientQuote({
      currencyCode: resolvedCurrency,
      lineItems,
      discount,
      tax,
    });
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      fail([error.message]);
    }
    throw error;
  }

  return {
    schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
    currencyScale: calculated.currencyScale,
    issuer,
    customer,
    projectTitle,
    scopeSummary,
    lineItems: lineItems.map((line, index) => ({
      ...line,
      lineTotalMinor: calculated.lineTotalsMinor[index] ?? 0,
    })),
    paymentTerms,
    validity,
    appendix,
    discount,
    tax,
    totals: calculated.totals,
  };
}

/**
 * Commercial completeness required to freeze an issued snapshot.
 * Drafts may still omit payment terms and validity.
 */
export function assertClientQuoteIssuable(draft: ClientQuoteDraftV1): void {
  const errors: string[] = [];
  if (!draft.issuer.legalName.trim()) {
    errors.push("issuer.legalName is required to issue a quotation.");
  }
  if (!draft.customer.name.trim()) {
    errors.push("customer.name is required to issue a quotation.");
  }
  if (!draft.projectTitle.trim()) {
    errors.push("projectTitle is required to issue a quotation.");
  }
  if (!draft.scopeSummary.trim()) {
    errors.push("scopeSummary is required to issue a quotation.");
  }
  if (draft.lineItems.length < 1) {
    errors.push("At least one line item is required to issue a quotation.");
  }
  if (!draft.paymentTerms.summary.trim()) {
    errors.push("paymentTerms.summary is required to issue a quotation.");
  }
  if (draft.validity.validForDays == null && draft.validity.validUntil == null) {
    errors.push("validity requires validForDays or validUntil to issue a quotation.");
  }
  if (errors.length > 0) fail(errors);
}

function parseBrandColor(
  value: unknown,
  path: string,
  errors: string[],
): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    errors.push(`${path} must be a string.`);
    return null;
  }
  try {
    return parseOptionalBrandHexColor(value);
  } catch {
    errors.push(`${path} must be a 6-digit hex color.`);
    return null;
  }
}

function parseIssuedFont(value: unknown, errors: string[]): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    errors.push("brand.font must be a string.");
    return null;
  }
  try {
    return normalizeBrandFont(value);
  } catch {
    errors.push("brand.font is not an allowlisted font.");
    return null;
  }
}

function isQuoteOwnedLogoPath(path: string): boolean {
  return !(
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("..") ||
    path.includes("//") ||
    path.includes("://") ||
    path.includes("?") ||
    path.includes("#") ||
    /\s/.test(path)
  );
}

function parseQuoteOwnedLogo(
  value: unknown,
  errors: string[],
): ClientQuoteIssuedLogoSnapshot | null {
  if (value == null) return null;
  if (!isRecord(value)) {
    errors.push("brand.logo must be an object.");
    return null;
  }
  const storagePath = pushText(
    errors,
    value.storagePath,
    "brand.logo.storagePath",
    CLIENT_QUOTE_FIELD_LIMITS.logoStoragePath,
    true,
  );
  if (storagePath && !isQuoteOwnedLogoPath(storagePath)) {
    errors.push("brand.logo.storagePath must be a quote-owned storage path.");
  }
  const mime = value.mimeType;
  let mimeType: ClientQuoteLogoMimeType | null = null;
  if (
    typeof mime !== "string" ||
    !(CLIENT_QUOTE_LOGO_MIME_TYPES as readonly string[]).includes(mime)
  ) {
    errors.push(
      "brand.logo.mimeType must be image/png, image/jpeg, or image/webp.",
    );
  } else {
    mimeType = mime as ClientQuoteLogoMimeType;
  }
  let contentHash: string | null = null;
  if (
    typeof value.contentHash !== "string" ||
    !new RegExp(`^[0-9a-fA-F]{${CLIENT_QUOTE_LOGO_CONTENT_HASH_LENGTH}}$`).test(
      value.contentHash,
    )
  ) {
    errors.push("brand.logo.contentHash must be a SHA-256 hex digest.");
  } else {
    contentHash = value.contentHash.toLowerCase();
  }
  if (
    !storagePath ||
    !isQuoteOwnedLogoPath(storagePath) ||
    !mimeType ||
    !contentHash
  ) {
    return null;
  }
  return { storagePath, mimeType, contentHash };
}

/**
 * Freeze palette, font, and quote-owned logo metadata onto an issued snapshot.
 * Omitted brand becomes an empty snapshot. This does not copy storage objects.
 */
export function parseClientQuoteIssuedBrand(
  value: unknown,
): ClientQuoteIssuedBrandSnapshot {
  if (value == null) return emptyClientQuoteIssuedBrand();
  if (!isRecord(value)) fail(["brand must be an object."]);
  const errors: string[] = [];
  const primaryColor = parseBrandColor(value.primaryColor, "brand.primaryColor", errors);
  const secondaryColor = parseBrandColor(
    value.secondaryColor,
    "brand.secondaryColor",
    errors,
  );
  const accentColor = parseBrandColor(value.accentColor, "brand.accentColor", errors);
  const backgroundColor = parseBrandColor(
    value.backgroundColor,
    "brand.backgroundColor",
    errors,
  );
  const font = parseIssuedFont(value.font, errors);
  const logo = parseQuoteOwnedLogo(value.logo, errors);
  if (errors.length > 0) fail(errors);
  return {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    font,
    logo,
  };
}
