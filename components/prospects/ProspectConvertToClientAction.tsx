"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";
import {
  PROSPECT_HEADER_ACTION_BASE,
  PROSPECT_STATUS_CHIP_SAVED,
} from "@/lib/prospects/prospectDetailPresentation";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { ProspectClientConversionState } from "@/services/licensee/licenseeProspectClientConversionReads";

export const CONVERT_TO_CLIENT_PRIMARY_ACTION = `${PROSPECT_HEADER_ACTION_BASE} bg-[var(--athena-success)] text-white shadow-lg shadow-[0_10px_24px_rgba(0,208,132,0.20)] hover:opacity-90 focus-visible:ring-[var(--athena-success)]/50`;

export type ProspectClientConversionStatus =
  ProspectClientConversionState["status"];

export function shouldShowConvertToClientCta(input: {
  canConvertProspectToClient: boolean;
  conversionStatus: ProspectClientConversionStatus;
  isGetOblicDerivedProspect?: boolean;
  hasActiveGetOblicOwnership?: boolean;
}): boolean {
  if (
    !input.canConvertProspectToClient ||
    (input.conversionStatus !== "none" && input.conversionStatus !== "reversed")
  ) {
    return false;
  }
  if (input.isGetOblicDerivedProspect && !input.hasActiveGetOblicOwnership) {
    return false;
  }
  return true;
}

export function shouldShowConvertedToClientState(input: {
  canConvertProspectToClient: boolean;
  conversionStatus: ProspectClientConversionStatus;
}): boolean {
  return input.canConvertProspectToClient && input.conversionStatus === "active";
}

export function convertToClientUserMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Unable to convert this prospect from the current account.";
  }
  if (status === 409) {
    return "This prospect could not be converted automatically. Please contact your administrator.";
  }
  return "Unable to convert this prospect right now.";
}

type ProspectConvertToClientActionProps = {
  prospectId: string;
  businessName: string;
  conversionStatus: ProspectClientConversionStatus;
  canConvertProspectToClient: boolean;
  isGetOblicDerivedProspect?: boolean;
  hasActiveGetOblicOwnership?: boolean;
};

export function ProspectConvertToClientAction({
  prospectId,
  businessName,
  conversionStatus,
  canConvertProspectToClient,
  isGetOblicDerivedProspect = false,
  hasActiveGetOblicOwnership = false,
}: ProspectConvertToClientActionProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canConvertProspectToClient) {
    return null;
  }

  if (
    shouldShowConvertedToClientState({
      canConvertProspectToClient,
      conversionStatus,
    })
  ) {
    return (
      <div className="flex flex-col gap-2">
        <span
          data-prospect-header-action="converted-to-client"
          className={PROSPECT_STATUS_CHIP_SAVED}
        >
          Converted to Client
        </span>
      </div>
    );
  }

  if (
    !shouldShowConvertToClientCta({
      canConvertProspectToClient,
      conversionStatus,
      isGetOblicDerivedProspect,
      hasActiveGetOblicOwnership,
    })
  ) {
    return null;
  }

  async function convertToClient() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/prospects/${prospectId}/convert-to-client`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );
      const payload = await parseJsonResponse<{
        ok?: boolean;
        success?: boolean;
      }>(response, {
        unexpectedMessage: convertToClientUserMessage(response.status),
      });

      if (!response.ok || !payload.ok) {
        setError(convertToClientUserMessage(response.status));
        setPending(false);
        return;
      }

      router.push("/prospects");
      router.refresh();
    } catch {
      setError("Unable to convert this prospect right now.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-prospect-header-action="convert-to-client"
        className={CONVERT_TO_CLIENT_PRIMARY_ACTION}
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (pending) {
            return;
          }
          setConfirmOpen(true);
          setError(null);
        }}
      >
        <Building2 className="size-4" />
        {pending ? "Converting…" : "Convert to Client"}
      </button>
      {error ? (
        <div className="text-sm text-red-300" role="alert">
          {error}
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="convert-to-client-title"
            className="w-full max-w-md rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-6 shadow-2xl shadow-black/40"
          >
            <h2
              id="convert-to-client-title"
              className="text-xl font-semibold text-white"
            >
              Convert {businessName} to a client?
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/55">
              A client sub-account will be created and this business will move
              out of your active Prospect list.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (pending) {
                    return;
                  }
                  setConfirmOpen(false);
                }}
                className="rounded-xl border border-[var(--athena-border)] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void convertToClient()}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
              >
                {pending ? "Converting…" : "Convert to Client"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
