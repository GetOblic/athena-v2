/**
 * Server-only Google business Make caller.
 * Never import this module from client components.
 * Never log the webhook URL or query string.
 * Invalid Make bodies log structural metadata only.
 */

import { randomUUID } from "node:crypto";
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
import { resolveOrganizationLanguage } from "@/services/organizationService";

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

const GOOGLE_BUSINESS_MAKE_INVALID_RESPONSE_EVENT =
  "[GOOGLE_BUSINESS_MAKE_INVALID_RESPONSE]" as const;

const INVALID_RESPONSE_TOP_LEVEL_KEY_CAP = 16;
const TOP_LEVEL_KEY_MAX_LENGTH = 64;
const CONTENT_TYPE_MAX = 120;

const GOOGLE_BUSINESS_INVALID_RESPONSE_REASONS = [
  "BODY_READ_FAILED",
  "EMPTY_BODY",
  "NON_JSON",
  "NON_OBJECT",
  "INVALID_LISTING_ID",
  "MISSING_GOOGLE_ID",
] as const;

type GoogleBusinessInvalidResponseReason =
  (typeof GOOGLE_BUSINESS_INVALID_RESPONSE_REASONS)[number];

type InvalidResponseObservation = {
  reason: GoogleBusinessInvalidResponseReason;
  status: number;
  contentType: string | null;
  bodyBytes: number | null;
  jsonParsed: boolean;
  parsed: unknown;
};

function structuralType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function isDigitString(value: unknown): boolean {
  return typeof value === "string" && /^\d+$/.test(value.trim());
}

function readSafeContentType(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || /:\/\/|\?/.test(cleaned)) {
    return null;
  }
  return cleaned.length > CONTENT_TYPE_MAX
    ? cleaned.slice(0, CONTENT_TYPE_MAX)
    : cleaned;
}

function readTopLevelKeys(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => key.length > 0 && key.length <= TOP_LEVEL_KEY_MAX_LENGTH)
    .sort()
    .slice(0, INVALID_RESPONSE_TOP_LEVEL_KEY_CAP);
}

function readOwn(
  record: Record<string, unknown> | null,
  key: string,
): { present: boolean; value: unknown } {
  if (!record || !Object.hasOwn(record, key)) {
    return { present: false, value: undefined };
  }
  return { present: true, value: record[key] };
}

function buildInvalidResponseDiagnostic(input: InvalidResponseObservation) {
  const record =
    input.jsonParsed && isRecord(input.parsed) ? input.parsed : null;
  const listing = readOwn(record, "listing_id");
  const googleId = readOwn(record, "google_id");
  const success = readOwn(record, "success");

  return {
    diagnostic_id: randomUUID(),
    rejection_reason: input.reason,
    make_http_status: input.status,
    content_type: readSafeContentType(input.contentType),
    body_bytes: input.bodyBytes,
    json_parsed: input.jsonParsed,
    top_level_type: input.jsonParsed ? structuralType(input.parsed) : null,
    top_level_keys: input.jsonParsed ? readTopLevelKeys(input.parsed) : [],
    listing_id_present: listing.present,
    listing_id_type: listing.present ? structuralType(listing.value) : null,
    listing_id_digit_string: listing.present
      ? isDigitString(listing.value)
      : false,
    listing_id_positive_integer:
      listing.present && readPositiveInteger(listing.value) != null,
    google_id_present: googleId.present,
    google_id_type: googleId.present ? structuralType(googleId.value) : null,
    google_id_blank_after_trim:
      googleId.present &&
      typeof googleId.value === "string" &&
      googleId.value.trim().length === 0,
    success_present: success.present,
    success_type: success.present ? structuralType(success.value) : null,
  };
}

function rejectInvalidMakeResponse(input: InvalidResponseObservation): never {
  const diagnostic = buildInvalidResponseDiagnostic(input);
  console.error(GOOGLE_BUSINESS_MAKE_INVALID_RESPONSE_EVENT, diagnostic);
  fail("GOOGLE_BUSINESS_INVALID_RESPONSE");
}

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function buildMakeQuery(
  payload: GoogleBusinessPayload,
  authorId: number,
  makeLanguageCode: "EN" | "FR",
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("action", `${GOOGLE_BUSINESS_ADD_ACTION}_${makeLanguageCode}`);
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
  params.set(
    "funnel_name",
    `${GOOGLE_BUSINESS_FUNNEL_NAME}_${makeLanguageCode}`,
  );
  params.set("author_id", String(authorId));
  return params;
}

function parseMakeResult(
  payload: unknown,
  http: { status: number; contentType: string | null; bodyBytes: number },
): GoogleBusinessMakeResult {
  const observation = {
    status: http.status,
    contentType: http.contentType,
    bodyBytes: http.bodyBytes,
    jsonParsed: true,
    parsed: payload,
  };

  if (!isRecord(payload)) {
    rejectInvalidMakeResponse({
      ...observation,
      reason: "NON_OBJECT",
    });
  }

  const listingId = readPositiveInteger(payload.listing_id);
  const googleId = readTrimmedString(payload.google_id);

  if (listingId == null) {
    rejectInvalidMakeResponse({
      ...observation,
      reason: "INVALID_LISTING_ID",
    });
  }
  if (!googleId) {
    rejectInvalidMakeResponse({
      ...observation,
      reason: "MISSING_GOOGLE_ID",
    });
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

  const organizationId = input.organizationId;
  const payload = sanitizeGoogleBusinessPayload(input.payload);
  const settingsResult = await getSettings(organizationId);

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

  const language = await resolveOrganizationLanguage(organizationId);
  // Make accepts FR and EN only. es, it, de, and pt use the EN outbound contract.
  const makeLanguageCode = language === "fr" ? "FR" : "EN";
  const query = buildMakeQuery(payload, authorId, makeLanguageCode);
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

    const contentType = response.headers.get("content-type");
    let text: string;
    try {
      text = await response.text();
    } catch {
      rejectInvalidMakeResponse({
        reason: "BODY_READ_FAILED",
        status: response.status,
        contentType,
        bodyBytes: null,
        jsonParsed: false,
        parsed: undefined,
      });
    }

    const bodyBytes = utf8ByteLength(text);
    if (!text.trim()) {
      rejectInvalidMakeResponse({
        reason: "EMPTY_BODY",
        status: response.status,
        contentType,
        bodyBytes,
        jsonParsed: false,
        parsed: undefined,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      rejectInvalidMakeResponse({
        reason: "NON_JSON",
        status: response.status,
        contentType,
        bodyBytes,
        jsonParsed: false,
        parsed: undefined,
      });
    }

    return parseMakeResult(parsed, {
      status: response.status,
      contentType,
      bodyBytes,
    });
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
