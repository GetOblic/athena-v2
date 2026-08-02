"use client";

import { ConfirmDeleteControl } from "@/components/ui/ConfirmDeleteControl";

type PersonaHeaderDeleteButtonProps = {
  personaId: string;
};

export function PersonaHeaderDeleteButton({
  personaId,
}: PersonaHeaderDeleteButtonProps) {
  return (
    <ConfirmDeleteControl
      confirmMessage="Delete this Persona permanently? The Persona, its linked intelligence Discussion, and generated intelligence will be removed. This cannot be undone."
      deleteUrl={`/api/personas/${personaId}`}
      redirectTo="/personas"
      isSuccessPayload={(payload) => Boolean(payload.ok)}
      errorFallback="Failed to delete persona."
    />
  );
}
