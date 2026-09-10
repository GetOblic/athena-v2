/**
 * Athena V2 GetOblic Directory Knowledge Base push orchestration.
 *
 * Tenant-authenticated path: org context → org-scoped Prospect → linked
 * listing row → Current Executive Version → parsed knowledge_base_enhancement
 * → SHA-256 → Athena-side idempotency → existing WordPress PUT primitive →
 * persist KB sync metadata.
 *
 * This service does not claim listings, consume allocation, search, create
 * listings, release/unlink, or accept browser-supplied WordPress / version /
 * organization authority.
 *
 * Concurrency limitation: the current schema cannot suppress two identical
 * in-flight PUTs. Simultaneous requests may both write WordPress. Required
 * correctness still holds: no cross-tenant mutation, no corrupted sync
 * metadata, and a successful final row reflects the current version/hash.
 */

import { createHash } from "node:crypto";
import { parseLabeledDeploymentAssets } from "@/lib/deploymentAssets";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GetOblicDirectoryError } from "@/services/getoblicDirectory/getoblicDirectoryErrors";
import {
  GETOBLIC_LISTING_LINKS_TABLE,
  type GetOblicListingLink,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  getActiveGetOblicLinkForProspect,
  mapListingLinkRow,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { putWordpressListingKnowledgeBase } from "@/services/getoblicDirectory/getoblicWordpressClient";
import { GetOblicWordpressError } from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { getCurrentExecutiveVersion } from "@/services/executiveVersions/executiveVersionService";
import { getProspectById } from "@/services/prospects/prospectService";

const REMOTE_ERROR_MAX_LENGTH = 500;
const KNOWLEDGE_BASE_ASSET_KEY = "knowledge_base_enhancement" as const;

export type KnowledgeBaseSyncOutcome = "pushed" | "already_current";

export type KnowledgeBaseSyncResult = {
  success: true;
  outcome: KnowledgeBaseSyncOutcome;
  prospect_id: string;
  listing_link_id: string;
  wordpress_listing_id: number;
  executive_version_id: string;
  content_sha256: string;
  kb_push_status: "success";
};

export type SyncGetOblicListingKnowledgeBaseInput = {
  organizationId: string;
  prospectId: string;
  now?: Date;
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
  const prospect = await requireProspectInOrganization(
    input.prospectId,
    input.organizationId,
  );
  const link = await requireLinkedListing(
    input.organizationId,
    input.prospectId,
  );

  const discussionId = prospect.linked_discussion_id?.trim() ?? "";
  if (!discussionId) {
    throw currentExecutiveVersionMissingError();
  }

  const version = await getCurrentExecutiveVersion(
    discussionId,
    input.organizationId,
  );
  if (!version || !version.is_current) {
    throw currentExecutiveVersionMissingError();
  }

  const knowledgeBase = extractKnowledgeBaseBody(version.intelligence);
  const contentSha256 = hashKnowledgeBaseContent(knowledgeBase);

  if (
    link.kb_push_status === "success" &&
    link.kb_last_pushed_executive_version_id === version.id &&
    link.kb_last_content_sha256 === contentSha256
  ) {
    return {
      success: true,
      outcome: "already_current",
      prospect_id: input.prospectId,
      listing_link_id: link.id,
      wordpress_listing_id: link.wordpress_listing_id,
      executive_version_id: version.id,
      content_sha256: contentSha256,
      kb_push_status: "success",
    };
  }

  try {
    await wordpress.putKnowledgeBase(
      link.wordpress_listing_id,
      knowledgeBase,
    );
  } catch (error) {
    await persistKnowledgeBaseFailure(link, now, error);
    throw mapWordpressWriteError(error);
  }

  const persisted = await persistKnowledgeBaseSuccess(link, {
    executiveVersionId: version.id,
    contentSha256,
    now,
  });

  return {
    success: true,
    outcome: "pushed",
    prospect_id: input.prospectId,
    listing_link_id: persisted.id,
    wordpress_listing_id: persisted.wordpress_listing_id,
    executive_version_id: version.id,
    content_sha256: contentSha256,
    kb_push_status: "success",
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

function extractKnowledgeBaseBody(intelligence: unknown): string {
  const suggestedCta = readSuggestedCta(intelligence);
  const assets = parseLabeledDeploymentAssets(suggestedCta);
  const matches = assets.filter(
    (asset) => asset.assetKey === KNOWLEDGE_BASE_ASSET_KEY,
  );
  if (matches.length !== 1) {
    throw knowledgeBaseAssetMissingError();
  }

  const body = matches[0]?.content;
  if (typeof body !== "string" || body.length === 0) {
    throw knowledgeBaseAssetMissingError();
  }

  return body;
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
    executiveVersionId: string;
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

function currentExecutiveVersionMissingError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_CURRENT_EXECUTIVE_VERSION_MISSING",
    "This Prospect has no Current Executive Version.",
    409,
  );
}

function knowledgeBaseAssetMissingError(): GetOblicDirectoryError {
  return new GetOblicDirectoryError(
    "GETOBLIC_KNOWLEDGE_BASE_ASSET_MISSING",
    "Current Executive Version has no Knowledge Base asset.",
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
