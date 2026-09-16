"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { parseContentDispositionFilename } from "@/services/seo/seoProspectPdf/seoProspectPdfFilename";

type SeoProspectPdfDownloadButtonProps = {
  reportId: string;
  generateLabel: string;
  generatingLabel: string;
  generateFailedLabel: string;
  onError?: (message: string | null) => void;
};

export function SeoProspectPdfDownloadButton({
  reportId,
  generateLabel,
  generatingLabel,
  generateFailedLabel,
  onError,
}: SeoProspectPdfDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);

  async function handleClick() {
    if (generating) return;
    setGenerating(true);
    onError?.(null);
    let objectUrl: string | null = null;
    try {
      const response = await fetch(`/api/seo/${reportId}/prospect-pdf`);
      if (!response.ok) {
        const payload = await parseJsonResponse<{
          error?: { message?: string };
        }>(response);
        onError?.(payload.error?.message || generateFailedLabel);
        return;
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        parseContentDispositionFilename(
          response.headers.get("Content-Disposition"),
        ) ?? "seo-report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      onError?.(generateFailedLabel);
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setGenerating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={generating}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
    >
      <FileText size={16} aria-hidden="true" />
      {generating ? generatingLabel : generateLabel}
    </button>
  );
}
