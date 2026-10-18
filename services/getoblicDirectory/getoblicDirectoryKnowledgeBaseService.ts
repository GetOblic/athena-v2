/**
 * Athena GetOblic Directory Knowledge Base push orchestration.
 *
 * Tenant-authenticated path: org context → shared outbound authorization →
 * saved prospect_directory_artifacts knowledge_base → existing WordPress PUT.
 *
 * Linked owners compare the saved artifact SHA-256 with kb_last_content_sha256.
 * kb_last_pushed_executive_version_id is historical provenance. It is not the
 * freshness check. Authorized unclaimed Prospects perform the remote PUT only.
 * They do not skip from a linked-row hash and they do not write listing-link metadata.
 *
 * This service does not claim listings, consume allocation, search, create
 * listings, release/unlink, or accept browser-supplied WordPress, artifact,
 * or organization authority. It does not read Executive Intelligence or
 * Client Brain as the outbound body.
 *
 * Concurrency limitation: the current schema cannot suppress two identical
 * in-flight PUTs. Simultaneous requests may both write WordPress. Required
 * correctness still holds: no cross-tenant mutation, no corrupted sync
 * metadata, and a successful final linked row reflects the saved hash.
 *
 * Remaining race: beforeOutbound and resolveGetOblicOutboundContentTarget run
 * again immediately before the PUT. A release or conversion reversal that
 * commits during the remote PUT can still reach WordPress. There is no
 * distributed transaction around that gap.
 */

import { createHash } from "node:crypto";
import { parseLabeledDeploymentAssets } from "@/lib/deploymentAssets";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  GETOBLIC_LISTING_LINKS_TABLE,
  type GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { mapListingLinkRow } from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  recheckGetOblicOutboundContentTarget,
  resolveGetOblicOutboundContentTarget,
} from "@/services/getoblicDirectory/getoblicOutboundContentAuthorization";
import { loadPublishableSavedDirectoryArtifact } from "@/services/getoblicDirectory/getoblicSavedArtifactOutbound";
import { putWordpressListingKnowledgeBase } from "@/services/getoblicDirectory/getoblicWordpressClient";
import { GetOblicWordpressError } from "@/services/getoblicDirectory/getoblicWordpressTypes";

const REMOTE_ERROR_MAX_LENGTH = 500;
const KNOWLEDGE_BASE_ASSET_KEY = "knowledge_base_enhancement" as const;

export type KnowledgeBaseSyncOutcome = "pushed" | "already_current";

export type KnowledgeBaseSyncResult = {
  success: true;
  outcome: KnowledgeBaseSyncOutcome;
  prospect_id: string;
  listing_link_id: string | null;
  wordpress_listing_id: number;
  executive_version_id: string | null;
  content_sha256: string;
  kb_push_status: "success";
};

export type SyncGetOblicListingKnowledgeBaseInput = {
  organizationId: string;
  prospectId: string;
  now?: Date;
  beforeOutbound?: () => Promise<void>;
};

export type KnowledgeBaseWordpressPort = {
  putKnowledgeBase: typeof putWordpressListingKnowledgeBase;
};

const defaultWordpressPort: KnowledgeBaseWordpressPort = {
  putKnowledgeBase: putWordpressListingKnowledgeBase,
};

export function hashKnowledgeBaseContent(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function toPublicGetOblicKnowledgeBaseSync(
  result: KnowledgeBaseSyncResult,
): KnowledgeBaseSyncResult {
  return {
    success: true,
    outcome: result.outcome,
    prospect_id: result.prospect_id,
    listing_link_id: result.listing_link_id,
    wordpress_listing_id: result.wordpress_listing_id,
    executive_version_id: result.executive_version_id,
    content_sha256: result.content_sha256,
    kb_push_status: result.kb_push_status,
  };
}

export async function syncGetOblicListingKnowledgeBase(
  input: SyncGetOblicListingKnowledgeBaseInput,
  wordpress: KnowledgeBaseWordpressPort = defaultWordpressPort,
): Promise<KnowledgeBaseSyncResult> {
  const now = input.now ?? new Date();
  const initial = await resolveGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
  });
  const artifact = await loadPublishableSavedDirectoryArtifact({
    prospectId: input.prospectId,
    sourceOrganizationId: input.organizationId,
    artifactType: "knowledge_base",
  });
  const contentSha256 = artifact.contentSha256;

  if (input.beforeOutbound) {
    await input.beforeOutbound();
  }
  const target = await recheckGetOblicOutboundContentTarget({
    organizationId: input.organizationId,
    prospectId: input.prospectId,
    expected: initial,
  });

  if (target.mode === "linked_owner") {
    const link = target.link;
    if (
      link.kb_push_status === "success" &&
      link.kb_last_content_sha256 === contentSha256
    ) {
      return {
        success: true,
        outcome: "already_current",
        prospect_id: input.prospectId,
        listing_link_id: link.id,
        wordpress_listing_id: link.wordpress_listing_id,
        executive_version_id: link.kb_last_pushed_executive_version_id,
        content_sha256: contentSha256,
        kb_push_status: "success",
      };
    }

    try {
      await wordpress.putKnowledgeBase(link.wordpress_listing_id, artifact.content);
    } catch (error) {
      await persistKnowledgeBaseFailure(link, now, error);
      throw mapWordpressWriteError(error);
    }

    const provenanceId =
      artifact.sourceExecutiveVersionId ?? link.kb_last_pushed_executive_version_id;
    const persisted = await persistKnowledgeBaseSuccess(link, {
      executiveVersionId: provenanceId,
      contentSha256,
      now,
    });

    return {
      success: true,
      outcome: "pushed",
      prospect_id: input.prospectId,
      listing_link_id: persisted.id,
      wordpress_listing_id: persisted.wordpress_listing_id,
      executive_version_id: provenanceId,
      content_sha256: contentSha256,
      kb_push_status: "success",
    };
  }

  try {
    await wordpress.putKnowledgeBase(target.wordpressListingId, artifact.content);
  } catch (error) {
    throw mapWordpressWriteError(error);
  }

  return {
    success: true,
    outcome: "pushed",
    prospect_id: input.prospectId,
    listing_link_id: null,
    wordpress_listing_id: target.wordpressListingId,
    executive_version_id: artifact.sourceExecutiveVersionId,
    content_sha256: contentSha256,
    kb_push_status: "success",
  };
}

