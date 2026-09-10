/**
 * List-side Persona Confidence attach.
 *
 * Reads the existing Current Executive Version snapshot only:
 * intelligence.analysis.confidence
 *
 * One batched query. Never N+1. Never another stored score.
 * Does not resolve live intelligence, jobs, or generation state.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PersonaLibraryRow } from "@/services/personas/personaLibraryEnrichment";

export const PERSONA_LIBRARY_CONFIDENCE_SELECT =
  "discussion_id, confidence:intelligence->analysis->confidence";

export type PersonaLibraryConfidenceSource = {
  id: string;
  linked_discussion_id?: string | null;
};

export function collectPersonaLibraryDiscussionIds(
  personas: readonly PersonaLibraryConfidenceSource[],
): string[] {
  const ids = new Set<string>();
  for (const persona of personas) {
    const discussionId = persona.linked_discussion_id;
    if (typeof discussionId === "string" && discussionId.trim()) {
      ids.add(discussionId);
    }
  }
  return [...ids];
}

/**
 * Normalize a stored Current EV confidence for the library row.
 * Valid integers 0–100 are preserved, including stored 0.
 * Invalid / missing values become null. Never falls back to another stored score.
 */
export function readPersonaLibraryConfidenceValue(
  value: unknown,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 100) {
    return null;
  }
  return rounded;
}

export function extractConfidenceFromCurrentVersionRow(
  row: unknown,
): number | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as {
    confidence?: unknown;
    intelligence?: { analysis?: { confidence?: unknown } | null } | null;
  };
  if ("confidence" in record) {
    return readPersonaLibraryConfidenceValue(record.confidence);
  }
  return readPersonaLibraryConfidenceValue(
    record.intelligence?.analysis?.confidence,
  );
}

export async function loadPersonaLibraryConfidenceByDiscussionId(
  discussionIds: readonly string[],
  organizationId: string,
): Promise<Map<string, number | null>> {
  const confidenceByDiscussionId = new Map<string, number | null>();
  if (discussionIds.length === 0) {
    return confidenceByDiscussionId;
  }

  const { data, error } = await supabaseAdmin
    .from("athena_executive_intelligence_versions")
    .select(PERSONA_LIBRARY_CONFIDENCE_SELECT)
    .eq("is_current", true)
    .eq("organization_id", organizationId)
    .in("discussion_id", [...discussionIds]);

  if (error) {
    console.error("[PERSONAS_LIBRARY] confidence_attach_failed", error);
    return confidenceByDiscussionId;
  }

  for (const row of data ?? []) {
    const discussionId =
      row && typeof row === "object" && "discussion_id" in row
        ? (row as { discussion_id?: unknown }).discussion_id
        : null;
    if (typeof discussionId !== "string" || !discussionId) {
      continue;
    }
    confidenceByDiscussionId.set(
      discussionId,
      extractConfidenceFromCurrentVersionRow(row),
    );
  }

  return confidenceByDiscussionId;
}

export function applyPersonaLibraryConfidence<T extends { id: string }>(
  rows: readonly T[],
  personas: readonly PersonaLibraryConfidenceSource[],
  confidenceByDiscussionId: ReadonlyMap<string, number | null>,
): Array<T & { display_confidence: number | null }> {
  const discussionByPersonaId = new Map(
    personas.map((persona) => [persona.id, persona.linked_discussion_id ?? null]),
  );

  return rows.map((row) => {
    const discussionId = discussionByPersonaId.get(row.id);
    const confidence =
      typeof discussionId === "string" && discussionId
        ? (confidenceByDiscussionId.get(discussionId) ?? null)
        : null;
    return {
      ...row,
      display_confidence: confidence,
    };
  });
}

export async function attachPersonaLibraryConfidence(
  rows: PersonaLibraryRow[],
  personas: readonly PersonaLibraryConfidenceSource[],
  organizationId: string,
): Promise<PersonaLibraryRow[]> {
  const discussionIds = collectPersonaLibraryDiscussionIds(personas);
  const confidenceByDiscussionId =
    await loadPersonaLibraryConfidenceByDiscussionId(
      discussionIds,
      organizationId,
    );
  return applyPersonaLibraryConfidence(
    rows,
    personas,
    confidenceByDiscussionId,
  );
}
