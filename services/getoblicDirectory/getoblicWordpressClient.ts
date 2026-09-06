/**
 * Server-only GetOblic WordPress athena/v1 client.
 * Reads ATHENA_V2_DIRECTORY_* secrets — never import this module from client
 * components. The API key must never be logged, returned, or embedded in errors.
 */

import {
  GETOBLIC_WORDPRESS_DEFAULT_BASE_URL,
  GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
  GetOblicWordpressError,
  type GetOblicWordpressAuthorAssignment,
  type GetOblicWordpressErrorCode,
  type GetOblicWordpressKnowledgeBaseUpdate,
  type GetOblicWordpressListing,
  type GetOblicWordpressUserResolution,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";

type WordpressConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

function readBaseUrl(): string {
  const baseUrl = (
    process.env.ATHENA_V2_DIRECTORY_BASE_URL?.trim() ||
    GETOBLIC_WORDPRESS_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new GetOblicWordpressError(
      "CONFIG_MISSING",
      "ATHENA_V2_DIRECTORY_BASE_URL must be an http(s) URL.",
      503,
    );
  }

  return baseUrl;
}

function readConfig(): WordpressConfig {
  const baseUrl = readBaseUrl();
  const apiKey = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim() ?? "";

  if (!apiKey) {
    throw new GetOblicWordpressError(
      "CONFIG_MISSING",
      "GetOblic Directory is not configured on this Athena instance.",
      503,
    );
  }

  return {
    baseUrl,
    apiKey,
    timeoutMs: GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
  };
}

function wordpressUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  if (!(key in record) || record[key] === null) {
    return null;
  }
  return readString(record, key);
}

function readInteger(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function extractWordpressErrorMessage(
  payload: unknown,
  fallback: string,
): { message: string; remoteCode: string | null } {
  const record = asRecord(payload);
  if (!record) {
    return { message: fallback, remoteCode: null };
  }

  const remoteCode = readString(record, "code");
  if (typeof record.message === "string" && record.message.trim()) {
    return { message: record.message.trim(), remoteCode };
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return { message: record.error.trim(), remoteCode };
  }
  return { message: fallback, remoteCode };
}

function mapStatusToCode(
  status: number,
  remoteCode: string | null,
): GetOblicWordpressErrorCode {
  if (remoteCode === "LISTING_NOT_FOUND" || status === 404) {
    return "NOT_FOUND";
  }
  if (
    status === 401 ||
    status === 403 ||
    remoteCode === "MISSING_API_KEY" ||
    remoteCode === "INVALID_API_KEY" ||
    remoteCode === "AUTH_NOT_CONFIGURED"
  ) {
    return "UNAUTHORIZED";
  }
  if (status === 409) return "CONFLICT";
  if (status === 400 || status === 422) return "VALIDATION";
  return "REMOTE_ERROR";
}

function parseListing(payload: unknown): GetOblicWordpressListing {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid listing payload.",
      502,
    );
  }

  const source = asRecord(root.listing) ?? root;
  const wordpressListingId = readInteger(source, "wordpress_listing_id");
  if (wordpressListingId == null || wordpressListingId <= 0) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress listing response is missing wordpress_listing_id.",
      502,
    );
  }

  return {
    wordpress_listing_id: wordpressListingId,
    status: readNullableString(source, "status"),
    title: readNullableString(source, "title"),
    author_id: readInteger(source, "author_id"),
    google_id: readNullableString(source, "google_id"),
    google_place_url: readNullableString(source, "google_place_url"),
    knowledge_base: readNullableString(source, "knowledge_base"),
  };
}

function parseUserResolution(payload: unknown): GetOblicWordpressUserResolution {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid user payload.",
      502,
    );
  }

  const wordpressUserId = readInteger(root, "wordpress_user_id");
  const created = readBoolean(root, "created");
  if (wordpressUserId == null || wordpressUserId <= 0 || created == null) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress user response is missing wordpress_user_id.",
      502,
    );
  }

  return {
    wordpress_user_id: wordpressUserId,
    created,
  };
}

function parseAuthorAssignment(
  payload: unknown,
  fallbackListingId: number,
): GetOblicWordpressAuthorAssignment {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid author payload.",
      502,
    );
  }

  const wordpressUserId = readInteger(root, "wordpress_user_id");
  const changed = readBoolean(root, "changed");
  if (wordpressUserId == null || wordpressUserId <= 0 || changed == null) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress author response is missing wordpress_user_id.",
      502,
    );
  }

  return {
    wordpress_listing_id:
      readInteger(root, "wordpress_listing_id") ?? fallbackListingId,
    wordpress_user_id: wordpressUserId,
    changed,
  };
}

