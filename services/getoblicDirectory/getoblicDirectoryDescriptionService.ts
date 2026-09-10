/**
 * Athena V2 GetOblic Directory listing description push.
 *
 * Tenant-authenticated path: org context → org-scoped Prospect → linked
 * listing row → persisted generated_listing_description.description →
 * existing WordPress PUT primitive.
 *
 * This service does not accept browser-supplied WordPress IDs, organization
 * IDs, or description content. Observed listing copy is never the outbound source.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  GETOBLIC_LISTING_LINKS_TABLE,
  type GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { getActiveGetOblicLinkForProspect } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { putWordpressListingDescription } from "@/services/getoblicDirectory/getoblicWordpressClient";
import { GetOblicWordpressError } from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { GETOBLIC_DESCRIPTION_MAX_CHARS } from "@/services/prospects/prospectGeneratedListingDescription";
import { getProspectById } from "@/services/prospects/prospectService";

const REMOTE_ERROR_MAX_LENGTH = 500;

export type DescriptionSyncResult = {
  success: true;
  prospect_id: string;
  listing_link_id: string;
  wordpress_listing_id: number;
  changed: boolean;
};

export type SyncGetOblicListingDescriptionInput = {
  organizationId: string;
  prospectId: string;
};

export type DescriptionWordpressPort = {
  putDescription: typeof putWordpressListingDescription;
};

const defaultWordpressPort: DescriptionWordpressPort = {
  putDescription: putWordpressListingDescription,
};

export function toPublicGetOblicDescriptionSync(
  result: DescriptionSyncResult,
): DescriptionSyncResult {
  return {
    success: true,
    prospect_id: result.prospect_id,
    listing_link_id: result.listing_link_id,
    wordpress_listing_id: result.wordpress_listing_id,
    changed: result.changed,
  };
}

export function resolveOutboundGeneratedDescription(value: unknown): string {
  if (value == null) {
    throw generatedDescriptionMissingError();
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw generatedDescriptionInvalidError();
  }

  const description = (value as { description?: unknown }).description;
  if (typeof description !== "string") {
    throw generatedDescriptionInvalidError();
  }

  const trimmed = description.trim();
  if (!trimmed) {
    throw generatedDescriptionInvalidError();
  }
  if (trimmed.length > GETOBLIC_DESCRIPTION_MAX_CHARS) {
    throw generatedDescriptionInvalidError();
  }

  return trimmed;
}

export async function syncGetOblicListingDescription(
  input: SyncGetOblicListingDescriptionInput,
  wordpress: DescriptionWordpressPort = defaultWordpressPort,
): Promise<DescriptionSyncResult> {
  await requireProspectInOrganization(input.prospectId, input.organizationId);
  const link = await requireLinkedListing(
    input.organizationId,
    input.prospectId,
  );
  if (
    !Number.isInteger(link.wordpress_listing_id) ||
    link.wordpress_listing_id <= 0
  ) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_INVALID_WORDPRESS_LISTING_ID",
      "This GetOblic listing is missing a WordPress listing id.",
      409,
    );
  }

  const rawGenerated = await loadRawGeneratedListingDescription(
    input.prospectId,
    input.organizationId,
  );
  const description = resolveOutboundGeneratedDescription(rawGenerated);

  let remote: { wordpress_listing_id: number; changed: boolean };
  try {
    remote = await wordpress.putDescription(
      link.wordpress_listing_id,
      description,
    );
  } catch (error) {
    throw mapWordpressWriteError(error);
  }

  return {
    success: true,
    prospect_id: input.prospectId,
    listing_link_id: link.id,
    wordpress_listing_id: remote.wordpress_listing_id,
    changed: remote.changed,
  };
}

async function requireProspectInOrganization(
  prospectId: string,
  organizationId: string,
) {
  const prospect = await getProspectById(prospectId, organizationId);
  if (!prospect) {
    throw new GetOblicDirectoryError(
      "GETOBLIC_PROSPECT_NOT_FOUND",
      "Prospect not found.",
      404,
    );
  }
  return prospect;
}

async function loadRawGeneratedListingDescription(
  prospectId: string,
  organizationId: string,
): Promise<unknown> {
  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select("generated_listing_description")
    .eq("id", prospectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error loading generated listing description:", error);
    throw generatedDescriptionMissingError();
  }

  return data
    ? (data as { generated_listing_description?: unknown })
        .generated_listing_description
    : null;
}

async function requireLinkedListing(
  organizationId: string,
  prospectId: string,
): Promise<GetOblicListingLink> {
  const active = await getActiveGetOblicLinkForProspect(
    organizationId,
    prospectId,
  );
  if (active) {
    if (active.relationship_status === "linked") {
      return active;
    }
    throw relationshipNotLinkedError();
  }

  if (await hasReleasedLinkForProspect(organizationId, prospectId)) {
    throw relationshipNotLinkedError();
  }

  throw new GetOblicDirectoryError(
    "GETOBLIC_LINK_NOT_FOUND",
    "This Prospect has no GetOblic Directory listing.",
    404,
  );
}

async function hasReleasedLinkForProspect(
  organizationId: string,
  prospectId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("prospect_id", prospectId)
    .eq("relationship_status", "released")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error looking up released GetOblic listing link:", error);
    throw new GetOblicDirectoryError(
      "GETOBLIC_LINK_NOT_FOUND",
      "This Prospect has no GetOblic Directory listing.",
      404,
    );
  }

  return Boolean(data);
}

function mapWordpressWriteError(error: unknown): GetOblicDirectoryError {
  if (
    error instanceof GetOblicWordpressError &&
    (error.code === "UNAUTHORIZED" ||
      error.code === "CONFIG_MISSING" ||
      error.remoteCode === "MISSING_API_KEY" ||
      error.remoteCode === "INVALID_API_KEY" ||
      error.remoteCode === "AUTH_NOT_CONFIGURED")
  ) {
    return new GetOblicDirectoryError(
      "GETOBLIC_REMOTE_AUTH_FAILED",
      "GetOblic Directory authentication failed.",
      503,
    );
  }

  const message =
    error instanceof GetOblicWordpressError
      ? error.message
      : error instanceof Error
        ? error.message
        : "GetOblic Directory description write failed.";

  return new GetOblicDirectoryError(
    "GETOBLIC_WORDPRESS_DESCRIPTION_WRITE_FAILED",
    sanitizeRemoteErrorText(message) ||
      "GetOblic Directory description write failed.",
    502,
  );
}

function generatedDescriptionMissingError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_GENERATED_DESCRIPTION_MISSING",
    "This Prospect has no generated GetOblic description.",
    409,
  );
}

function generatedDescriptionInvalidError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_GENERATED_DESCRIPTION_INVALID",
    "The generated GetOblic description is empty or invalid.",
    409,
  );
}

function relationshipNotLinkedError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_RELATIONSHIP_NOT_LINKED",
    "This Prospect is not linked to a GetOblic listing.",
    409,
  );
}

function sanitizeRemoteErrorText(value: string): string {
  const key = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim();
  let sanitized = value;
  if (key) {
    sanitized = sanitized.split(key).join("[redacted]");
  }
  return sanitized.slice(0, REMOTE_ERROR_MAX_LENGTH);
}
