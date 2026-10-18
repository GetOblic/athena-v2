/**
 * Explicit Save for the shared GetOblic Description and Knowledge Base.
 *
 * Draft generation stays outside this module. Save writes only
 * prospect_directory_artifacts through the compare-and-swap repository.
 * It does not write Executive Intelligence, Client Brain, the legacy
 * listing description column, or WordPress.
 */

import type { ClientProspectIntelligenceDenial } from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import { resolveClientProspectIntelligenceAuthority } from "@/services/clientProspectIntelligence/clientProspectIntelligenceAuthority";
import {
  GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS,
  GETOBLIC_DESCRIPTION_MAX_CHARS,
} from "@/lib/prospects/getoblicContentLimits";
import {
  isProspectDirectoryArtifactType,
  readSavedProspectDirectoryArtifacts,
  saveProspectDirectoryArtifact,
  type ProspectDirectoryArtifactStore,
  type ProspectDirectoryArtifactType,
} from "@/services/prospects/prospectDirectoryArtifacts";
import { getProspectById } from "@/services/prospects/prospectService";

const SAVE_BODY_KEYS = ["artifactType", "content", "expectedRevision"] as const;

export type GetoblicContentFailureReason =
  | "invalid_request"
  | "invalid_artifact"
  | "invalid_content"
  | "invalid_revision"
  | "content_too_long"
  | "not_found"
  | "conflict"
  | "unavailable"
  | ClientProspectIntelligenceDenial;

export type GetoblicContentSavedView = {
  revision: number;
  content: string;
  savedAt: string;
};

export type GetoblicContentSaveSuccess = {
  ok: true;
  created: boolean;
  artifactType: ProspectDirectoryArtifactType;
  revision: number;
  content: string;
  savedAt: string;
};

export type GetoblicContentReadSuccess = {
  ok: true;
  artifactType: ProspectDirectoryArtifactType;
  saved: GetoblicContentSavedView | null;
};

export type GetoblicContentFailure = {
  ok: false;
  reason: GetoblicContentFailureReason;
};

export type GetoblicContentSaveResult =
  | GetoblicContentSaveSuccess
  | GetoblicContentFailure;

export type GetoblicContentReadResult =
  | GetoblicContentReadSuccess
  | GetoblicContentFailure;

export type GetoblicContentHttpResult = {
  status: number;
  body:
    | {
        ok: true;
        artifactType: ProspectDirectoryArtifactType;
        revision: number;
        content: string;
        created: boolean;
        savedAt: string;
      }
    | {
        ok: true;
        artifactType: ProspectDirectoryArtifactType;
        saved: GetoblicContentSavedView | null;
      }
    | {
        ok: false;
        error: { code: string; message: string };
      };
};

type OwnsSourceProspect = (value: {
  prospectId: string;
  sourceOrganizationId: string;
}) => Promise<boolean>;

type SaveDeps = {
  store?: ProspectDirectoryArtifactStore;
  ownsSourceProspect?: OwnsSourceProspect;
  now?: Date;
};

const FAILURE_HTTP: Record<
  GetoblicContentFailureReason,
  { status: number; code: string; message: string }
> = {
  invalid_request: {
    status: 400,
    code: "INVALID_REQUEST",
    message: "Save requires artifact type, content, and expected revision.",
  },
  invalid_artifact: {
    status: 400,
    code: "INVALID_ARTIFACT",
    message: "Choose a Description or Knowledge Base.",
  },
  invalid_content: {
    status: 400,
    code: "INVALID_CONTENT",
    message: "Enter text before saving.",
  },
  invalid_revision: {
    status: 400,
    code: "INVALID_REVISION",
    message: "Save requires the current revision, or none for a first save.",
  },
  content_too_long: {
    status: 400,
    code: "CONTENT_TOO_LONG",
    message: "This content is longer than the allowed limit.",
  },
  not_found: {
    status: 404,
    code: "NOT_FOUND",
    message: "That Prospect is not available.",
  },
  conflict: {
    status: 409,
    code: "CONFLICT",
    message: "A newer saved version exists.",
  },
  unavailable: {
    status: 503,
    code: "UNAVAILABLE",
    message: "Saved content is temporarily unavailable.",
  },
  missing_client_organization: {
    status: 401,
    code: "UNAUTHORIZED",
    message: "Authentication required.",
  },
  no_active_conversion: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  ambiguous_conversion: {
    status: 409,
    code: "AMBIGUOUS_CONVERSION",
    message: "GetOblic content is not available for this account.",
  },
  incomplete_conversion: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  client_mismatch: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  source_mismatch: {
    status: 404,
    code: "CONVERSION_UNAVAILABLE",
    message: "GetOblic content is not available for this account.",
  },
  lookup_failed: {
    status: 503,
    code: "UNAVAILABLE",
    message: "Saved content is temporarily unavailable.",
  },
};

