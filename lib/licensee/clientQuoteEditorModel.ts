/**
 * Licensee client quotation editor model.
 * Presentation and payload assembly only.
 * Totals always come from calculateClientQuote. Callers cannot supply a total.
 */

import {
  calculateClientQuote,
  currencyMinorUnitScale,
  majorAmountToMinorUnits,
  normalizeCurrencyCode,
} from "@/services/clientQuote/clientQuoteMoney";
import {
  CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
  CLIENT_QUOTE_FIELD_LIMITS,
  CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR,
  ClientQuoteCalculationError,
  type ClientQuoteDiscount,
  type ClientQuoteDraftV1,
  type ClientQuoteQuantity,
  type ClientQuoteTax,
  type ClientQuoteTotals,
} from "@/services/clientQuote/clientQuoteTypes";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";
import {
  isOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUANTITY_PATTERN = /^\d+(\.\d{1,4})?$/;
const PERCENT_PATTERN = /^\d+(\.\d{1,4})?$/;

export const CLIENT_QUOTE_ISSUE_REQUIREMENTS = [
  "issuerLegalName",
  "customerName",
  "projectTitle",
  "scopeSummary",
  "lineItem",
  "paymentTerms",
  "validity",
] as const;

export type ClientQuoteIssueRequirement =
  (typeof CLIENT_QUOTE_ISSUE_REQUIREMENTS)[number];

export type ClientQuoteDraftBlocker =
  | "customerName"
  | "projectTitle"
  | "scopeSummary"
  | "lineItem"
  | "discount"
  | "tax"
  | "appendix"
  | "validity"
  | "contact"
  | "calculation";

export type ClientQuotePostalAddressEdit = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type ClientQuoteIssuerEdit = {
  legalName: string;
  tradingName: string;
  postalAddress: ClientQuotePostalAddressEdit;
  phone: string;
  email: string;
  website: string;
  registrationNumber: string;
  taxIdentifier: string;
  taxIdentifierLabel: string;
  contactName: string;
  jobTitle: string;
  additionalNote: string;
};

export type ClientQuoteCustomerEdit = {
  name: string;
  contactName: string;
  jobTitle: string;
  postalAddress: ClientQuotePostalAddressEdit;
  phone: string;
  email: string;
  taxIdentifier: string;
};

export type ClientQuoteLineEdit = {
  id: string;
  description: string;
  quantityText: string;
  unitPriceText: string;
};

export type ClientQuoteAppendixSectionEdit = {
  heading: string;
  body: string;
};

export type ClientQuoteEditorDraft = {
  issuer: ClientQuoteIssuerEdit;
  customer: ClientQuoteCustomerEdit;
  projectTitle: string;
  scopeSummary: string;
  lines: ClientQuoteLineEdit[];
  discountKind: "none" | "fixed" | "percentage";
  discountAmountText: string;
  discountPercentText: string;
  taxKind: "none" | "percentage";
  taxPercentText: string;
  taxLabel: string;
  paymentSummary: string;
  paymentScheduleNote: string;
  validForDaysText: string;
  validUntil: string;
  validityNote: string;
  appendixEnabled: boolean;
  appendixSections: ClientQuoteAppendixSectionEdit[];
  contentLanguage: OrganizationLanguage;
};

export type ClientQuoteMoneyPreview = {
  currencyCode: string;
  currencyScale: number;
  lineTotalsMinor: number[];
  totals: ClientQuoteTotals;
};

export type ClientQuoteUpdateBody = {
  draft: ClientQuoteDraftV1;
  contentLanguage: OrganizationLanguage;
};

export type ClientQuoteLibraryRow = {
  id: string;
  status: PublicClientQuote["status"];
  quoteNumber: string | null;
  customerName: string;
  projectTitle: string;
  currencyCode: string;
  totalMinor: number;
  totalLabel: string;
  dateIso: string;
  dateLabel: string;
  dateKind: "created" | "issued";
};

type CommercialSource = {
  issuer: PublicClientQuote["draft"]["issuer"];
  customer: PublicClientQuote["draft"]["customer"];
  projectTitle: string;
  scopeSummary: string;
  lineItems: PublicClientQuote["draft"]["lineItems"];
  discount: ClientQuoteDiscount;
  tax: ClientQuoteTax;
  paymentTerms: PublicClientQuote["draft"]["paymentTerms"];
  validity: PublicClientQuote["draft"]["validity"];
  appendix: PublicClientQuote["draft"]["appendix"];
  contentLanguage: OrganizationLanguage;
  currencyCode: string;
};

function text(value: string | null | undefined): string {
  return value ?? "";
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function addressFrom(
  address: PublicClientQuote["draft"]["issuer"]["postalAddress"] | null | undefined,
): ClientQuotePostalAddressEdit {
  return {
    line1: text(address?.line1),
    line2: text(address?.line2),
    city: text(address?.city),
    region: text(address?.region),
    postalCode: text(address?.postalCode),
    country: text(address?.country),
  };
}

function addressTo(address: ClientQuotePostalAddressEdit) {
  return {
    line1: emptyToNull(address.line1),
    line2: emptyToNull(address.line2),
    city: emptyToNull(address.city),
    region: emptyToNull(address.region),
    postalCode: emptyToNull(address.postalCode),
    country: emptyToNull(address.country),
  };
}

export function isClientQuoteRouteId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function formatClientQuoteMinorAmount(
  amountMinor: number,
  currencyCode: string,
): string {
  let code = "XXX";
  let scale = 2;
  try {
    code = normalizeCurrencyCode(currencyCode);
    scale = currencyMinorUnitScale(code);
  } catch (error) {
    if (!(error instanceof ClientQuoteCalculationError)) throw error;
    return "—";
  }
  if (!Number.isSafeInteger(amountMinor)) return "—";
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  let body: string;
  if (scale === 0) {
    body = String(abs);
  } else {
    const factor = 10 ** scale;
    const whole = Math.floor(abs / factor);
    const fraction = String(abs % factor).padStart(scale, "0");
    body = `${whole}.${fraction}`;
  }
  return `${negative ? "-" : ""}${body} ${code}`;
}

export function formatClientQuoteMajorInput(
  amountMinor: number,
  currencyCode: string,
): string {
  const formatted = formatClientQuoteMinorAmount(amountMinor, currencyCode);
  const space = formatted.lastIndexOf(" ");
  return space > 0 ? formatted.slice(0, space) : formatted;
}

export function formatClientQuoteQuantity(quantity: ClientQuoteQuantity): string {
  if (quantity.scale === 0) return String(quantity.coefficient);
  const factor = 10 ** quantity.scale;
  const whole = Math.floor(quantity.coefficient / factor);
  const fraction = String(quantity.coefficient % factor)
    .padStart(quantity.scale, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseClientQuoteQuantityText(
  value: string,
): ClientQuoteQuantity | null {
  const trimmed = value.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const scale = fraction.length;
  const digits = `${whole}${fraction}`.replace(/^0+/, "");
  if (!digits) return null;
  const coefficient = Number(digits);
  if (
    !Number.isSafeInteger(coefficient) ||
    coefficient < 1 ||
    coefficient > CLIENT_QUOTE_FIELD_LIMITS.quantityCoefficient
  ) {
    return null;
  }
  return { coefficient, scale };
}

export function parseClientQuoteMajorAmount(
  value: string,
  currencyCode: string,
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return majorAmountToMinorUnits(trimmed, currencyCode);
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) return null;
    throw error;
  }
}

export function percentTextToRatePpm(value: string): number | null {
  const trimmed = value.trim().replace(/%$/, "");
  if (!PERCENT_PATTERN.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = `${fraction}0000`.slice(0, 4);
  const ppm = Number(whole) * 10_000 + Number(padded);
  if (
    !Number.isSafeInteger(ppm) ||
    ppm < 0 ||
    ppm > CLIENT_QUOTE_PERCENTAGE_RATE_DENOMINATOR
  ) {
    return null;
  }
  return ppm;
}

export function ratePpmToPercentText(ratePpm: number): string {
  const whole = Math.floor(ratePpm / 10_000);
  const fraction = String(ratePpm % 10_000)
    .padStart(4, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function formatClientQuoteTimestamp(
  iso: string | null | undefined,
  locale: string,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return iso;
  }
}

export function formatClientQuoteDate(isoDate: string, locale: string): string {
  if (!ISO_DATE_PATTERN.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(utc);
  } catch {
    return isoDate;
  }
}

function parseValidForDays(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const days = Number(trimmed);
  if (
    !Number.isSafeInteger(days) ||
    days < 1 ||
    days > CLIENT_QUOTE_FIELD_LIMITS.validForDays
  ) {
    return "invalid";
  }
  return days;
}

function parseValidUntil(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_PATTERN.test(trimmed)) return "invalid";
  const [year, month, day] = trimmed.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return "invalid";
  }
  return trimmed;
}

function zeroMajorInput(currencyCode: string): string {
  try {
    const scale = currencyMinorUnitScale(currencyCode);
    return scale === 0 ? "0" : `0.${"0".repeat(scale)}`;
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) return "0.00";
    throw error;
  }
}

function editorFromCommercial(source: CommercialSource): ClientQuoteEditorDraft {
  const discount = source.discount;
  const tax = source.tax;
  return {
    issuer: {
      legalName: source.issuer.legalName,
      tradingName: text(source.issuer.tradingName),
      postalAddress: addressFrom(source.issuer.postalAddress),
      phone: text(source.issuer.phone),
      email: text(source.issuer.email),
      website: text(source.issuer.website),
      registrationNumber: text(source.issuer.registrationNumber),
      taxIdentifier: text(source.issuer.taxIdentifier),
      taxIdentifierLabel: text(source.issuer.taxIdentifierLabel),
      contactName: text(source.issuer.contactName),
      jobTitle: text(source.issuer.jobTitle),
      additionalNote: text(source.issuer.additionalNote),
    },
    customer: {
      name: source.customer.name,
      contactName: text(source.customer.contactName),
      jobTitle: text(source.customer.jobTitle),
      postalAddress: addressFrom(source.customer.postalAddress),
      phone: text(source.customer.phone),
      email: text(source.customer.email),
      taxIdentifier: text(source.customer.taxIdentifier),
    },
    projectTitle: source.projectTitle,
    scopeSummary: source.scopeSummary,
    lines: source.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      quantityText: formatClientQuoteQuantity(line.quantity),
      unitPriceText: formatClientQuoteMajorInput(
        line.unitPriceMinor,
        source.currencyCode,
      ),
    })),
    discountKind: discount.kind,
    discountAmountText:
      discount.kind === "fixed"
        ? formatClientQuoteMajorInput(discount.amountMinor, source.currencyCode)
        : "",
    discountPercentText:
      discount.kind === "percentage"
        ? ratePpmToPercentText(discount.ratePpm)
        : "",
    taxKind: tax.kind,
    taxPercentText:
      tax.kind === "percentage" ? ratePpmToPercentText(tax.ratePpm) : "",
    taxLabel: tax.kind === "percentage" ? text(tax.label) : "",
    paymentSummary: source.paymentTerms.summary,
    paymentScheduleNote: text(source.paymentTerms.scheduleNote),
    validForDaysText:
      source.validity.validForDays == null
        ? ""
        : String(source.validity.validForDays),
    validUntil: text(source.validity.validUntil),
    validityNote: text(source.validity.note),
    appendixEnabled: source.appendix.enabled,
    appendixSections: source.appendix.sections.map((section) => ({
      heading: section.heading,
      body: section.body,
    })),
    contentLanguage: source.contentLanguage,
  };
}

