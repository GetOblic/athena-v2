import type {
  GetOblicCreateLinkInput,
  GetOblicUpdateLinkInput,
} from "@/lib/getoblic-links/types";
import { GetOblicWorkerError } from "@/lib/getoblic-links/types";

/** Hard ceiling for JSON bodies accepted by Athena GetOblic Links API routes. */
export const GETOBLIC_LINKS_MAX_BODY_BYTES = 8_192;

/**
 * Exact Worker slug pattern. Case is significant — do not lowercase.
 * KV keys and short-link paths must preserve the slug exactly.
 */
export const GETOBLIC_SLUG_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

const BLOCKED_DESTINATION_PROTOCOLS = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "blob:",
]);

/** Approved GetOblic hostnames: apex and any subdomain of getoblic.com. */
export function isApprovedGetOblicHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return host === "getoblic.com" || host.endsWith(".getoblic.com");
}

export function assertBodyWithinLimit(
  contentLengthHeader: string | null,
  rawBody: string,
): void {
  const declared = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : Number.NaN;
  if (
    Number.isFinite(declared) &&
    declared > GETOBLIC_LINKS_MAX_BODY_BYTES
  ) {
    throw new GetOblicWorkerError(
      "PAYLOAD_TOO_LARGE",
      "Request body exceeds the allowed size.",
      413,
    );
  }
  const bytes = Buffer.byteLength(rawBody, "utf8");
  if (bytes > GETOBLIC_LINKS_MAX_BODY_BYTES) {
    throw new GetOblicWorkerError(
      "PAYLOAD_TOO_LARGE",
      "Request body exceeds the allowed size.",
      413,
    );
  }
}

export function normalizeSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Slug must be a string.",
      400,
    );
  }
  // Trim only — never lowercase. Worker/KV slugs are case-sensitive.
  const slug = value.trim();
  if (!GETOBLIC_SLUG_PATTERN.test(slug)) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Slug must be 3–64 characters: letters, numbers, hyphens, or underscores.",
      400,
    );
  }
  return slug;
}

export function validateOptionalSlug(value: unknown): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return normalizeSlug(value);
}

/**
 * Match Worker destination rules:
 * HTTPS only, approved GetOblic hostnames, no credentials, no ports,
 * no javascript/data/file schemes.
 */
export function validateDestinationUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "A valid HTTPS GetOblic URL is required.",
      400,
    );
  }

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  for (const protocol of BLOCKED_DESTINATION_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      throw new GetOblicWorkerError(
        "VALIDATION",
        "Destination URL scheme is not allowed.",
        400,
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Destination URL is not a valid absolute URL.",
      400,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Destination URL must use HTTPS.",
      400,
    );
  }

  if (!parsed.hostname) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Destination URL must include a hostname.",
      400,
    );
  }

  if (parsed.username || parsed.password) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Destination URL must not include credentials.",
      400,
    );
  }

  if (parsed.port) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Destination URL must not include a port.",
      400,
    );
  }

  if (!isApprovedGetOblicHostname(parsed.hostname)) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Destination URL must use an approved GetOblic hostname.",
      400,
    );
  }

  return parsed.toString();
}

const OPTIONAL_STRING_FIELDS = [
  "contact_id",
  "business_name",
  "campaign",
  "channel",
  "owner",
  "created_by",
  "notes",
] as const;

function readOptionalString(
  record: Record<string, unknown>,
  key: (typeof OPTIONAL_STRING_FIELDS)[number],
): string | undefined {
  const value = record[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new GetOblicWorkerError(
      "VALIDATION",
      `${key} must be a string.`,
      400,
    );
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readOptionalNullableString(
  record: Record<string, unknown>,
  key: (typeof OPTIONAL_STRING_FIELDS)[number],
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new GetOblicWorkerError(
      "VALIDATION",
      `${key} must be a string or null.`,
      400,
    );
  }
  return value.trim();
}

export function parseCreateLinkBody(body: unknown): GetOblicCreateLinkInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;
  const input: GetOblicCreateLinkInput = {
    url: validateDestinationUrl(record.url),
    slug: validateOptionalSlug(record.slug),
  };

  if (record.expires_at !== undefined && record.expires_at !== null) {
    if (typeof record.expires_at !== "string" || !record.expires_at.trim()) {
      throw new GetOblicWorkerError(
        "VALIDATION",
        "expires_at must be a string or null.",
        400,
      );
    }
    input.expires_at = record.expires_at.trim();
  } else if (record.expires_at === null) {
    input.expires_at = null;
  }

  for (const key of OPTIONAL_STRING_FIELDS) {
    const value = readOptionalString(record, key);
    if (value !== undefined) {
      input[key] = value;
    }
  }

  return input;
}

export function parseUpdateLinkBody(body: unknown): GetOblicUpdateLinkInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Request body must be a JSON object.",
      400,
    );
  }

  const record = body as Record<string, unknown>;
  const update: GetOblicUpdateLinkInput = {};

  if (record.url !== undefined) {
    update.url = validateDestinationUrl(record.url);
  }

  if (record.expires_at !== undefined) {
    if (record.expires_at === null) {
      update.expires_at = null;
    } else if (
      typeof record.expires_at === "string" &&
      record.expires_at.trim()
    ) {
      update.expires_at = record.expires_at.trim();
    } else {
      throw new GetOblicWorkerError(
        "VALIDATION",
        "expires_at must be a string or null.",
        400,
      );
    }
  }

  if (record.disabled !== undefined) {
    if (typeof record.disabled !== "boolean") {
      throw new GetOblicWorkerError(
        "VALIDATION",
        "disabled must be a boolean.",
        400,
      );
    }
    update.disabled = record.disabled;
  }

  if (record.enabled !== undefined) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "enabled is not supported; use disabled.",
      400,
    );
  }

  for (const key of OPTIONAL_STRING_FIELDS) {
    const value = readOptionalNullableString(record, key);
    if (value !== undefined) {
      update[key] = value;
    }
  }

  const hasField =
    update.url !== undefined ||
    update.expires_at !== undefined ||
    update.disabled !== undefined ||
    OPTIONAL_STRING_FIELDS.some((key) => update[key] !== undefined);

  if (!hasField) {
    throw new GetOblicWorkerError(
      "VALIDATION",
      "Provide at least one supported field to update a link.",
      400,
    );
  }

  return update;
}
