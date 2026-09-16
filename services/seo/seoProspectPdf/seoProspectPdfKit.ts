import PDFDocument from "pdfkit";
import { SEO_PROSPECT_PDF_PAGE } from "@/services/seo/seoProspectPdf/seoProspectPdfTokens";

export type SeoProspectPdfKitOptions = {
  title: string;
  author: string;
  subject: string;
};

/**
 * Promise-based PDFKit renderer. Collects stream chunks in memory.
 * Does not write temp files or persist the generated PDF.
 */
export function createSeoProspectPdfDocument(
  options: SeoProspectPdfKitOptions,
): PDFKit.PDFDocument {
  return new PDFDocument({
    size: SEO_PROSPECT_PDF_PAGE.size,
    compress: false,
    margins: {
      top: SEO_PROSPECT_PDF_PAGE.marginTop,
      bottom: SEO_PROSPECT_PDF_PAGE.marginBottom,
      left: SEO_PROSPECT_PDF_PAGE.marginLeft,
      right: SEO_PROSPECT_PDF_PAGE.marginRight,
    },
    bufferPages: false,
    autoFirstPage: true,
    info: {
      Title: options.title,
      Author: options.author,
      Subject: options.subject,
      Creator: "Athena",
    },
  });
}

export function collectPdfKitBuffer(
  doc: PDFKit.PDFDocument,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (error: Error) => reject(error));
  });
}
