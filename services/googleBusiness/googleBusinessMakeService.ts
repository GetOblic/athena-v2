/**
 * Server-only Google business Make caller.
 * Never import this module from client components.
 * Never log the webhook URL or query string.
 */

import {
  GOOGLE_BUSINESS_ADD_ACTION,
  GOOGLE_BUSINESS_EMPTY_OPENING_HOURS_JSON,
  GOOGLE_BUSINESS_OPTIONAL_FIELDS,
  type GoogleBusinessPayload,
} from "@/lib/googlePlaces/googlePlacesTypes";
import { getGetOblicDirectorySettings } from "@/services/getoblicDirectory/getoblicDirectoryService";
import {
  GOOGLE_BUSINESS_FUNNEL_NAME,
  GOOGLE_BUSINESS_MAKE_TIMEOUT_MS,
  GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV,
  GoogleBusinessMakeError,
  googleBusinessMakeErrorMessage,
  type GoogleBusinessMakeResult,
} from "@/services/googleBusiness/googleBusinessMakeTypes";

const PAYLOAD_FIELD_MAX = 4_000;

export type AddGoogleBusinessListingInput = {
  organizationId: string;
  payload: unknown;
};

export type AddGoogleBusinessListingDeps = {
  getSettings?: typeof getGetOblicDirectorySettings;
  fetchImpl?: typeof fetch;
  readWebhookUrl?: () => string | null;
  timeoutMs?: number;
};

function fail(
  code: GoogleBusinessMakeError["code"],
): never {
  throw new GoogleBusinessMakeError(
    code,
    googleBusinessMakeErrorMessage(code),
  );
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clipField(value: string): string {
  return value.length > PAYLOAD_FIELD_MAX
    ? value.slice(0, PAYLOAD_FIELD_MAX)
    : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeGoogleBusinessPayload(
  raw: unknown,
): GoogleBusinessPayload {
  if (!isRecord(raw)) {
    fail("GOOGLE_BUSINESS_INVALID_PAYLOAD");
  }

  const action = readTrimmedString(raw.action);
  const companyName = readTrimmedString(raw.company_name);
  const googleId = readTrimmedString(raw.google_id);

  if (action !== GOOGLE_BUSINESS_ADD_ACTION || !companyName || !googleId) {
    fail("GOOGLE_BUSINESS_INVALID_PAYLOAD");
  }

  const payload: GoogleBusinessPayload = {
    action: GOOGLE_BUSINESS_ADD_ACTION,
    company_name: clipField(companyName),
    google_id: clipField(googleId),
    opening_hours:
      typeof raw.opening_hours === "string" ? clipField(raw.opening_hours) : "",
    opening_hours_json: sanitizeOpeningHoursJson(raw.opening_hours_json),
  };

  for (const field of GOOGLE_BUSINESS_OPTIONAL_FIELDS) {
    const value = readTrimmedString(raw[field]);
    if (value) {
      payload[field] = clipField(value);
    }
  }

  return payload;
}

function sanitizeOpeningHoursJson(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return clipField(trimmed);
    }
  }
  return GOOGLE_BUSINESS_EMPTY_OPENING_HOURS_JSON;
}

export function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
}

function defaultWebhookUrl(): string | null {
  const value = process.env[GOOGLE_BUSINESS_MAKE_WEBHOOK_ENV]?.trim() ?? "";
  return value || null;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

function buildMakeQuery(
  payload: GoogleBusinessPayload,
  authorId: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("action", payload.action);
  params.set("company_name", payload.company_name);
  params.set("google_id", payload.google_id);

  for (const field of GOOGLE_BUSINESS_OPTIONAL_FIELDS) {
    const value = payload[field];
    if (value) {
      params.set(field, value);
    }
  }

  params.set("opening_hours", payload.opening_hours);
  params.set("opening_hours_json", payload.opening_hours_json);
  params.set("funnel_name", GOOGLE_BUSINESS_FUNNEL_NAME);
  params.set("author_id", String(authorId));
  return params;
}

function parseMakeResult(payload: unknown): GoogleBusinessMakeResult {
  if (!isRecord(payload)) {
    fail("GOOGLE_BUSINESS_INVALID_RESPONSE");
  }

  const listingId = readPositiveInteger(payload.listing_id);
  const googleId = readTrimmedString(payload.google_id);

  if (listingId == null) {
    fail("GOOGLE_BUSINESS_INVALID_RESPONSE");
  }
  if (!googleId) {
    fail("GOOGLE_BUSINESS_INVALID_RESPONSE");
  }

  return {
    wordpress_listing_id: listingId,
    google_id: googleId,
  };
}

export async function addGoogleBusinessListing(
  input: AddGoogleBusinessListingInput,
  deps: AddGoogleBusinessListingDeps = {},
): Promise<GoogleBusinessMakeResult> {
  const getSettings = deps.getSettings ?? getGetOblicDirectorySettings;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readWebhookUrl = deps.readWebhookUrl ?? defaultWebhookUrl;
  const timeoutMs = deps.timeoutMs ?? GOOGLE_BUSINESS_MAKE_TIMEOUT_MS;

  const payload = sanitizeGoogleBusinessPayload(input.payload);
  const settingsResult = await getSettings(input.organizationId);

  const authorId = settingsResult.configured
    ? readPositiveInteger(settingsResult.settings.wordpress_author_id)
    : null;

  if (authorId == null) {
    fail("GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING");
  }

  const webhookUrl = readWebhookUrl();
  if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
    fail("GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED");
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(webhookUrl);
  } catch {
    fail("GOOGLE_BUSINESS_WEBHOOK_NOT_CONFIGURED");
  }

  const query = buildMakeQuery(payload, authorId);
  for (const [key, value] of query.entries()) {
    requestUrl.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(requestUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if (!response.ok) {
      fail("GOOGLE_BUSINESS_REMOTE_FAILED");
    }

    const text = await response.text().catch(() => "");
    let parsed: unknown = null;
    if (!text.trim()) {
      fail("GOOGLE_BUSINESS_INVALID_RESPONSE");
    }
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      fail("GOOGLE_BUSINESS_INVALID_RESPONSE");
    }

    return parseMakeResult(parsed);
  } catch (error) {
    if (error instanceof GoogleBusinessMakeError) {
      throw error;
    }
    if (isAbortError(error)) {
      fail("GOOGLE_BUSINESS_TIMEOUT");
    }
    fail("GOOGLE_BUSINESS_REMOTE_FAILED");
  } finally {
    clearTimeout(timer);
  }
}
