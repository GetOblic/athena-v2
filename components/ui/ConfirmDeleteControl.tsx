"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

export type ConfirmDeleteChrome = {
  delete: string;
  cancel: string;
  confirmDelete: string;
  deleting: string;
  confirmDeletion: string;
};

const DEFAULT_DELETE_CHROME: ConfirmDeleteChrome = {
  delete: "Delete",
  cancel: "Cancel",
  confirmDelete: "Confirm Delete",
  deleting: "Deleting...",
  confirmDeletion: "Confirm deletion",
};

export type ConfirmDeleteControlProps = {
  confirmMessage: string;
  deleteUrl: string;
  redirectTo: string;
  /** Interpret success from the entity API JSON body. */
  isSuccessPayload: (payload: Record<string, unknown>) => boolean;
  errorFallback: string;
  /** Change to force-close the confirm panel (e.g. when Edit opens). */
  dismissKey?: number | string | boolean;
  chrome?: ConfirmDeleteChrome;
};

/**
 * Shared Delete + inline confirmation control for entity headers.
 * Preserves each API's success shape via isSuccessPayload.
 */
export function ConfirmDeleteControl({
  confirmMessage,
  deleteUrl,
  redirectTo,
  isSuccessPayload,
  errorFallback,
  dismissKey,
  chrome = DEFAULT_DELETE_CHROME,
}: ConfirmDeleteControlProps) {
  const router = useRouter();
  const confirmId = useId();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShowDeleteConfirm(false);
    setError(null);
  }, [dismissKey]);

  async function handleDelete() {
    if (isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(deleteUrl, {
        method: "DELETE",
      });
      const payload = await parseJsonResponse<Record<string, unknown>>(response);
      const errorMessage =
        typeof payload.error === "string"
          ? payload.error
          : payload.error &&
              typeof payload.error === "object" &&
              "message" in payload.error &&
              typeof (payload.error as { message?: unknown }).message ===
                "string"
            ? (payload.error as { message: string }).message
            : undefined;

      if (!response.ok || !isSuccessPayload(payload)) {
        throw new Error(errorMessage || errorFallback);
      }

      router.push(redirectTo);
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : errorFallback,
      );
      setIsDeleting(false);
      // Keep confirmation open so Cancel remains available and the error is visible.
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-3 sm:items-end">
      <button
        type="button"
        onClick={() => {
          setShowDeleteConfirm(true);
          setError(null);
        }}
        aria-expanded={showDeleteConfirm}
        aria-controls={confirmId}
        className="rounded-full border border-red-500/30 px-6 py-3 text-sm font-semibold text-red-300 transition hover:border-red-400/50 hover:text-red-200"
      >
        {chrome.delete}
      </button>

      {showDeleteConfirm && (
        <div
          id={confirmId}
          role="group"
          aria-label={chrome.confirmDeletion}
          className="w-full max-w-md rounded-2xl border border-red-500/20 bg-black/30 p-5 sm:text-right lg:text-right"
        >
          <p className="text-sm leading-6 text-white/70">{confirmMessage}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (isDeleting) return;
                setShowDeleteConfirm(false);
                setError(null);
              }}
              disabled={isDeleting}
              className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 disabled:opacity-50"
            >
              {chrome.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              aria-busy={isDeleting}
              className="rounded-full bg-red-500/20 px-5 py-2 text-sm font-semibold text-red-200 disabled:opacity-50"
            >
              {isDeleting ? chrome.deleting : chrome.confirmDelete}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-300" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
