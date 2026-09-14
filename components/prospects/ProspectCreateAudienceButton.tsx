"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Users } from "lucide-react";
import { PROSPECT_UTILITY_VIOLET_ACTION } from "@/lib/prospects/prospectDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

type ProspectCreateAudienceChrome = {
  createAudienceFromProspect: string;
  creatingAudienceFromProspect: string;
  createAudienceFromProspectFailed: string;
  createAudienceRequiresIntelligence: string;
};

type ProspectCreateAudienceButtonProps = {
  prospectId: string;
  canCreate: boolean;
  chrome: ProspectCreateAudienceChrome;
};

export function ProspectCreateAudienceButton({
  prospectId,
  canCreate,
  chrome,
}: ProspectCreateAudienceButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAudience() {
    if (!canCreate || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/prospects/${prospectId}/create-audience`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        personaId?: string;
        error?: string | { message?: string };
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message;

      if (!response.ok || !payload.ok || !payload.personaId) {
        setError(errorMessage || chrome.createAudienceFromProspectFailed);
        return;
      }

      router.push(`/personas/${payload.personaId}`);
    } catch {
      setError(chrome.createAudienceFromProspectFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-prospect-header-action="create-audience"
        className={PROSPECT_UTILITY_VIOLET_ACTION}
        disabled={!canCreate || pending}
        aria-busy={pending}
        title={
          canCreate
            ? chrome.createAudienceFromProspect
            : chrome.createAudienceRequiresIntelligence
        }
        onClick={() => void createAudience()}
      >
        {pending ? (
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
        ) : (
          <Users className="size-4" />
        )}
        {pending
          ? chrome.creatingAudienceFromProspect
          : chrome.createAudienceFromProspect}
      </button>
      {!canCreate ? (
        <p className="text-sm text-white/45">
          {chrome.createAudienceRequiresIntelligence}
        </p>
      ) : null}
      {error ? (
        <div className="text-sm text-red-300" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
