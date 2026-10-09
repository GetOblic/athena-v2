"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { buildCreateClientQuoteRequest } from "@/lib/licensee/clientQuoteEditorModel";
import { clientQuoteErrorMessage } from "@/lib/licensee/clientQuoteEditorMessages";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientQuote } from "@/services/clientQuote/clientQuotePublic";

type CreateResponse = {
  ok?: boolean;
  quote?: PublicClientQuote;
  error?: { code?: string; message?: string };
};

/**
 * Seeds one draft from the selected Ready Estimate.
 * Does not regenerate the Estimate and does not call a model.
 */
export function CreateClientQuoteFromEstimate({
  estimateId,
  prospectId,
  prospectRemoved,
  messages,
}: {
  estimateId: string;
  prospectId: string | null;
  prospectRemoved: boolean;
  messages: LicenseeMessages;
}) {
  const router = useRouter();
  const lockRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = messages.clientQuotes;

  async function createQuote() {
    if (lockRef.current) return;
    lockRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/licensee/client-quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildCreateClientQuoteRequest({ estimateId, prospectId, prospectRemoved }),
        ),
      });
      const payload = await parseJsonResponse<CreateResponse>(response);
      if (!response.ok || !payload.ok || !payload.quote?.id) {
        lockRef.current = false;
        setPending(false);
        setError(clientQuoteErrorMessage(messages, payload.error?.code));
        return;
      }
      router.push(`/licensee/client-quotes/${payload.quote.id}`);
    } catch {
      lockRef.current = false;
      setPending(false);
      setError(copy.errors.generic);
    }
  }

  return (
    <div className="flex max-w-full shrink-0 flex-col items-start gap-2">
      <button
        type="button"
        data-create-client-quote="true"
        disabled={pending}
        onClick={() => void createQuote()}
        className="inline-flex w-auto shrink-0 justify-center rounded-full border border-[var(--athena-orange)]/40 bg-[var(--athena-orange)]/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--athena-orange)]/25 disabled:opacity-60"
      >
        {pending ? copy.creatingFromEstimate : copy.createFromEstimate}
      </button>
      <p className="max-w-xs text-xs leading-5 text-white/40">
        {copy.createFromEstimateHint}
      </p>
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
