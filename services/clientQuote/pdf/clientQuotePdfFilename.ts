/**
 * ASCII download names for issued quotation PDFs.
 * The name is derived from the quote number and issue date only.
 */

const FILENAME_RE = /^quotation(?:-[a-z0-9]+)+\.pdf$/;

export function isSafeClientQuotePdfFilename(value: string): boolean {
  return value.length <= 120 && FILENAME_RE.test(value);
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function issuedUtcDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "undated";
  return date.toISOString().slice(0, 10);
}

export function buildClientQuotePdfFilename(input: {
  quoteNumber: string;
  issuedAt: string;
}): string {
  const number = slug(input.quoteNumber) || "quote";
  const filename = `quotation-${number}-${issuedUtcDate(input.issuedAt)}.pdf`;
  return isSafeClientQuotePdfFilename(filename) ? filename : "quotation.pdf";
}

export function clientQuotePdfContentDisposition(filename: string): string {
  const safe = isSafeClientQuotePdfFilename(filename) ? filename : "quotation.pdf";
  return `attachment; filename="${safe}"`;
}

export function clientQuotePdfDownloadHeaders(
  filename: string,
): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": clientQuotePdfContentDisposition(filename),
    "Cache-Control": "no-store",
  };
}

export function parseClientQuotePdfContentDisposition(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const quoted = /filename="([^"]+)"/i.exec(header);
  const plain = /filename=([^;]+)/i.exec(header);
  const raw = String(quoted?.[1] ?? plain?.[1] ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
  return isSafeClientQuotePdfFilename(raw) ? raw : null;
}
