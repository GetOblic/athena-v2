/**
 * Locale formatting for quotation PDFs.
 * Dates and currency use the snapshot content language.
 * Narrative text is sanitized for PDFKit only — it is not translated.
 */

import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import {
  formatTenantDate,
  toFormattingLocale,
} from "@/lib/tenantI18n/format";
import type { OrganizationLanguage } from "@/services/organizationLanguage";
import type { ClientQuoteQuantity } from "@/services/clientQuote/clientQuoteTypes";

const UNICODE_SPACE = /[\u00A0\u202F\u2000-\u200A\u205F\u3000]/g;

export function sanitizeClientQuotePdfText(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(UNICODE_SPACE, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

/** Break unbreakable tokens onto extra lines without inserting new words. */
export function wrapClientQuotePdfTokens(value: string): string {
  return sanitizeClientQuotePdfText(value).replace(/\S{40,}/g, (token) => {
    const parts: string[] = [];
    for (let index = 0; index < token.length; index += 32) {
      parts.push(token.slice(index, index + 32));
    }
    return parts.join("\n");
  });
}

export function formatClientQuotePdfIssueDate(
  iso: string,
  language: OrganizationLanguage,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(toFormattingLocale(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatClientQuotePdfValidUntil(
  isoDate: string,
  language: OrganizationLanguage,
): string {
  return formatTenantDate(isoDate, language);
}

export function formatClientQuotePdfValidForDays(
  template: string,
  days: number,
): string {
  return interpolateTenantMessage(template, { days });
}

function decimalSeparator(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

function groupInteger(whole: string, locale: string): string {
  if (whole.length > 15) return whole;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(whole));
}

/**
 * Format a frozen minor-unit amount with the snapshot scale.
 * Integer digits are grouped through Intl. The fraction is taken from
 * the minor units so scale 0, 2, and 3 stay exact.
 */
export function formatClientQuotePdfMoney(
  amountMinor: number,
  currencyCode: string,
  currencyScale: number,
  language: OrganizationLanguage,
): string {
  const locale = toFormattingLocale(language);
  const scale =
    Number.isInteger(currencyScale) && currencyScale >= 0 && currencyScale <= 4
      ? currencyScale
      : 2;
  const negative = amountMinor < 0;
  const minor = Math.abs(Math.trunc(amountMinor));
  const digits = minor.toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale);
  const grouped = groupInteger(whole.replace(/^0+(?=\d)/, "") || "0", locale);
  const numberText =
    scale === 0 ? grouped : `${grouped}${decimalSeparator(locale)}${fraction}`;

  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).formatToParts(negative ? -1 : 1);
    let usedNumber = false;
    let out = "";
    for (const part of parts) {
      if (part.type === "integer") {
        if (!usedNumber) {
          out += numberText;
          usedNumber = true;
        }
      } else if (part.type === "group" || part.type === "decimal" || part.type === "fraction") {
        continue;
      } else {
        out += part.value;
      }
    }
    return sanitizeClientQuotePdfText(usedNumber ? out : `${negative ? "-" : ""}${numberText} ${currencyCode}`);
  } catch {
    return `${negative ? "-" : ""}${numberText} ${currencyCode}`;
  }
}

export function formatClientQuotePdfQuantity(
  quantity: ClientQuoteQuantity,
  language: OrganizationLanguage,
): string {
  const scale =
    Number.isInteger(quantity.scale) && quantity.scale > 0 ? quantity.scale : 0;
  const coefficient = Math.trunc(quantity.coefficient);
  if (scale === 0) {
    return new Intl.NumberFormat(toFormattingLocale(language), {
      maximumFractionDigits: 0,
    }).format(coefficient);
  }
  const factor = 10 ** scale;
  const whole = Math.floor(coefficient / factor);
  const fraction = String(coefficient % factor)
    .padStart(scale, "0")
    .replace(/0+$/, "");
  const locale = toFormattingLocale(language);
  const grouped = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(whole);
  if (!fraction) return grouped;
  return `${grouped}${decimalSeparator(locale)}${fraction}`;
}
