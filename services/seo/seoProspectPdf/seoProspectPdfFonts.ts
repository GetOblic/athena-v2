import type { SeoProspectPdfFontFamily } from "@/services/seo/seoProspectPdf/seoProspectPdfTypes";

const TIMES = new Set(["times_new_roman", "georgia"]);
const COURIER = new Set(["geist_mono"]);

export function mapBrandFontToPdfKit(
  font: string | null | undefined,
): SeoProspectPdfFontFamily {
  const raw = String(font ?? "").trim().toLowerCase();
  if (TIMES.has(raw)) {
    return { regular: "Times-Roman", bold: "Times-Bold" };
  }
  if (COURIER.has(raw)) {
    return { regular: "Courier", bold: "Courier-Bold" };
  }
  return { regular: "Helvetica", bold: "Helvetica-Bold" };
}
