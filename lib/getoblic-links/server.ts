/**
 * Server-only GetOblic Links Worker client.
 * Reads GETOBLIC_LINKS_* secrets — never import this module from client components.
 */

import type {
  GetOblicCreateLinkInput,
  GetOblicLinkRecord,
  GetOblicUpdateLinkInput,
  GetOblicWorkerHealth,
} from "@/lib/getoblic-links/types";
import { GetOblicWorkerError } from "@/lib/getoblic-links/types";

const DEFAULT_BASE_URL = "https://link.getoblic.com";
const DEFAULT_TIMEOUT_MS = 12_000;

type WorkerConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

function readBaseUrl(): string {
  const baseUrl = (
    process.env.GETOBLIC_LINKS_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new GetOblicWorkerError(
      "CONFIG_MISSING",
      "GETOBLIC_LINKS_BASE_URL must be an http(s) URL.",
      503,
    );
  }

  return baseUrl;
}

/**
 * User-facing short-link origin (e.g. https://link.getoblic.com).
 * Prefers GETOBLIC_LINKS_PUBLIC_BASE_URL; falls back to GETOBLIC_LINKS_BASE_URL.
 * Distinct from the Worker API base when the Worker is reached via workers.dev.
 */
export function readPublicBaseUrl(): string {
  const publicConfigured = process.env.GETOBLIC_LINKS_PUBLIC_BASE_URL?.trim();
  const baseUrl = (
    publicConfigured ||
    process.env.GETOBLIC_LINKS_BASE_URL?.trim() ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new GetOblicWorkerError(
      "CONFIG_MISSING",
      publicConfigured
        ? "GETOBLIC_LINKS_PUBLIC_BASE_URL must be an http(s) URL."
        : "GETOBLIC_LINKS_BASE_URL must be an http(s) URL.",
      503,
    );
  }

  return baseUrl;
}

function readConfig(): WorkerConfig {
  const baseUrl = readBaseUrl();
  const apiKey = process.env.GETOBLIC_LINKS_API_KEY?.trim() ?? "";

  if (!apiKey) {
    throw new GetOblicWorkerError(
      "CONFIG_MISSING",
      "GetOblic Links is not configured on this Athena instance.",
      503,
    );
  }

  return {
    baseUrl,
    apiKey,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function workerUrl(baseUrl: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, `${baseUrl}/`).toString();
}

function extractWorkerErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  if (
    record.error &&
    typeof record.error === "object" &&
    typeof (record.error as { message?: unknown }).message === "string"
  ) {
    return String((record.error as { message: string }).message);
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  return fallback;
}

function mapStatusToCode(status: number): GetOblicWorkerError["code"] {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 400 || status === 422) return "VALIDATION";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  return "WORKER_ERROR";
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

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

/**
 * Always build the canonical public short URL from the public base + slug.
 * Worker-provided short_url values (e.g. workers.dev) must not override this.
 * Slug case is preserved exactly; the path segment is URI-encoded.
 */
function buildShortUrl(publicBaseUrl: string, slug: string): string {
  return new URL(
    `/${encodeURIComponent(slug)}`,
    `${publicBaseUrl}/`,
  ).toString();
}

/**
 * Normalize canonical Worker create / get / patch payloads into an Athena record.
 *
 * Create: { success, slug, short_url, destination_url, created_at, expires_at, disabled }
 * Get:    { success, link: { slug, url, short_url, disabled, click_count, ... } }
 * Patch:  { success, slug, short_url, link: { ... } }
 */
export function normalizeWorkerLink(
  payload: unknown,
  publicBaseUrl: string,
  fallbackSlug?: string,
): GetOblicLinkRecord {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWorkerError(
      "INVALID_RESPONSE",
      "Worker returned an invalid link payload.",
      502,
    );
  }

  const nested = asRecord(root.link);
  const source = nested ?? root;

  const slug = readString(source, "slug") ?? (fallbackSlug ? fallbackSlug : null);

  if (!slug) {
    throw new GetOblicWorkerError(
      "INVALID_RESPONSE",
      "Worker link response is missing a slug.",
      502,
    );
  }

  // GET/PATCH use link.url; create response uses destination_url at the root.
  const url =
    readString(source, "url") ??
    (nested ? null : readString(root, "destination_url"));

  if (!url) {
    throw new GetOblicWorkerError(
      "INVALID_RESPONSE",
      "Worker link response is missing url.",
      502,
    );
  }

  const disabled = nested
    ? readBoolean(source, "disabled", false)
    : readBoolean(root, "disabled", readBoolean(source, "disabled", false));

  return {
    slug,
    url,
    // Worker short_url (e.g. workers.dev) is ignored; always use public base + slug.
    short_url: buildShortUrl(publicBaseUrl, slug),
    disabled,
    click_count: readNumber(source, "click_count"),
    created_at:
      readNullableString(source, "created_at") ??
      readNullableString(root, "created_at"),
    updated_at: readNullableString(source, "updated_at"),
    expires_at:
      readNullableString(source, "expires_at") ??
      readNullableString(root, "expires_at"),
    schema_version:
      typeof source.schema_version === "number" ||
      typeof source.schema_version === "string"
        ? source.schema_version
        : null,
    first_clicked_at: readNullableString(source, "first_clicked_at"),
    last_clicked_at: readNullableString(source, "last_clicked_at"),
    contact_id: readNullableString(source, "contact_id"),
    business_name: readNullableString(source, "business_name"),
    campaign: readNullableString(source, "campaign"),
    channel: readNullableString(source, "channel"),
    owner: readNullableString(source, "owner"),
    created_by: readNullableString(source, "created_by"),
    notes: readNullableString(source, "notes"),
  };
}

