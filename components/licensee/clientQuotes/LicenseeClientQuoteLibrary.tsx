"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClientQuoteLibraryView,
  type ClientQuoteMaskRequestResult,
} from "@/components/licensee/clientQuotes/ClientQuoteLibraryView";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { clientQuoteErrorMessage } from "@/lib/licensee/clientQuoteEditorMessages";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";

type ListResponse = {
  ok?: boolean;
  quotes?: PublicClientQuote[];
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const maskLock = useRef(false);

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
        setError(clientQuoteErrorMessage(messages, payload.error?.code));
        setPhase("error");
        return;
      }
      setQuotes(payload.quotes);
      setPhase("ready");
    } catch {
      setQuotes([]);
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

  return (
    <ClientQuoteLibraryView
      phase={phase}
      quotes={quotes}
      error={error}
      notice={notice}
      locale={locale}
      messages={messages}
      onRetry={() => void load()}
      onMask={maskQuote}
    />
  );
}
