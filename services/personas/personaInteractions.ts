/**
 * Persona Append Interaction — server-side append-only Notes updates.
 *
 * Concurrency: optimistic locking on `updated_at` with bounded retries.
 * Notes are never overwritten; additional_context and ads_content are untouched.
 */

import { ensurePersonaGenerationQueued } from "@/services/personas/personaImporter";
import {
  getPersonaById,
  updatePersonaNotesIfUnchanged,
  type Persona,
} from "@/services/personas/personaService";

/** Display timezone for interaction stamps (Stage 5 product convention). */
export const PERSONA_INTERACTION_DISPLAY_TIMEZONE = "Europe/Belgrade";

const MAX_APPEND_RETRIES = 3;

export class PersonaInteractionError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "VALIDATION_ERROR"
    | "CONFLICT"
    | "APPEND_FAILED";

  constructor(
    code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "APPEND_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "PersonaInteractionError";
    this.code = code;
  }
}

export function formatPersonaInteractionStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PERSONA_INTERACTION_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = lookup("year");
  const month = lookup("month");
  const day = lookup("day");
  const hour = lookup("hour");
  const minute = lookup("minute");

  return `[Interaction appended on ${year}-${month}-${day} ${hour}:${minute} ${PERSONA_INTERACTION_DISPLAY_TIMEZONE}]`;
}

export function buildAppendedPersonaNotes(input: {
  existingNotes: string | null | undefined;
  interaction: string;
  stampedAt?: Date;
}): string {
  const interaction = input.interaction.trim();
  if (!interaction) {
    throw new PersonaInteractionError(
      "VALIDATION_ERROR",
      "Interaction text is required.",
    );
  }

  const block = `${formatPersonaInteractionStamp(input.stampedAt)}\n${interaction}`;
  const existing = (input.existingNotes ?? "").trimEnd();
  if (!existing) return block;
  return `${existing}\n\n${block}`;
}

/**
 * Append an interaction to Persona Notes with optimistic concurrency.
 * Does not modify additional_context or ads_content.
 */
export async function appendPersonaInteraction(input: {
  personaId: string;
  organizationId: string;
  interaction: string;
  requestedBy?: string | null;
}): Promise<{
  persona: Persona;
  notes: string;
  queued: boolean;
  jobId?: string;
  regenerationError?: string;
}> {
  const interaction = input.interaction.trim();
  if (!interaction) {
    throw new PersonaInteractionError(
      "VALIDATION_ERROR",
      "Interaction text is required.",
    );
  }

  let appendedPersona: Persona | null = null;
  let nextNotes = "";

  for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt += 1) {
    const current = await getPersonaById(input.personaId, input.organizationId);
    if (!current) {
      throw new PersonaInteractionError("NOT_FOUND", "Persona not found.");
    }

    nextNotes = buildAppendedPersonaNotes({
      existingNotes: current.notes,
      interaction,
    });

    const updated = await updatePersonaNotesIfUnchanged({
      personaId: current.id,
      organizationId: input.organizationId,
      expectedUpdatedAt: current.updated_at,
      notes: nextNotes,
      lastActivity: new Date().toISOString(),
    });

    if (updated) {
      appendedPersona = updated;
      break;
    }
    // Conflict — another writer won; retry with fresh Notes.
  }

  if (!appendedPersona) {
    throw new PersonaInteractionError(
      "CONFLICT",
      "Could not append interaction due to a concurrent update. Please retry.",
    );
  }

  // Bridge refresh + durable regeneration. Append is retained even if queue fails.
  try {
    const queued = await ensurePersonaGenerationQueued(appendedPersona, {
      requestedBy: input.requestedBy,
      triggerType: "discussion_update",
    });
    return {
      persona: queued.persona,
      notes: queued.persona.notes ?? nextNotes,
      queued: queued.queued,
      jobId: queued.jobId,
    };
  } catch (error) {
    return {
      persona: appendedPersona,
      notes: appendedPersona.notes ?? nextNotes,
      queued: false,
      regenerationError:
        error instanceof Error
          ? error.message
          : "Interaction saved, but regeneration could not be queued.",
    };
  }
}