export function getoblicContentHttpResult(
  result: GetoblicContentSaveResult | GetoblicContentReadResult,
): GetoblicContentHttpResult {
  if (!result.ok) {
    const mapped = FAILURE_HTTP[result.reason];
    return {
      status: mapped.status,
      body: {
        ok: false,
        error: { code: mapped.code, message: mapped.message },
      },
    };
  }
  if ("saved" in result) {
    return {
      status: 200,
      body: {
        ok: true,
        artifactType: result.artifactType,
        saved: result.saved,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      artifactType: result.artifactType,
      revision: result.revision,
      content: result.content,
      created: result.created,
      savedAt: result.savedAt,
    },
  };
}

export function parseGetoblicContentSaveBody(body: unknown):
  | {
      ok: true;
      artifactType: ProspectDirectoryArtifactType;
      content: string;
      expectedRevision: number | null;
    }
  | GetoblicContentFailure {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_request" };
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== SAVE_BODY_KEYS.length ||
    SAVE_BODY_KEYS.some((key) => !keys.includes(key))
  ) {
    return { ok: false, reason: "invalid_request" };
  }
  if (!isProspectDirectoryArtifactType(record.artifactType)) {
    return { ok: false, reason: "invalid_artifact" };
  }
  if (typeof record.content !== "string") {
    return { ok: false, reason: "invalid_content" };
  }
  const content = record.content.trim();
  if (!content) return { ok: false, reason: "invalid_content" };
  const max =
    record.artifactType === "description"
      ? GETOBLIC_DESCRIPTION_MAX_CHARS
      : GETOBLIC_CONTENT_KNOWLEDGE_BASE_MAX_CHARS;
  if (content.length > max) return { ok: false, reason: "content_too_long" };
  const expectedRevision = record.expectedRevision;
  if (expectedRevision === null) {
    return {
      ok: true,
      artifactType: record.artifactType,
      content,
      expectedRevision: null,
    };
  }
  if (
    typeof expectedRevision !== "number" ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    return { ok: false, reason: "invalid_revision" };
  }
  return {
    ok: true,
    artifactType: record.artifactType,
    content,
    expectedRevision,
  };
}

function savedView(input: {
  revision: number;
  content: string;
  savedAt: string;
}): GetoblicContentSavedView {
  return {
    revision: input.revision,
    content: input.content,
    savedAt: input.savedAt,
  };
}

async function defaultOwnsSourceProspect(input: {
  prospectId: string;
  sourceOrganizationId: string;
}): Promise<boolean> {
  const prospect = await getProspectById(
    input.prospectId,
    input.sourceOrganizationId,
  );
  return (
    prospect?.id === input.prospectId &&
    prospect.organization_id === input.sourceOrganizationId
  );
}

async function readOwnedArtifact(input: {
  prospectId: string;
  sourceOrganizationId: string;
  artifactType: ProspectDirectoryArtifactType;
  store?: ProspectDirectoryArtifactStore;
}): Promise<GetoblicContentReadResult> {
  const listed = await readSavedProspectDirectoryArtifacts({
    prospectId: input.prospectId,
    sourceOrganizationId: input.sourceOrganizationId,
    store: input.store,
  });
  if (!listed.ok) return { ok: false, reason: "unavailable" };
  const row =
    input.artifactType === "description"
      ? listed.description
      : listed.knowledgeBase;
  return {
    ok: true,
    artifactType: input.artifactType,
    saved: row
      ? savedView({
          revision: row.revision,
          content: row.content,
          savedAt: row.savedAt,
        })
      : null,
  };
}

