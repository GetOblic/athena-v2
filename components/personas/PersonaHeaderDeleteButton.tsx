"use client";

import {
  ConfirmDeleteControl,
  type ConfirmDeleteChrome,
} from "@/components/ui/ConfirmDeleteControl";

type PersonaHeaderDeleteButtonProps = {
  personaId: string;
  confirmMessage?: string;
  errorFallback?: string;
  chrome?: ConfirmDeleteChrome;
};

export function PersonaHeaderDeleteButton({
  personaId,
  confirmMessage,
  errorFallback,
  chrome,
}: PersonaHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage={
        confirmMessage ??
        "Delete this Persona permanently? The Persona, its linked intelligence Discussion, and generated intelligence will be removed. This cannot be undone."
      }
      deleteUrl={`/api/personas/${personaId}`}
      redirectTo="/personas"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback={errorFallback ?? "Failed to delete persona."}
      chrome={chrome}
    />
  );
}
