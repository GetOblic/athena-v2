/**
 * Presentation-only sanitizer. Strips layout-breaking control characters
 * without converting Unicode letters or rewriting semantic content.
 */
export function sanitizeSeoProspectPdfText(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

export function parseSeoProspectPdfScore(value: string): number | null {
  const trimmed = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseSeoProspectPdfPercent(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  const match = String(value ?? "")
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
}
