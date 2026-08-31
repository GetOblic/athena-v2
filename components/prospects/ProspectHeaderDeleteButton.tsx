"use client";

import {
  ConfirmDeleteControl,
  type ConfirmDeleteChrome,
} from "@/components/ui/ConfirmDeleteControl";

type ProspectHeaderDeleteButtonProps = {
  prospectId: string;
  confirmMessage?: string;
  errorFallback?: string;
  chrome?: ConfirmDeleteChrome;
};

export function ProspectHeaderDeleteButton({
  prospectId,
  confirmMessage,
  errorFallback,
  chrome,
}: ProspectHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage={
        confirmMessage ??
        "Delete this Prospect permanently? The Prospect, its linked Discussion, and generated intelligence will be removed. This cannot be undone."
      }
      deleteUrl={`/api/prospects/${prospectId}`}
      redirectTo="/prospects"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback={errorFallback ?? "Failed to delete prospect."}
      chrome={chrome}
    />
  );
}