export function editorDraftFromQuote(
  quote: PublicClientQuote,
): ClientQuoteEditorDraft {
  if (quote.status === "issued" && quote.issuedSnapshot) {
    const snapshot = quote.issuedSnapshot;
    return editorFromCommercial({
      issuer: snapshot.issuer,
      customer: snapshot.customer,
      projectTitle: snapshot.projectTitle,
      scopeSummary: snapshot.scopeSummary,
      lineItems: snapshot.lineItems,
      discount: snapshot.discount,
      tax: snapshot.tax,
      paymentTerms: snapshot.paymentTerms,
      validity: snapshot.validity,
      appendix: snapshot.appendix,
      contentLanguage: snapshot.contentLanguage,
      currencyCode: snapshot.currencyCode,
    });
  }
  return editorFromCommercial({
    ...quote.draft,
    contentLanguage: quote.contentLanguage,
    currencyCode: quote.currencyCode,
  });
}

export function withClientQuoteDocumentLanguage(
  editor: ClientQuoteEditorDraft,
  language: OrganizationLanguage,
): ClientQuoteEditorDraft {
  if (!isOrganizationLanguage(language) || language === editor.contentLanguage) {
    return editor;
  }
  return { ...editor, contentLanguage: language };
}

export function createClientQuoteLineId(existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  let sequence = 1;
  while (used.has(`line-${sequence}`)) sequence += 1;
  return `line-${sequence}`;
}

