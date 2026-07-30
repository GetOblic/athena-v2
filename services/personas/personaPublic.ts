import { resolvePersonaDisplayLabel } from "@/services/personas/personaUtils";
import type { Persona } from "@/services/personas/personaService";

/**
 * Public Persona DTO for later API/UI stages.
 * Omits linked_discussion_id (internal bridge identifier).
 * Follows Prospect public DTO precedent for other fields.
 */
export type PublicPersona = Omit<Persona, "linked_discussion_id"> & {
  display_label: string;
};

export function toPublicPersona(persona: Persona): PublicPersona {
  const rest = { ...persona };
  delete (rest as { linked_discussion_id?: string | null }).linked_discussion_id;

  return {
    ...rest,
    display_label: resolvePersonaDisplayLabel(persona),
  };
}
