"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type GetOblicListingReleaseControlProps = {
  prospectId: string;
  relationshipStatus: "claiming" | "linked";
  messages: TenantMessages;
};

export function GetOblicListingReleaseControl({
  prospectId,
  relationshipStatus,
  messages,
}: GetOblicListingReleaseControlProps) {
  const router = useRouter();
  const confirmId = useId();
  const copy = messages.prospects.detail;
  const [showConfirm, setShowConfirm] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (relationshipStatus !== "claiming" && relationshipStatus !== "linked") {
    return null;
  }

  async function handleRelease() {
    if (releasing) return;
    setReleasing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/prospects/${prospectId}/getoblic-directory/release`,
        { method: "POST", credentials: "same-origin" },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
        error?: { message?: string } | string;
      }>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error &&
              typeof payload.error === "object" &&
              typeof payload.error.message === "string"
            ? payload.error.message
            : undefined;
      if (!response.ok || !payload.ok || !payload.success) {
        throw new Error(errorMessage || copy.releaseGetOblicFailed);
      }
      router.refresh();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : copy.releaseGetOblicFailed,
      );
      setReleasing(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-3 sm:items-start">
      <button
        type="button"
        onClick={() => {
          setShowConfirm(true);
          setError(null);
        }}
        aria-expanded={showConfirm}
        aria-controls={confirmId}
        className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
      >
        {copy.releaseGetOblicListing}
      </button>

      {showConfirm ? (
        <div
          id={confirmId}
          role="group"
          aria-label={copy.releaseGetOblicListing}
          className="w-full max-w-md rounded-2xl border border-white/15 bg-black/30 p-5"
        >
          <p className="text-sm leading-6 text-white/70">
            {copy.releaseGetOblicConfirm}
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (releasing) return;
                setShowConfirm(false);
                setError(null);
              }}
              disabled={releasing}
              className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 disabled:opacity-50"
            >
              {messages.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleRelease()}
              disabled={releasing}
              aria-busy={releasing}
              className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"
            >
              {releasing ? copy.releasingGetOblic : copy.releaseGetOblicAction}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="text-sm text-red-300" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