async function workerFetch(
  path: string,
  init: {
    method: string;
    body?: unknown;
    auth?: boolean;
  },
): Promise<{ status: number; payload: unknown }> {
  const config = readConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (init.auth !== false) {
      headers["X-API-Key"] = config.apiKey;
    }
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(workerUrl(config.baseUrl, path), {
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
        throw new GetOblicWorkerError(
          "INVALID_RESPONSE",
          "Worker returned a non-JSON response.",
          502,
        );
      }
    }

    if (!response.ok) {
      throw new GetOblicWorkerError(
        mapStatusToCode(response.status),
        extractWorkerErrorMessage(
          payload,
          `GetOblic Links request failed (${response.status}).`,
        ),
        response.status >= 400 && response.status < 600 ? response.status : 502,
        // Never echo X-API-Key or secrets — payload is Worker business errors only.
        payload,
      );
    }

    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof GetOblicWorkerError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message))
    ) {
      throw new GetOblicWorkerError(
        "TIMEOUT",
        "GetOblic Links Worker timed out.",
        504,
      );
    }
    throw new GetOblicWorkerError(
      "NETWORK",
      "GetOblic Links Worker is unavailable.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getGetOblicLinksHealth(): Promise<{
  healthy: boolean;
  status: string;
  service: string | null;
  timestamp: string | null;
  kvBinding: string | null;
}> {
  try {
    const baseUrl = readBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      // Worker /health requires no authentication — do not send X-API-Key.
      const response = await fetch(workerUrl(baseUrl, "/health"), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      const text = await response.text().catch(() => "");
      let payload: GetOblicWorkerHealth | null = null;
      if (text.trim()) {
        try {
          payload = JSON.parse(text) as GetOblicWorkerHealth;
        } catch {
          payload = null;
        }
      }

      const status =
        typeof payload?.status === "string" ? payload.status : "unknown";
      const healthy =
        response.ok &&
        payload?.success === true &&
        /healthy/i.test(status);

      return {
        healthy,
        status: healthy ? "healthy" : status || "unhealthy",
        service:
          typeof payload?.service === "string" ? payload.service : null,
        timestamp:
          typeof payload?.timestamp === "string" ? payload.timestamp : null,
        kvBinding:
          typeof payload?.kv_binding === "string" ? payload.kv_binding : null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error instanceof GetOblicWorkerError && error.code === "CONFIG_MISSING") {
      throw error;
    }
    return {
      healthy: false,
      status: "unavailable",
      service: null,
      timestamp: null,
      kvBinding: null,
    };
  }
}

export async function createGetOblicLink(
  input: GetOblicCreateLinkInput,
): Promise<GetOblicLinkRecord> {
  // Worker accepts `url` only — never send destination aliases.
  const body: Record<string, unknown> = {
    url: input.url,
  };
  if (input.slug) {
    body.slug = input.slug;
  }
  if (input.expires_at !== undefined) {
    body.expires_at = input.expires_at;
  }
  for (const key of [
    "contact_id",
    "business_name",
    "campaign",
    "channel",
    "owner",
    "created_by",
    "notes",
  ] as const) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }

  const { payload } = await workerFetch("/api/links", {
    method: "POST",
    body,
  });

  return normalizeWorkerLink(payload, readPublicBaseUrl());
}

export async function getGetOblicLink(slug: string): Promise<GetOblicLinkRecord> {
  const encoded = encodeURIComponent(slug);
  const { payload } = await workerFetch(`/api/links/${encoded}`, {
    method: "GET",
  });
  return normalizeWorkerLink(payload, readPublicBaseUrl(), slug);
}

export async function updateGetOblicLink(
  slug: string,
  input: GetOblicUpdateLinkInput,
): Promise<GetOblicLinkRecord> {
  const body: Record<string, unknown> = {};
  if (input.url !== undefined) {
    body.url = input.url;
  }
  if (input.expires_at !== undefined) {
    body.expires_at = input.expires_at;
  }
  if (input.disabled !== undefined) {
    body.disabled = input.disabled;
  }
  for (const key of [
    "contact_id",
    "business_name",
    "campaign",
    "channel",
    "owner",
    "created_by",
    "notes",
  ] as const) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }

  const encoded = encodeURIComponent(slug);
  const { payload } = await workerFetch(`/api/links/${encoded}`, {
    method: "PATCH",
    body,
  });
  return normalizeWorkerLink(payload, readPublicBaseUrl(), slug);
}

export async function deleteGetOblicLink(slug: string): Promise<void> {
  const encoded = encodeURIComponent(slug);
  await workerFetch(`/api/links/${encoded}`, {
    method: "DELETE",
  });
}

export function toAthenaApiError(error: unknown): {
  status: number;
  body: { ok: false; error: { code: string; message: string } };
} {
  if (error instanceof GetOblicWorkerError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: "WORKER_ERROR",
        message: "Unexpected GetOblic Links error.",
      },
    },
  };
}
