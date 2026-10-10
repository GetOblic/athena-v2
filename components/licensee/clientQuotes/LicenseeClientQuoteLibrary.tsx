"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClientQuoteLibraryView,
  type ClientQuoteMaskRequestResult,
} from "@/components/licensee/clientQuotes/ClientQuoteLibraryView";
import {
  clientInvoiceDetailPath,
  submitCreateClientInvoice,
} from "@/lib/licensee/clientInvoiceEditorModel";
import { clientInvoiceErrorMessage } from "@/lib/licensee/clientInvoiceEditorMessages";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { clientQuoteErrorMessage } from "@/lib/licensee/clientQuoteEditorMessages";
import {
  parseClientQuoteInvoiceLinks,
  type ClientQuoteInvoiceRelationship,
} from "@/lib/licensee/clientQuoteEditorModel";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";

type ListResponse = {
  ok?: boolean;
  quotes?: PublicClientQuote[];
  invoiceLinks?: unknown;
  error?: { code?: string; message?: string };
};

export function LicenseeClientQuoteLibrary({
  messages,
  locale,
}: {
  messages: LicenseeMessages;
  locale: string;
}) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [quotes, setQuotes] = useState<PublicClientQuote[]>([]);
  const [invoiceLinks, setInvoiceLinks] = useState<ClientQuoteInvoiceRelationship[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createPendingId, setCreatePendingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const maskLock = useRef(false);
  const createLock = useRef(false);
  const router = useRouter();

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setPhase("loading");
      setError(null);
    }
    try {
      const response = await fetch("/api/licensee/client-quotes", {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<ListResponse>(response);
      if (!response.ok || !payload.ok || !Array.isArray(payload.quotes)) {
        setQuotes([]);
        setInvoiceLinks([]);
        setError(clientQuoteErrorMessage(messages, payload.error?.code));
        setPhase("error");
        return;
      }
      setQuotes(payload.quotes);
      setInvoiceLinks(parseClientQuoteInvoiceLinks(payload.invoiceLinks));
      setPhase("ready");
    } catch {
      setQuotes([]);
      setInvoiceLinks([]);
      setError(messages.clientQuotes.errors.generic);
      setPhase("error");
    }
  }, [messages]);

  useEffect(() => {
    void load();
  }, [load]);

  async function maskQuote(quoteId: string): Promise<ClientQuoteMaskRequestResult> {
    if (maskLock.current) return { ok: false, error: null };
    maskLock.current = true;
    try {
      const response = await fetch(`/api/licensee/client-quotes/${quoteId}`, {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<ListResponse>(response);
      if (!response.ok || !payload.ok) {
        return {
          ok: false,
          error: clientQuoteErrorMessage(messages, payload.error?.code),
        };
      }
      setNotice(messages.clientQuotes.deleteSuccess);
      await load({ quiet: true });
      return { ok: true, error: null };
    } catch {
      return { ok: false, error: messages.clientQuotes.errors.generic };
    } finally {
      maskLock.current = false;
    }
  }

  async function createInvoice(quoteId: string) {
    if (createLock.current) return;
    createLock.current = true;
    setCreatePendingId(quoteId);
    setCreateError(null);
    let navigating = false;
    try {
      const result = await submitCreateClientInvoice({ quoteId });
      if (!result.ok) {
        setCreateError(
          result.network
            ? messages.clientInvoices.errors.generic
            : clientInvoiceErrorMessage(messages, result.code),
        );
        return;
      }
      navigating = true;
      router.push(clientInvoiceDetailPath(result.invoiceId));
    } finally {
      if (!navigating) {
        createLock.current = false;
        setCreatePendingId(null);
      }
    }
  }

  return (
    <ClientQuoteLibraryView
      phase={phase}
      quotes={quotes}
      invoiceLinks={invoiceLinks}
      error={error}
      notice={notice}
      locale={locale}
      messages={messages}
      createInvoicePendingId={createPendingId}
      createInvoiceError={createError}
      onRetry={() => void load()}
      onMask={maskQuote}
      onCreateInvoice={(quoteId) => void createInvoice(quoteId)}
    />
  );
}
