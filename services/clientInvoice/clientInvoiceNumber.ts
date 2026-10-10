/**
 * Invoice numbers.
 * The sequence is independent of quotation numbers: Q-YYYY-#### is ignored.
 * Uniqueness against stored rows is a later persistence concern.
 */

import {
  CLIENT_INVOICE_FIELD_LIMITS,
  ClientInvoiceValidationError,
} from "@/services/clientInvoice/clientInvoiceTypes";

const INVOICE_NUMBER_PATTERN = /^I-(\d{4})-(\d+)$/;

export function formatClientInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Invoice number year is out of range.");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Invoice number sequence must be a positive integer.");
  }
  const formatted = `I-${year}-${String(sequence).padStart(4, "0")}`;
  if (formatted.length > CLIENT_INVOICE_FIELD_LIMITS.invoiceNumber) {
    throw new Error("Invoice number exceeds 40 characters.");
  }
  return formatted;
}

/**
 * Next sequence for a calendar year.
 * Quotation numbers, other years, and non-matching text are ignored.
 */
export function nextClientInvoiceSequence(
  existingNumbers: readonly string[],
  year: number,
): number {
  let max = 0;
  for (const raw of existingNumbers) {
    if (typeof raw !== "string") continue;
    const match = INVOICE_NUMBER_PATTERN.exec(raw.trim());
    if (!match) continue;
    if (Number(match[1]) !== year) continue;
    const sequence = Number(match[2]);
    if (!Number.isSafeInteger(sequence) || sequence < 1) continue;
    if (sequence > max) max = sequence;
  }
  return max + 1;
}

export function invoiceNumberYear(issuedAt: string): number {
  const year = Number(issuedAt.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error("Issued timestamp has no year.");
  }
  return year;
}

/**
 * Accept only text the formatter would emit.
 * I-2026-0001 is valid. I-2026-1, I-2026-00001, and Q-2026-0001 are not.
 */
export function parseClientInvoiceNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = INVOICE_NUMBER_PATTERN.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
  let canonical: string;
  try {
    canonical = formatClientInvoiceNumber(year, sequence);
  } catch {
    return null;
  }
  if (canonical !== trimmed) return null;
  return canonical;
}

export function assertClientInvoiceNumber(value: unknown): string {
  const canonical = parseClientInvoiceNumber(value);
  if (!canonical) {
    throw new ClientInvoiceValidationError([
      "invoiceNumber must use the form I-YYYY-####.",
    ]);
  }
  return canonical;
}
