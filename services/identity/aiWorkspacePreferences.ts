/**
 * Organization AI Workspace preferences — navigational Continue destinations only.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEFAULT_AI_WORKSPACE_PREFERENCES,
  normalizeAiWorkspacePreferences,
  type AiWorkspaceId,
  type AiWorkspacePreferences,
  type ImageGeneratorId,
} from "@/services/assetContinuation/destinationRegistry";
import { getOrganizationById } from "@/services/organizationService";
import type { Organization } from "@/services/organizationService";

export class AiWorkspacePreferencesNotFoundError extends Error {
  constructor(message = "Organization not found.") {
    super(message);
    this.name = "AiWorkspacePreferencesNotFoundError";
  }
}

export function readAiWorkspacePreferencesFromOrganization(
  organization: Pick<Organization, "ai_workspace_preferences"> | null | undefined,
): AiWorkspacePreferences {
  return normalizeAiWorkspacePreferences(
    organization?.ai_workspace_preferences ?? null,
  );
}

export async function getOrganizationAiWorkspacePreferences(
  organizationId: string,
): Promise<AiWorkspacePreferences> {
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    return { ...DEFAULT_AI_WORKSPACE_PREFERENCES };
  }
  return readAiWorkspacePreferencesFromOrganization(organization);
}

export async function updateOrganizationAiWorkspacePreferences(input: {
  organizationId: string;
  preferredAiWorkspace: AiWorkspaceId;
  preferredImageGenerator: ImageGeneratorId;
}): Promise<AiWorkspacePreferences> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new AiWorkspacePreferencesNotFoundError();
  }

  const existing = await getOrganizationById(organizationId);
  if (!existing) {
    throw new AiWorkspacePreferencesNotFoundError();
  }

  const preferences = normalizeAiWorkspacePreferences({
    preferredAiWorkspace: input.preferredAiWorkspace,
    preferredImageGenerator: input.preferredImageGenerator,
  });

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({
      ai_workspace_preferences: preferences,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId)
    .select("ai_workspace_preferences")
    .single();

  if (error || !data) {
    console.error("[AI_WORKSPACE] organization_update_failed", error);
    throw new Error("Could not save AI workspace preferences.");
  }

  return readAiWorkspacePreferencesFromOrganization(
    data as Pick<Organization, "ai_workspace_preferences">,
  );
}

export type { AiWorkspaceId, AiWorkspacePreferences, ImageGeneratorId };
