"use client";

import { ConfirmDeleteControl } from "@/components/ui/ConfirmDeleteControl";

type ProspectHeaderDeleteButtonProps = {
  prospectId: string;
};

export function ProspectHeaderDeleteButton({
  prospectId,
}: ProspectHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage="Delete this Prospect permanently? The Prospect, its linked Discussion, and generated intelligence will be removed. This cannot be undone."
      deleteUrl={`/api/prospects/${prospectId}`}
      redirectTo="/prospects"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback="Failed to delete prospect."
    />
  );
}