export function addClientQuoteLine(
  editor: ClientQuoteEditorDraft,
  currencyCode: string,
): ClientQuoteEditorDraft {
  if (editor.lines.length >= CLIENT_QUOTE_FIELD_LIMITS.lineItems) return editor;
  return {
    ...editor,
    lines: [
      ...editor.lines,
      {
        id: createClientQuoteLineId(editor.lines.map((line) => line.id)),
        description: "",
        quantityText: "1",
        unitPriceText: zeroMajorInput(currencyCode),
      },
    ],
  };
}

export function removeClientQuoteLineAt(
  editor: ClientQuoteEditorDraft,
  index: number,
): ClientQuoteEditorDraft {
  if (editor.lines.length <= 1) return editor;
  if (index < 0 || index >= editor.lines.length) return editor;
  return {
    ...editor,
    lines: editor.lines.filter((_, lineIndex) => lineIndex !== index),
  };
}

export function moveClientQuoteLineAt(
  editor: ClientQuoteEditorDraft,
  index: number,
  direction: -1 | 1,
): ClientQuoteEditorDraft {
  const nextIndex = index + direction;
  if (
    index < 0 ||
    index >= editor.lines.length ||
    nextIndex < 0 ||
    nextIndex >= editor.lines.length
  ) {
    return editor;
  }
  const lines = [...editor.lines];
  const [line] = lines.splice(index, 1);
  lines.splice(nextIndex, 0, line);
  return { ...editor, lines };
}

