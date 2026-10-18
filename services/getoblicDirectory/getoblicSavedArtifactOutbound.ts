/**
 * Saved Description and Knowledge Base selected for a GetOblic send.
 *
 * The only outbound body is the source organization's row in
 * prospect_directory_artifacts. Legacy generated_listing_description,
 * Executive Intelligence, and Client Brain are not read here.
 */

import {
  GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS,
  GETOBLIC_DESCRIPTION_MAX_CHARS,
} from "@/lib/prospects/getoblicContentLimits";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  hashProspectDirectoryArtifactContent,
  readSavedProspectDirectoryArtifacts,
  type ProspectDirectoryArtifactRecord,
  type ProspectDirectoryArtifactType,
} from "@/services/prospects/prospectDirectoryArtifacts";

export async function loadPublishableSavedDirectoryArtifact(input: {
  prospectId: string;
  sourceOrganizationId: string;
  artifactType: ProspectDirectoryArtifactType;
}): Promise<ProspectDirectoryArtifactRecord> {
  const listed = await readSavedProspectDirectoryArtifacts({
    prospectId: input.prospectId,
    sourceOrganizationId: input.sourceOrganizationId,
  });
  if (!listed.ok) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_SAVED_ARTIFACT_UNAVAILABLE",
      "Saved GetOblic content is temporarily unavailable.",
      503,
    );
  }

  const artifact =
    input.artifactType === "description"
      ? listed.description
      : listed.knowledgeBase;
  if (!artifact) {
    throw missingSavedArtifactError(input.artifactType);
  }

  const max =
    input.artifactType === "description"
      ? GETOBLIC_DESCRIPTION_MAX_CHARS
      : GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS;
  if (
    artifact.content.length > max ||
    artifact.contentSha256 !== hashProspectDirectoryArtifactContent(artifact.content)
  ) {
    throw invalidSavedArtifactError(input.artifactType);
  }

  return artifact;
}

function missingSavedArtifactError(
  artifactType: ProspectDirectoryArtifactType,
): GetOblicDirectoryError {
  if (artifactType === "description") {
    return new GetOblicDirectoryError(
      "GETOBLIC_SAVED_DESCRIPTION_MISSING",
      "This Prospect has no saved GetOblic description.",
      409,
    );
  }
  return new GetOblicDirectoryError(
    "GETOBLIC_SAVED_KNOWLEDGE_BASE_MISSING",
    "This Prospect has no saved GetOblic Knowledge Base.",
    409,
  );
}

function invalidSavedArtifactError(
  artifactType: ProspectDirectoryArtifactType,
): GetOblicDirectoryError {
  if (artifactType === "description") {
    return new GetOblicDirectoryError(
      "GETOBLIC_SAVED_DESCRIPTION_INVALID",
      "The saved GetOblic description is empty or longer than 4000 characters.",
      409,
    );
  }
  return new GetOblicDirectoryError(
    "GETOBLIC_SAVED_KNOWLEDGE_BASE_INVALID",
    "The saved GetOblic Knowledge Base is empty or longer than 20000 characters.",
    409,
  );
}
