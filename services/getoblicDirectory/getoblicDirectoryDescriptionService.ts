/**
 * Athena V2 GetOblic Directory listing description push.
 *
 * Tenant-authenticated path: org context → shared outbound authorization →
 * persisted generated_listing_description.description → existing WordPress
 * PUT primitive.
 *
 * Linked owners keep the linked-row WordPress id. Authorized unclaimed
 * Prospects use the resolver's canonical id and do not write a listing link.
 *
 * This service does not accept browser-supplied WordPress IDs, organization
 * IDs, or description content. Observed listing copy is never the outbound source.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import { resolveGetOblicOutboundContentTarget } from "@/services/getoblicDirectory/getoblicOutboundContentAuthorization";
import { putWordpressListingDescription } from "@/services/getoblicDirectory/getoblicWordpressClient";
import { GetOblicWordpressError } from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { GETOBLIC_DESCRIPTION_MAX_CHARS } from "@/services/prospects/prospectGeneratedListingDescription";

const REMOTE_ERROR_MAX_LENGTH = 500;

export type DescriptionSyncResult = {
  success: true;
  prospect_id: string;
  listing_link_id: string | null;
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
  const target = await resolveGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
  });
  if (
    target.mode === "linked_owner" &&
    (!Number.isInteger(target.link.wordpress_listing_id) ||
      target.link.wordpress_listing_id <= 0)
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
      target.wordpressListingId,
      description,
    );
  } catch (error) {
    throw mapWordpressWriteError(error);
  }

  return {
    success: true,
    prospect_id: input.prospectId,
    listing_link_id: target.mode === "linked_owner" ? target.link.id : null,
    wordpress_listing_id: remote.wordpress_listing_id,
    changed: remote.changed,
  };
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

function sanitizeRemoteErrorText(value: string): string {
  const key = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim();
  let sanitized = value;
  if (key) {
    sanitized = sanitized.split(key).join("[redacted]");
  }
  return sanitized.slice(0, REMOTE_ERROR_MAX_LENGTH);
}