export function setClientQuoteAppendixEnabled(
  editor: ClientQuoteEditorDraft,
  enabled: boolean,
): ClientQuoteEditorDraft {
  if (editor.appendixEnabled === enabled) return editor;
  return { ...editor, appendixEnabled: enabled };
}

export function addClientQuoteAppendixSection(
  editor: ClientQuoteEditorDraft,
): ClientQuoteEditorDraft {
  if (editor.appendixSections.length >= CLIENT_QUOTE_FIELD_LIMITS.appendixSections) {
    return editor;
  }
  return {
    ...editor,
    appendixSections: [...editor.appendixSections, { heading: "", body: "" }],
  };
}

export function removeClientQuoteAppendixSection(
  editor: ClientQuoteEditorDraft,
  index: number,
): ClientQuoteEditorDraft {
  if (index < 0 || index >= editor.appendixSections.length) return editor;
  return {
    ...editor,
    appendixSections: editor.appendixSections.filter(
      (_, sectionIndex) => sectionIndex !== index,
    ),
  };
}

export function setClientQuoteDiscountKind(
  editor: ClientQuoteEditorDraft,
  kind: ClientQuoteEditorDraft["discountKind"],
  currencyCode: string,
): ClientQuoteEditorDraft {
  if (kind === editor.discountKind) return editor;
  return {
    ...editor,
    discountKind: kind,
    discountAmountText:
      kind === "fixed" && !editor.discountAmountText.trim()
        ? zeroMajorInput(currencyCode)
        : editor.discountAmountText,
    discountPercentText:
      kind === "percentage" && !editor.discountPercentText.trim()
        ? "0"
        : editor.discountPercentText,
  };
}

export function setClientQuoteTaxKind(
  editor: ClientQuoteEditorDraft,
  kind: ClientQuoteEditorDraft["taxKind"],
): ClientQuoteEditorDraft {
  if (kind === editor.taxKind) return editor;
  return {
    ...editor,
    taxKind: kind,
    taxPercentText:
      kind === "percentage" && !editor.taxPercentText.trim()
        ? "0"
        : editor.taxPercentText,
  };
}

type ParsedLine = {
  id: string;
  description: string;
  quantity: ClientQuoteQuantity;
  unitPriceMinor: number;
};

function parseLine(
  line: ClientQuoteLineEdit,
  currencyCode: string,
): ParsedLine | null {
  const description = line.description.trim();
  const quantity = parseClientQuoteQuantityText(line.quantityText);
  const unitPriceMinor = parseClientQuoteMajorAmount(
    line.unitPriceText,
    currencyCode,
  );
  if (!description || !quantity || unitPriceMinor == null) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(line.id)) return null;
  return { id: line.id, description, quantity, unitPriceMinor };
}

