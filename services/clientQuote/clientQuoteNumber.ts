/**
 * Licensee-scoped quotation numbers.
 * Uniqueness is enforced by the partial unique index plus a bounded retry.
 * This module only formats and chooses the next sequence.
 */

const QUOTE_NUMBER_PATTERN = /^Q-(\d{4})-(\d+)$/;

export const CLIENT_QUOTE_NUMBER_ATTEMPTS = 8 as const;

export function formatClientQuoteNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Quote number year is out of range.");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Quote number sequence must be a positive integer.");
  }
  const formatted = `Q-${year}-${String(sequence).padStart(4, "0")}`;
  if (formatted.length > 40) {
    throw new Error("Quote number exceeds 40 characters.");
  }
  return formatted;
}

/**
 * Next sequence for a calendar year.
 * Numbers from other years and non-matching text are ignored.
 */
export function nextClientQuoteSequence(
  existingNumbers: readonly string[],
  year: number,
): number {
  let max = 0;
  for (const raw of existingNumbers) {
    if (typeof raw !== "string") continue;
    const match = QUOTE_NUMBER_PATTERN.exec(raw.trim());
    if (!match) continue;
    if (Number(match[1]) !== year) continue;
    const sequence = Number(match[2]);
    if (!Number.isSafeInteger(sequence) || sequence < 1) continue;
    if (sequence > max) max = sequence;
  }
  return max + 1;
}

export function quoteNumberYear(issuedAt: string): number {
  const year = Number(issuedAt.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error("Issued timestamp has no year.");
  }
  return year;
}