function parseKnowledgeBaseUpdate(
  payload: unknown,
  fallbackListingId: number,
): GetOblicWordpressKnowledgeBaseUpdate {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid knowledge-base payload.",
      502,
    );
  }

  const changed = readBoolean(root, "changed");
  if (changed == null) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress knowledge-base response is missing changed.",
      502,
    );
  }

  return {
    wordpress_listing_id:
      readInteger(root, "wordpress_listing_id") ?? fallbackListingId,
    sha256: readNullableString(root, "sha256"),
    changed,
  };
}

async function wordpressFetch(
  path: string,
  init: {
    method: string;
    body?: unknown;
  },
): Promise<{ status: number; payload: unknown }> {
  const config = readConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-api-key": config.apiKey,
    };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(wordpressUrl(config.baseUrl, path), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const text = await response.text().catch(() => "");
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new GetOblicWordpressError(
          "INVALID_RESPONSE",
          "WordPress returned a non-JSON response.",
          502,
        );
      }
    }

    if (!response.ok) {
      const extracted = extractWordpressErrorMessage(
        payload,
        `GetOblic Directory request failed (${response.status}).`,
      );
      throw new GetOblicWordpressError(
        mapStatusToCode(response.status, extracted.remoteCode),
        extracted.message,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        extracted.remoteCode,
      );
    }

    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof GetOblicWordpressError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message))
    ) {
      throw new GetOblicWordpressError(
        "TIMEOUT",
        "GetOblic Directory request timed out.",
        504,
      );
    }
    throw new GetOblicWordpressError(
      "NETWORK",
      "GetOblic Directory is unavailable.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function parseGetOblicWordpressListingId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value.trim())) {
    return Number(value.trim());
  }
  throw new GetOblicWordpressError(
    "VALIDATION",
    "wordpress_listing_id must be a positive integer.",
    400,
  );
}

export async function resolveOrCreateWordpressUser(
  email: string,
): Promise<GetOblicWordpressUserResolution> {
  const normalized = email.trim();
  if (!normalized) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "email is required.",
      400,
    );
  }

  const { payload } = await wordpressFetch("/users/resolve-or-create", {
    method: "POST",
    body: { email: normalized },
  });
  return parseUserResolution(payload);
}

export async function getWordpressListingById(
  wordpressListingId: number,
): Promise<GetOblicWordpressListing> {
  const id = parseGetOblicWordpressListingId(wordpressListingId);
  const { payload } = await wordpressFetch(`/listings/${id}`, {
    method: "GET",
  });
  return parseListing(payload);
}

export async function getWordpressListingsByGoogleId(
  googleId: string,
): Promise<GetOblicWordpressListing[]> {
  const normalized = googleId.trim();
  if (!normalized) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "google_id is required.",
      400,
    );
  }

  const { payload } = await wordpressFetch(
    `/listings?google_id=${encodeURIComponent(normalized)}`,
    { method: "GET" },
  );

  const root = asRecord(payload);
  const matches = root && Array.isArray(root.matches) ? root.matches : null;
  if (!matches) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress google_id response is missing matches.",
      502,
    );
  }

  return matches.map((entry) => parseListing(entry));
}

export async function assignWordpressListingAuthor(
  wordpressListingId: number,
  wordpressUserId: number,
): Promise<GetOblicWordpressAuthorAssignment> {
  const id = parseGetOblicWordpressListingId(wordpressListingId);
  if (!Number.isInteger(wordpressUserId) || wordpressUserId <= 0) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "wordpress_user_id must be a positive integer.",
      400,
    );
  }

  const { payload } = await wordpressFetch(`/listings/${id}/author`, {
    method: "POST",
    body: { wordpress_user_id: wordpressUserId },
  });
  return parseAuthorAssignment(payload, id);
}

export async function putWordpressListingKnowledgeBase(
  wordpressListingId: number,
  knowledgeBase: string,
): Promise<GetOblicWordpressKnowledgeBaseUpdate> {
  const id = parseGetOblicWordpressListingId(wordpressListingId);
  if (typeof knowledgeBase !== "string") {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "knowledge_base must be a string.",
      400,
    );
  }

  const { payload } = await wordpressFetch(`/listings/${id}/knowledge-base`, {
    method: "PUT",
    body: { knowledge_base: knowledgeBase },
  });
  return parseKnowledgeBaseUpdate(payload, id);
}
