/**
 * Athena GetOblic Directory listing description push.
 *
 * Tenant-authenticated path: org context → shared outbound authorization →
 * saved prospect_directory_artifacts description → existing WordPress PUT.
 *
 * Linked owners keep the linked-row WordPress id. Authorized unclaimed
 * Prospects use the resolver's canonical id and do not write a listing link.
 *
 * This service does not accept browser-supplied WordPress IDs, organization
 * IDs, or description content. Observed listing copy, unsaved editor text,
 * and the legacy generated listing column are never the outbound source.
 *
 * Remaining race: beforeOutbound and resolveGetOblicOutboundContentTarget run
 * again immediately before the PUT. A release or conversion reversal that
 * commits during the remote PUT can still reach WordPress. There is no
 * distributed transaction around that gap.
 */

import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  recheckGetOblicOutboundContentTarget,
  resolveGetOblicOutboundContentTarget,
  type GetOblicOutboundContentTarget,
} from "@/services/getoblicDirectory/getoblicOutboundContentAuthorization";
import { loadPublishableSavedDirectoryArtifact } from "@/services/getoblicDirectory/getoblicSavedArtifactOutbound";
import { putWordpressListingDescription } from "@/services/getoblicDirectory/getoblicWordpressClient";
import { GetOblicWordpressError } from "@/services/getoblicDirectory/getoblicWordpressTypes";

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
  beforeOutbound?: () => Promise<void>;
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

export async function syncGetOblicListingDescription(
  input: SyncGetOblicListingDescriptionInput,
  wordpress: DescriptionWordpressPort = defaultWordpressPort,
): Promise<DescriptionSyncResult> {
  const initial = await resolveGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
  });
  assertLinkedWordpressId(initial);

  const artifact = await loadPublishableSavedDirectoryArtifact({
    prospectId: input.prospectId,
    sourceOrganizationId: input.organizationId,
    artifactType: "description",
  });

  if (input.beforeOutbound) {
    await input.beforeOutbound();
  }
  const target = await recheckGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
    expected: initial,
  });
  assertLinkedWordpressId(target);

  let remote: { wordpress_listing_id: number; changed: boolean };
  try {
    remote = await wordpress.putDescription(
      target.wordpressListingId,
      artifact.content,
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

function assertLinkedWordpressId(target: GetOblicOutboundContentTarget): void {
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

function sanitizeRemoteErrorText(value: string): string {
  const key = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim();
  let sanitized = value;
  if (key) {
    sanitized = sanitized.split(key).join("[redacted]");
  }
  return sanitized.slice(0, REMOTE_ERROR_MAX_LENGTH);
}
