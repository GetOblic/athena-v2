/**
 * ASCII download names for issued invoice PDFs.
 * The name is derived from the invoice number and civil issue date only.
 */

const FILENAME_RE = /^invoice(?:-[a-z0-9]+)+\.pdf$/;

export function isSafeClientInvoicePdfFilename(value: string): boolean {
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

function civilDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "undated";
}

export function buildClientInvoicePdfFilename(input: {
  invoiceNumber: string;
  issueDate: string;
}): string {
  const number = slug(input.invoiceNumber) || "invoice";
  const filename = `invoice-${number}-${civilDate(input.issueDate)}.pdf`;
  return isSafeClientInvoicePdfFilename(filename) ? filename : "invoice.pdf";
}

export function clientInvoicePdfContentDisposition(filename: string): string {
  const safe = isSafeClientInvoicePdfFilename(filename) ? filename : "invoice.pdf";
  return `attachment; filename="${safe}"`;
}

export function clientInvoicePdfDownloadHeaders(
  filename: string,
): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": clientInvoicePdfContentDisposition(filename),
    "Cache-Control": "no-store",
  };
}

export function parseClientInvoicePdfContentDisposition(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const quoted = /filename="([^"]+)"/i.exec(header);
  const plain = /filename=([^;]+)/i.exec(header);
  const raw = String(quoted?.[1] ?? plain?.[1] ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
  return isSafeClientInvoicePdfFilename(raw) ? raw : null;
}
