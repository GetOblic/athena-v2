/**
 * Create a normal Athena Audience / Persona from Prospect intelligence.
 *
 * Sequence: org-scoped Prospect → current Executive Version gate →
 * trusted context compose → existing Persona generator → existing import
 * + bridge + Executive Intelligence queue.
 *
 * Does not invent a parallel Persona type or Stage 2 Prospect read.
 */

import { PERSONA_GENERATION_OUTPUT_FIELDS } from "@/services/ai/prompts/personaGenerationPrompt";
import { generateFreeAudienceCandidate } from "@/services/personas/freeAudienceOrchestration";
import {
  generatePersonaCandidate,
  PersonaGenerationError,
  type PersonaGenerationCandidate,
} from "@/services/personas/personaGeneration";
import {
  importPersonaManual,
  type PersonaImportRow,
} from "@/services/personas/personaImporter";
import { composeProspectAudienceContext } from "@/services/personas/prospectAudienceContextComposer";
import type { Prospect } from "@/services/prospects/prospectService";
import type { ExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionTypes";

export const PROSPECT_AUDIENCE_PROVENANCE = {
  generated_from: "prospect",
} as const;

export class CreateAudienceFromProspectError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "PROSPECT_INTELLIGENCE_REQUIRED"
    | "CREATE_FAILED";
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(input: {
    code: "NOT_FOUND" | "PROSPECT_INTELLIGENCE_REQUIRED" | "CREATE_FAILED";
    message: string;
    httpStatus: number;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "CreateAudienceFromProspectError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.retryable = Boolean(input.retryable);
  }
}

export type CreateAudienceFromProspectDeps = {
  getProspectById?: (
    prospectId: string,
    organizationId: string,
  ) => Promise<Prospect | null>;
  getCurrentExecutiveVersion?: (
    discussionId: string,
    organizationId: string,
  ) => Promise<ExecutiveIntelligenceVersion | null>;
  composeContext?: typeof composeProspectAudienceContext;
  generateCandidate?: typeof generatePersonaCandidate | typeof generateFreeAudienceCandidate;
  importPersona?: typeof importPersonaManual;
};

export type CreateAudienceFromProspectResult = {
  personaId: string;
  duplicate: boolean;
};

function candidateToImportRow(
  candidate: PersonaGenerationCandidate,
): PersonaImportRow {
  const row: PersonaImportRow = {
    source: "generated",
    reference_website: null,
  };
  for (const field of PERSONA_GENERATION_OUTPUT_FIELDS) {
    if (field === "reference_website") {
      row.reference_website = null;
      continue;
    }
    const value = candidate[field];
    row[field] = typeof value === "string" ? value : null;
  }
  return row;
}

export async function createAudienceFromProspect(input: {
  prospectId: string;
  organizationId: string;
  userId: string | null;
  /** Ignored — organizationId is never accepted from the browser. */
  clientOrganizationId?: unknown;
  deps?: CreateAudienceFromProspectDeps;
}): Promise<CreateAudienceFromProspectResult> {
  void input.clientOrganizationId;

  const organizationId = String(input.organizationId ?? "").trim();
  const prospectId = String(input.prospectId ?? "").trim();
  if (!organizationId || !prospectId) {
    throw new CreateAudienceFromProspectError({
      code: "NOT_FOUND",
      message: "Prospect not found.",
      httpStatus: 404,
    });
  }

  const getProspect =
    input.deps?.getProspectById ??
    (await import("@/services/prospects/prospectService")).getProspectById;

  const prospect = await getProspect(prospectId, organizationId);
  if (!prospect) {
    throw new CreateAudienceFromProspectError({
      code: "NOT_FOUND",
      message: "Prospect not found.",
      httpStatus: 404,
    });
  }

  const linkedDiscussionId =
    typeof prospect.linked_discussion_id === "string" &&
    prospect.linked_discussion_id.trim()
      ? prospect.linked_discussion_id.trim()
      : null;

  const getCurrentEv =
    input.deps?.getCurrentExecutiveVersion ??
    (
      await import("@/services/executiveVersions/executiveVersionService")
    ).getCurrentExecutiveVersion;

  const currentVersion = linkedDiscussionId
    ? await getCurrentEv(linkedDiscussionId, organizationId)
    : null;

  if (!currentVersion?.is_current) {
    throw new CreateAudienceFromProspectError({
      code: "PROSPECT_INTELLIGENCE_REQUIRED",
      message: "Generate prospect intelligence first.",
      httpStatus: 409,
    });
  }

  const compose = input.deps?.composeContext ?? composeProspectAudienceContext;
  const composed = await compose({
    prospectId: prospect.id,
    organizationId,
    deps: {
      getProspectById: getProspect,
      getCurrentExecutiveVersion: getCurrentEv,
    },
  });

  const generate = input.deps?.generateCandidate ?? generateFreeAudienceCandidate;
  let generated;
  try {
    generated = await generate({
      organizationId,
      prospectContextBlock: composed.composedText,
    });
  } catch (error) {
    if (error instanceof PersonaGenerationError) {
      throw error;
    }
    throw new CreateAudienceFromProspectError({
      code: "CREATE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Create Audience from Prospect failed.",
      httpStatus: 502,
      retryable: true,
    });
  }

  const persist = input.deps?.importPersona ?? importPersonaManual;
  const persisted = await persist({
    organizationId,
    userId: input.userId,
    row: candidateToImportRow(generated.candidate),
    rawJson: {
      generated_from: PROSPECT_AUDIENCE_PROVENANCE.generated_from,
      prospect_id: prospect.id,
    },
  });

  return {
    personaId: persisted.persona.id,
    duplicate: persisted.duplicate,
  };
}
