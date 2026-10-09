"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { clientQuoteErrorMessage } from "@/lib/licensee/clientQuoteEditorMessages";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { parseClientQuotePdfContentDisposition } from "@/services/clientQuote/pdf/clientQuotePdfFilename";

export function ClientQuotePdfDownloadButton({
  quoteId,
  disabled = false,
  messages,
}: {
  quoteId: string;
  disabled?: boolean;
  messages: LicenseeMessages;
}) {
  const copy = messages.clientQuotes;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  async function handleClick() {
    if (pendingRef.current || disabled) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    let objectUrl: string | null = null;
    try {
      const response = await fetch(`/api/licensee/client-quotes/${quoteId}/pdf`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await parseJsonResponse<{
          error?: { code?: string; message?: string };
        }>(response);
        setError(clientQuoteErrorMessage(messages, payload.error?.code));
        return;
      }
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        parseClientQuotePdfContentDisposition(
          response.headers.get("Content-Disposition"),
        ) ?? "quotation.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError(copy.downloadPdfFailed);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        type="button"
        data-client-quote-download-pdf="true"
        data-client-quote-pdf-pending={pending ? "true" : "false"}
        onClick={() => void handleClick()}
        disabled={pending || disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60 sm:w-auto"
      >
        <FileText size={16} aria-hidden="true" />
        {pending ? copy.downloadingPdf : copy.downloadPdf}
      </button>
      {error ? (
        <p className="text-sm text-red-300" role="alert" data-client-quote-pdf-error="true">
          {error}
        </p>
      ) : null}
    </div>
  );
}
