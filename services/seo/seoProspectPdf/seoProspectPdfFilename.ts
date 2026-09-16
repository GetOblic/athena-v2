import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

const FILENAME_RE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*-(?:visibility-strategy|website-technical-health)-\d{4}-\d{2}-\d{2}\.pdf$/;

export function slugifySeoProspectPdfSubject(
  name: string | null | undefined,
): string {
  const ascii = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || "seo-report";
}

export function isoDateForSeoProspectPdf(
  value: string | null | undefined,
): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function buildSeoProspectPdfFilename(input: {
  subjectName: string;
  generationType: SeoGenerationType;
  reportDateIso: string;
}): string {
  const subject = slugifySeoProspectPdfSubject(input.subjectName);
  const date = isoDateForSeoProspectPdf(input.reportDateIso);
  const lens =
    input.generationType === "technical"
      ? "website-technical-health"
      : "visibility-strategy";
  return `${subject}-${lens}-${date}.pdf`;
}

export function isSafeSeoProspectPdfFilename(value: string): boolean {
  return FILENAME_RE.test(value);
}

export function parseContentDispositionFilename(
  header: string | null | undefined,
): string | null {
  if (!header) return null;

  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  const quoted = /filename="([^"]+)"/i.exec(header);
  const plain = /filename=([^;]+)/i.exec(header);
  const raw = String(encoded?.[1] ?? quoted?.[1] ?? plain?.[1] ?? "").trim();
  if (!raw) return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  decoded = decoded.replace(/^["']|["']$/g, "").trim();
  return isSafeSeoProspectPdfFilename(decoded) ? decoded : null;
}