function parseDiscount(
  editor: ClientQuoteEditorDraft,
  currencyCode: string,
): ClientQuoteDiscount | null {
  if (editor.discountKind === "none") return { kind: "none" };
  if (editor.discountKind === "fixed") {
    const amountMinor = parseClientQuoteMajorAmount(
      editor.discountAmountText,
      currencyCode,
    );
    if (amountMinor == null) return null;
    return { kind: "fixed", amountMinor };
  }
  const ratePpm = percentTextToRatePpm(editor.discountPercentText);
  if (ratePpm == null) return null;
  return { kind: "percentage", ratePpm };
}

function parseTax(editor: ClientQuoteEditorDraft): ClientQuoteTax | null {
  if (editor.taxKind === "none") return { kind: "none" };
  const ratePpm = percentTextToRatePpm(editor.taxPercentText);
  if (ratePpm == null) return null;
  const label = emptyToNull(editor.taxLabel);
  if (label && label.length > CLIENT_QUOTE_FIELD_LIMITS.taxIdentifierLabel) {
    return null;
  }
  return { kind: "percentage", ratePpm, label };
}

function contactIsValid(editor: ClientQuoteEditorDraft): boolean {
  const emails = [editor.issuer.email, editor.customer.email];
  for (const email of emails) {
    const trimmed = email.trim();
    if (trimmed && !EMAIL_PATTERN.test(trimmed)) return false;
  }
  const website = editor.issuer.website.trim();
  if (website && (/\s/.test(website) || website.length > CLIENT_QUOTE_FIELD_LIMITS.website)) {
    return false;
  }
  return true;
}

function appendixIsValid(editor: ClientQuoteEditorDraft): boolean {
  if (editor.appendixSections.length > CLIENT_QUOTE_FIELD_LIMITS.appendixSections) {
    return false;
  }
  return editor.appendixSections.every((section) => {
    const heading = section.heading.trim();
    const body = section.body.trim();
    return (
      heading.length > 0 &&
      body.length > 0 &&
      heading.length <= CLIENT_QUOTE_FIELD_LIMITS.appendixHeading &&
      body.length <= CLIENT_QUOTE_FIELD_LIMITS.appendixBody
    );
  });
}

export function missingClientQuoteIssueRequirements(
  editor: ClientQuoteEditorDraft,
  currencyCode: string,
): ClientQuoteIssueRequirement[] {
  const missing: ClientQuoteIssueRequirement[] = [];
  if (!editor.issuer.legalName.trim()) missing.push("issuerLegalName");
  if (!editor.customer.name.trim()) missing.push("customerName");
  if (!editor.projectTitle.trim()) missing.push("projectTitle");
  if (!editor.scopeSummary.trim()) missing.push("scopeSummary");
  const lines = editor.lines.map((line) => parseLine(line, currencyCode));
  if (lines.length < 1 || lines.some((line) => line == null)) {
    missing.push("lineItem");
  }
  if (!editor.paymentSummary.trim()) missing.push("paymentTerms");
  const days = parseValidForDays(editor.validForDaysText);
  const until = parseValidUntil(editor.validUntil);
  if (days === "invalid" || until === "invalid" || (days == null && until == null)) {
    missing.push("validity");
  }
  return missing;
}

export function clientQuoteDraftBlockers(
  editor: ClientQuoteEditorDraft,
  currencyCode: string,
): ClientQuoteDraftBlocker[] {
  const blockers: ClientQuoteDraftBlocker[] = [];
  if (!editor.customer.name.trim()) blockers.push("customerName");
  if (!editor.projectTitle.trim()) blockers.push("projectTitle");
  if (!editor.scopeSummary.trim()) blockers.push("scopeSummary");
  const lines = editor.lines.map((line) => parseLine(line, currencyCode));
  if (lines.length < 1 || lines.some((line) => line == null)) {
    blockers.push("lineItem");
  }
  if (!parseDiscount(editor, currencyCode)) blockers.push("discount");
  if (!parseTax(editor)) blockers.push("tax");
  if (!appendixIsValid(editor)) blockers.push("appendix");
  const days = parseValidForDays(editor.validForDaysText);
  const until = parseValidUntil(editor.validUntil);
  if (days === "invalid" || until === "invalid") blockers.push("validity");
  if (!contactIsValid(editor)) blockers.push("contact");
  if (
    !blockers.includes("lineItem") &&
    !blockers.includes("discount") &&
    !blockers.includes("tax")
  ) {
    const preview = previewClientQuoteMoney(editor, currencyCode);
    if (!preview.ok && preview.reason === "calculation") {
      blockers.push("calculation");
    }
  }
  return blockers;
}

