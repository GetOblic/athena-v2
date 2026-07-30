/**
 * Persona Reference Website Deep Scrape — enqueue helpers.
 * Additive Persona branch; does not generalize Prospect deep scrape.
 */

import {
  getPersonaById,
  type Persona,
} from "@/services/personas/personaService";
import { normalizePersonaReferenceWebsite } from "@/services/personas/personaUtils";
import {
  enqueuePersonaDeepScrapeJob,
  getActiveDeepScrapeJobForPersona,
  getLatestDeepScrapeJobForPersona,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import type { AthenaWebsiteDeepScrapeJob } from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import { normalizeRootWebsiteUrl } from "@/services/websiteLearning/deepScrape/urlSafety";

export class PersonaDeepScrapeEligibilityError extends Error {
  readonly code: "NOT_FOUND" | "INVALID_WEBSITE";

  constructor(code: "NOT_FOUND" | "INVALID_WEBSITE", message: string) {
    super(message);
    this.name = "PersonaDeepScrapeEligibilityError";
    this.code = code;
  }
}

export function resolvePersonaDeepScrapeTargetUrl(
  persona: Pick<Persona, "reference_website">,
): string | null {
  const normalized = normalizePersonaReferenceWebsite(persona.reference_website);
  if (!normalized.referenceWebsite) return null;
  const root = normalizeRootWebsiteUrl(normalized.referenceWebsite);
  return root?.url ?? null;
}

export async function enqueuePersonaReferenceWebsiteDeepScrape(input: {
  personaId: string;
  organizationId: string;
  requestedBy?: string | null;
}): Promise<{
  job: AthenaWebsiteDeepScrapeJob;
  created: boolean;
  persona: Persona;
}> {
  const persona = await getPersonaById(input.personaId, input.organizationId);
  if (!persona) {
    throw new PersonaDeepScrapeEligibilityError(
      "NOT_FOUND",
      "Persona not found.",
    );
  }

  const targetUrl = resolvePersonaDeepScrapeTargetUrl(persona);
  if (!targetUrl) {
    throw new PersonaDeepScrapeEligibilityError(
      "INVALID_WEBSITE",
      "A valid Reference Website is required for deep scrape research.",
    );
  }

  const result = await enqueuePersonaDeepScrapeJob({
    organizationId: input.organizationId,
    personaId: persona.id,
    discussionId: persona.linked_discussion_id,
    websiteUrl: targetUrl,
    requestedBy: input.requestedBy,
  });

  return { ...result, persona };
}

export async function getPersonaDeepScrapeStatus(input: {
  personaId: string;
  organizationId: string;
}): Promise<{
  persona: Persona | null;
  available: boolean;
  isActive: boolean;
  active: AthenaWebsiteDeepScrapeJob | null;
  latest: AthenaWebsiteDeepScrapeJob | null;
}> {
  const persona = await getPersonaById(input.personaId, input.organizationId);
  if (!persona) {
    return {
      persona: null,
      available: false,
      isActive: false,
      active: null,
      latest: null,
    };
  }

  const available = Boolean(resolvePersonaDeepScrapeTargetUrl(persona));
  const active = await getActiveDeepScrapeJobForPersona({
    personaId: persona.id,
    organizationId: input.organizationId,
  });
  const latest =
    active ??
    (await getLatestDeepScrapeJobForPersona({
      personaId: persona.id,
      organizationId: input.organizationId,
    }));

  const activeStatuses = new Set([
    "queued",
    "processing",
    "awaiting_follow_on",
    "retryable",
  ]);
  const isActive = Boolean(active && activeStatuses.has(active.status));

  return { persona, available, isActive, active, latest };
}
