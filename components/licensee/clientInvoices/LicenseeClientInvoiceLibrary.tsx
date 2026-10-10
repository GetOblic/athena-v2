"use client";

import { useCallback, useEffect, useState } from "react";
import { ClientInvoiceLibraryView } from "@/components/licensee/clientInvoices/ClientInvoiceLibraryView";
import { clientInvoiceErrorMessage } from "@/lib/licensee/clientInvoiceEditorMessages";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientInvoice } from "@/services/clientInvoice/clientInvoicePublic";

type ListResponse = {
  ok?: boolean;
  invoices?: PublicClientInvoice[];
  error?: { code?: string; message?: string };
};

export function LicenseeClientInvoiceLibrary({
  messages,
  locale,
}: {
  messages: LicenseeMessages;
  locale: string;
}) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [invoices, setInvoices] = useState<PublicClientInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const response = await fetch("/api/licensee/invoices", { cache: "no-store" });
      const payload = await parseJsonResponse<ListResponse>(response);
      if (!response.ok || !payload.ok || !Array.isArray(payload.invoices)) {
        setInvoices([]);
        setError(clientInvoiceErrorMessage(messages, payload.error?.code));
        setPhase("error");
        return;
      }
      setInvoices(payload.invoices);
      setPhase("ready");
    } catch {
      setInvoices([]);
      setError(messages.clientInvoices.errors.generic);
      setPhase("error");
    }
  }, [messages]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ClientInvoiceLibraryView
      phase={phase}
      invoices={invoices}
      error={error}
      locale={locale}
      messages={messages}
      onRetry={() => void load()}
    />
  );
}