export function previewClientQuoteMoney(
  editor: ClientQuoteEditorDraft,
  currencyCode: string,
):
  | { ok: true; preview: ClientQuoteMoneyPreview }
  | { ok: false; reason: "incomplete" | "calculation" } {
  const lines = editor.lines.map((line) => parseLine(line, currencyCode));
  if (lines.length < 1 || lines.some((line) => line == null)) {
    return { ok: false, reason: "incomplete" };
  }
  const discount = parseDiscount(editor, currencyCode);
  const tax = parseTax(editor);
  if (!discount || !tax) return { ok: false, reason: "incomplete" };
  try {
    const calculated = calculateClientQuote({
      currencyCode,
      lineItems: lines.filter((line): line is ParsedLine => line != null),
      discount,
      tax,
    });
    return {
      ok: true,
      preview: {
        currencyCode: calculated.currencyCode,
        currencyScale: calculated.currencyScale,
        lineTotalsMinor: calculated.lineTotalsMinor,
        totals: calculated.totals,
      },
    };
  } catch (error) {
    if (error instanceof ClientQuoteCalculationError) {
      return { ok: false, reason: "calculation" };
    }
    throw error;
  }
}

/**
 * Build the PATCH body. Totals and line totals are assigned from
 * calculateClientQuote. This function does not accept a total override.
 */
export function editorDraftToUpdateBody(
  editor: ClientQuoteEditorDraft,
  currencyCode: string,
):
  | { ok: true; body: ClientQuoteUpdateBody }
  | { ok: false; blockers: ClientQuoteDraftBlocker[] } {
  const blockers = clientQuoteDraftBlockers(editor, currencyCode);
  if (blockers.length > 0) return { ok: false, blockers };
  const preview = previewClientQuoteMoney(editor, currencyCode);
  if (!preview.ok) {
    return {
      ok: false,
      blockers: [preview.reason === "calculation" ? "calculation" : "lineItem"],
    };
  }
  const lines = editor.lines.map((line) => parseLine(line, currencyCode));
  const discount = parseDiscount(editor, currencyCode);
  const tax = parseTax(editor);
  const days = parseValidForDays(editor.validForDaysText);
  const until = parseValidUntil(editor.validUntil);
  if (
    lines.some((line) => line == null) ||
    !discount ||
    !tax ||
    days === "invalid" ||
    until === "invalid"
  ) {
    return { ok: false, blockers: ["lineItem"] };
  }
  const parsedLines = lines.filter((line): line is ParsedLine => line != null);
  const draft: ClientQuoteDraftV1 = {
    schemaVersion: CLIENT_QUOTE_DRAFT_SCHEMA_VERSION,
    currencyScale: preview.preview.currencyScale,
    issuer: {
      legalName: editor.issuer.legalName.trim(),
      tradingName: emptyToNull(editor.issuer.tradingName),
      postalAddress: addressTo(editor.issuer.postalAddress),
      phone: emptyToNull(editor.issuer.phone),
      email: emptyToNull(editor.issuer.email),
      website: emptyToNull(editor.issuer.website),
      registrationNumber: emptyToNull(editor.issuer.registrationNumber),
      taxIdentifier: emptyToNull(editor.issuer.taxIdentifier),
      taxIdentifierLabel: emptyToNull(editor.issuer.taxIdentifierLabel),
      contactName: emptyToNull(editor.issuer.contactName),
      jobTitle: emptyToNull(editor.issuer.jobTitle),
      additionalNote: emptyToNull(editor.issuer.additionalNote),
    },
    customer: {
      name: editor.customer.name.trim(),
      contactName: emptyToNull(editor.customer.contactName),
      jobTitle: emptyToNull(editor.customer.jobTitle),
      postalAddress: addressTo(editor.customer.postalAddress),
      phone: emptyToNull(editor.customer.phone),
      email: emptyToNull(editor.customer.email),
      taxIdentifier: emptyToNull(editor.customer.taxIdentifier),
    },
    projectTitle: editor.projectTitle.trim(),
    scopeSummary: editor.scopeSummary.trim(),
    lineItems: parsedLines.map((line, index) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: preview.preview.lineTotalsMinor[index] ?? 0,
    })),
    paymentTerms: {
      summary: editor.paymentSummary.trim(),
      scheduleNote: emptyToNull(editor.paymentScheduleNote),
    },
    validity: {
      validForDays: days,
      validUntil: until,
      note: emptyToNull(editor.validityNote),
    },
    appendix: {
      enabled: editor.appendixEnabled,
      sections: editor.appendixSections.map((section) => ({
        heading: section.heading.trim(),
        body: section.body.trim(),
      })),
    },
    discount,
    tax,
    totals: preview.preview.totals,
  };
  return {
    ok: true,
    body: {
      draft,
      contentLanguage: editor.contentLanguage,
    },
  };
}