async function assertOwnedProspect(input: {
  prospectId: string;
  sourceOrganizationId: string;
  ownsSourceProspect?: OwnsSourceProspect;
}): Promise<GetoblicContentFailure | null> {
  const prospectId = input.prospectId.trim();
  const sourceOrganizationId = input.sourceOrganizationId.trim();
  if (!prospectId || !sourceOrganizationId) {
    return { ok: false, reason: "not_found" };
  }
  const owns = input.ownsSourceProspect ?? defaultOwnsSourceProspect;
  const owned = await owns({ prospectId, sourceOrganizationId });
  if (!owned) return { ok: false, reason: "not_found" };
  return null;
}

export async function readProspectGetoblicContent(
  input: {
    prospectId: string;
    sourceOrganizationId: string;
    artifactType: unknown;
  } & SaveDeps,
): Promise<GetoblicContentReadResult> {
  const denied = await assertOwnedProspect(input);
  if (denied) return denied;
  if (!isProspectDirectoryArtifactType(input.artifactType)) {
    return { ok: false, reason: "invalid_artifact" };
  }
  return readOwnedArtifact({
    prospectId: input.prospectId.trim(),
    sourceOrganizationId: input.sourceOrganizationId.trim(),
    artifactType: input.artifactType,
    store: input.store,
  });
}

export async function saveProspectGetoblicContent(
  input: {
    prospectId: string;
    sourceOrganizationId: string;
    body: unknown;
  } & SaveDeps,
): Promise<GetoblicContentSaveResult> {
  const denied = await assertOwnedProspect(input);
  if (denied) return denied;
  const parsed = parseGetoblicContentSaveBody(input.body);
  if (!parsed.ok) return parsed;
  const saved = await saveProspectDirectoryArtifact({
    prospectId: input.prospectId.trim(),
    sourceOrganizationId: input.sourceOrganizationId.trim(),
    artifactType: parsed.artifactType,
    content: parsed.content,
    origin: "edited",
    expectedRevision: parsed.expectedRevision,
    sourceExecutiveVersionId: null,
    now: input.now,
    store: input.store,
    ownsSourceProspect: input.ownsSourceProspect ?? defaultOwnsSourceProspect,
  });
  if (!saved.ok) return saved;
  return {
    ok: true,
    created: saved.created,
    artifactType: saved.artifact.artifactType,
    revision: saved.artifact.revision,
    content: saved.artifact.content,
    savedAt: saved.artifact.savedAt,
  };
}

export async function readClientGetoblicContent(
  input: {
    clientOrganizationId: string;
    artifactType: unknown;
    resolveAuthority?: typeof resolveClientProspectIntelligenceAuthority;
  } & SaveDeps,
): Promise<GetoblicContentReadResult> {
  const resolve =
    input.resolveAuthority ?? resolveClientProspectIntelligenceAuthority;
  const authority = await resolve(input.clientOrganizationId);
  if (!authority.ok) return authority;
  if (!isProspectDirectoryArtifactType(input.artifactType)) {
    return { ok: false, reason: "invalid_artifact" };
  }
  const denied = await assertOwnedProspect({
    prospectId: authority.conversion.prospectId,
    sourceOrganizationId: authority.conversion.sourceOrganizationId,
    ownsSourceProspect: input.ownsSourceProspect,
  });
  if (denied) return denied;
  return readOwnedArtifact({
    prospectId: authority.conversion.prospectId,
    sourceOrganizationId: authority.conversion.sourceOrganizationId,
    artifactType: input.artifactType,
    store: input.store,
  });
}

export async function saveClientGetoblicContent(
  input: {
    clientOrganizationId: string;
    body: unknown;
    resolveAuthority?: typeof resolveClientProspectIntelligenceAuthority;
  } & SaveDeps,
): Promise<GetoblicContentSaveResult> {
  const resolve =
    input.resolveAuthority ?? resolveClientProspectIntelligenceAuthority;
  const authority = await resolve(input.clientOrganizationId);
  if (!authority.ok) return authority;
  return saveProspectGetoblicContent({
    prospectId: authority.conversion.prospectId,
    sourceOrganizationId: authority.conversion.sourceOrganizationId,
    body: input.body,
    store: input.store,
    ownsSourceProspect: input.ownsSourceProspect,
    now: input.now,
  });
}