export function hasCurrentKnowledgeBaseAsset(intelligence: unknown): boolean {
  const suggestedCta = readSuggestedCta(intelligence);
  const assets = parseLabeledDeploymentAssets(suggestedCta);
  const matches = assets.filter(
    (asset) => asset.assetKey === KNOWLEDGE_BASE_ASSET_KEY,
  );
  if (matches.length !== 1) {
    return false;
  }
  const body = matches[0]?.content;
  return typeof body === "string" && body.length > 0;
}

function readSuggestedCta(intelligence: unknown): string | null {
  if (!intelligence || typeof intelligence !== "object" || Array.isArray(intelligence)) {
    return null;
  }
  const analysis = (intelligence as { analysis?: unknown }).analysis;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    return null;
  }
  const suggestedCta = (analysis as { suggested_cta?: unknown }).suggested_cta;
  return typeof suggestedCta === "string" ? suggestedCta : null;
}

async function persistKnowledgeBaseSuccess(
  link: GetOblicListingLink,
  input: {
    executiveVersionId: string | null;
    contentSha256: string;
    now: Date;
  },
): Promise<GetOblicListingLink> {
  const persisted = await persistKnowledgeBaseRow(link, {
    kb_push_status: "success",
    kb_last_pushed_executive_version_id: input.executiveVersionId,
    kb_last_content_sha256: input.contentSha256,
    kb_last_pushed_at: input.now.toISOString(),
    kb_last_push_error: null,
    kb_last_push_error_at: null,
    updated_at: input.now.toISOString(),
  });

  if (
    !persisted ||
    persisted.kb_push_status !== "success" ||
    persisted.kb_last_pushed_executive_version_id !== input.executiveVersionId ||
    persisted.kb_last_content_sha256 !== input.contentSha256
  ) {
    throw knowledgeBasePersistenceFailedError();
  }

  return persisted;
}

async function persistKnowledgeBaseFailure(
  link: GetOblicListingLink,
  now: Date,
  error: unknown,
): Promise<void> {
  try {
    await persistKnowledgeBaseRow(link, {
      kb_push_status: "failed",
      kb_last_push_error: boundRemoteErrorFromUnknown(error),
      kb_last_push_error_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  } catch (persistError) {
    console.error(
      "Error persisting GetOblic Knowledge Base failure metadata:",
      persistError,
    );
  }
}

async function persistKnowledgeBaseRow(
  link: GetOblicListingLink,
  patch: Record<string, unknown>,
): Promise<GetOblicListingLink> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .update(patch)
    .eq("id", link.id)
    .eq("organization_id", link.organization_id)
    .eq("prospect_id", link.prospect_id)
    .eq("relationship_status", "linked")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error persisting GetOblic Knowledge Base sync metadata:", error);
    throw knowledgeBasePersistenceFailedError();
  }

  const mapped = data
    ? mapListingLinkRow(data as Record<string, unknown>)
    : null;
  if (!mapped || mapped.relationship_status !== "linked") {
    throw knowledgeBasePersistenceFailedError();
  }
  return mapped;
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
        : "GetOblic Directory Knowledge Base write failed.";

  return new GetOblicDirectoryError(
    "GETOBLIC_WORDPRESS_KB_WRITE_FAILED",
    sanitizeRemoteErrorText(message) ||
      "GetOblic Directory Knowledge Base write failed.",
    502,
  );
}

function knowledgeBasePersistenceFailedError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_KB_SYNC_PERSISTENCE_FAILED",
    "Knowledge Base was written remotely but Athena could not persist sync metadata.",
    500,
  );
}

function boundRemoteErrorFromUnknown(error: unknown): string {
  if (error instanceof GetOblicWordpressError) {
    return sanitizeRemoteErrorText(
      `${error.remoteCode ?? error.code}: ${error.message}`,
    );
  }
  if (error instanceof Error) {
    return sanitizeRemoteErrorText(`REMOTE_ERROR: ${error.message}`);
  }
  return sanitizeRemoteErrorText(
    "REMOTE_ERROR: GetOblic Directory Knowledge Base write failed.",
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