export function sortClientQuotesForLibrary(
  quotes: readonly PublicClientQuote[],
): PublicClientQuote[] {
  return [...quotes].sort((left, right) => {
    const byCreated = right.createdAt.localeCompare(left.createdAt);
    if (byCreated !== 0) return byCreated;
    return right.id.localeCompare(left.id);
  });
}

export type ClientQuoteLibraryStatusLabels = {
  draft: string;
  issued: string;
};

export function clientQuoteMatchesLibraryQuery(
  quote: PublicClientQuote,
  query: string,
  statusLabels: ClientQuoteLibraryStatusLabels,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const issued =
    quote.status === "issued" && quote.issuedSnapshot ? quote.issuedSnapshot : null;
  const customerName = issued?.customer.name ?? quote.draft.customer.name;
  const projectTitle = issued?.projectTitle ?? quote.draft.projectTitle;
  const quoteNumber = quote.quoteNumber ?? "";
  const statusLabel =
    quote.status === "issued" ? statusLabels.issued : statusLabels.draft;
  const haystack = [customerName, projectTitle, quoteNumber, quote.status, statusLabel]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterClientQuotesForLibrary(
  quotes: readonly PublicClientQuote[],
  query: string,
  statusLabels: ClientQuoteLibraryStatusLabels,
): PublicClientQuote[] {
  return sortClientQuotesForLibrary(quotes).filter((quote) =>
    clientQuoteMatchesLibraryQuery(quote, query, statusLabels),
  );
}

export function clientQuoteLibraryRow(
  quote: PublicClientQuote,
  locale: string,
): ClientQuoteLibraryRow {
  const issued = quote.status === "issued" && quote.issuedSnapshot
    ? quote.issuedSnapshot
    : null;
  const customerName = issued?.customer.name ?? quote.draft.customer.name;
  const projectTitle = issued?.projectTitle ?? quote.draft.projectTitle;
  const totalMinor = issued?.totals.totalMinor ?? quote.draft.totals.totalMinor;
  const currencyCode = issued?.currencyCode ?? quote.currencyCode;
  const dateIso =
    quote.status === "issued"
      ? quote.issuedAt ?? quote.createdAt
      : quote.createdAt;
  return {
    id: quote.id,
    status: quote.status,
    quoteNumber: quote.status === "issued" ? quote.quoteNumber : null,
    customerName,
    projectTitle,
    currencyCode,
    totalMinor,
    totalLabel: formatClientQuoteMinorAmount(totalMinor, currencyCode),
    dateIso,
    dateLabel: formatClientQuoteTimestamp(dateIso, locale),
    dateKind: quote.status === "issued" ? "issued" : "created",
  };
}

export function buildCreateClientQuoteRequest(input: {
  estimateId: string;
  prospectId: string | null;
  prospectRemoved?: boolean;
}): {
  estimateId: string;
  recipient:
    | { kind: "prospect"; prospectId: string }
    | { kind: "removedProspect" }
    | { kind: "client" };
} {
  const estimateId = input.estimateId.trim();
  const prospectId = input.prospectId?.trim() ?? "";
  if (prospectId) {
    return {
      estimateId,
      recipient: { kind: "prospect", prospectId },
    };
  }
  if (input.prospectRemoved === true) {
    return {
      estimateId,
      recipient: { kind: "removedProspect" },
    };
  }
  return {
    estimateId,
    recipient: { kind: "client" },
  };
}
