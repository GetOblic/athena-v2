"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { clientInvoiceErrorMessage } from "@/lib/licensee/clientInvoiceEditorMessages";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { parseClientInvoicePdfContentDisposition } from "@/services/clientInvoice/pdf/clientInvoicePdfFilename";

export function ClientInvoicePdfDownloadButton({
  invoiceId,
  disabled = false,
  messages,
}: {
  invoiceId: string;
  disabled?: boolean;
  messages: LicenseeMessages;
}) {
  const copy = messages.clientInvoices;
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
      const response = await fetch(`/api/licensee/invoices/${invoiceId}/pdf`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await parseJsonResponse<{
          error?: { code?: string; message?: string };
        }>(response);
        setError(clientInvoiceErrorMessage(messages, payload.error?.code));
        return;
      }
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        parseClientInvoicePdfContentDisposition(
          response.headers.get("Content-Disposition"),
        ) ?? "invoice.pdf";
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
        data-client-invoice-download-pdf="true"
        data-client-invoice-pdf-pending={pending ? "true" : "false"}
        onClick={() => void handleClick()}
        disabled={pending || disabled}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60 sm:w-auto"
      >
        <FileText size={16} aria-hidden="true" />
        {pending ? copy.downloadingPdf : copy.downloadPdf}
      </button>
      {error ? (
        <p className="text-sm text-red-300" role="alert" data-client-invoice-pdf-error="true">
          {error}
        </p>
      ) : null}
    </div>
  );
}
